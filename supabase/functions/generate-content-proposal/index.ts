import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AI_MODELS } from '../shared/ai-models.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  topic: string;
  pillar_content?: string;
  target_channels: string[];
  brand_voice?: string;
  target_audience?: string;
  tone_level?: number; // 1-5 (1=formal, 5=casual)
  industry?: string;
  content_goals?: string[];
  unique_angle?: string;
  schedule_for?: string;
}

// Tone descriptions based on 1-5 scale
const TONE_DESCRIPTIONS: Record<number, string> = {
  1: "Highly formal and professional. Use industry terminology, avoid contractions, maintain corporate gravitas.",
  2: "Professional but approachable. Formal structure with occasional warm touches.",
  3: "Balanced tone. Professional credibility with conversational warmth. Like a knowledgeable colleague.",
  4: "Conversational and friendly. Use contractions, personal pronouns, relatable examples.",
  5: "Casual and playful. Conversational, uses humor appropriately, feels like a friend sharing insights.",
};

// Enhanced channel-specific prompts with detailed instructions
const CHANNEL_PROMPTS: Record<string, string> = {
  blog: `Create a comprehensive blog article with:
- title: Compelling, SEO-optimized headline (50-60 chars). Use power words, numbers, or questions.
- excerpt: Engaging meta description that creates curiosity and drives clicks (150-160 chars). Include primary keyword naturally.
- body: Well-structured article (800-1200 words) with:
  * HOOK: Open with a surprising statistic, contrarian opinion, relatable problem, or compelling question (first 2-3 sentences are crucial)
  * STRUCTURE: Use short paragraphs (2-3 sentences max), clear subheadings (## for H2) every 150-200 words
  * SCANNABLE: Include bullet points, numbered lists, bold key phrases
  * VALUE: Provide specific, actionable insights - avoid generic advice
  * EXAMPLES: Include at least 2 concrete examples or case studies
  * INTERNAL LINKS: Add placeholders like [RELATED: topic] for internal linking opportunities
  * CONCLUSION: Strong wrap-up with clear call-to-action
- seo_keywords: Array of 5-7 relevant long-tail keywords (include primary + secondary)
- estimated_reading_time: Number in minutes`,

  newsletter: `Create an engaging email newsletter with structured blocks:
- subject: Compelling email subject line (40-50 chars). Use one of these formulas:
  * Curiosity gap: "The [unexpected thing] that changed my [outcome]"
  * FOMO: "Last chance: [benefit] expires [timeframe]"
  * Benefit-driven: "[Number] ways to [achieve desired outcome]"
  * Question: "Are you making this [topic] mistake?"
- preview_text: Preview/preheader text that COMPLEMENTS (not repeats) subject (90-100 chars). Add context or tease the content.
- blocks: Array of 6-10 content blocks in this format:
  [
    { "type": "heading", "content": "Main headline (clear value proposition)" },
    { "type": "paragraph", "content": "Personal greeting and hook (2-3 sentences). Start with 'you' not 'I/we'." },
    { "type": "paragraph", "content": "First key point or insight. Be specific, use examples." },
    { "type": "bullet-list", "items": ["Point 1 with specific detail", "Point 2 with actionable tip", "Point 3 with example"] },
    { "type": "paragraph", "content": "Deeper explanation or story that supports the main message." },
    { "type": "callout", "content": "Key quote, statistic, or important highlight that stands out." },
    { "type": "paragraph", "content": "Additional value or insight. Connect to reader's pain points." },
    { "type": "cta", "text": "Action verb + benefit (e.g., 'Get your free guide')", "url": "[LINK]" },
    { "type": "divider" },
    { "type": "paragraph", "content": "P.S. line that reinforces urgency or adds a secondary offer" }
  ]
  Block types available: heading, paragraph, bullet-list, numbered-list, callout, cta, divider, image-placeholder
  IMPORTANT: Generate at least 6 blocks for a complete newsletter. Include variety - mix paragraphs with lists, callouts, and CTAs.`,

  linkedin: `Create a professional LinkedIn post with:
- text: Engaging professional post (1200-1500 chars) with:
  * HOOK (first line is CRITICAL - appears before "see more"):
    - Use patterns like: "I used to think X. Then I learned Y."
    - Or: "Unpopular opinion: [statement]"
    - Or: "Here's what nobody tells you about [topic]:"
    - Or: "After [experience], I discovered [insight]"
  * STRUCTURE: Use \\n\\n for paragraph breaks (improves readability dramatically)
  * CONTENT: Share a personal insight, lesson learned, or contrarian take
  * SPECIFICS: Include numbers, percentages, or concrete results when possible
  * READABILITY: Vary sentence length. Short punchy sentences mixed with longer explanatory ones.
  * ENGAGEMENT: End with a genuine question that invites discussion (not generic "What do you think?")
- hashtags: Array of 3-5 relevant, professional hashtags (without #). Mix industry terms with trending topics.
- emoji_usage: Maximum 2-3 emojis, placed strategically (not decorative)`,

  instagram: `Create a visually-focused Instagram post with:
- caption: Engaging caption (300-500 chars) with:
  * HOOK: First line must stop the scroll (question, bold statement, or intrigue)
  * STRUCTURE: Line breaks for scannability (use \\n for breaks)
  * VALUE: Provide genuine value - tips, insights, or entertainment
  * EMOJIS: Use 2-4 strategically placed emojis (not random decoration)
  * CTA: Clear call-to-action (save this for later, share with someone who needs this, comment your [X])
- hashtags: Array of 5-10 relevant hashtags (NOT 20-30 - algorithm has changed). Mix:
  * 2-3 broad/popular (500K-2M posts)
  * 3-4 niche-specific (50K-500K posts)  
  * 1-2 branded or very specific
- suggested_image_prompt: Detailed image generation prompt. Include: style (minimalist, bold, lifestyle), colors (specific palette), composition (rule of thirds, centered), mood (inspiring, professional, playful), text overlay suggestions if applicable.
- alt_text: Descriptive accessibility text (what's IN the image, not SEO keywords)`,

  twitter: `Create an engaging Twitter/X content with:
- thread: Array of 5-8 tweets for a thread:
  * Tweet 1: HOOK - Must work as standalone. Create curiosity, make a bold claim, or pose an intriguing question. Add "🧵" at end.
  * Tweets 2-6: ONE clear point per tweet. Use numbers ("1/", "2/") for clarity. Each should provide value even if read alone.
  * Second-to-last: Summarize key takeaways
  * Final tweet: CTA with engagement trigger (Follow for more [topic], RT if this helped, Save this thread)
  * NOTE: Tweets can be up to 280 chars - USE the space. Longer tweets get better reach in 2024+.
- single_tweet: Standalone tweet version (280 chars max). Include:
  * Strong opinion or insight
  * Specific detail or number if possible
  * Implicit CTA or discussion prompt`,

  facebook: `Create a Facebook post optimized for engagement with:
- text: Conversational post (100-250 words) with:
  * STORY: Open with a relatable personal anecdote or situation
  * LESSON: Share the insight or lesson learned
  * QUESTION: End with a genuine question to encourage comments (algorithm rewards comments)
  * TONE: Warm, personal, community-focused
  * FORMAT: Short paragraphs, easy to read on mobile
- link_preview_title: Compelling title for link preview if sharing a URL (60 chars max)
- link_preview_description: Description that expands on the title's promise (155 chars max)`,

  print: `Create print-ready content with:
- format: "A4"
- headline: Print headline (8-12 words). Clear, impactful, works without digital context.
- subheadline: Supporting headline that adds context or benefit
- body: Formal, well-structured article (600-1000 words) suitable for print publication:
  * More formal tone than digital
  * Complete sentences and proper paragraphs
  * No links or digital CTAs
  * Designed for linear reading
- sidebar_content: Pull quote or 3-4 key statistics for sidebar display
- author_bio_placeholder: "[AUTHOR BIO]"
- print_cta: Offline call-to-action (visit our office, call this number, etc.)`,
};

// Content validation rules
const VALIDATION_RULES: Record<string, { minWords?: number; maxChars?: number; maxHashtags?: number }> = {
  blog: { minWords: 600 },
  newsletter: { minWords: 150 },
  linkedin: { maxChars: 3000 },
  instagram: { maxHashtags: 10 },
  twitter: { maxChars: 280 },
  facebook: { minWords: 50 },
  print: { minWords: 400 },
};

async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string
): Promise<any> {
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
      temperature: 0.8,
      max_tokens: 8000,
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
): Promise<any> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODELS.gemini.default}:generateContent?key=${apiKey}`,
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
          temperature: 0.8,
          maxOutputTokens: 8000,
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
): Promise<any> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "generate-content",
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

function buildSystemPrompt(request: GenerateRequest): string {
  const toneDescription = TONE_DESCRIPTIONS[request.tone_level || 3];
  const goalsText = request.content_goals?.length 
    ? request.content_goals.join(", ") 
    : "Engagement and awareness";
  
  return `You are an expert content strategist, copywriter, and social media specialist with 10+ years of experience creating viral, high-performing content across all major platforms.

═══════════════════════════════════════════════════════
BRAND CONTEXT
═══════════════════════════════════════════════════════

INDUSTRY: ${request.industry || "General/Business"}

TARGET AUDIENCE: ${request.target_audience || "Professionals and business decision-makers"}

UNIQUE POSITIONING: ${request.unique_angle || "Not specified - focus on providing genuine value and unique insights"}

BRAND VOICE: ${request.brand_voice || "Professional yet approachable"}

TONE CALIBRATION (${request.tone_level || 3}/5):
${toneDescription}

═══════════════════════════════════════════════════════
CONTENT GOALS
═══════════════════════════════════════════════════════
Primary objectives: ${goalsText}

═══════════════════════════════════════════════════════
CRITICAL RULES - FOLLOW EXACTLY
═══════════════════════════════════════════════════════

1. NATIVE FEEL: Each channel MUST feel native to that platform. A LinkedIn post should NOT read like a shortened blog post. An Instagram caption should NOT read like a formal article.

2. HOOKS ARE EVERYTHING: The first line/sentence determines if people read further. Spend extra effort on hooks. Use proven formulas.

3. SPECIFICITY WINS: Replace generic advice with specific examples, numbers, percentages, and actionable steps. "Increase productivity" → "Save 2.5 hours per week with this 3-step system"

4. READABILITY: Vary sentence length. Short sentences create impact. Longer ones provide depth and nuance when needed. But never let paragraphs run too long.

5. PLATFORM PSYCHOLOGY:
   - LinkedIn: Professional credibility + personal vulnerability = engagement
   - Twitter: Contrarian takes + specific insights = shares
   - Instagram: Visual storytelling + emotional connection = saves
   - Newsletter: Exclusive value + personal touch = opens
   - Blog: Comprehensive + scannable = SEO + shares

6. CTAs MATTER: Every piece needs a clear, platform-appropriate call-to-action. Not generic "click here" but specific, benefit-driven actions.

7. AVOID: Clichés ("In today's fast-paced world"), passive voice, filler phrases, generic openings ("Are you looking to..."), clickbait without substance.

═══════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════
Return ONLY valid JSON. No markdown code blocks, no explanations outside the JSON - just the raw JSON object.`;
}

function validateContent(content: any, channels: string[]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  for (const channel of channels) {
    const variant = content.channel_variants?.[channel];
    if (!variant) {
      issues.push(`Missing content for ${channel}`);
      continue;
    }
    
    const rules = VALIDATION_RULES[channel];
    if (!rules) continue;
    
    // Check word count for body content
    if (rules.minWords) {
      const textContent = variant.body || variant.text || variant.caption || variant.content || '';
      const wordCount = textContent.split(/\s+/).filter(Boolean).length;
      if (wordCount < rules.minWords * 0.8) { // 80% threshold for flexibility
        issues.push(`${channel}: Content may be too short (${wordCount} words, recommend ${rules.minWords}+)`);
      }
    }
    
    // Check character limits
    if (rules.maxChars && channel === 'twitter' && variant.single_tweet) {
      if (variant.single_tweet.length > rules.maxChars) {
        issues.push(`${channel}: Single tweet exceeds ${rules.maxChars} chars`);
      }
    }
    
    // Check hashtag limits
    if (rules.maxHashtags && variant.hashtags?.length > rules.maxHashtags) {
      issues.push(`${channel}: Too many hashtags (${variant.hashtags.length}, max ${rules.maxHashtags})`);
    }
  }
  
  return { valid: issues.length === 0, issues };
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

    const requestData: GenerateRequest = await req.json();
    const { 
      topic, 
      pillar_content, 
      target_channels, 
      brand_voice,
      target_audience,
      tone_level,
      industry,
      content_goals,
      unique_angle,
      schedule_for 
    } = requestData;

    if (!topic) {
      return new Response(JSON.stringify({ error: "Topic is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!target_channels || target_channels.length === 0) {
      return new Response(JSON.stringify({ error: "At least one target channel is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for AI providers (priority: OpenAI > Gemini > Local LLM via N8N)
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const n8nWebhookUrl = Deno.env.get("N8N_WEBHOOK_URL");

    if (!openaiKey && !geminiKey && !n8nWebhookUrl) {
      return new Response(JSON.stringify({ 
        error: "No AI provider configured. Please add OPENAI_API_KEY, GEMINI_API_KEY, or N8N_WEBHOOK_URL in your environment." 
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build enhanced system prompt
    const systemPrompt = buildSystemPrompt(requestData);

    // Build channel-specific instructions
    const channelInstructions = target_channels
      .filter(ch => CHANNEL_PROMPTS[ch])
      .map(ch => `### ${ch.toUpperCase()}\n${CHANNEL_PROMPTS[ch]}`)
      .join("\n\n");

    const userPrompt = `═══════════════════════════════════════════════════════
CONTENT BRIEF
═══════════════════════════════════════════════════════

TOPIC: "${topic}"

${target_audience ? `TARGET AUDIENCE: ${target_audience}\n` : ""}
${industry ? `INDUSTRY CONTEXT: ${industry}\n` : ""}
${unique_angle ? `UNIQUE ANGLE/DIFFERENTIATION: ${unique_angle}\n` : ""}
${content_goals?.length ? `CONTENT GOALS: ${content_goals.join(", ")}\n` : ""}

${pillar_content ? `═══════════════════════════════════════════════════════
SOURCE MATERIAL / KEY POINTS
═══════════════════════════════════════════════════════
${pillar_content}

Use this as the foundation. Extract key points, statistics, and insights to repurpose across channels while maintaining the core message.
` : ""}

═══════════════════════════════════════════════════════
CHANNEL SPECIFICATIONS
═══════════════════════════════════════════════════════

${channelInstructions}

═══════════════════════════════════════════════════════
OUTPUT STRUCTURE
═══════════════════════════════════════════════════════

Return a JSON object with this EXACT structure:
{
  "pillar_summary": "A 2-3 sentence summary of the core message/theme that unifies all channel content",
  "key_messages": ["3-5 key messages/points that appear across all content"],
  "content_strategy_notes": "Brief notes on how the content was adapted for each platform",
  "channel_variants": {
    // Include ONLY the channels requested above, with ALL their specified fields
  }
}

CRITICAL: Generate comprehensive, publication-ready content. Each piece should require minimal editing before publishing.`;

    console.log("Generating content for channels:", target_channels);
    console.log("Using tone level:", tone_level || 3);
    console.log("Target audience:", target_audience || "default");

    let generatedContent: any;
    let aiProvider: string = "unknown";

    // Try providers in order of preference (OpenAI > Gemini > Local LLM)
    const providers = [
      { key: openaiKey, name: "openai", fn: generateWithOpenAI },
      { key: geminiKey, name: "gemini", fn: generateWithGemini },
      { key: n8nWebhookUrl, name: "local_llm", fn: generateWithLocalLLM },
    ];

    for (const provider of providers) {
      if (!provider.key) continue;
      
      try {
        console.log(`Trying ${provider.name}...`);
        aiProvider = provider.name;
        generatedContent = await provider.fn(systemPrompt, userPrompt, provider.key);
        break;
      } catch (error: any) {
        console.error(`${provider.name} error:`, error.message);
        // Continue to next provider
      }
    }

    if (!generatedContent) {
      throw new Error("All AI providers failed. Please try again later.");
    }

    // Validate the generated content structure
    if (!generatedContent || !generatedContent.channel_variants) {
      throw new Error("Invalid content structure received from AI");
    }

    // Validate content quality
    const validation = validateContent(generatedContent, target_channels);
    if (!validation.valid) {
      console.warn("Content validation issues:", validation.issues);
    }

    // Ensure all requested channels are present
    const missingChannels = target_channels.filter(ch => !generatedContent.channel_variants[ch]);
    if (missingChannels.length > 0) {
      console.warn("Missing channels in AI response:", missingChannels);
    }

    // Create the proposal in the database
    const { data: proposal, error: insertError } = await supabase
      .from("content_proposals")
      .insert({
        topic,
        pillar_content: generatedContent.pillar_summary || pillar_content || topic,
        channel_variants: generatedContent.channel_variants || {},
        source_research: { 
          generated_by: aiProvider,
          key_messages: generatedContent.key_messages || [],
          content_strategy_notes: generatedContent.content_strategy_notes || null,
          channels_requested: target_channels,
          channels_generated: Object.keys(generatedContent.channel_variants || {}),
          validation_issues: validation.issues,
          generation_params: {
            target_audience,
            tone_level: tone_level || 3,
            industry,
            content_goals,
            unique_angle,
          },
          generated_at: new Date().toISOString(),
        },
        scheduled_for: schedule_for || null,
        created_by: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Database error: ${insertError.message}`);
    }

    console.log("Content proposal created:", proposal.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        proposal,
        validation_issues: validation.issues,
        message: `Content proposal generated for ${Object.keys(generatedContent.channel_variants || {}).length} channels using ${aiProvider}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error generating content proposal:", error);
    const message = error instanceof Error ? error.message : "Failed to generate content proposal";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
