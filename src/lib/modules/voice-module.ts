import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { z } from 'zod';

const inputSchema = z.object({
  action: z.enum(['list_calls', 'schedule_callback', 'mark_callback_done']),
  call_id: z.string().uuid().optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const VOICE_SKILLS: SkillSeed[] = [
  {
    name: 'list_voice_calls',
    description:
      'List voice calls filtered by status (missed/voicemail/answered/etc) and direction. Returns A-number, B-number, agent, duration, recording URL, callback status. Use when: reviewing missed calls; finding pending callbacks; auditing call history. NOT for: scheduling a callback (schedule_voice_callback); placing an outbound call (place_voice_call).',
    category: 'communication',
    handler: 'db:voice_calls',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_voice_calls',
        description:
          'List voice calls. Filter by status, direction, agent_id, callback_status.',
        parameters: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['ringing', 'answered', 'missed', 'voicemail', 'completed', 'failed', 'busy', 'no_answer'],
            },
            direction: { type: 'string', enum: ['inbound', 'outbound'] },
            callback_status: { type: 'string', enum: ['none', 'pending', 'scheduled', 'completed', 'failed'] },
            limit: { type: 'number', description: 'Default 20' },
          },
          required: [],
        },
      },
    },
    instructions:
      '## list_voice_calls\nReturns the call log. Use callback_status="pending" to find calls awaiting agent callback. Recording URL is provider-hosted; transcript field is filled when voicemail is transcribed.',
  },
  {
    name: 'schedule_voice_callback',
    description:
      'Schedule a callback for a missed/voicemail call. Sets callback_status=scheduled and callback_scheduled_at. Use when: agent commits to ring back a caller; UC4 booking-IVR selected a slot. NOT for: marking a callback as completed (mark_voice_callback_done); listing calls (list_voice_calls).',
    category: 'communication',
    handler: 'db:voice_calls',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'schedule_voice_callback',
        description: 'Schedule a callback for a voice call.',
        parameters: {
          type: 'object',
          required: ['call_id', 'scheduled_at'],
          properties: {
            call_id: { type: 'string', format: 'uuid' },
            scheduled_at: { type: 'string', description: 'ISO timestamp' },
            agent_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    instructions:
      '## schedule_voice_callback\nSets callback_status=scheduled. If agent_id is given the call is also reassigned. Pair with the bookings module for UC4 (caller picks slot via IVR).',
  },
  {
    name: 'mark_voice_callback_done',
    description:
      'Mark a scheduled callback as completed (after the agent has rung back the caller). Use when: callback attempt is finished. NOT for: scheduling (schedule_voice_callback).',
    category: 'communication',
    handler: 'db:voice_calls',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'mark_voice_callback_done',
        description: 'Mark a callback as completed.',
        parameters: {
          type: 'object',
          required: ['call_id'],
          properties: {
            call_id: { type: 'string', format: 'uuid' },
            outcome: { type: 'string', enum: ['reached', 'no_answer', 'wrong_number'] },
          },
        },
      },
    },
    instructions:
      '## mark_voice_callback_done\nSets callback_status=completed and callback_completed_at=now. Outcome stored in metadata.',
  },
];

export const voiceModule = defineModule<Input, Output>({
  id: 'voice',
  name: 'Voice',
  version: '0.1.0',
  processes: ['support-to-resolution', 'lead-to-customer'],
  maturity: 'L1',
  description:
    'Inbound + outbound voice calls via pluggable providers (46elks, Twilio, ...). WebRTC browser-klient i admin, voicemail, missed-call-kö, callback-flöde och booking-IVR. Provider-agnostisk — välj adapter per marknad.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: ['list_voice_calls', 'schedule_voice_callback', 'mark_voice_callback_done'],
  skillSeeds: VOICE_SKILLS,

  async publish(input: Input): Promise<Output> {
    return { success: true, message: `Voice ${input.action} completed` };
  },
});
