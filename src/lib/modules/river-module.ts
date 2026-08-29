import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';

/**
 * River — internal social feed (X / Instagram / Slack-inspired).
 *
 * Owns:
 *   - `river_posts`   (body, media_urls, parent_id, pinned, counters)
 *   - `river_reactions` (emoji per user/post)
 *   - storage bucket `river-media` (public read, authed upload)
 *
 * Skills (handler `module:river`):
 *   - `post_to_river`   — create a post, reply, or pin (admin)
 *   - `search_river`    — search recent posts by text
 *
 * @see docs/modules/river.md
 */

const inputSchema = z.object({
  action: z.enum(['get_config']).default('get_config'),
});
const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const RIVER_SKILLS: SkillSeed[] = [
  {
    name: 'post_to_river',
    description:
      'Post a message to the internal River feed (team social channel, Slack/X-style). This is also the agent\'s team voice. Use when: announcing a release, sharing a quick win, posting a positive/informative team moment, or replying in a thread — anything a human colleague would genuinely post. NOT for: operational alerts or drift/health warnings (⚠️ failing jobs, integrity issues, error counts — those go to the Daily Briefing and /admin/system Observability, never here); routine status or "checked, nothing new" (silence — that telemetry already lives in agent_activity); approval requests (the approval queue notifies on its own); external customer chat (use chat); ticket replies (use manage_ticket); newsletter/blog (those are external).',
    category: 'communication',
    handler: 'module:river',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'post_to_river',
        description: 'Create a River post (top-level or reply) or pin one.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'reply', 'pin', 'unpin', 'delete', 'list'],
              description:
                'create=new top-level post; reply=needs parent_id; pin/unpin=admin-only; delete=author or admin; list=most recent.',
            },
            body: {
              type: 'string',
              description:
                'Markdown body (URLs auto-link). Required for create/reply.',
            },
            parent_id: {
              type: 'string',
              description: 'Parent post id (required for reply).',
            },
            id: {
              type: 'string',
              description: 'Post id (required for pin/unpin/delete).',
            },
            media_urls: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Optional list of public image URLs to attach (already uploaded).',
            },
            limit: {
              type: 'number',
              description: 'list: max rows (default 20, max 100).',
            },
          },
          required: ['action'],
          additionalProperties: false,
        },
      },
    },
    instructions: `## post_to_river
### What
Internal team social feed — like Slack-meets-X. Short messages,
optional images, threads via \`parent_id\`.

### When to use
- Internal announcements ("deploy is live", "new template shipped").
- Quick wins worth celebrating with the team.
- Replying to an existing post in a thread.

### The colleague test (for agents)
River is a human channel — every post costs team attention. Before posting,
ask: would a human colleague post this? A completed objective, a shipped
campaign, a positive team moment → yes. Routine status, "checked X,
nothing new", per-heartbeat summaries → NO — stay silent (that telemetry is
already recorded in agent_activity). Approvals never go here; the approval
queue notifies on its own. Aim for at most a few posts per day.

### Channel hierarchy (HARD RULE — 2026-08-28)
Operational warnings NEVER go to River. Failing scheduled jobs, drift/health
alerts, integrity issues, error counts → the Daily Briefing and
/admin/system → Observability are their channels. River is reserved for
positive/informative posts ("first booking!", a publish, a shipped feature).
An ops ⚠️ posted here is a misroute even when the finding is real — and if
you haven't verified the claim against primary evidence (job_run_details,
agent_activity), it may also be a false alarm.

### Dedup (system posts)
Agent-created posts are deduplicated server-side: a post whose fingerprint
(normalized body, digits ignored) matches a post from the last 7 days
UPDATES that post instead of creating a new one. Don't re-post the same
announcement with fresher numbers — the existing post absorbs it.

### Parameters
- **action**: create | reply | pin | unpin | delete | list
- **body**: required for create/reply; markdown OK.
- **parent_id**: required for reply.
- **id**: required for pin/unpin/delete.
- **media_urls**: pre-uploaded public image URLs (use the
  \`river-media\` storage bucket).

### Edge cases
- pin/unpin require admin role (RLS enforced).
- delete is allowed for author or admin only.`,
  },
  {
    name: 'search_river',
    description:
      'Search the internal River feed by free-text query against post body. Use when: looking up an internal announcement, finding a thread you remember reading, or summarising what the team posted recently. NOT for: external chat history.',
    category: 'communication',
    handler: 'module:river',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_river',
        description: 'Free-text search recent River posts.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search text.' },
            limit: {
              type: 'number',
              description: 'Max matches (default 10, max 50).',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    instructions: `## search_river
### What
ILIKE search over \`river_posts.body\`. Returns most recent matches.
### When to use
- Pulling up an old internal announcement.
- Briefing FlowPilot on what the team has been talking about.
### Parameters
- **query**: required.
- **limit**: optional, default 10.`,
  },
  {
    name: 'share_weekly_knowledge',
    description:
      "Post the weekly knowledge digest to River: new and updated wiki pages plus new KB articles from the last 7 days, as one positive team post. Runs automatically every Monday (cron weekly-knowledge-river); call it to post now instead of waiting. Skips silently when the week is empty or a digest was already posted. Use when: an admin asks to share this week's new knowledge in River. NOT for: ad-hoc posts (post_to_river); operational alerts (Daily Briefing).",
    category: 'communication',
    handler: 'rpc:post_weekly_knowledge_to_river',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'share_weekly_knowledge',
        description:
          'Post the last 7 days of new/updated wiki pages and new KB articles to River as one digest post. No parameters.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    instructions: `## share_weekly_knowledge
### What
One deterministic SQL function composes and posts "📚 Veckans kunskap" to
River: new wiki pages, updated wiki pages, new published KB articles from
the last 7 days, each with an /admin/wiki link where applicable.

### When to use
- An admin asks to post this week's knowledge summary now.
- Verifying the Monday cron output manually.

### Behaviour
- Empty week → returns {skipped: "no new knowledge this week"}, posts nothing.
- Already posted within 6 days → {skipped: "already posted this week"}.
- River module disabled → {skipped}, never an error.
- The post is positive/informative by construction — it never carries
  operational warnings, so it cannot violate the channel hierarchy.`,
  },
];

export const riverModule = defineModule<Input, Output>({
  id: 'river',
  name: 'River',
  version: '1.0.0',
  processes: [],
  maturity: 'L2',
  description:
    'Internal social feed (X / Instagram / Slack-inspired) for the team. Authenticated staff post short messages with images, reply in threads, and react with emoji. Realtime.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  skills: ['post_to_river', 'search_river'],
  data: {
    tables: ['river_reactions', 'river_posts'],
  },
  skillSeeds: RIVER_SKILLS,
  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
