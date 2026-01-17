import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateRequest {
  topic: string;
  pillar_content?: string;
  target_channels: string[];
  brand_voice?: string;
  schedule_for?: string;
}

// Detailed channel-specific prompts for richer content generation
const CHANNEL_PROMPTS: Record<string, string> = {
  blog: `Create a comprehensive blog article with:
- title: Compelling, SEO-optimized headline (50-60 chars)
- excerpt: Engaging meta description that drives clicks (150-160 chars)
- body: Well-structured article (800-1200 words) with:
  * An attention-grabbing introduction
  * 3-5 main sections with clear subheadings (use ## for H2)
  * Bullet points or numbered lists where appropriate
  * Practical examples or actionable tips
  * A strong conclusion with a call-to-action
- seo_keywords: Array of 5-7 relevant long-tail keywords
- estimated_reading_time: Number in minutes`,

  newsletter: `Create an engaging email newsletter with:
- subject: Compelling email subject line (40-50 chars, creates curiosity or urgency)
- preview_text: Preview/preheader text that complements subject (90-100 chars)
- headline: Main headline inside the email
- intro: Personal greeting and hook (2-3 sentences)
- body: Main content with clear value proposition (200-400 words)
- cta_text: Primary call-to-action button text
- cta_url_placeholder: Placeholder like "[LINK]" for the CTA
- ps_line: Optional P.S. line for extra engagement`,

  linkedin: `Create a professional LinkedIn post with:
- text: Engaging professional post (1000-1300 chars) with:
  * A strong hook in the first line (this appears before "see more")
  * Line breaks for readability (use \\n\\n for paragraph breaks)
  * A personal angle or insight
  * Specific data points or examples when relevant
  * A question or call-to-action at the end to encourage engagement
- hashtags: Array of 3-5 relevant, professional hashtags (without #)`,

  instagram: `Create a visually-focused Instagram post with:
- caption: Engaging caption (300-500 chars) with:
  * Hook in the first line
  * Emojis used strategically (2-4 per post)
  * Line breaks for scannability
  * Call-to-action (save, share, comment)
- hashtags: Array of 20-30 relevant hashtags (mix of popular, niche, and branded, without #)
- suggested_image_prompt: Detailed DALL-E/Midjourney style prompt for image generation (describe style, colors, composition, mood)
- alt_text: Accessibility description of the suggested image`,

  twitter: `Create an engaging Twitter/X thread with:
- thread: Array of 5-8 tweets, each max 280 chars:
  * Tweet 1: Hook that makes people want to read more
  * Tweets 2-6: Main content, one key point per tweet
  * Final tweet: Summary + call-to-action with a question
  * Use emojis sparingly for visual breaks
- single_tweet: Standalone tweet version (280 chars max) for quick sharing`,

  facebook: `Create a Facebook post optimized for engagement with:
- text: Conversational post (100-250 words) with:
  * Relatable opening
  * Story or personal angle
  * Question to encourage comments
- link_preview_title: Title for link preview if sharing a URL
- link_preview_description: Description for link preview`,

  print: `Create print-ready content with:
- format: "A4"
- headline: Print headline (8-12 words)
- subheadline: Supporting headline
- body: Formal, well-structured article (600-1000 words) suitable for print publication
- sidebar_content: Pull quote or key statistics for sidebar
- author_bio_placeholder: "[AUTHOR BIO]"`,
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
      temperature: 0.8, // Slightly higher for more creative content
      max_tokens: 4000, // Allow for longer content
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
          temperature: 0.8,
          maxOutputTokens: 4000,
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
  
  // Handle different response formats from n8n/local LLM
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

    const { topic, pillar_content, target_channels, brand_voice, schedule_for }: GenerateRequest = await req.json();

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

    // Build channel-specific prompts
    const channelInstructions = target_channels
      .filter(ch => CHANNEL_PROMPTS[ch])
      .map(ch => `### ${ch.toUpperCase()}\n${CHANNEL_PROMPTS[ch]}`)
      .join("\n\n");

    const systemPrompt = `You are an expert content strategist, copywriter, and social media specialist. Your task is to generate high-quality, platform-optimized content across multiple channels.

BRAND VOICE:
${brand_voice || "Professional yet approachable. Authoritative but friendly. Use clear, concise language that resonates with a business audience."}

CONTENT PRINCIPLES:
1. Each channel must feel native to that platform - not just reformatted text
2. Lead with value - what will the reader learn or gain?
3. Use specific examples, data, or stories when possible
4. Every piece should have a clear purpose and call-to-action
5. Maintain consistent messaging while adapting tone per platform

OUTPUT FORMAT:
Return ONLY valid JSON. No markdown code blocks, no explanations - just the raw JSON object.`;

    const userPrompt = `CONTENT TOPIC: "${topic}"

${pillar_content ? `PILLAR CONTENT / RESEARCH:\n${pillar_content}\n\nUse this as the foundation for all channel content. Extract key points, statistics, and insights to repurpose.\n` : ""}

REQUESTED CHANNELS:

${channelInstructions}

---

Generate comprehensive, publication-ready content for each channel listed above.

Return a JSON object with this exact structure:
{
  "pillar_summary": "A 2-3 sentence summary of the core message/theme that unifies all channel content",
  "key_messages": ["Message 1", "Message 2", "Message 3"],
  "channel_variants": {
    // Include ONLY the channels requested above, with all their specified fields
  }
}`;

    console.log("Generating content for channels:", target_channels);
    console.log("Using AI provider:", openaiKey ? "OpenAI" : geminiKey ? "Gemini" : "Local LLM");

    let generatedContent: any;
    let aiProvider: string = "unknown";

    try {
      if (openaiKey) {
        aiProvider = "openai";
        generatedContent = await generateWithOpenAI(systemPrompt, userPrompt, openaiKey);
      } else if (geminiKey) {
        aiProvider = "gemini";
        generatedContent = await generateWithGemini(systemPrompt, userPrompt, geminiKey);
      } else if (n8nWebhookUrl) {
        aiProvider = "local_llm";
        generatedContent = await generateWithLocalLLM(systemPrompt, userPrompt, n8nWebhookUrl);
      }
    } catch (aiError: any) {
      console.error("AI generation error:", aiError);
      
      // Try fallback providers
      if (aiProvider === "openai" && geminiKey) {
        console.log("Falling back to Gemini...");
        aiProvider = "gemini";
        generatedContent = await generateWithGemini(systemPrompt, userPrompt, geminiKey);
      } else if (aiProvider === "openai" && n8nWebhookUrl) {
        console.log("Falling back to Local LLM...");
        aiProvider = "local_llm";
        generatedContent = await generateWithLocalLLM(systemPrompt, userPrompt, n8nWebhookUrl);
      } else {
        throw aiError;
      }
    }

    // Validate the generated content structure
    if (!generatedContent || !generatedContent.channel_variants) {
      throw new Error("Invalid content structure received from AI");
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
          channels_requested: target_channels,
          channels_generated: Object.keys(generatedContent.channel_variants || {}),
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
