import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { resolveAiConfig } from "../_shared/ai-config.ts";
import { logAiUsage } from "../_shared/ai-usage-logger.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Extract text from a PDF file stored in Supabase Storage.
 * 
 * Uses the system multimodal AI provider (resolved via resolveAiConfig('multimodal'))
 * to extract text from PDF by sending it as base64. If the configured System AI
 * provider is text-only (e.g. local LLM), automatically falls back to the first
 * vision-capable provider with an env key (Gemini → OpenAI → Anthropic).
 * 
 * Input: { file_url: string } — public URL or storage path (bucket/path)
 * Output: { success: boolean, text: string, char_count: number, provider_used: string }
 */
async function extractPdfTextCore(params: {
  supabase: ReturnType<typeof createClient>;
  file_url?: string;
  storage_path?: string;
}) {
  const { supabase, file_url, storage_path } = params;

  let pdfBytes: Uint8Array;

  if (storage_path) {
    const parts = storage_path.split('/');
    const bucket = parts[0];
    const path = parts.slice(1).join('/');

    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw new Error(`Storage download failed: ${error.message}`);
    pdfBytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const resp = await fetch(file_url!);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    pdfBytes = new Uint8Array(await resp.arrayBuffer());
  }

  if (pdfBytes.length < 100) {
    throw new Error('File too small to be a valid PDF');
  }

  let ai;
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  if (geminiKey) {
    ai = {
      provider: 'gemini' as const,
      apiKey: geminiKey,
      apiUrl: '',
      model: 'gemini-2.5-flash-lite',
      fallback: false,
    };
  } else {
    ai = await resolveAiConfig(supabase, 'multimodal');
  }

  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < pdfBytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      pdfBytes.subarray(i, i + CHUNK) as unknown as number[],
    );
  }
  const base64Pdf = btoa(binary);

  const extractionPrompt = `Extract the readable text content from this PDF.
- Preserve headings, paragraphs, lists, and table structure.
- Skip page numbers, repeated headers/footers, and decorative artifacts.
- For long documents (>50 pages), prefer concise extraction over verbatim copying — summarize repetitive boilerplate.
- Hard cap output at ~50,000 characters; stop cleanly at the next paragraph break if approaching the limit.
- Return ONLY the extracted text. No commentary.`;

  let extractedText = '';
  const _aiStart = Date.now();
  let _pTok = 0, _cTok = 0, _tTok = 0;

  if (ai.provider === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${ai.model}:generateContent?key=${ai.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: base64Pdf } },
              { text: extractionPrompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini PDF extraction error:', errText);
      throw new Error('Gemini extraction failed');
    }

    const result = await response.json();
    extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const um = result?.usageMetadata || {};
    _pTok = Number(um.promptTokenCount || 0);
    _cTok = Number(um.candidatesTokenCount || 0);
    _tTok = Number(um.totalTokenCount || _pTok + _cTok);
  } else if (ai.provider === 'openai') {
    const uploadForm = new FormData();
    uploadForm.append('purpose', 'user_data');
    uploadForm.append('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'document.pdf');

    const uploadResp = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ai.apiKey}` },
      body: uploadForm,
    });

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.error('OpenAI file upload error:', errText);
      throw new Error('OpenAI file upload failed');
    }

    const uploaded = await uploadResp.json();
    const fileId = uploaded.id;

    const response = await fetch(ai.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ai.apiKey}`,
      },
      body: JSON.stringify({
        model: ai.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: extractionPrompt },
            { type: 'file', file: { file_id: fileId } },
          ],
        }],
        max_tokens: 16384,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI PDF extraction error:', errText);
      throw new Error('OpenAI extraction failed');
    }

    const result = await response.json();
    extractedText = result.choices?.[0]?.message?.content || '';
    const u = result?.usage || {};
    _pTok = Number(u.prompt_tokens || 0);
    _cTok = Number(u.completion_tokens || 0);
    _tTok = Number(u.total_tokens || _pTok + _cTok);

    fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${ai.apiKey}` },
    }).catch(() => {});
  } else if (ai.provider === 'anthropic') {
    const response = await fetch(ai.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ai.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 16384,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf } },
            { type: 'text', text: extractionPrompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic PDF extraction error:', errText);
      throw new Error('Anthropic extraction failed');
    }

    const result = await response.json();
    extractedText = result.content?.[0]?.text || '';
    const u = result?.usage || {};
    _pTok = Number(u.input_tokens || 0);
    _cTok = Number(u.output_tokens || 0);
    _tTok = _pTok + _cTok;
  } else {
    throw new Error(`Provider "${ai.provider}" does not support PDF extraction`);
  }

  if (!extractedText || extractedText.length < 10) {
    throw new Error('Could not extract text from PDF');
  }

  void logAiUsage({
    supabase, source: 'extract-pdf-text', provider: ai.provider, model: ai.model,
    promptTokens: _pTok, completionTokens: _cTok, totalTokens: _tTok,
    latencyMs: Date.now() - _aiStart, status: 'success',
    metadata: { char_count: extractedText.length, fallback: ai.fallback },
  });

  return {
    success: true,
    text: extractedText,
    char_count: extractedText.length,
    provider_used: ai.provider,
    provider_fallback: ai.fallback,
  };
}

async function updateDocumentExtraction(documentId: string, status: 'success' | 'failed', contentMd: string | null, errorMessage: string | null) {
      const supabase = getServiceClient();
  const payload: Record<string, string | null> = {
    extraction_status: status,
    extraction_error: errorMessage,
  };

  if (contentMd !== null) {
    payload.content_md = contentMd;
  }

  if (status === 'success') {
    payload.content_extracted_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('documents')
    .update(payload)
    .eq('id', documentId)
    .eq('source', 'cowork-upload');

  if (error) {
    console.error('updateDocumentExtraction rpc failed:', error);
    throw new Error(error.message || 'Failed to persist extraction result');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_url, storage_path, document_id } = await req.json();

    if (!file_url && !storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: 'file_url or storage_path is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = getServiceClient();

    if (document_id) {
      EdgeRuntime.waitUntil((async () => {
        try {
          const result = await extractPdfTextCore({ supabase, file_url, storage_path });
          await updateDocumentExtraction(document_id, 'success', result.text, null);
        } catch (error) {
          console.error('extract-pdf-text background error:', error);
          await updateDocumentExtraction(
            document_id,
            'failed',
            null,
            (error as Error).message || 'Unknown error',
          );
        }
      })());

      return new Response(
        JSON.stringify({ success: true, queued: true, document_id }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await extractPdfTextCore({ supabase, file_url, storage_path });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('extract-pdf-text error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
