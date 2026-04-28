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

    // Resolve a vision-capable AI via the central config layer
    let ai;
    try {
      ai = await resolveAiConfig(supabase, 'multimodal');
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

    const extractionPrompt = `Extract ALL text content from this PDF document. 
Preserve the structure: headings, paragraphs, lists, tables.
Return ONLY the extracted text content, no commentary or formatting instructions.
If this is a resume/CV, preserve all sections clearly.`;

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
      // OpenAI accepts data URLs in image_url for PDF/image content
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
              { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64Pdf}` } },
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
