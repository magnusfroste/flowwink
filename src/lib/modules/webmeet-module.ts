import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';

// ── Skill seeds (rpc handlers map to SECURITY DEFINER functions in DB) ──
const WEBMEET_SKILLS: SkillSeed[] = [
  {
    name: 'create_webmeet_room',
    description:
      'Create a new WebMeet video room and return a shareable URL. Use when: visitor or admin asks for a "video meeting link", "video call", "huddle", "screen share session", or any 1-to-few real-time video session; booking a customer consultation that needs a video link. NOT for: large broadcasts/webinars (use manage_webinar — 50+ viewers needs an SFU); phone/PSTN calls (use voice module); persistent chat rooms (use chat).',
    category: 'communication',
    handler: 'rpc:create_webmeet_room',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_webmeet_room',
        description:
          'Create a WebMeet video room with a shareable URL. Returns slug + URL the host can send via email/SMS/Telegram.',
        parameters: {
          type: 'object',
          properties: {
            p_name: { type: 'string', description: 'Friendly room title (e.g. "Customer call — Acme")' },
            p_password: { type: 'string', description: 'Optional access password' },
            p_max_participants: {
              type: 'integer',
              minimum: 2,
              maximum: 16,
              default: 8,
              description: 'Cap on simultaneous participants. P2P mesh works best up to 6.',
            },
            p_expires_in_minutes: {
              type: 'integer',
              minimum: 5,
              description: 'Optional auto-expire window in minutes from now.',
            },
            p_host_user_id: { type: 'string', format: 'uuid', description: 'Override host (admin/agent use only).' },
          },
          required: [],
        },
      },
    },
    instructions:
      'Returns `{ id, slug, name, url, max_participants, expires_at, created_at }`. The `url` is a relative path (`/meet/<slug>`) — prefix with the site origin when sharing. Keep `p_max_participants` ≤ 6 for best quality.',
  },
  {
    name: 'end_webmeet_room',
    description:
      'End an active WebMeet room — sets ended_at and stops new participants from joining. Use when: meeting is over and the host wants to close the link; cleanup after an expired session. NOT for: deleting room history (rooms remain readable for audit).',
    category: 'communication',
    handler: 'rpc:end_webmeet_room',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'end_webmeet_room',
        description: 'Mark a WebMeet room as ended.',
        parameters: {
          type: 'object',
          required: ['p_room_id'],
          properties: { p_room_id: { type: 'string', format: 'uuid' } },
        },
      },
    },
  },
  {
    name: 'list_webmeet_rooms',
    description:
      'List WebMeet rooms (active by default). Use when: an agent or user asks "what meetings do we have right now?", "any open rooms?", or needs to surface a join link to a known participant. NOT for: webinar listings (use manage_webinar action=list).',
    category: 'communication',
    handler: 'rpc:list_webmeet_rooms',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_webmeet_rooms',
        description: 'List WebMeet rooms.',
        parameters: {
          type: 'object',
          properties: {
            p_active_only: { type: 'boolean', default: true },
            p_limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
  },
];

const webmeetInputSchema = z.object({}).passthrough();
const webmeetOutputSchema = z.object({}).passthrough();

export const webmeetModule = defineModule({
  id: 'webmeet',
  name: 'WebMeet',
  version: '0.1.0',
  processes: ['lead-to-customer'],
  maturity: 'L2',
  description:
    'Quick 1-to-few video meetings with shareable URLs and screen sharing — peer-to-peer WebRTC, no SFU required. Use for internal huddles, customer consultations (e.g. psychologist sessions), and ad-hoc calls. For 50+ viewer broadcasts, use the Webinars module instead.',
  capabilities: ['data:write'],
  tier: 'extended',
  inputSchema: webmeetInputSchema,
  outputSchema: webmeetOutputSchema,

  skills: ['create_webmeet_room', 'end_webmeet_room', 'list_webmeet_rooms'],
  data: {
    tables: ['webmeet_rooms'],
  },
  skillSeeds: WEBMEET_SKILLS,
});
