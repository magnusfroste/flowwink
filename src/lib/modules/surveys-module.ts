/**
 * Surveys / NPS Module
 *
 * Capture customer satisfaction (NPS, CSAT, custom) with one-click email surveys
 * triggered manually or by platform events (order.delivered, ticket.closed, etc.).
 * Detractors auto-route to FlowPilot for follow-up; promoters score the lead +20p.
 */
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['create_campaign', 'send_survey', 'list_responses', 'get_nps_score']),
});
const outputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SURVEY_SKILLS: SkillSeed[] = [
  {
    name: 'create_survey_campaign',
    description:
      'Create a new survey campaign attached to a template. Requires an existing template_id — if none exists, call `manage_survey_template` with action=list first, and if empty, action=create to make one. Use when: launching a new NPS/CSAT program, automating feedback after an event (order delivered, ticket closed, contract renewed). NOT for: editing an existing campaign (use generic update via manage_record).',
    category: 'crm',
    handler: 'db:survey_campaigns',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_survey_campaign',
        description: 'Create a survey campaign that can be triggered manually or by a platform event.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create'] },
            name: { type: 'string', description: 'Internal campaign name' },
            template_id: { type: 'string', description: 'UUID of the survey_templates row' },
            trigger: {
              type: 'string',
              enum: ['manual', 'order.delivered', 'order.paid', 'ticket.resolved', 'ticket.closed', 'contract.renewed', 'booking.completed', 'deal.won'],
            },
            delay_hours: { type: 'number', description: 'Wait N hours after trigger event before sending' },
            email_subject: { type: 'string' },
            email_intro: { type: 'string' },
          },
          required: ['action', 'name', 'template_id'],
        },
      },
    },
    instructions:
      'Default trigger is "manual" if not specified. Set delay_hours=24 for post-purchase surveys, delay_hours=0 for ticket.closed (strike while it is fresh).',
  },
  {
    name: 'manage_survey_template',
    description:
      'Create, list, or get survey templates — the reusable question sets that a survey campaign attaches to. Use when: you need a template_id for create_survey_campaign but none exists yet; setting up an NPS/CSAT/CES question set. NOT for: campaigns (use create_survey_campaign) or sending (use send_survey).',
    category: 'crm',
    handler: 'db:survey_templates',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_survey_template',
        description: 'CRUD for survey templates (reusable question sets).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['create', 'list', 'get'] },
            template_id: { type: 'string', description: 'UUID, for action=get' },
            name: { type: 'string', description: 'Template name (required for create)' },
            kind: { type: 'string', description: 'nps | csat | ces | custom (drives the response scale)' },
            description: { type: 'string' },
            questions: {
              type: 'array',
              description: 'Question objects, e.g. [{ "text": "How likely are you to recommend us?", "type": "scale", "scale": 10 }]',
              items: { type: 'object' },
            },
          },
          required: ['action'],
          'x-action-required': { create: ['name'] },
        },
      },
    },
    instructions:
      'Create a template FIRST, then pass the returned id as template_id to create_survey_campaign (a campaign cannot be created without an existing template). `name` is required on create. `questions` is a JSON array of question definitions; `kind` selects the response scale (nps=0-10, csat=1-5, ces=1-7, custom=free-form).',
  },
  {
    name: 'send_survey',
    description:
      'Send an active survey campaign to one or more recipients via email. Each recipient gets a unique one-click token link. Use when: a triggering event fires (order delivered, ticket closed), running a manual feedback push, or following up on a specific customer interaction.',
    category: 'crm',
    handler: 'edge:comms-send',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_survey',
        description: 'Dispatch a survey campaign to recipients via email.',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: { type: 'string', description: 'UUID of the survey_campaigns row' },
            recipients: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  name: { type: 'string' },
                  related_entity_type: {
                    type: 'string',
                    enum: ['order', 'ticket', 'contract', 'booking', 'deal'],
                  },
                  related_entity_id: { type: 'string' },
                  lead_id: { type: 'string' },
                },
                required: ['email'],
              },
            },
          },
          required: ['campaign_id', 'recipients'],
        },
      },
    },
    instructions:
      'Always pass related_entity_id when the survey relates to a specific record — it powers the per-record NPS report. Pass lead_id when known to boost lead score on promoter responses.',
  },
  {
    name: 'list_survey_responses',
    description:
      'List responses for a campaign with optional filters (category, score range, date range). Use when: reviewing detractor feedback, building a monthly NPS report, finding promoters to ask for testimonials.',
    category: 'crm',
    handler: 'db:survey_responses',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_survey_responses',
        description: 'List survey responses with filters.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list'] },
            campaign_id: { type: 'string' },
            category: { type: 'string', enum: ['detractor', 'passive', 'promoter'] },
            min_score: { type: 'number' },
            max_score: { type: 'number' },
            limit: { type: 'number' },
          },
          required: ['action'],
        },
      },
    },
    instructions:
      'Filter by category="detractor" to find unhappy customers needing immediate attention. Filter by category="promoter" to find advocates for testimonials/case studies.',
  },
  {
    name: 'get_survey_analytics',
    description:
      'Aggregate per-campaign NPS/CSAT scores AND per-question response distributions across all responses. Use when: building the monthly NPS report, seeing which quiz question failed the most, understanding response spread. NOT for: raw response rows (use list_survey_responses).',
    category: 'crm',
    handler: 'rpc:get_survey_analytics',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_survey_analytics',
        description: 'Return per-campaign aggregates plus per-question distributions for one or all survey campaigns.',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: { type: 'string', description: 'Optional UUID; if omitted, aggregates all campaigns.' },
          },
        },
      },
    },
    instructions:
      'Returns { success, campaigns: [{ campaign_id, campaign_name, kind, total_responses, promoters, passives, detractors, nps_score, avg_score, avg_points, passed_count, failed_count, per_question: [{ id, label, type, response_count, distribution }] }] }. `distribution` is a { answer_value: count } map. Prefer this over list_survey_responses when you need summary numbers.',
  },
  {
    name: 'export_survey_responses',
    description:
      'Export survey responses as a CSV string. Use when: an operator requests a spreadsheet-ready extract for board reports, external BI, or archive. Filters by campaign, category, and start date. Caps at 10 000 rows.',
    category: 'crm',
    handler: 'rpc:export_survey_responses',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'export_survey_responses',
        description: 'Return CSV text of survey responses (up to 10 000 rows) with optional campaign/category/date filters.',
        parameters: {
          type: 'object',
          properties: {
            campaign_id: { type: 'string', description: 'Optional UUID to scope to one campaign.' },
            category: { type: 'string', enum: ['detractor', 'passive', 'promoter'] },
            since: { type: 'string', description: 'Optional ISO timestamp — only responses newer than this are returned.' },
          },
        },
      },
    },
    instructions:
      'Returns { success, csv, row_count }. `csv` includes a header row. Use category="detractor" for a churn-risk export. For very large exports (>10k) paginate by narrowing `since`.',
  },
  {
    name: 'queue_event_surveys',
    description: 'Queue the surveys an event asks for: every ACTIVE campaign whose trigger is this event gets one send to the customer behind the record (order, booking, ticket, contract or deal), due after the campaign\'s delay_hours — never twice for the same campaign and record. Run by the platform\'s survey automations on order.delivered, order.paid, ticket.resolved, ticket.closed, booking.completed, contract.renewed and deal.won. Use when: re-queuing the survey for one record after fixing its e-mail address. NOT for: a manual push to a list of people (send_survey); creating a campaign (create_survey_campaign).',
    category: 'crm',
    handler: 'rpc:queue_event_surveys',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'queue_event_surveys',
        description: 'Queue the survey sends an event asks for.',
        parameters: {
          type: 'object',
          properties: {
            p_event: { type: 'string', enum: ['order.delivered', 'order.paid', 'ticket.resolved', 'ticket.closed', 'booking.completed', 'contract.renewed', 'deal.won'] },
            p_entity_id: { type: 'string', format: 'uuid', description: 'The order, booking, ticket, contract or deal.' },
          },
          required: ['p_event', 'p_entity_id'],
        },
      },
    },
  },
  {
    name: 'send_due_surveys',
    description: 'Mail the queued survey sends whose time has come (queue_event_surveys put them there with the campaign\'s delay). Each is claimed before the mail and given back when nothing went out. Run every fifteen minutes by the "Send due surveys" automation, which wakes only when a send is due. Use when: a person wants the due surveys out now. NOT for: sending a campaign to a list of people (send_survey).',
    category: 'crm',
    handler: 'edge:comms-send',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_due_surveys',
        description: 'Mail due queued surveys.',
        parameters: { type: 'object', properties: { limit: { type: 'integer', description: 'At most this many in one run (default 25).' } } },
      },
    },
  },
];

export const surveysModule = defineModule<Input, Output>({
  id: 'surveys',
  name: 'Surveys & NPS',
  version: '1.0.0',
  processes: ['support-to-resolution', 'lead-to-customer'],
  maturity: 'L2',
  description:
    'Capture customer satisfaction with one-click NPS, CSAT, and custom surveys. Triggered manually or automatically after orders, tickets, contracts and bookings. Detractor responses auto-route to FlowPilot for recovery; promoter responses boost lead score and surface testimonial opportunities.',
  capabilities: ['data:read', 'data:write'],
  tier: 'standard',
  inputSchema,
  outputSchema,
  skills: ['manage_survey_template', 'create_survey_campaign', 'send_survey', 'list_survey_responses', 'queue_event_surveys', 'send_due_surveys'],
  data: {
    tables: ['survey_responses', 'survey_sends', 'survey_campaigns', 'survey_templates'],
  },
  skillSeeds: SURVEY_SKILLS,

  automations: [
    {
      name: 'Survey when an order is delivered',
      description: 'When an order is delivered, queue the survey of every active campaign set to "order.delivered" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'order.delivered' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'order.delivered', p_entity_id: '{{event.payload.id}}' },
    },
    {
      name: 'Survey when an order is paid',
      description: 'When an order is paid, queue the survey of every active campaign set to "order.paid" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'order.paid' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'order.paid', p_entity_id: '{{event.payload.id}}' },
    },
    {
      name: 'Survey when a support case is resolved',
      description: 'When a support case is resolved, queue the survey of every active campaign set to "ticket.resolved" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'ticket.resolved' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'ticket.resolved', p_entity_id: '{{event.payload.ticket_id}}' },
    },
    {
      name: 'Survey when a support case is closed',
      description: 'When a support case is closed, queue the survey of every active campaign set to "ticket.closed" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'ticket.closed' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'ticket.closed', p_entity_id: '{{event.payload.id}}' },
    },
    {
      name: 'Survey when a booking is marked completed',
      description: 'When a booking is marked completed, queue the survey of every active campaign set to "booking.completed" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'booking.completed' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'booking.completed', p_entity_id: '{{event.payload.id}}' },
    },
    {
      name: 'Survey when a contract is renewed',
      description: 'When a contract is renewed, queue the survey of every active campaign set to "contract.renewed" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'contract.renewed' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'contract.renewed', p_entity_id: '{{event.payload.id}}' },
    },
    {
      name: 'Survey when a deal is won',
      description: 'When a deal is won, queue the survey of every active campaign set to "deal.won" for the customer behind it. Quiet when no campaign uses the event.',
      trigger_type: 'event',
      trigger_config: { event: 'deal.won' },
      skill_name: 'queue_event_surveys',
      skill_arguments: { p_event: 'deal.won', p_entity_id: '{{event.payload.id}}' },
    },
    {
      name: 'Send due surveys',
      description: 'Every fifteen minutes, mail the queued surveys whose delay has passed. Wakes nothing when none is due (work probe due_surveys).',
      trigger_type: 'cron',
      trigger_config: { expression: '*/15 * * * *', work_probe: 'due_surveys' },
      skill_name: 'send_due_surveys',
      skill_arguments: {},
      executor: 'platform',
    },
  ],

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
