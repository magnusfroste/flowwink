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

const CHANNEL_PROMPTS: Record<string, string> = {
  blog: `Create a blog article with:
- title: Compelling headline (under 60 chars)
- excerpt: Meta description (under 160 chars)
- body: Full article (500-800 words)
- seo_keywords: Array of 5-7 relevant keywords`,

  newsletter: `Create an email newsletter with:
- subject: Email subject line (under 50 chars, engaging)
- preview_text: Preview text (under 100 chars)
- blocks: Empty array (content will be adapted)`,

  linkedin: `Create a LinkedIn post with:
- text: Professional post (1300 chars max, use line breaks)
- hashtags: Array of 3-5 relevant hashtags (without #)`,

  instagram: `Create an Instagram post with:
- caption: Engaging caption (2200 chars max, with emojis)
- hashtags: Array of 20-30 relevant hashtags (without #)
- suggested_image_prompt: Detailed image generation prompt`,

  twitter: `Create a Twitter/X thread with:
- thread: Array of tweets (each max 280 chars)`,

  facebook: `Create a Facebook post with:
- text: Engaging post (ideal 40-80 words)`,

  print: `Create print-ready content with:
- format: "A4"
- content: Formal article text suitable for print`,
};

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

    // Check for AI provider
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (!openaiKey && !geminiKey) {
      return new Response(JSON.stringify({ error: "No AI provider configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build channel-specific prompts
    const channelInstructions = target_channels
      .filter(ch => CHANNEL_PROMPTS[ch])
      .map(ch => `### ${ch.toUpperCase()}\n${CHANNEL_PROMPTS[ch]}`)
      .join("\n\n");

    const systemPrompt = `You are a professional content strategist and copywriter. Generate multi-channel content based on a topic and optional pillar content.

${brand_voice ? `Brand voice: ${brand_voice}` : "Use a professional yet approachable tone."}

IMPORTANT: Return valid JSON only. No markdown, no code blocks, just the JSON object.

For each requested channel, create optimized content following platform best practices.`;

    const userPrompt = `Topic: "${topic}"

${pillar_content ? `Pillar Content:\n${pillar_content}\n\n` : ""}

Generate content for these channels:

${channelInstructions}

Return a JSON object with this structure:
{
  "pillar_summary": "Brief summary of the main content theme",
  "channel_variants": {
    // Include only the requested channels with their respective fields
  }
}`;

    let generatedContent: any;

    if (openaiKey) {
      // Use OpenAI
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${error}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      generatedContent = JSON.parse(content);

    } else if (geminiKey) {
      // Use Gemini
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
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
              temperature: 0.7,
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
      generatedContent = JSON.parse(content);
    }

    // Create the proposal in the database
    const { data: proposal, error: insertError } = await supabase
      .from("content_proposals")
      .insert({
        topic,
        pillar_content: generatedContent.pillar_summary || pillar_content,
        channel_variants: generatedContent.channel_variants || {},
        source_research: { generated_by: openaiKey ? "openai" : "gemini" },
        scheduled_for: schedule_for || null,
        created_by: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Database error: ${insertError.message}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        proposal,
        message: `Content proposal generated for ${target_channels.length} channels`
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
