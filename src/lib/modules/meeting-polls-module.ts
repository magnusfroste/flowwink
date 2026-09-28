import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

/**
 * Meeting Polls — propose several times, let people answer by link without an
 * account, and let a RULE pick the first time everyone can make.
 *
 * What this module owns:
 *   - meeting_polls, meeting_poll_slots, meeting_poll_responses (staff-only RLS;
 *     anon reaches them ONLY through the token RPCs — never the base tables)
 *   - the resolution rule: first_all | first_quorum | max_attendance,
 *     deterministic, in resolve_meeting_poll()
 *   - the hand-off: a resolved poll becomes a calendar_events row (and a
 *     bookings row when customer_facing)
 *
 * Modelled on timeslot.fit, ported as a model rather than as code — that app
 * has no rule (the organizer taps "confirm"), identifies people by name, and
 * leaves its RLS open. See docs/processes/propose-to-meet.md and #590.
 *
 * FlowPilot is the intelligence layer here (Law 3): the block captures "find a
 * time for the five of us next week", FlowPilot reads the gaps via list_events
 * and calls create_meeting_poll. No regex routes it (Law 1) — the skill
 * descriptions below are what makes the scorer pick it (Law 2).
 *
 * @see docs/modules/meeting-polls.md
 */

const inputSchema = z.object({
  action: z.enum(['noop']).default('noop'),
});
const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const MEETING_POLL_SKILLS: SkillSeed[] = [
  {
    name: 'create_meeting_poll',
    description:
      'Propose several candidate times for a meeting and get a shareable link people answer WITHOUT an account. Use when: someone wants to find a time that works for a group ("hitta en tid för oss nästa vecka", "when can we all meet"), when more than one slot should be offered, or when the attendees are outside the organisation. NOT for: booking a single known slot against a service (book_appointment_slot); putting a fixed meeting on the calendar (manage_calendar_event); checking one day\'s availability (check_availability).',
    category: 'crm',
    handler: 'rpc:create_meeting_poll',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_meeting_poll',
        description: 'Create a meeting poll with candidate slots. Returns poll_id, share_token and share_path (/poll/<share_token>) to send to respondents.',
        parameters: {
          type: 'object',
          properties: {
            p_title: { type: 'string', description: 'What the meeting is about' },
            p_slots: {
              type: 'array',
              description: 'Candidate times. Each: { starts_at: ISO timestamp, duration_min: minutes (default 60) }. At least one.',
              items: {
                type: 'object',
                properties: {
                  starts_at: { type: 'string', description: 'ISO 8601 timestamp with offset, e.g. 2026-10-06T09:00:00+02:00' },
                  duration_min: { type: 'integer', description: 'Length in minutes. Default 60.' },
                },
                required: ['starts_at'],
              },
            },
            p_organizer_email: { type: 'string', description: 'Organizer e-mail (becomes the booking customer when customer_facing)' },
            p_organizer_name: { type: 'string' },
            p_description: { type: 'string' },
            p_timezone: { type: 'string', description: 'IANA zone the organizer thinks in, e.g. Europe/Stockholm. Default UTC.' },
            p_policy: {
              type: 'string',
              enum: ['first_all', 'first_quorum', 'max_attendance'],
              description: 'How resolve picks: first_all = earliest slot every respondent chose (default); first_quorum = earliest slot with at least p_quorum; max_attendance = the slot most chose, earliest wins a tie.',
            },
            p_quorum: { type: 'integer', description: 'Required with first_quorum. Minimum respondents a slot needs.' },
            p_expires_at: { type: 'string', description: 'ISO timestamp after which the poll stops taking answers' },
            p_customer_facing: { type: 'boolean', description: 'true when the respondents are customers: resolving also creates a bookings row. Default false.' },
          },
          required: ['p_title', 'p_slots', 'p_organizer_email', 'p_organizer_name'],
        },
      },
    },
    instructions:
      'Parameter names are exact: p_title, p_slots, p_organizer_email, p_organizer_name, p_description, p_timezone, p_policy, p_quorum, p_expires_at, p_customer_facing. p_slots is an ARRAY of objects with starts_at (ISO with offset) and duration_min. To propose times the calendar is actually free, call list_events for the range first and pick gaps. The result carries share_path — that is the link to send (comms-send or the visitor\'s reply). Never send edit_token to respondents; it is the organizer\'s.',
  },
  {
    name: 'respond_to_meeting_poll',
    description:
      'Answer a meeting poll by its share link: which of the proposed times work for this person. One answer per e-mail — answering again replaces the previous one. Use when: a visitor or external attendee holds a /poll/<token> link and says which times suit them; when re-submitting a changed availability. NOT for: creating polls (create_meeting_poll); deciding the final time (resolve_meeting_poll); booking a service slot (book_appointment_slot).',
    category: 'crm',
    handler: 'rpc:respond_to_meeting_poll_by_token',
    scope: 'external',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'respond_to_meeting_poll',
        description: 'Record which proposed slots work for one respondent, identified by the poll share token and their e-mail.',
        parameters: {
          type: 'object',
          properties: {
            p_token: { type: 'string', description: 'The share token from the /poll/<token> link' },
            p_email: { type: 'string' },
            p_name: { type: 'string' },
            p_slot_ids: { type: 'array', items: { type: 'string' }, description: 'Slot ids that work. An empty array means "none of these".' },
          },
          required: ['p_token', 'p_email', 'p_name', 'p_slot_ids'],
        },
      },
    },
    instructions:
      'Parameter names are exact: p_token, p_email, p_name, p_slot_ids. Slot ids come from get_meeting_poll_by_token (the public view: slots with counts, respondents as initials — never e-mails). A slot id from another poll is refused. The poll must be open and not expired.',
  },
  {
    name: 'resolve_meeting_poll',
    description:
      'Decide the meeting time from the answers, by the poll\'s rule, and put it on the calendar with the people who can make it as attendees. Use when: enough answers are in, the organizer asks "which time won?", or a poll is about to expire. NOT for: overriding the rule by hand (change the poll or create the event directly with manage_calendar_event); reading answers (get_meeting_poll_by_token / list_meeting_polls).',
    category: 'crm',
    handler: 'rpc:resolve_meeting_poll',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'resolve_meeting_poll',
        description: 'Apply the poll\'s policy. Returns resolved:true with the slot and calendar_event_id, or resolved:false with the reason — read `resolved`, not `success`.',
        parameters: {
          type: 'object',
          properties: {
            p_poll_id: { type: 'string', description: 'The poll id (uuid)' },
          },
          required: ['p_poll_id'],
        },
      },
    },
    instructions:
      'Deterministic: first_all picks the EARLIEST slot every respondent chose; first_quorum the earliest slot with at least quorum; max_attendance the slot most chose, earliest on a tie. No qualifying slot returns resolved:false and leaves the poll open — that is an answer, not an error. Resolving twice returns the existing result and creates nothing new. A customer_facing poll also creates a bookings row.',
  },
  {
    name: 'list_meeting_polls',
    description:
      'List meeting polls with their status, rule, answer counts and share links. Use when: an operator asks what polls are open, which have enough answers, or wants the link to re-send. NOT for: the public respondent view (get_meeting_poll_by_token); deciding (resolve_meeting_poll).',
    category: 'crm',
    handler: 'rpc:list_meeting_polls',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_meeting_polls',
        description: 'List polls, newest first.',
        parameters: {
          type: 'object',
          properties: {
            p_status: { type: 'string', enum: ['open', 'resolved', 'expired', 'cancelled'], description: 'Optional filter' },
            p_limit: { type: 'integer', description: 'Default 50, max 200' },
          },
        },
      },
    },
  },
];

export const meetingPollsModule = defineModule<Input, Output>({
  id: 'meetingPolls',
  name: 'Meeting Polls',
  version: '0.1.0',
  processes: ['propose-to-meet'],
  maturity: 'L1',
  description: 'Propose several times, let people answer by link without an account, and let a rule pick the first time everyone can make',
  capabilities: ['data:write', 'content:receive'],
  tier: 'standard',
  requires: ['bookings', 'calendar'],
  inputSchema,
  outputSchema,

  skills: ['create_meeting_poll', 'respond_to_meeting_poll', 'resolve_meeting_poll', 'list_meeting_polls'],
  skillSeeds: MEETING_POLL_SKILLS,
  data: {
    tables: ['meeting_polls', 'meeting_poll_slots', 'meeting_poll_responses'],
  },

  // Everything this module does happens in the database through its RPC
  // skills; there is no client-side publish path.
  async publish(): Promise<Output> {
    return { success: true };
  },
});
