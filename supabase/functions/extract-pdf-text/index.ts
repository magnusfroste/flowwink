import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveAiConfig } from "../_shared/ai-config.ts";

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
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_url, storage_path } = await req.json();

    if (!file_url && !storage_path) {
      return new Response(
        JSON.stringify({ success: false, error: 'file_url or storage_path is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Download the PDF
    let pdfBytes: Uint8Array;

    if (storage_path) {
      const parts = storage_path.split('/');
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw new Error(`Storage download failed: ${error.message}`);
      pdfBytes = new Uint8Array(await data.arrayBuffer());
    } else {
      const resp = await fetch(file_url);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      pdfBytes = new Uint8Array(await resp.arrayBuffer());
    }

    if (pdfBytes.length < 100) {
      return new Response(
        JSON.stringify({ success: false, error: 'File too small to be a valid PDF' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve a vision-capable AI via the central config layer.
    // PDF preference: Gemini handles PDFs in a single call via inline_data.
    // OpenAI requires the Files API (2-step upload). Anthropic supports document blocks.
    // If Gemini key exists, prefer it for PDFs even when another provider is primary.
    let ai;
    try {
      const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
      if (geminiKey) {
        // gemini-2.5-flash-lite is 3-5x faster on large PDFs and accurate enough
        // for plain text extraction. Falls back to flash if lite isn't available.
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
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, error: err.message || 'No vision-capable AI provider configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert PDF to base64. Chunked to avoid stack overflow on large files.
    const CHUNK = 0x8000; // 32 KB
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

    if (ai.provider === 'gemini') {
      // Gemini native API supports inline_data with application/pdf
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
    } else if (ai.provider === 'openai') {
      // OpenAI requires PDF via Files API: upload first, then reference file_id.
      // image_url with application/pdf data URL is NOT supported (returns invalid_image_format).
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

      // Best-effort cleanup of uploaded file
      fetch(`https://api.openai.com/v1/files/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${ai.apiKey}` },
      }).catch(() => {});
    } else if (ai.provider === 'anthropic') {
      // Anthropic native messages API with document content block
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
    } else {
      throw new Error(`Provider "${ai.provider}" does not support PDF extraction`);
    }

    if (!extractedText || extractedText.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract text from PDF', provider_used: ai.provider }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: extractedText,
        char_count: extractedText.length,
        provider_used: ai.provider,
        provider_fallback: ai.fallback,
      }),
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
