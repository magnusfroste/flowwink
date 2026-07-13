import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['get_config']),
});

const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// ── Bundled skill definitions ──
// The widget itself talks to chat-completion directly (by design — anonymous
// visitors, no skill dispatch). These skills are the ADMIN-side surface over
// the conversation data the widget produces.
const CHAT_SKILLS: SkillSeed[] = [
  {
    name: 'get_chat_transcript',
    description:
      'Read visitor chat transcripts — list recent chat messages or fetch the full message thread of one conversation (filters.conversation_id). Use when: reviewing what a visitor discussed with the AI chat widget; auditing answer quality; pulling a transcript for lead follow-up or a support handover. NOT for: managing/assigning live-support conversations (support_list_conversations, support_assign_conversation); chat satisfaction ratings (analyze_chat_feedback); internal workspace chat.',
    category: 'communication',
    handler: 'db:chat_messages',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_chat_transcript',
        description:
          'List visitor chat messages, optionally filtered to a single conversation. Read-only.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'get'],
              description: 'list (default) returns message rows; get returns one message by id.',
            },
            id: { type: 'string', description: 'chat_messages.id (uuid) — only with action=get.' },
            filters: {
              type: 'object',
              description:
                'Column filters. Pass { "conversation_id": "<uuid>" } to read one conversation\'s transcript.',
              properties: {
                conversation_id: { type: 'string', description: 'chat_conversations.id (uuid).' },
                role: { type: 'string', description: 'Filter by author role: user | assistant | system.' },
              },
            },
            order_by: { type: 'string', description: 'Sort column (default created_at).' },
            ascending: {
              type: 'boolean',
              description: 'true = chronological order (recommended for reading transcripts).',
            },
            limit: { type: 'number', description: 'Max rows (default 50, cap 200).' },
          },
          required: ['action'],
        },
      },
    },
    instructions: `## get_chat_transcript
### What
Read-only access to visitor chat history (chat_messages). Rows have conversation_id, role (user/assistant/system), content, source, created_at.
### How to read one transcript
1. Find the conversation id — support_list_conversations (live-support module) or a prior message row.
2. Call with action="list", filters={ "conversation_id": "<uuid>" }, ascending=true.
### When to use
- "What did that visitor ask about yesterday?"
- Auditing AI answer quality before tuning KB content.
- Pulling context on a lead captured from chat (chat_conversations.lead_id).
### Edge cases
- Read-only — this skill never writes; transcripts are produced by the public widget.
- Without filters it returns the most recent messages across ALL conversations.`,
  },
];

export const chatModule = defineModule<Input, Output>({
  id: 'chat',
  name: 'Chat',
  version: '1.0.0',
  processes: ['support-to-resolution', 'lead-to-customer'],
  maturity: 'L3',
  description: 'Public visitor chat — the AI-powered widget and /chat landing page for anonymous site visitors. For internal operator chat use FlowChat (/admin/flowchat); for workspace Q&A over your own data use Flowwork (/admin/flowwork).',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  // The public widget uses chat-completion directly (no skill dispatch);
  // get_chat_transcript is the admin/agent surface over the resulting data.
  skills: ['get_chat_transcript'],
  skillSeeds: CHAT_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true };
  },
});
