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
      'Create a new survey campaign attached to a template. Use when: launching a new NPS/CSAT program, automating feedback after an event (order delivered, ticket closed, contract renewed). NOT for: editing an existing campaign (use generic update via manage_record).',
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
              enum: ['manual', 'order.delivered', 'order.paid', 'ticket.closed', 'contract.renewed', 'booking.completed', 'deal.won'],
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
    name: 'send_survey',
    description:
      'Send an active survey campaign to one or more recipients via email. Each recipient gets a unique one-click token link. Use when: a triggering event fires (order delivered, ticket closed), running a manual feedback push, or following up on a specific customer interaction.',
    category: 'crm',
    handler: 'edge:survey-send',
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
  skills: ['create_survey_campaign', 'send_survey', 'list_survey_responses'],
  data: {
    tables: ['survey_responses', 'survey_sends', 'survey_campaigns', 'survey_templates'],
  },
  skillSeeds: SURVEY_SKILLS,

  async publish(_input: Input): Promise<Output> {
    return { success: true };
  },
});
