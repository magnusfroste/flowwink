import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AIAction = 'expand' | 'improve' | 'translate' | 'summarize' | 'continue';

interface GenerateRequest {
  text: string;
  action: AIAction;
  context?: string;
  targetLanguage?: string;
  tone?: 'professional' | 'friendly' | 'formal';
}

function getSystemPrompt(action: AIAction, context?: string, targetLanguage?: string, tone?: string, language?: string): string {
  const toneInstruction = tone === 'friendly' 
    ? 'Use a warm, approachable tone.' 
    : tone === 'formal' 
    ? 'Use a formal, professional tone.'
    : 'Use a clear, professional tone.';

  const contextInstruction = context 
    ? `Context: This is for a page about "${context}". ` 
    : '';

  const LANG_NAMES: Record<string, string> = {
    sv: 'Swedish', en: 'English', no: 'Norwegian', da: 'Danish', fi: 'Finnish', de: 'German',
  };
  const langName = language ? LANG_NAMES[language] || language : null;
  const languageInstruction = langName 
    ? `IMPORTANT: Write ALL output in ${langName}.` 
    : 'Keep the language the same as the input.';

  const prompts: Record<AIAction, string> = {
    expand: `You are a professional content writer. ${contextInstruction}${toneInstruction}
Take the provided keywords or short text and expand it into a well-written paragraph. 
${languageInstruction}
Only output the expanded text, no explanations or quotes.`,
    
    improve: `You are a professional editor. ${contextInstruction}${toneInstruction}
Improve the provided text for clarity, grammar, and flow while preserving its meaning.
${languageInstruction}
Only output the improved text, no explanations or quotes.`,
    
    translate: `You are a professional translator. ${contextInstruction}
Translate the provided text to ${targetLanguage || 'English'}.
Maintain the same tone and meaning.
Only output the translation, no explanations or quotes.`,
    
    summarize: `You are a professional editor. ${contextInstruction}${toneInstruction}
Summarize the provided text in 1-2 concise sentences.
${languageInstruction}
Only output the summary, no explanations or quotes.`,
    
    continue: `You are a professional content writer. ${contextInstruction}${toneInstruction}
Continue the provided text naturally with 2-3 more sentences.
Keep the same style and tone as the input.
${languageInstruction}
Only output the continuation (not the original text), no explanations or quotes.`
  };

  return prompts[action];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, action, context, targetLanguage, tone } = await req.json() as GenerateRequest;
    
    if (!text || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: text and action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const validActions: AIAction[] = ['expand', 'improve', 'translate', 'summarize', 'continue'];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AI provider from environment (defaults to OpenAI)
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    
    if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
      console.error('No AI API key configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured. Please add OPENAI_API_KEY or GEMINI_API_KEY to Supabase Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if the AI integration is enabled and get system AI settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get system AI settings
    const { data: systemAiRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'system_ai')
      .maybeSingle();

    const systemAiSettings = systemAiRow?.value as {
      provider?: 'openai' | 'gemini';
      openaiModel?: string;
      geminiModel?: string;
      defaultTone?: string;
      defaultLanguage?: string;
    } || {};

    // Determine provider from settings (fallback to env-based logic)
    const configuredProvider = systemAiSettings.provider;
    let useGemini = false;
    
    if (configuredProvider === 'gemini' && GEMINI_API_KEY) {
      useGemini = true;
    } else if (configuredProvider === 'openai' && OPENAI_API_KEY) {
      useGemini = false;
    } else {
      // Fallback: use whichever key is available
      useGemini = !OPENAI_API_KEY && !!GEMINI_API_KEY;
    }

    const { data: integrationSettings } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();

    const aiIntegrations = integrationSettings?.value as any;
    
    if (useGemini) {
      const geminiEnabled = aiIntegrations?.gemini?.enabled ?? false;
      if (!geminiEnabled) {
        console.log('[generate-text] Gemini integration is disabled');
        return new Response(
          JSON.stringify({ error: 'Gemini integration is disabled. Enable it in Integrations settings.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      const openaiEnabled = aiIntegrations?.openai?.enabled ?? false;
      if (!openaiEnabled) {
        console.log('[generate-text] OpenAI integration is disabled');
        return new Response(
          JSON.stringify({ error: 'OpenAI integration is disabled. Enable it in Integrations settings.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use tone and language from request or fall back to system settings
    const effectiveTone = tone || systemAiSettings.defaultTone || 'professional';
    const effectiveLanguage = systemAiSettings.defaultLanguage || undefined;
    const systemPrompt = getSystemPrompt(action, context, targetLanguage, effectiveTone, effectiveLanguage);
    
    // Get model from settings
    const geminiModel = systemAiSettings.geminiModel || 'gemini-2.0-flash-exp';
    const openaiModel = systemAiSettings.openaiModel || 'gpt-4o-mini';
    
    console.log(`Generating text with action: ${action}, provider: ${useGemini ? 'gemini' : 'openai'}, model: ${useGemini ? geminiModel : openaiModel}, input length: ${text.length}`);

    let response: Response;

    if (useGemini) {
      // Use Google Gemini API
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${text}` }]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          }
        }),
      });
    } else {
      // Use OpenAI API
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: openaiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to generate text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    // Parse response based on provider
    let generatedText = '';
    if (useGemini) {
      // Gemini response format
      generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // OpenAI response format
      generatedText = data.choices?.[0]?.message?.content || '';
    }

    if (!generatedText) {
      console.error('No text generated from AI');
      return new Response(
        JSON.stringify({ error: 'Failed to generate text' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generated text length: ${generatedText.length}`);

    return new Response(
      JSON.stringify({ generatedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-text function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
