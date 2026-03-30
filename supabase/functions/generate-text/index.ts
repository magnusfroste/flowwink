import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveAiConfig } from '../_shared/ai-config.ts';
import { callAi } from '../_shared/ai-call.ts';

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

    // Create Supabase client to read settings
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve AI provider using unified config
    const aiConfig = await resolveAiConfig(supabase, 'fast');

    // Get system AI settings for tone/language defaults
    const { data: systemAiRow } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'system_ai')
      .maybeSingle();

    const systemAiSettings = systemAiRow?.value as {
      defaultTone?: string;
      defaultLanguage?: string;
    } || {};

    const effectiveTone = tone || systemAiSettings.defaultTone || 'professional';
    const effectiveLanguage = systemAiSettings.defaultLanguage || undefined;
    const systemPrompt = getSystemPrompt(action, context, targetLanguage, effectiveTone, effectiveLanguage);
    
    console.log(`Generating text with action: ${action}, model: ${aiConfig.model}, input length: ${text.length}`);

    // All providers use unified callAi adapter (handles OpenAI, Gemini, Anthropic)
    const response = await callAi({
      apiKey: aiConfig.apiKey,
      apiUrl: aiConfig.apiUrl,
      model: aiConfig.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
    });

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
    const generatedText = data.choices?.[0]?.message?.content || '';

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
