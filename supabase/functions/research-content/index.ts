import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResearchRequest {
  topic: string;
  target_audience?: string;
  industry?: string;
  target_channels: string[];
}

interface ResearchResponse {
  topic_analysis: {
    main_theme: string;
    sub_topics: string[];
    key_questions: string[];
  };
  content_angles: Array<{
    angle: string;
    description: string;
    why_it_works: string;
    hook_example: string;
    best_for_channels: string[];
  }>;
  audience_insights: {
    pain_points: string[];
    desires: string[];
    objections: string[];
    language_patterns: string[];
  };
  competitive_landscape: {
    common_approaches: string[];
    content_gaps: string[];
    differentiation_opportunities: string[];
  };
  content_hooks: {
    curiosity_hooks: string[];
    controversy_hooks: string[];
    story_hooks: string[];
    data_hooks: string[];
  };
  recommended_structure: {
    opening_strategy: string;
    key_points: string[];
    closing_strategy: string;
    cta_suggestions: string[];
  };
  seo_insights?: {
    primary_keywords: string[];
    secondary_keywords: string[];
    questions_people_ask: string[];
  };
}

const RESEARCH_SYSTEM_PROMPT = `You are a world-class content strategist and creative director with 15+ years of experience. Your specialty is transforming basic topic ideas into compelling, differentiated content strategies that stand out from generic content.

Your role is to conduct deep content research and ideation BEFORE any content is written. You think like a combination of:
- A journalist investigating a story (finding unique angles)
- A psychologist understanding audience motivations
- A strategist identifying competitive advantages
- A copywriter crafting compelling hooks

═══════════════════════════════════════════════════════
YOUR RESEARCH PROCESS
═══════════════════════════════════════════════════════

1. TOPIC DECONSTRUCTION
   - Break down the topic into its core themes and sub-topics
   - Identify the "real" story beneath the surface
   - Find unexpected connections to other subjects

2. ANGLE GENERATION (THE CREATIVE CORE)
   - Generate 5 distinct angles, ranging from safe to bold
   - Each angle should have a clear "why it works" rationale
   - Include hook examples for each angle

3. AUDIENCE PSYCHOLOGY
   - Map pain points to desires
   - Identify objections before they arise
   - Note language patterns your audience actually uses

4. COMPETITIVE ANALYSIS
   - What is everyone else saying about this topic?
   - Where are the content gaps?
   - What contrarian position could you take?

5. HOOK CRAFTING
   - Generate multiple hook types for flexibility
   - Include curiosity, controversy, story, and data-driven options

═══════════════════════════════════════════════════════
ANGLE CREATIVITY GUIDELINES
═══════════════════════════════════════════════════════

Generate angles on a spectrum from "safe" to "bold":

LEVEL 1 - SAFE (Educational/Standard)
- Straightforward how-to or explainer
- Good for building trust, low risk

LEVEL 2 - INTERESTING (Unique Take)
- Fresh perspective on a common topic
- Includes surprising insights or data

LEVEL 3 - COMPELLING (Story-Driven)
- Personal narrative or case study angle
- Emotional connection + practical value

LEVEL 4 - PROVOCATIVE (Contrarian)
- Challenges conventional wisdom
- "Why everything you know about X is wrong"

LEVEL 5 - BOLD (Polarizing)
- Strong opinion that will alienate some
- Creates advocates, not just readers

Always include at least one Level 3+ angle. Safe content doesn't get shared.

═══════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════

Return ONLY valid JSON matching the exact structure requested. No markdown, no explanations outside JSON.`;

async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<ResearchResponse> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9, // Higher creativity for research phase
      max_tokens: 6000,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("No content received from OpenAI");
  }
  
  return JSON.parse(content);
}

async function generateWithGemini(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<ResearchResponse> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 6000,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    throw new Error("No content received from Gemini");
  }
  
  return JSON.parse(content);
}

async function generateWithLocalLLM(
  systemPrompt: string,
  userPrompt: string,
  webhookUrl: string
): Promise<ResearchResponse> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "research-content",
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      response_format: "json",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Local LLM error: ${error}`);
  }

  const data = await response.json();
  
  if (data.content) {
    return typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
  }
  if (data.result) {
    return typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
  }
  
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestData: ResearchRequest = await req.json();
    const { topic, target_audience, industry, target_channels } = requestData;

    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for AI providers
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");

    if (!openaiKey && !geminiKey && !n8nWebhookUrl) {
      return new Response(JSON.stringify({ 
        error: "No AI provider configured. Please add OPENAI_API_KEY, GEMINI_API_KEY, or N8N_WEBHOOK_URL." 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `═══════════════════════════════════════════════════════
RESEARCH BRIEF
═══════════════════════════════════════════════════════

TOPIC: "${topic}"

TARGET AUDIENCE: ${target_audience || "Professionals and business decision-makers interested in this topic"}

INDUSTRY CONTEXT: ${industry || "General / Business"}

TARGET CHANNELS: ${target_channels?.join(", ") || "Blog, Newsletter, LinkedIn, Social Media"}

═══════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════

Conduct comprehensive content research and generate a strategic brief. This research will be used to create the actual content, so be thorough and creative.

CRITICAL: Generate at least 5 distinct content angles, with a range from safe educational content to bold/provocative takes. The client needs OPTIONS to choose from.

Return your research in this JSON structure:
{
  "topic_analysis": {
    "main_theme": "The core theme distilled into one powerful sentence",
    "sub_topics": ["Related topics that could be woven in", "...", "..."],
    "key_questions": ["Questions the audience is actually asking", "...", "..."]
  },
  "content_angles": [
    {
      "angle": "Angle title/headline concept",
      "description": "2-3 sentences explaining the angle",
      "why_it_works": "The psychology/strategy behind this angle",
      "hook_example": "A specific opening hook for this angle",
      "best_for_channels": ["blog", "linkedin"]
    }
    // ... generate 5 angles minimum
  ],
  "audience_insights": {
    "pain_points": ["Specific frustrations related to this topic", "...", "..."],
    "desires": ["What they really want to achieve", "...", "..."],
    "objections": ["Why they might resist this content/message", "...", "..."],
    "language_patterns": ["Phrases and terms they actually use", "...", "..."]
  },
  "competitive_landscape": {
    "common_approaches": ["How most content covers this topic", "..."],
    "content_gaps": ["What's missing from existing content", "..."],
    "differentiation_opportunities": ["Ways to stand out", "..."]
  },
  "content_hooks": {
    "curiosity_hooks": ["Hook that creates curiosity gap", "...", "..."],
    "controversy_hooks": ["Hook with contrarian take", "...", "..."],
    "story_hooks": ["Hook that starts a narrative", "...", "..."],
    "data_hooks": ["Hook with surprising statistic/fact", "...", "..."]
  },
  "recommended_structure": {
    "opening_strategy": "How to open the content for maximum impact",
    "key_points": ["The 3-5 main points to cover", "...", "..."],
    "closing_strategy": "How to end for maximum action/retention",
    "cta_suggestions": ["Specific calls-to-action that fit this content", "..."]
  },
  "seo_insights": {
    "primary_keywords": ["Main search terms to target", "..."],
    "secondary_keywords": ["Related terms", "..."],
    "questions_people_ask": ["FAQ-style questions for this topic", "..."]
  }
}`;

    console.log("Starting content research for topic:", topic);

    let researchResult: ResearchResponse;
    let aiProvider: string = "unknown";

    // Try providers in order
    const providers = [
      { key: openaiKey, name: "openai", fn: generateWithOpenAI },
      { key: geminiKey, name: "gemini", fn: generateWithGemini },
      { key: n8nWebhookUrl, name: "local_llm", fn: generateWithLocalLLM },
    ];

    for (const provider of providers) {
      if (!provider.key) continue;
      
      try {
        console.log(`Trying ${provider.name} for research...`);
        aiProvider = provider.name;
        researchResult = await provider.fn(RESEARCH_SYSTEM_PROMPT, userPrompt, provider.key);
        break;
      } catch (error: any) {
        console.error(`${provider.name} error:`, error.message);
      }
    }

    if (!researchResult!) {
      throw new Error("All AI providers failed. Please try again later.");
    }

    console.log("Research completed using:", aiProvider);
    console.log("Generated angles:", researchResult.content_angles?.length || 0);

    return new Response(
      JSON.stringify({ 
        success: true, 
        research: researchResult,
        ai_provider: aiProvider,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in content research:", error);
    const message = error instanceof Error ? error.message : "Failed to complete research";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
