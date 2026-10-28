/**
 * Feedback module — the feedback board, and the ping
 *
 * What Easypanel's feedback board is for its users, this is for every
 * FlowWink instance: boards (bug, feature, template, question), posts with a
 * status, votes and comments. The twist is the endpoint. By default an
 * instance SENDS its feedback to www.flowwink.com — one board for the whole
 * fleet, where the project reads what every instance runs into. A self-hoster
 * who wants the board for their own product points the endpoint at their own
 * instance and RECEIVES instead: the same tables, the same public board at
 * /feedback, the same admin.
 *
 * The same endpoint takes a daily ping (feedback_ping): instance id, site URL,
 * skills sha, migration head, enabled modules — no business data — switched off with
 * feedback.share_usage. That is how the project knows how many run the
 * platform without a licence portal.
 *
 * Skills:
 *   - submit_feedback   send a post to the endpoint (or store it here when the
 *                       endpoint is this instance)
 *   - feedback_ping     the daily ping (automation "Feedback ping")
 *   - manage_feedback   the receiving side: list, status, reply, delete
 *   - browse_feedback   read the board (external: the chat can say what is planned)
 *
 * @see docs/modules/feedback.md
 */

import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';
import type { AutomationSeed, SkillSeed } from '@/lib/module-bootstrap';

/** Where feedback and pings go unless the operator points them elsewhere. */
export const FEEDBACK_DEFAULT_ENDPOINT = 'https://www.flowwink.com';
export const FEEDBACK_BOARDS = ['bug', 'feature', 'template', 'question'] as const;
export const FEEDBACK_STATUSES = ['open', 'planned', 'in_progress', 'done', 'declined'] as const;

const inputSchema = z.object({
  action: z.enum(['submit', 'ping', 'list']),
  payload: z.record(z.unknown()).optional(),
});
const outputSchema = z.object({ success: z.boolean(), data: z.unknown().optional(), error: z.string().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const FEEDBACK_SKILLS: SkillSeed[] = [
  {
    name: 'submit_feedback',
    description:
      'Send feedback about the platform — a bug report, a feature request, a template wish or a question — to the feedback endpoint this instance is configured for (www.flowwink.com by default; a self-hoster may point it at their own instance, where it lands on their board). The post carries this instance\'s version (skills sha, migration head, enabled modules) so the maintainer reads it with its context. Use when: you hit a platform gap, a wrong answer from a skill, a missing parameter, a UI that misleads; the owner asks you to report something to FlowWink; an idea for the product. NOT for: this business\'s own customer tickets (create_ticket); QA findings on a beta session (report_finding); operating the board you receive (manage_feedback).',
    category: 'system',
    handler: 'module:feedback',
    scope: 'internal',
    trust_level: 'notify',
    instructions:
      'Write the title as the maintainer will read it (what, where, expected vs actual) and put reproduction steps, the skill and arguments, and the answer you got in body. board: bug | feature | template | question. The answer says where it went (endpoint, post id) — tell the owner. If the endpoint is this instance, the post is stored here and shows under /admin/feedback and /feedback.',
    tool_definition: {
      type: 'function',
      risk: 'low',
      reversible: true,
      reversal: 'A post on the receiving board is deleted there (manage_feedback delete when it is this instance).',
      function: {
        name: 'submit_feedback',
        description: 'Send a bug report, feature request, template wish or question to the configured feedback endpoint, with this instance\'s version attached.',
        parameters: {
          type: 'object',
          properties: {
            board: { type: 'string', enum: ['bug', 'feature', 'template', 'question'], description: 'Default feature.' },
            title: { type: 'string', description: '3–200 characters: what, where, expected vs actual.' },
            body: { type: 'string', description: 'Up to 10 000 characters: steps, skill + arguments, the answer you got, why it matters.' },
            author_name: { type: 'string', description: 'Who is reporting (the owner, or "FlowPilot on <site>").' },
            author_email: { type: 'string', description: 'Where the maintainer may answer. Only what the owner gave.' },
          },
          required: ['title'],
        },
      },
    },
  },
  {
    name: 'feedback_ping',
    description:
      'The daily ping to the feedback endpoint: this instance\'s id (minted on the first ping), site URL, skills sha, migration head and enabled modules — no business data. Runs by the "Feedback ping" automation; switched off with feedback.share_usage = false. Use when: the automation runs; the owner asks whether the instance is counted. NOT for: sending feedback (submit_feedback).',
    category: 'system',
    handler: 'module:feedback',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      risk: 'low',
      function: {
        name: 'feedback_ping',
        description: 'Send the daily usage ping to the feedback endpoint (or record it here when the endpoint is this instance). Honours feedback.share_usage.',
        parameters: { type: 'object', properties: {} },
      },
    },
  },
  {
    name: 'manage_feedback',
    description:
      'Operate the feedback board THIS instance receives (www.flowwink.com for the fleet; a self-hoster\'s own product board): list posts by board/status/origin, get one with its comments, set the status (open | planned | in_progress | done | declined), reply as staff, delete, and list the instances that ping here. Use when: triaging what came in; answering a report; marking what is planned or done; reading the fleet (how many instances, which version). NOT for: sending feedback from here (submit_feedback); the public read (browse_feedback).',
    category: 'system',
    handler: 'module:feedback',
    scope: 'internal',
    trust_level: 'notify',
    instructions:
      'list answers posts with origin_site_url and origin (skills_sha, migration_head, modules) — read a bug with its version. set_status with a note writes a staff comment the reporter sees on the board. instances lists feedback_instances (skills_sha and migration_head per site — the two rails of a fork): active_7d counts those seen in the last week.',
    tool_definition: {
      type: 'function',
      risk: 'medium',
      reversible: true,
      reversal: 'set_status back; a deleted post is gone (delete is final).',
      function: {
        name: 'manage_feedback',
        description: 'List / get / set_status / comment / delete posts on the board this instance receives; instances lists who pings here.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'set_status', 'comment', 'delete', 'instances'] },
            post_id: { type: 'string', description: 'The post (get / set_status / comment / delete).' },
            board: { type: 'string', enum: ['bug', 'feature', 'template', 'question'], description: 'list filter' },
            status: { type: 'string', enum: ['open', 'planned', 'in_progress', 'done', 'declined'], description: 'list filter, or the new status for set_status' },
            origin_site_url: { type: 'string', description: 'list filter: posts from one instance' },
            note: { type: 'string', description: 'set_status / comment: the staff reply the reporter sees.' },
            limit: { type: 'number', description: 'list: default 50, max 200' },
          },
          required: ['action'],
        },
      },
    },
  },
  {
    name: 'browse_feedback',
    description:
      'Read the public feedback board of this instance: what is open, planned, in progress or done, with votes and comment counts. Use when: a visitor or customer asks whether something is planned, known, or fixed; before filing a duplicate. NOT for: writing (submit_feedback, manage_feedback).',
    category: 'system',
    handler: 'module:feedback',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      risk: 'low',
      function: {
        name: 'browse_feedback',
        description: 'List posts on this instance\'s feedback board, newest or most voted first, filtered by board and status. Read-only.',
        parameters: {
          type: 'object',
          properties: {
            board: { type: 'string', enum: ['bug', 'feature', 'template', 'question'] },
            status: { type: 'string', enum: ['open', 'planned', 'in_progress', 'done', 'declined'] },
            query: { type: 'string', description: 'Words in the title.' },
            sort: { type: 'string', enum: ['newest', 'top'], description: 'Default newest.' },
            limit: { type: 'number', description: 'Default 20, max 100' },
          },
        },
      },
    },
  },
];

const FEEDBACK_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Feedback ping',
    description: 'Once a day, tell the feedback endpoint this instance exists: id, site URL, version, enabled modules. Off when feedback.share_usage is false.',
    trigger_type: 'cron',
    trigger_config: { cron: '17 3 * * *', expression: '17 3 * * *' },
    skill_name: 'feedback_ping',
    skill_arguments: {},
    executor: 'platform',
  },
];

export const feedbackModule = defineModule<Input, Output>({
  id: 'feedback',
  name: 'Feedback',
  version: '1.0.0',
  description:
    'The feedback board — bug reports, feature requests, template wishes, questions — with votes, comments and a status per post. By default this instance sends its feedback (and a daily usage ping) to www.flowwink.com; point the endpoint at this instance to run the board for your own product.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  processes: [],
  maturity: 'L2',
  skills: ['submit_feedback', 'feedback_ping', 'manage_feedback', 'browse_feedback'],
  data: {
    tables: ['feedback_posts', 'feedback_votes', 'feedback_comments', 'feedback_instances'],
  },
  skillSeeds: FEEDBACK_SKILLS,
  automations: FEEDBACK_AUTOMATIONS,

  async publish(input: Input): Promise<Output> {
    const validated = inputSchema.parse(input);
    logger.log('[feedback] action:', validated.action);
    return { success: true, data: { action: validated.action } };
  },
});
