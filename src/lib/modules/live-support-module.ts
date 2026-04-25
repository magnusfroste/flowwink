import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['list_conversations', 'assign']),
  conversation_id: z.string().uuid().optional(),
  agent_id: z.string().uuid().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const LIVESUPPORT_SKILLS: SkillSeed[] = [
  {
    name: 'support_list_conversations',
    description: 'List support conversations filtered by status. Returns customer name, email, priority, sentiment, and escalation reason. Use when: reviewing support queue; monitoring overall support load; identifying high-priority issues. NOT for: assigning conversations (support_assign_conversation); analyzing feedback (analyze_chat_feedback).',
    category: 'communication',
    handler: 'db:chat_conversations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'support_list_conversations',
        description: 'List support conversations filtered by status. Returns customer name, email, priority, sentiment, and escalation reason. Use when: reviewing support queue; monitoring overall support load; identifying high-priority issues. NOT for: assigning conversations (support_assign_conversation); analyzing feedback (analyze_chat_feedback).',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: [
                'waiting_agent',
                'with_agent',
                'escalated',
                'closed',
                'active',
              ],
              description: 'Filter by conversation status',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## support_list_conversations
### What
Lists support conversations filtered by status.
### When to use
- Admin asks about support queue
- Monitoring escalated or waiting conversations
- Support dashboard data
### Parameters
- **status**: Filter: waiting_agent, with_agent, escalated, closed, active.
- **limit**: Max results (default 20).
### Edge cases
- Escalated conversations should be prioritized.
- Returns customer name, email, priority, and sentiment score.`,
  },
  {
    name: 'support_assign_conversation',
    description: 'Assign or reassign a support conversation to an agent. Use when: a customer query needs agent attention; re-routing a conversation to a specialist; ensuring no support ticket is unassigned. NOT for: listing conversations (support_list_conversations); getting feedback (support_get_feedback).',
    category: 'communication',
    handler: 'db:chat_conversations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'support_assign_conversation',
        description: 'Assign or reassign a support conversation to an agent. Use when: a customer query needs agent attention; re-routing a conversation to a specialist; ensuring no support ticket is unassigned. NOT for: listing conversations (support_list_conversations); getting feedback (support_get_feedback).',
        parameters: {
          type: 'object',
          properties: {
            conversation_id: {
              type: 'string',
              description: 'UUID of the conversation',
            },
            agent_id: {
              type: 'string',
              description: 'UUID of the support_agents record to assign',
            },
            status: {
              type: 'string',
              enum: [
                'with_agent',
                'escalated',
                'closed',
              ],
              description: 'New status',
            },
          },
          required: [
            'conversation_id',
          ],
        },
      },
    },
    instructions: `## support_assign_conversation
### What
Assigns or reassigns a support conversation to an agent.
### When to use
- Admin assigns a conversation to a team member
- Routing escalated conversations
### Parameters
- **conversation_id**: Required. UUID of the conversation.
- **agent_id**: UUID of the support agent to assign.
- **status**: New status: with_agent, escalated, closed.
### Edge cases
- Assigning sets status to 'with_agent' automatically.
- Closing a conversation removes it from active queue.`,
  },
  {
    name: 'support_get_feedback',
    description: 'Retrieve chat feedback ratings and comments. Useful for monitoring customer satisfaction and identifying knowledge gaps. Use when: pulling raw feedback data; building satisfaction reports; reviewing individual feedback entries. NOT for: analyzing feedback trends (analyze_chat_feedback); listing support conversations (support_list_conversations).',
    category: 'analytics',
    handler: 'db:chat_feedback',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'support_get_feedback',
        description: 'Retrieve chat feedback ratings and comments. Useful for monitoring customer satisfaction and identifying knowledge gaps. Use when: pulling raw feedback data; building satisfaction reports; reviewing individual feedback entries. NOT for: analyzing feedback trends (analyze_chat_feedback); listing support conversations (support_list_conversations).',
        parameters: {
          type: 'object',
          properties: {
            rating: {
              type: 'string',
              enum: [
                'positive',
                'negative',
              ],
              description: 'Filter by rating',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20)',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## support_get_feedback
### What
Retrieves chat feedback ratings and comments for quality monitoring.
### When to use
- Admin asks about customer satisfaction
- Quality assurance reviews
- Identifying knowledge gaps from negative feedback
### Parameters
- **rating**: Filter by 'positive' or 'negative'.
- **limit**: Max results (default 20).
### Edge cases
- Use negative feedback to identify KB gaps and improve responses.
- Chain: support_get_feedback(negative) → kb_gap_analysis.`,
  },
];

export const liveSupportModule = defineModule<Input, Output>({
  id: 'liveSupport',
  name: 'Live Support',
  version: '1.0.0',
  description: 'Human agent takeover for escalated chat conversations',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,

  skills: [
    'support_list_conversations',
    'support_assign_conversation',
  ],
  skillSeeds: LIVESUPPORT_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Live support ${input.action} completed` };
  },
});
