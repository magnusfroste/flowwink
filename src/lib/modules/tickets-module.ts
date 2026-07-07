import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const ticketModuleInputSchema = z.object({
  subject: z.string().min(1).max(300),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  category: z.enum(['bug', 'feature', 'question', 'billing', 'other']).default('other'),
  contact_email: z.string().email().optional(),
  contact_name: z.string().optional(),
  lead_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  source: z.string().default('manual'),
});

const ticketModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  error: z.string().optional(),
});

type TicketModuleInput = z.infer<typeof ticketModuleInputSchema>;
type TicketModuleOutput = z.infer<typeof ticketModuleOutputSchema>;

// ── Bundled skill definitions ──
const TICKETS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_ticket',
    description:
      'List, view, update, resolve/close, reopen, reassign, or re-prioritize helpdesk tickets. Use when: closing a resolved ticket, changing status/priority, assigning a ticket to an agent, or reviewing the queue. NOT for: creating a ticket from an email (email_to_ticket), classifying (ticket_triage), or replying to the customer (reply_to_ticket_via_email).',
    category: 'crm',
    handler: 'db:tickets',
    scope: 'both',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_ticket',
        description: 'CRUD + lifecycle for support tickets. action=update changes any field (status/priority/category/assigned_to); use it to close (status="closed"), resolve ("resolved"), reopen ("open") or reassign.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update'] },
            id: { type: 'string', description: 'Ticket UUID — required for get/update.' },
            status: { type: 'string', enum: ['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'], description: 'On list: filters by status. On update: sets it (resolved/closed also stamp resolved_at/closed_at).' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            category: { type: 'string', enum: ['bug', 'feature', 'question', 'billing', 'other'] },
            assigned_to: { type: 'string', description: 'support_agents/user UUID to reassign to (update).' },
            tags: { type: 'array', items: { type: 'string' }, description: 'On update: replaces the ticket tags array (e.g. ["vip","billing"]).' },
            limit: { type: 'number' },
          },
          required: ['action'],
          'x-action-required': { get: ['id'], update: ['id'] },
        },
      },
    },
    instructions:
      'Lifecycle via action=update on an id: close={status:"closed"}, resolve={status:"resolved"}, reopen={status:"open"}, reassign={assigned_to:<uuid>}, escalate={priority:"urgent"}, tag={tags:["vip"]} (replaces the whole array — read first, then write). action=list without a status returns recent tickets; pass status to filter the queue. Keyword lookup across subject/description/tags is search_tickets. Reply to the customer is a separate skill (reply_to_ticket_via_email).',
  },
  {
    name: 'search_tickets',
    description:
      'Full-text search across ticket subjects, descriptions and tags, ranked by relevance. Use when: finding tickets about a topic ("all tickets mentioning login errors"), locating a customer issue without an id, checking for duplicates before creating a ticket. NOT for: listing/filtering by status alone (manage_ticket list) or updating tickets (manage_ticket).',
    category: 'crm',
    handler: 'rpc:search_tickets',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_tickets',
        description: 'Ranked full-text search over tickets (subject + description + tags), optionally narrowed to a status.',
        parameters: {
          type: 'object',
          required: ['p_query'],
          properties: {
            p_query: { type: 'string', description: 'Search phrase (websearch syntax: quoted phrases, OR, -exclusions)' },
            p_status: { type: 'string', enum: ['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'], description: 'Optional status filter' },
            p_limit: { type: 'number', description: 'Max results (default 20, max 100)' },
          },
        },
      },
    },
    instructions: 'Returns {results:[{id, subject, status, priority, category, contact_email, contact_name, assigned_to, tags, sla_deadline, created_at}]} ranked by relevance. Falls back to substring matching when full-text finds nothing, so partial words also hit.',
  },
  {
    name: 'manage_canned_response',
    description:
      'CRUD for canned responses (reusable reply templates for support tickets). Use when: creating a standard answer for a recurring question, updating template wording, retiring an outdated template. NOT for: sending a reply (reply_to_ticket_via_email) or KB articles (manage_kb_article).',
    category: 'crm',
    handler: 'rpc:manage_canned_response',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_canned_response',
        description: 'Create, list, get, update or delete canned responses (title, shortcut, body_md, category, is_active).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['create', 'list', 'get', 'update', 'delete'] },
            p_id: { type: 'string', format: 'uuid', description: 'Canned response UUID — required for get/update/delete.' },
            p_title: { type: 'string' },
            p_shortcut: { type: 'string', description: 'Short trigger like "/refund" for quick insertion.' },
            p_body_md: { type: 'string', description: 'Template body (markdown). Support placeholders like {{customer_name}} by convention.' },
            p_category: { type: 'string' },
            p_is_active: { type: 'boolean', description: 'Set false to retire without deleting. On list: filters.' },
            p_limit: { type: 'number' },
          },
          'x-action-required': { create: ['p_title', 'p_body_md'], get: ['p_id'], update: ['p_id'], delete: ['p_id'] },
        },
      },
    },
  },
  {
    name: 'ticket_triage',
    description:
      'Auto-classify a helpdesk ticket: set priority + category, attach up to 3 relevant KB article suggestions, write a 1-sentence internal summary. Use when: a new ticket needs triage, an existing ticket changed and needs re-classification, or a human asks "what is this ticket about?". NOT for: drafting a customer-facing reply (that is a separate ai-task), or bulk re-triaging the queue (loop calls per ticket).',
    category: 'crm',
    handler: 'ai-task:ticket_triage',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'ticket_triage',
        description:
          'Triage a single ticket. Loads the ticket + a small KB index, then writes back priority, category and suggested_kb_article_ids on the tickets row.',
        parameters: {
          type: 'object',
          properties: {
            ticket_id: { type: 'string', description: 'UUID of the ticket to triage' },
          },
          required: ['ticket_id'],
          additionalProperties: false,
        },
      },
    },
  },
];

export const ticketsModule = defineModule<TicketModuleInput, TicketModuleOutput>({
  id: 'tickets',
  name: 'Tickets',
  version: '1.0.0',
  processes: ['support-to-resolution'],
  maturity: 'L3',
  description: 'Helpdesk ticket management with Kanban pipeline',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: ticketModuleInputSchema,
  outputSchema: ticketModuleOutputSchema,

  skills: ['manage_ticket', 'ticket_triage', 'search_tickets', 'manage_canned_response'],
  data: {
    tables: ['ticket_comments', 'support_escalations', 'canned_responses', 'tickets', 'support_agents'],
  },
  skillSeeds: TICKETS_SKILLS,

  async publish(input: TicketModuleInput): Promise<TicketModuleOutput> {
    try {
      const validated = ticketModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('tickets')
        .insert([{
          subject: validated.subject,
          description: validated.description || null,
          priority: validated.priority,
          category: validated.category,
          contact_email: validated.contact_email || null,
          contact_name: validated.contact_name || null,
          lead_id: validated.lead_id || null,
          company_id: validated.company_id || null,
          source: validated.source,
        }])
        .select('id')
        .single();

      if (error) {
        logger.error('[TicketsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
    } catch (error) {
      logger.error('[TicketsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
