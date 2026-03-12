-- Register content hub FlowPilot skills
-- These route content research and proposal generation through FlowPilot
-- so brand voice, soul, and objectives apply to all AI-generated content.

-- Remove existing skills if present (no unique constraint on name)
DELETE FROM public.agent_skills WHERE name IN ('research_content', 'generate_content_proposal');

INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
VALUES
(
  'research_content',
  'Research a content topic and generate strategic angles, audience insights, hooks, and SEO data',
  'edge:research-content',
  'content',
  'internal',
  false,
  true,
  'Use this skill when the admin wants to research a topic before creating content. Returns 5+ distinct content angles (from safe/educational to bold/contrarian), audience psychology insights, competitive landscape analysis, hook variations, and SEO keywords. Always call this before generate_content_proposal when the admin has not already done research.',
  '{
    "type": "function",
    "function": {
      "name": "research_content",
      "description": "Research a content topic — returns strategic angles, audience insights, competitive gaps, hook variations, and SEO keywords",
      "parameters": {
        "type": "object",
        "properties": {
          "topic": { "type": "string", "description": "The content topic to research" },
          "target_audience": { "type": "string", "description": "Who the content is for" },
          "industry": { "type": "string", "description": "Industry context for the research" },
          "target_channels": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Channels to optimize for: blog, linkedin, instagram, twitter, newsletter, facebook"
          }
        },
        "required": ["topic", "target_channels"]
      }
    }
  }'::jsonb
),
(
  'generate_content_proposal',
  'Generate a complete multi-channel content proposal with publication-ready copy for blog, newsletter, LinkedIn, social media, and more',
  'edge:generate-content-proposal',
  'content',
  'internal',
  false,
  true,
  'Use this skill to generate a full content proposal across multiple channels from a topic brief. Each channel variant (blog, newsletter, linkedin, instagram, twitter, facebook, print) is generated with platform-native copy. Always include all channels the admin requested. Pass user_id for proper attribution.',
  '{
    "type": "function",
    "function": {
      "name": "generate_content_proposal",
      "description": "Generate a complete multi-channel content proposal — returns publication-ready copy for each requested channel",
      "parameters": {
        "type": "object",
        "properties": {
          "topic": { "type": "string", "description": "The content topic or headline" },
          "target_channels": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Channels to generate for: blog, newsletter, linkedin, instagram, twitter, facebook, print"
          },
          "pillar_content": { "type": "string", "description": "Source material or key points to build from" },
          "brand_voice": { "type": "string", "description": "Brand voice description" },
          "target_audience": { "type": "string", "description": "Who the content is for" },
          "tone_level": { "type": "number", "description": "Tone scale 1-5 (1=highly formal, 5=casual/playful)" },
          "industry": { "type": "string", "description": "Industry context" },
          "content_goals": { "type": "array", "items": { "type": "string" }, "description": "e.g. brand awareness, lead generation" },
          "unique_angle": { "type": "string", "description": "Unique positioning or differentiator" },
          "schedule_for": { "type": "string", "description": "ISO date string for scheduling" },
          "user_id": { "type": "string", "description": "Requesting user ID for proposal attribution" }
        },
        "required": ["topic", "target_channels"]
      }
    }
  }'::jsonb
)
;
