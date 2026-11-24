// chat-stt — server-side Speech-to-Text router for the chat widget.
// Provider routed via multipart field `provider`:
//   openai     → OpenAI Whisper (OPENAI_API_KEY)
//   gemini     → Google Gemini (GEMINI_API_KEY)
//   local      → OpenAI-compatible endpoint (multipart field `endpoint`, optional `model`)
//   elevenlabs → ElevenLabs Scribe (ELEVENLABS_API_KEY)
//
// Returns { text: string }.
// Public — verify_jwt = false (used from anonymous chat widget).

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { publicAiLimit } from '../_shared/rate-limit.ts';
import { getServiceClient } from '../_shared/supabase-clients.ts';

const MAX_BYTES = 25 * 1024 * 1024; // 25 MiB

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function ok(text: string) {
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function extForMime(mime: string): string {
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
  };
  return map[m] ?? 'webm';
}

async function transcribeOpenAI(file: File, language?: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('model', 'whisper-1');
  if (language) fd.append('language', language);
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`OpenAI STT ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.text ?? '';
}

async function transcribeLocal(file: File, endpoint: string, model: string, language?: string): Promise<string> {
  if (!endpoint) throw new Error('Local STT endpoint is not configured');
  const key = Deno.env.get('LOCAL_AI_API_KEY') || 'local';
  const base = endpoint.replace(/\/+$/, '');
  const url = base.endsWith('/audio/transcriptions') ? base : `${base}/audio/transcriptions`;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('model', model || 'whisper-1');
  if (language) fd.append('language', language);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Local STT ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.text ?? '';
}

async function transcribeElevenLabs(file: File, language?: string): Promise<string> {
  const key = Deno.env.get('ELEVENLABS_API_KEY');
  if (!key) throw new Error('ELEVENLABS_API_KEY is not configured');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('model_id', 'scribe_v1');
  if (language) fd.append('language_code', language);
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: fd,
  });
  if (!res.ok) throw new Error(`ElevenLabs STT ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.text ?? '';
}

async function transcribeGemini(file: File, language?: string): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const bytes = new Uint8Array(await file.arrayBuffer());
  // base64 encode without spread (avoid stack overflow)
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(bin);
  const mime = file.type || 'audio/webm';
  const prompt = language
    ? `Transcribe this audio in ${language}. Return only the transcript text, no commentary.`
    : 'Transcribe this audio. Return only the transcript text, no commentary.';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mime, data: b64 } },
          ],
        }],
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini STT ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('') ?? '';
  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return err(405, 'Method not allowed');
  // Every call is paid on the instance's own speech key, and the visitor
  // chat calls it with the publishable key: the same per-visitor and hourly
  // ceiling as the other public AI doors. The platform's own call (the
  // phone line's voicemail) is not counted.
  const limited = await publicAiLimit(req, getServiceClient(), 'chat-stt', corsHeaders);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err(400, 'Expected multipart/form-data');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return err(400, 'Missing `file` field');
  if (file.size === 0) return err(400, 'Empty audio file');
  if (file.size > MAX_BYTES) return err(413, 'Audio file exceeds 25 MiB');

  const provider = String(form.get('provider') ?? 'openai').toLowerCase();
  const language = (form.get('language') as string | null) || undefined;

  try {
    let text = '';
    switch (provider) {
      case 'openai':
        text = await transcribeOpenAI(file, language);
        break;
      case 'gemini':
        text = await transcribeGemini(file, language);
        break;
      case 'local':
        text = await transcribeLocal(
          file,
          String(form.get('endpoint') ?? ''),
          String(form.get('model') ?? 'whisper-1'),
          language,
        );
        break;
      case 'elevenlabs':
        text = await transcribeElevenLabs(file, language);
        break;
      default:
        return err(400, `Unsupported provider: ${provider}`);
    }
    return ok(text);
  } catch (e: any) {
    console.error('[chat-stt] failed', e?.message ?? e);
    return err(500, e?.message ?? 'Transcription failed');
  }
});
