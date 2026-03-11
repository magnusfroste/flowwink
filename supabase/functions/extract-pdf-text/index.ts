import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Extract text from a PDF file stored in Supabase Storage.
 * 
 * Uses the system AI provider (Gemini/OpenAI) to extract text from PDF
 * by converting pages to base64 and using multimodal vision capabilities.
 * 
 * Input: { file_url: string } — public URL or storage path (bucket/path)
 * Output: { success: boolean, text: string, page_count: number }
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
      // Download from Supabase storage
      const parts = storage_path.split('/');
      const bucket = parts[0];
      const path = parts.slice(1).join('/');
      
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw new Error(`Storage download failed: ${error.message}`);
      pdfBytes = new Uint8Array(await data.arrayBuffer());
    } else {
      // Download from URL
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

    // Resolve AI provider from site_settings
    const { data: aiSettings } = await supabase
      .from('site_settings').select('value').eq('key', 'system_ai').maybeSingle();

    let apiKey = '';
    let apiUrl = '';
    let provider = 'gemini';

    if (aiSettings?.value) {
      const config = aiSettings.value as Record<string, any>;
      provider = config.provider || 'gemini';

      if (provider === 'openai') {
        apiKey = config.apiKey || Deno.env.get('OPENAI_API_KEY') || '';
        apiUrl = 'https://api.openai.com/v1/chat/completions';
      } else {
        apiKey = config.apiKey || Deno.env.get('GEMINI_API_KEY') || '';
      }
    } else {
      apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('OPENAI_API_KEY') || '';
      if (!apiKey && Deno.env.get('OPENAI_API_KEY')) provider = 'openai';
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'No AI API key configured. Set up System AI in settings.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert PDF to base64 for multimodal extraction
    const base64Pdf = btoa(String.fromCharCode(...pdfBytes));

    const extractionPrompt = `Extract ALL text content from this PDF document. 
Preserve the structure: headings, paragraphs, lists, tables.
Return ONLY the extracted text content, no commentary or formatting instructions.
If this is a resume/CV, preserve all sections clearly.`;

    let extractedText = '';

    if (provider === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                {
                  inline_data: {
                    mime_type: 'application/pdf',
                    data: base64Pdf,
                  },
                },
                { text: extractionPrompt },
              ],
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 16384,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini extraction error:', errText);
        throw new Error('AI extraction failed');
      }

      const result = await response.json();
      extractedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // OpenAI with vision
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: extractionPrompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Pdf}`,
                },
              },
            ],
          }],
          max_tokens: 16384,
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('OpenAI extraction error:', errText);
        throw new Error('AI extraction failed');
      }

      const result = await response.json();
      extractedText = result.choices?.[0]?.message?.content || '';
    }

    if (!extractedText || extractedText.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract text from PDF' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        text: extractedText,
        char_count: extractedText.length,
        provider_used: provider,
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
