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
  // ── Contact Center (omnichannel) — Fas 1 ──
  {
    name: 'route_conversation',
    description: 'Route a conversation to a human agent: assigns the least-loaded online agent that handles the conversation\'s channel, else queues it and records an escalation. Use when: a visitor (any channel) needs a human; an external operator wants to hand a thread to support. NOT for: picking a specific agent (support_assign_conversation); listing the queue (support_list_conversations).',
    category: 'communication',
    handler: 'rpc:route_conversation_to_agent',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'route_conversation',
        description: 'Presence-aware routing: assign least-loaded capable agent, else queue + escalate. Channel is read from the conversation.',
        parameters: {
          type: 'object',
          required: ['conversation_id'],
          properties: {
            conversation_id: { type: 'string', format: 'uuid', description: 'Conversation to route' },
            reason: { type: 'string', description: 'Why a human is needed' },
            urgency: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'] },
          },
        },
      },
    },
    instructions: 'Single routing primitive shared by chat handoff and channel adapters. Returns {action: handoff_to_agent|create_escalation, agent_id?, message}. Idempotent — re-routing an already-assigned conversation does not double-count.',
  },
  {
    name: 'manage_channel',
    description: 'Configure or test an inbound channel (Telegram). action=test verifies the bot token; action=configure stores it and registers the webhook; action=list shows configured channels. Use when: connecting Telegram to the Contact Center; verifying a bot token. NOT for: sending a message (send_channel_message).',
    category: 'communication',
    handler: 'edge:contact-center',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_channel',
        description: 'Verify/configure an inbound channel. Telegram: getMe (test) + setWebhook (configure).',
        parameters: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['test', 'configure', 'list'] },
            channel: { type: 'string', enum: ['telegram'], description: 'Default telegram' },
            bot_token: { type: 'string', description: 'Telegram bot token (test/configure)' },
            webhook_url: { type: 'string', description: 'Public webhook URL of telegram-ingest (configure)' },
          },
        },
      },
    },
    instructions: 'Credentials persist to site_settings.integrations.telegram.config. configure also generates a webhook secret and registers it with Telegram. Provider verification lives here (Law 4: if the token works, the channel works).',
  },
  {
    name: 'send_channel_message',
    description: 'Send an outbound message on a conversation\'s channel (e.g. an agent reply out to Telegram). Use when: a human agent replies to a non-web conversation; pushing a proactive message to a channel thread. NOT for: web chat (the widget renders agent messages directly); routing (route_conversation).',
    category: 'communication',
    handler: 'edge:contact-center',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_channel_message',
        description: 'Send text out on a channel. Provide conversation_id (channel + thread resolved from it) or channel_thread_id directly.',
        parameters: {
          type: 'object',
          required: ['text'],
          properties: {
            conversation_id: { type: 'string', format: 'uuid' },
            channel_thread_id: { type: 'string', description: 'External thread id (e.g. Telegram chat id)' },
            channel: { type: 'string', enum: ['telegram'] },
            text: { type: 'string' },
          },
        },
      },
    },
    instructions: 'Resolves channel + thread from conversation_id when given. Telegram only for now. Inbound arrives at the telegram-ingest webhook, not here.',
  },
  {
    name: 'request_callback',
    description: 'Manage a callback request (rides the bookings table, metadata.kind=callback). action=create schedules one; action=mark_attempted records an outreach attempt; action=list returns open callbacks. Use when: a caller asks to be called back instead of waiting; an agent logs a callback attempt. NOT for: booking a real appointment slot (book_appointment_slot).',
    category: 'communication',
    handler: 'rpc:request_callback',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'request_callback',
        description: 'Create / mark_attempted / list callback requests on the bookings table.',
        parameters: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string', enum: ['create', 'mark_attempted', 'list'] },
            callback_id: { type: 'string', format: 'uuid', description: 'Target callback (mark_attempted)' },
            conversation_id: { type: 'string', format: 'uuid' },
            customer_name: { type: 'string' },
            customer_email: { type: 'string' },
            customer_phone: { type: 'string' },
            preferred_time: { type: 'string', description: 'ISO timestamp for the callback' },
            notes: { type: 'string' },
          },
        },
      },
    },
    instructions: 'A callback is a bookings row tagged metadata.kind=callback (service_id null). mark_attempted increments metadata.attempts and stamps last_attempt_at.',
  },
  {
    name: 'handle_voicemail',
    description: 'FlowPilot-analyze a voicemail transcript: extracts summary, intent, sentiment, and whether a callback was requested, and stores them on the voicemail. Use when: a voicemail has a transcript and needs triage. NOT for: transcribing audio (the voice channel produces the transcript); scheduling a callback (request_callback).',
    category: 'communication',
    handler: 'edge:contact-center',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'handle_voicemail',
        description: 'Summarize + classify a voicemail transcript and persist intent/sentiment/summary.',
        parameters: {
          type: 'object',
          required: ['action', 'voicemail_id'],
          properties: {
            action: { type: 'string', enum: ['summarize'] },
            voicemail_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    instructions: 'Reads voicemail_messages.transcript_text, runs structured AI extraction, writes summary/intent/sentiment/callback_requested back. Errors cleanly if there is no transcript yet.',
  },
];

export const liveSupportModule = defineModule<Input, Output>({
  id: 'liveSupport',
  name: 'Contact Center',
  version: '1.1.0',
  processes: ['support-to-resolution'],
  maturity: 'L3',
  description: 'Omnichannel contact center: human-agent takeover across web chat, Telegram (and future SMS/voice), with presence-aware routing, callbacks, and voicemail triage. Built on the shared conversation hub.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: [
    'support_list_conversations',
    'support_assign_conversation',
    // Contact Center (omnichannel) — Fas 1
    'route_conversation',
    'manage_channel',
    'send_channel_message',
    'request_callback',
    'handle_voicemail',
  ],
  skillSeeds: LIVESUPPORT_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Live support ${input.action} completed` };
  },
});
