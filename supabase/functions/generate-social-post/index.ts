import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PLATFORM_GUIDELINES: Record<string, { maxChars: number; format: string }> = {
  linkedin: {
    maxChars: 1300,
    format: 'Professional tone. Use line breaks for readability. Start with a compelling hook. End with relevant hashtags (3-5). Include a CTA.',
  },
  x: {
    maxChars: 280,
    format: 'Concise and punchy. Lead with the most compelling insight. Max 1-2 hashtags. Use thread format for longer content.',
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { source_type, source_id, topic, platforms, tone = 'professional' } = await req.json();

    if (!platforms || platforms.length === 0) {
      return new Response(JSON.stringify({ error: 'platforms required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    // Step 1: Fetch source content
    let sourceContent = '';
    let sourceTitle = '';
    let sourceUrl = '';

    if (source_type === 'blog_post' && source_id) {
      const { data: post } = await supabase.from('blog_posts')
        .select('title, excerpt, content_json, slug')
        .eq('id', source_id)
        .single();
      
      if (post) {
        sourceTitle = post.title;
        sourceUrl = `/blog/${post.slug}`;
        // Extract text from Tiptap content
        sourceContent = extractTiptapText(post.content_json);
        if (!sourceContent && post.excerpt) {
          sourceContent = post.excerpt;
        }
      }
    } else if (source_type === 'proposal' && source_id) {
      const { data: proposal } = await supabase.from('content_proposals')
        .select('topic, pillar_content, channel_variants')
        .eq('id', source_id)
        .single();
      
      if (proposal) {
        sourceTitle = proposal.topic;
        sourceContent = proposal.pillar_content || proposal.topic;
      }
    } else if (topic) {
      sourceContent = topic;
      sourceTitle = topic;
    }

    if (!sourceContent) {
      return new Response(JSON.stringify({ error: 'No source content found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Generate posts for each platform
    const results: Record<string, any> = {};

    for (const platform of platforms) {
      const guidelines = PLATFORM_GUIDELINES[platform];
      if (!guidelines) continue;

      const prompt = `Generate 2 social media post variants for ${platform.toUpperCase()}.

Source content title: "${sourceTitle}"
Source content (first 2000 chars): ${sourceContent.substring(0, 2000)}
${sourceUrl ? `Link to include: ${sourceUrl}` : ''}

Tone: ${tone}
Platform rules: ${guidelines.format}
Max characters: ${guidelines.maxChars}

Return JSON:
{
  "variants": [
    {"text": "post text here", "hashtags": ["tag1", "tag2"]},
    {"text": "alternative post text", "hashtags": ["tag1", "tag2"]}
  ]
}

Return ONLY valid JSON.`;

      let postVariants: any = null;

      if (geminiKey) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
          const resp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
            }),
          });
          const data = await resp.json();
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) postVariants = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error(`[generate-social-post] Gemini failed for ${platform}:`, e);
        }
      } else if (openaiKey) {
        try {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
            body: JSON.stringify({
              model: 'gpt-4.1-mini',
              max_tokens: 1024,
              messages: [
                { role: 'system', content: 'You generate social media posts. Return only valid JSON.' },
                { role: 'user', content: prompt },
              ],
            }),
          });
          const data = await resp.json();
          const rawText = data.choices?.[0]?.message?.content || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) postVariants = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error(`[generate-social-post] OpenAI failed for ${platform}:`, e);
        }
      }

      results[platform] = postVariants || { variants: [] };
    }

    // Step 3: If source is a proposal, store variants back
    if (source_type === 'proposal' && source_id) {
      const { data: proposal } = await supabase.from('content_proposals')
        .select('channel_variants')
        .eq('id', source_id)
        .single();
      
      const existing = (proposal?.channel_variants as Record<string, any>) || {};
      const merged = { ...existing, ...results };
      
      await supabase.from('content_proposals')
        .update({ channel_variants: merged, updated_at: new Date().toISOString() })
        .eq('id', source_id);
    }

    return new Response(JSON.stringify({ success: true, posts: results, source_title: sourceTitle }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[generate-social-post] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Extract plain text from Tiptap JSON
function extractTiptapText(content: any): string {
  if (!content) return '';
  const parts: string[] = [];

  function walk(node: any) {
    if (node.text) parts.push(node.text);
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(walk);
    }
  }

  if (content.type === 'doc' && content.content) {
    content.content.forEach(walk);
  } else if (Array.isArray(content)) {
    content.forEach((block: any) => {
      if (block.data?.content) walk(block.data.content);
    });
  }

  return parts.join(' ');
}
