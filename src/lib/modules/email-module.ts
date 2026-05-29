import { z } from 'zod';
import type { SkillSeed } from '@/lib/module-bootstrap';
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
  inputSchema,
  outputSchema,

  // send_email/configure_email_provider/preview_email_template were declared
  // but never had SkillSeed entries. Removed to align manifest with reality.
  skills: ['scan_gmail_inbox', 'list_communications', 'get_communication'],
  skillSeeds: EMAIL_SKILLS,

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
