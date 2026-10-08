import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { triggerWebhook } from '@/lib/webhook-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  FormSubmissionModuleInput,
  FormSubmissionModuleOutput,
  formSubmissionModuleInputSchema,
  formSubmissionModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const FORMS_SKILLS: SkillSeed[] = [
  {
    name: 'manage_form_submissions',
    description: 'View and manage form submissions. Use when: reviewing customer inquiries from website forms; processing collected data; deleting spam submissions. NOT for: analyzing feedback sentiment (analyze_chat_feedback); managing leads (manage_leads).',
    category: 'crm',
    handler: 'module:forms',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_form_submissions',
        description: 'View and manage form submissions. Use when: reviewing customer inquiries from website forms; processing collected data; deleting spam submissions. NOT for: analyzing feedback sentiment (analyze_chat_feedback); managing leads (manage_leads).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'delete',
                'stats',
              ],
            },
            submission_id: {
              type: 'string',
            },
            form_name: {
              type: 'string',
            },
            limit: {
              type: 'number',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_form_submissions
### What
Views and manages form submissions from website forms.
### When to use
- Admin asks about form responses
- Lead generation: review contact form submissions
- Analytics: form submission statistics
### Parameters
- **action**: Required. list, get, delete, stats.
- **form_name**: Filter by form name.
### Edge cases
- Form submissions may contain PII — handle with care.
- Stats action returns submission counts by form.`,
  },
  {
    name: 'manage_form',
    description:
      'Inspect website forms and their performance. A form is a Form block on a page (its fields define the form); this reads those definitions. Use when: an operator asks what forms exist, which fields a form has, how many submissions a form got, or its submission→lead conversion. NOT for: reading individual submissions (manage_form_submissions); building/editing a form (that is a page edit via manage_pages — add or change a Form block).',
    category: 'crm',
    handler: 'module:forms',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_form',
        description:
          'List forms across pages (with field counts + submission counts), or get one form by block_id with its field definitions and submission→lead conversion.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get'], description: 'list = all forms; get = one form by block_id.' },
            block_id: { type: 'string', description: 'Form block id (from list) — required for get.' },
          },
          required: ['action'],
        },
      },
    },
    instructions: `## manage_form
Forms live as Form blocks inside pages (no forms table). This skill reads them.
- Inventory: manage_form(action:"list") → forms with page, field_count, submissions
- Detail: manage_form(action:"get", block_id:"<id>") → field definitions + submission→lead conversion
To CREATE or EDIT a form, edit the page (manage_pages) and add/change a Form block — the block's fields ARE the form.
To check that submissions actually reach someone, run test_form_delivery on the block.`,
  },
  {
    name: 'test_form_delivery',
    description:
      'Dry-run a website form: report every rail a submission would take (storage, CRM lead, form.submitted webhooks and automations, notification email, job application) against the live configuration — WITHOUT creating a submission or a lead. mode "send_test" additionally sends one clearly marked test email to the notify address and probes each webhook URL. Use when: a form was just built or changed; an operator asks "will submissions reach us?"; before launch; a notification is missing. NOT for: reading submissions (manage_form_submissions); listing forms (manage_form); sending real email (send_email). Requires one of: block_id or page_slug.',
    category: 'crm',
    handler: 'module:forms',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'test_form_delivery',
        description:
          'Dry-run a Form block: which rails a submission would take and whether each is configured to deliver. Creates nothing. mode "send_test" sends one marked test email and probes webhook URLs.',
        parameters: {
          type: 'object',
          properties: {
            block_id: { type: 'string', description: 'The Form block id (from manage_form list). Either this or page_slug.' },
            page_slug: { type: 'string', description: 'Resolve the form by page when the page has exactly one Form block.' },
            mode: {
              type: 'string',
              enum: ['dry_run', 'send_test'],
              description: 'dry_run (default): report only, nothing leaves the system. send_test: also send ONE test email marked [TEST] to the notify address and HEAD-probe each subscribed webhook URL. Neither mode stores a submission or creates a lead.',
            },
            sample_data: {
              type: 'object',
              description: 'Optional sample values keyed by field label, used in the report and in the test email. Defaults are generated from the field types.',
            },
          },
          required: [],
        },
      },
    },
    instructions: `## test_form_delivery
### What
Answers "if a visitor submits this form, who gets what?" from the live configuration, without a real submission. The same delivery plan the public block executes (shared module) is checked rail by rail:
- storage — the submission row (always)
- lead — only when the form has an email field; reports which labels feed name/company/phone, and whether the CRM module is on
- webhook — active webhooks subscribed to form.submitted and event automations listening for it
- notification_email — the block's notifyEmail and the email provider that would carry it (resolved by email-send's own dry run)
- job_application — jobPostingId + a file field, and whether the posting exists
### Modes
- dry_run (default): report only.
- send_test: also sends ONE email to notifyEmail with subject "[TEST] …" and the sample data, and HEAD-probes each webhook URL (reports status). Still no submission, no lead, no webhook payload.
### Reading the result
Each rail has status: ok (configured and would deliver), inactive (this form does not use it), misconfigured (used but cannot deliver — the detail says what to fix), sent / probed (send_test). "would_deliver_to" lists every destination a real submission would reach.
### Edge cases
- No notifyEmail AND no webhook AND no email field → a submission is stored and nobody is told; the summary says so.
- A form on a draft page is testable; the summary notes the page is not published.`,
  },
];

export const formsModule = defineModule<FormSubmissionModuleInput, FormSubmissionModuleOutput>({
  id: 'forms',
  name: 'Forms',
  version: '1.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L4',
  description: 'Process form submissions and create leads',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: formSubmissionModuleInputSchema,
  outputSchema: formSubmissionModuleOutputSchema,

  skills: [
    'manage_form_submissions',
    'manage_form',
    'test_form_delivery',
  ],
  data: {
    tables: ['form_submissions'],
  },
  skillSeeds: FORMS_SKILLS,

  webhookEvents: [
    { event: 'form.submitted', description: 'A form was submitted' },
  ],

  async publish(input: FormSubmissionModuleInput): Promise<FormSubmissionModuleOutput> {
    try {
      const validated = formSubmissionModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('form_submissions')
        .insert({
          form_name: validated.form_name,
          block_id: validated.block_id,
          data: validated.data as Json,
          page_id: validated.page_id || null,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[FormsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      try {
        await triggerWebhook({
          event: 'form.submitted',
          data: { id: data.id, form_name: validated.form_name, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[FormsModule] Webhook failed:', webhookError);
      }

      return { success: true, id: data.id };
    } catch (error) {
      logger.error('[FormsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
