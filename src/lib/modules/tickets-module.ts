import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

const ticketModuleInputSchema = z.object({
  subject: z.string().min(1).max(300),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  category: z.enum(['bug', 'feature', 'question', 'billing', 'other']).default('other'),
  contact_email: z.string().email().optional(),
  contact_name: z.string().optional(),
  lead_id: z.guid().optional(),
  company_id: z.guid().optional(),
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
    name: 'send_ticket_update',
    description: 'E-mail the customer about ONE support case: the receipt ("we have received your request", with the case number) when only ticket_id is given, or a staff reply when comment_id is given. Each is sent once: a second call answers skipped. Use when: a case was opened for a customer and they should know it arrived; a public reply was written and the customer has not been told; a person asks to send it again (resend: true). NOT for: writing the reply itself (add_ticket_comment); answering inside the customer\'s own mail thread on a case that came in by e-mail (reply_to_ticket_via_email); internal notes (never mailed).',
    category: 'crm',
    handler: 'edge:comms-send',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_ticket_update',
        description: 'E-mail the customer the receipt of a case, or one staff reply on it — once.',
        parameters: {
          type: 'object',
          properties: {
            ticket_id: { type: 'string', description: 'UUID of the case — alone, it sends the receipt.' },
            comment_id: { type: 'string', description: 'UUID of a public staff reply (comment_id from add_ticket_comment) — sends that reply.' },
            resend: { type: 'boolean', description: 'true = send it again although it was already sent. Default false.' },
          },
        },
      },
    },
    instructions: 'Give ticket_id for the receipt or comment_id for a reply (one of them). The answer says what happened: sent "received" | "reply" with emailed_to, or skipped with the reason — no_contact_email, came_in_by_email (a case that arrived by mail gets no automatic receipt), case_already_settled, not_a_new_case (older than a day), already_acknowledged, already_mailed, internal_note, not_a_staff_reply, customer_email_disabled (Tickets setting customerEmailEnabled: false). Two automations run this by themselves on ticket.created and ticket.replied, so calling it by hand is for a resend. Without an e-mail provider the send is logged as simulated and reaches nobody. The stamps are tickets.ack_sent_at and ticket_comments.emailed_at.',
  },
  {
    name: 'add_ticket_comment',
    description: 'Reply to a support case or add an internal note on it. A public reply (p_is_internal false) is e-mailed to the customer, shows in their portal and stops the first-response SLA clock; an internal note is staff-only, mailed to nobody, and does not. Use when: answering a ticket; documenting an investigation step on a case; handing context to a colleague. NOT for: e-mailing the reply through a connected mailbox (reply_to_ticket_via_email); changing status, priority or assignee (manage_ticket).',
    category: 'crm',
    handler: 'rpc:add_ticket_comment',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'add_ticket_comment',
        description: 'Post a public reply (customer-visible in the portal) or an internal note on a ticket. The SLA clock reacts to public replies only.',
        parameters: {
          type: 'object',
          required: ['p_ticket_id', 'p_content'],
          properties: {
            p_ticket_id: { type: 'string', format: 'uuid', description: 'The ticket (id from manage_ticket / search_tickets)' },
            p_content: { type: 'string', description: 'The reply or note text' },
            p_is_internal: { type: 'boolean', description: 'true = internal note (staff only, SLA keeps running); false/omitted = public reply' },
            p_author_name: { type: 'string', description: 'Signature shown on the reply (default "Support")' },
            p_created_at: { type: 'string', description: 'Only for importing history: back-dates the comment (ISO). Future times are refused.' },
          },
        },
      },
    },
    instructions: 'A public reply is written as-is to ticket_comments, shows in the customer portal, and is e-mailed to the case\'s contact_email by the automation "Reply to the customer on a case" (send_ticket_update) — once per reply; a back-dated reply (p_created_at) is an import and mails nobody. An internal note is never mailed. To answer inside the customer\'s own mail thread on a case that came in by e-mail, use reply_to_ticket_via_email (needs a connected mailbox) INSTEAD — it mails and logs the reply itself. Move the case on afterwards with manage_ticket {action:"update", status:"waiting"|"resolved"}. Requires the tickets module (or service role).',
  },
  {
    name: 'manage_ticket',
    description:
      'Create, list, view, update, resolve/close, reopen, reassign, or re-prioritize helpdesk tickets — including setting the owner (assigned_to), the team/queue and the requester (contact/company/lead). Use when: opening a ticket for a customer issue, closing a resolved ticket, changing status/priority, assigning a ticket to an agent, or reviewing the queue. NOT for: creating a ticket from an email (email_to_ticket), classifying (ticket_triage), or replying to the customer (reply_to_ticket_via_email).',
    category: 'crm',
    handler: 'db:tickets',
    scope: 'both',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_ticket',
        description: 'CRUD + lifecycle for support tickets. action=create opens a new ticket (subject required); action=update changes any field (status/priority/category/assigned_to/team_id); use it to close (status="closed"), resolve ("resolved"), reopen ("open") or reassign.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'create', 'update'] },
            id: { type: 'string', description: 'Ticket UUID — required for get/update.' },
            subject: { type: 'string', description: 'Short summary — required on create.' },
            description: { type: 'string', description: 'Full issue description (create/update).' },
            status: { type: 'string', enum: ['new', 'open', 'in_progress', 'waiting', 'resolved', 'closed'], description: 'On list: filters by status. On update: sets it (resolved/closed also stamp resolved_at/closed_at).' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            category: { type: 'string', enum: ['bug', 'feature', 'question', 'billing', 'other'] },
            assigned_to: { type: 'string', description: 'Owner: profiles/user UUID the ticket is assigned to (create/update).' },
            team_id: { type: 'string', description: 'Team/queue UUID (ticket_teams) that owns the ticket (create/update).' },
            contact_name: { type: 'string', description: 'Requester name — the customer the ticket is about (create/update).' },
            contact_email: { type: 'string', description: 'Requester email (create/update).' },
            company_id: { type: 'string', description: 'companies UUID the requester belongs to (create/update).' },
            lead_id: { type: 'string', description: 'leads UUID the requester belongs to (create/update).' },
            source: { type: 'string', description: 'Channel the ticket came from, e.g. "manual", "agent", "email". Defaults to "manual" on create.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'On create: sets tags. On update: replaces the ticket tags array (e.g. ["vip","billing"]).' },
            limit: { type: 'number' },
          },
          required: ['action'],
          'x-action-required': { get: ['id'], update: ['id'], create: ['subject'] },
        },
      },
    },
    instructions:
      'Create: {action:"create", subject, description?, priority?, category?, contact_name/contact_email (the REQUESTER — the customer the ticket is about), company_id/lead_id to bind it to CRM, assigned_to (the OWNER — a profiles/user UUID), team_id (queue)}. Owner and requester are different fields: assigned_to = internal staff, contact_* / company_id / lead_id = the customer. Lifecycle via action=update on an id: close={status:"closed"}, resolve={status:"resolved"}, reopen={status:"open"}, reassign={assigned_to:<uuid>}, escalate={priority:"urgent"}, tag={tags:["vip"]} (replaces the whole array — read first, then write). action=list without a status returns recent tickets; pass status to filter the queue. Keyword lookup across subject/description/tags is search_tickets. Reply to the customer is a separate skill (reply_to_ticket_via_email).',
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
  {
    // Motorn fanns, men ingen kunde köra den utom en människa vid en knapp:
    // run_ticket_escalations hade varken cron-schema eller skill-seed, så
    // "Run sweep now" i TicketEscalationRulesTab var enda anroparen. Samma
    // mönster som check_approval_escalations i approvals-module.ts, som ÄR
    // agent-körbar — det är formen vi följer här.
    name: 'run_ticket_escalations',
    description:
      'Sweep open tickets against the active ticket_escalation_rules and apply each rule that matches — raise priority, reassign, and log to support_escalations. Use when: heartbeat/queue hygiene, an SLA breach is suspected, or someone asks whether the support queue is being escalated. NOT for: escalating one named ticket (manage_ticket with priority:"urgent"), editing the rules themselves (table CRUD on ticket_escalation_rules), or SLA violation tracking (sla_check).',
    category: 'crm',
    handler: 'rpc:run_ticket_escalations',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'run_ticket_escalations',
        description:
          'Run the full ticket escalation sweep across all active rules. Returns counts. Idempotent and cheap — safe to run frequently.',
        parameters: { type: 'object', properties: {} },
      },
    },
    instructions:
      'Takes no arguments — it always sweeps every active rule. Returns {rules_evaluated, tickets_escalated, details, skipped_rules}. A rule whose match_status/match_priority/action_raise_priority carries a label that is not in the ticket enums is SKIPPED and reported in skipped_rules rather than aborting the sweep — read that key and report it, an empty skipped_rules is what a healthy rule set looks like. Escalating a ticket is idempotent per rule (a ticket already at the target priority is not re-escalated), so re-running after a partial failure is safe.',
  },
];

// The customer hears about their case whoever opened or answered it — a person
// in the admin, an agent on the gateway, the portal (2026-11-18). Before, a case
// told its customer nothing and a reply was only "in the portal".
const TICKETS_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'Receipt to the customer on a new case',
    description:
      'When a support case is created with a contact e-mail (any writer — the admin, an agent, the portal, a form), e-mail the customer that it was received, with the case number. Once per case; a case that came in by e-mail gets no automatic receipt.',
    trigger_type: 'event',
    trigger_config: { event: 'ticket.created' },
    skill_name: 'send_ticket_update',
    skill_arguments: { ticket_id: '{{event.payload.id}}' },
  },
  {
    name: 'Reply to the customer on a case',
    description:
      'When staff write a public reply on a support case, e-mail it to the customer. Once per reply; internal notes and back-dated (imported) replies are never mailed, and a reply already sent through the mailbox is not sent again.',
    trigger_type: 'event',
    trigger_config: { event: 'ticket.replied' },
    skill_name: 'send_ticket_update',
    skill_arguments: { comment_id: '{{event.payload.id}}' },
  },
];

export const ticketsModule = defineModule<TicketModuleInput, TicketModuleOutput>({
  id: 'tickets',
  name: 'Tickets',
  version: '1.0.0',
  processes: ['support-to-resolution', 'sign-to-serve'],
  maturity: 'L3',
  description: 'Helpdesk ticket management with Kanban pipeline',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: ticketModuleInputSchema,
  outputSchema: ticketModuleOutputSchema,

  skills: ['manage_ticket', 'add_ticket_comment', 'send_ticket_update', 'ticket_triage', 'search_tickets', 'manage_canned_response', 'run_ticket_escalations'],
  data: {
    tables: ['ticket_comments', 'support_escalations', 'canned_responses', 'tickets', 'support_agents', 'ticket_escalation_rules'],
  },
  skillSeeds: TICKETS_SKILLS,
  automations: TICKETS_AUTOMATIONS,

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
