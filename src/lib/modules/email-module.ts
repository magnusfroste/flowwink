import { z } from 'zod';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';


const inputSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string(),
  html: z.string(),
  text: z.string().optional(),
  fromOverride: z.string().optional(),
  replyTo: z.string().optional(),
  tags: z.record(z.string()).optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  provider: z.enum(['smtp', 'resend']).optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Email — provider-agnostic transactional sender.
 *
 * FlowWink is self-hosted. Email is treated as an integration so the same
 * module logic (dunning, newsletter, booking confirms, receipts) works
 * regardless of whether the operator runs SMTP (Postfix/Mailgun/SES/Gmail
 * SMTP) or a hosted API (Resend). Provider selection lives in
 * `site_settings.integrations.email.config.provider`; credentials live in
 * SMTP_* / RESEND_API_KEY secrets.
 *
 * Always-on core module — other modules call its skill via the registry
 * rather than talking to providers directly.
 */
// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const EMAIL_SKILLS: SkillSeed[] = [
  {
    name: 'send_email',
    description:
      'Send a one-off email through the provider-agnostic gateway (SMTP/Resend/Composio — whichever the site has configured). Logs to outbound_communications; with no provider configured the send is simulated and stored for inspection. Use when: sending a transactional or ad-hoc message to a known recipient (confirmation, follow-up, notification). NOT for: newsletter campaigns (send_newsletter); replying on an email-sourced ticket (reply_to_ticket_via_email); emailing a CRM lead with tracked context (send_email_to_lead).',
    category: 'communication',
    handler: 'edge:email-send',
    scope: 'both',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'send_email',
        description:
          'Send an email via the configured provider (SMTP/Resend). Requires approval. Logged to outbound_communications; simulated if no provider is configured.',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Recipient email address. Multiple recipients: comma-free single address per call preferred.',
            },
            subject: { type: 'string', description: 'Email subject line.' },
            html: { type: 'string', description: 'HTML body of the email (also used to derive text if text omitted).' },
            text: { type: 'string', description: 'Optional plain-text body.' },
            replyTo: { type: 'string', description: 'Optional Reply-To address.' },
            fromOverride: {
              type: 'string',
              description: 'Optional explicit From ("Name <addr@example.com>"). Defaults to the site\'s configured sender.',
            },
            source: {
              type: 'string',
              description: 'Originating module/skill label for the outbound_communications log (default "send_email").',
            },
          },
          required: ['to', 'subject', 'html'],
        },
      },
    },
    instructions: `## send_email
### What
Routes one email through the email-send gateway. Provider comes from site_settings.integrations.email (SMTP or Resend); modules and agents never talk to providers directly.
### When to use
- Ad-hoc or transactional messages to a specific recipient.
### Verify delivery
Check list_communications (channel=email) — status 'sent' means the provider accepted it; 'simulated' means no provider is configured and the message was only logged; 'failed' carries the provider error (see get_communication).
### Edge cases
- Requires approval (trust_level=approve) — outbound mail to arbitrary recipients.
- No provider configured is NOT an error: the send is simulated and logged, so flows keep working (Law 4).
- The gateway associates the recipient with a CRM lead automatically when the email uniquely matches one (outbound_communications trigger).`,
  },
  {
    name: 'scan_gmail_inbox',
    description: 'Scan connected Gmail inbox for business signals — new leads, partnership inquiries, support requests. Use when: identifying incoming business opportunities from email; automating email categorization; flagging important emails. NOT for: sending emails (composio_gmail_send); managing leads directly (manage_leads).',
    category: 'communication',
    handler: 'edge:gmail-inbox-scan',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'scan_gmail_inbox',
        description: 'Scan connected Gmail inbox for business signals — new leads, partnership inquiries, support requests. Use when: identifying incoming business opportunities from email; automating email categorization; flagging important emails. NOT for: sending emails (composio_gmail_send); managing leads directly (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            max_messages: {
              type: 'number',
              description: 'Max messages to scan (default 20)',
            },
            scan_days: {
              type: 'number',
              description: 'Days back to scan (default 1)',
            },
          },
        },
      },
    },
    instructions: `## scan_gmail_inbox
### What
Scans connected Gmail inbox for business signals — new leads, partnership inquiries, support requests.
### When to use
- Part of inbox monitoring automation
- Admin asks to check recent emails
- Lead discovery from inbound emails
### Parameters
- **max_messages**: Max messages to scan (default 20).
- **scan_days**: Days back to scan (default 1).
### Edge cases
- Requires Google OAuth connection. Returns error if not connected.
- Only reads — does not send or modify emails.
- Extracts signals: lead info, meeting requests, support needs.`,
  },
  {
    name: 'list_communications',
    description: 'List entries from the outbound communications gateway log (email/sms/slack/signing). Use when: following up on whether a message actually went out, debugging silent failures, checking which provider handled a send, or auditing what an agent sent on behalf of the business. NOT for: sending new messages (use send_email/send_contract_for_signature etc); reading internal chat sessions (use chat module); reading newsletter campaign stats (use newsletter module).',
    category: 'communication',
    handler: 'internal:list_communications',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_communications',
        description: 'List entries from the outbound communications gateway log (email/sms/slack/signing). Use when: following up on whether a message actually went out, debugging silent failures, checking which provider handled a send, or auditing what an agent sent on behalf of the business. NOT for: sending new messages (use send_email/send_contract_for_signature etc); reading internal chat sessions (use chat module); reading newsletter campaign stats (use newsletter module).',
        parameters: {
          type: 'object',
          properties: {
            channel: {
              type: 'string',
              enum: ['email', 'sms', 'slack', 'signing'],
              description: 'Filter by channel.',
            },
            status: {
              type: 'string',
              enum: ['sent', 'simulated', 'failed', 'skipped', 'pending'],
              description: 'Filter by delivery status. "simulated" = no provider configured, message logged but not actually sent.',
            },
            recipient: {
              type: 'string',
              description: 'Partial recipient match (case-insensitive).',
            },
            source: {
              type: 'string',
              description: 'Filter by originating module/skill (e.g. "newsletter", "send_contract_for_signature").',
            },
            since: {
              type: 'string',
              description: 'ISO 8601 timestamp — only entries created after this.',
            },
            limit: {
              type: 'number',
              description: 'Max rows (default 50, hard cap 200).',
            },
          },
        },
      },
    },
    instructions: `## list_communications
### What
Read-only view of the outbound_communications gateway log — every email/sms/slack/signing attempt FlowWink has made, regardless of which module triggered it.
### When to use
- Verifying a message actually went out after running send_email / send_contract_for_signature.
- Diagnosing "silent success" — a skill returned ok but no provider was configured.
- Auditing recent outbound activity per recipient or source module.
### Status semantics
- **sent**: provider accepted and delivered.
- **simulated**: no provider configured — message stored for inspection only (Stripe-style simulation).
- **skipped**: explicitly bypassed (e.g. suppressed recipient).
- **failed**: provider rejected — see error_message via get_communication.
- **pending**: enqueued, not yet processed.
### Returns
Compact rows (no body). Call get_communication with an id to see the full HTML/text body and metadata.`,
  },
  {
    name: 'get_communication',
    description: 'Fetch the full body, error details and metadata for one outbound communication log entry. Use when: inspecting exactly what was sent (or would have been sent), reading provider error messages on a failed send, or showing a user the content of a previous message. NOT for: listing or filtering — use list_communications first.',
    category: 'communication',
    handler: 'internal:get_communication',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'get_communication',
        description: 'Fetch the full body, error details and metadata for one outbound communication log entry. Use when: inspecting exactly what was sent (or would have been sent), reading provider error messages on a failed send, or showing a user the content of a previous message. NOT for: listing or filtering — use list_communications first.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'outbound_communications.id (uuid).' },
          },
          required: ['id'],
        },
      },
    },
    instructions: `## get_communication
### What
Returns one outbound_communications row in full — body_html, body_text, error_message, metadata, related_entity_*.
### When to use
- After list_communications surfaces an interesting row.
- When asked "what did we actually send to <recipient>?".
- When diagnosing a failed send — error_message and metadata.provider_response often hold the root cause.`,
  },
  {
    name: 'email_to_ticket',
    description: 'Convert an inbound email into a support ticket — creates a new ticket or appends a comment if the email is a reply to an existing thread. Idempotent on Gmail message_id. Use when: an `email.received` event fires (typically wired as an automation); manually replaying a stuck inbound email. NOT for: outbound replies (use reply_to_ticket_via_email); classifying email type (this assumes ticket — add a classifier upstream if needed).',
    category: 'communication',
    handler: 'internal:email_to_ticket',
    scope: 'both',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'email_to_ticket',
        description: 'Convert an inbound email into a support ticket (or comment on an existing thread). Idempotent on message_id.',
        parameters: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Gmail message id (REQUIRED). Used for idempotency.' },
            thread_id: { type: 'string', description: 'Gmail thread id — used to match replies back to existing tickets.' },
            from: { type: 'string', description: 'From header (Name <email@example.com>).' },
            to: { type: 'string', description: 'To header.' },
            subject: { type: 'string', description: 'Subject line.' },
            body_text: { type: 'string', description: 'Plain text body of the email.' },
            snippet: { type: 'string', description: 'Short snippet fallback if body_text is empty.' },
            in_reply_to: { type: 'string', description: 'In-Reply-To header — alternate threading path.' },
            references: { type: 'string', description: 'References header.' },
            message_id_header: { type: 'string', description: 'RFC822 Message-ID header value (used later for outbound In-Reply-To).' },
            connected_account_id: { type: 'string', description: 'Composio connected_account_id this email came from.' },
            mailbox: { type: 'string', description: 'The mailbox email address that received this email.' },
            event: { type: 'object', description: 'Alternative: full event payload from event-dispatcher (any of the fields above can live here instead, including message_id).' },
          },
          required: ['message_id'],
        },
      },
    },
    instructions: `## email_to_ticket
### What
Ingests an inbound email and produces a ticket. Either creates a new ticket OR appends a customer comment on an existing one (and reopens it if it was closed).
### Threading rules
1. Match on \`tickets.metadata.gmail_thread_id\` first (same Gmail conversation).
2. Fallback: match \`in_reply_to\` header to a previous outgoing message-id we logged in \`metadata.last_outgoing_message_id\`.
3. Otherwise → create a new ticket.
### Idempotency
A second call with the same \`message_id\` returns \`{ deduped: true }\` without writing.
### Wired via automation
The shipped automation 'inbound_email_to_ticket' calls this on every \`email.received\` event.`,
  },
  {
    name: 'reply_to_ticket_via_email',
    description: 'Send an email reply on a ticket that was opened from Gmail. Preserves threading via In-Reply-To/References + Gmail thread_id, sends from the same Composio-connected mailbox, logs a public ticket comment. Use when: an agent or admin wants to respond to a customer ticket whose source is email. NOT for: tickets from other channels (web/telegram/etc — those channels have their own reply paths); transactional one-off emails (use send_email/email-send).',
    category: 'communication',
    handler: 'internal:reply_to_ticket_via_email',
    scope: 'both',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'reply_to_ticket_via_email',
        description: 'Send a Gmail reply on a ticket, preserving threading and from-address.',
        parameters: {
          type: 'object',
          properties: {
            ticket_id: { type: 'string', description: 'UUID of the ticket to reply on.' },
            body: { type: 'string', description: 'Plain-text reply body.' },
          },
          required: ['ticket_id', 'body'],
        },
      },
    },
    instructions: `## reply_to_ticket_via_email
### What
Replies to a ticket via Gmail (Composio). Threads the reply correctly in the recipient's inbox so it lands in the same Gmail conversation.
### Pre-conditions
- Ticket must have \`source = 'email'\`.
- Ticket must have a \`contact_email\` (or metadata.from_email).
- A Composio Gmail account must be connected for the originating mailbox.
### Side effects
- Logs a non-internal \`ticket_comments\` row with author_type='agent'.
- Updates \`metadata.last_outgoing_message_id\` + \`last_outgoing_at\` so future inbound replies match back.
- Moves ticket from 'new' to 'open' on first reply.`,
  },
];

// ── Automations ─────────────────────────────────────────────────────────────
const EMAIL_AUTOMATIONS: AutomationSeed[] = [
  {
    name: 'inbound_email_to_ticket',
    description: 'On every email.received event (from composio-webhook), convert the email into a ticket or append it to an existing thread.',
    trigger_type: 'event',
    trigger_config: { event: 'email.received' },
    skill_name: 'email_to_ticket',
    // event-dispatcher passes the event payload under arguments.event — handler accepts either flat or nested.
    skill_arguments: {},
    executor: 'platform',
  },
];


export const emailModule = defineModule<Input, Output>({
  id: 'email' as any,
  name: 'Email',
  version: '1.0.0',
  processes: [],
  maturity: 'L3',
  description:
    'Provider-agnostic email sender. Routes system emails through SMTP or Resend.',
  capabilities: ['data:write'],
  tier: 'core',
  inputSchema,
  outputSchema,

  // configure_email_provider/preview_email_template were declared but never
  // had SkillSeed entries — removed to align manifest with reality.
  // send_email got a real SkillSeed 2026-07-07 (edge:email-send gateway).
  skills: ['send_email', 'scan_gmail_inbox', 'list_communications', 'get_communication', 'email_to_ticket', 'reply_to_ticket_via_email'],
  skillSeeds: EMAIL_SKILLS,
  automations: EMAIL_AUTOMATIONS,

  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);
      const { data, error } = await supabase.functions.invoke('email-send', {
        body: v,
      });
      if (error) throw error;
      return {
        success: !!data?.success,
        provider: data?.provider,
        error: data?.error,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  },
});
