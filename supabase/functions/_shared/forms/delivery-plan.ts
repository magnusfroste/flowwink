/**
 * Form delivery plan — the ONE description of what happens when a Form block is
 * submitted, shared by the public block (which does it) and the
 * `test_form_delivery` skill (which tells an operator what WOULD happen).
 *
 * Until 2026-10-03 the chain lived only inside FormBlock.tsx's submit handler:
 * store the submission, turn it into a lead if there is an email field, fire
 * the form.submitted webhook, mail the notification address, route a CV to
 * recruitment. An operator building a site through the MCP gateway (Hermes,
 * #619 point 7) had no way to check any of it without sending a real
 * submission — which creates a real lead and a real email. The plan below is
 * pure; the skill adds the live configuration (webhooks, email provider) and
 * the block executes the same rails in the same order.
 *
 * Lead-field detection speaks the site's language: on optic the labels were
 * "Namn" and "Verksamhet", and an English-only `.includes('name')` sent the
 * lead through with an email and nothing else.
 */

export interface PlanField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
}

export interface PlanFormData {
  title?: string;
  fields?: PlanField[];
  notifyEmail?: string;
  jobPostingId?: string;
}

export const LEAD_FIELD_NEEDLES = {
  name: ['name', 'namn'],
  company: ['company', 'företag', 'verksamhet', 'organisation', 'bolag'],
} as const;

export interface LeadFieldMap {
  email?: PlanField;
  name?: PlanField;
  company?: PlanField;
  phone?: PlanField;
}

const byLabel = (needles: readonly string[]) => (f: PlanField) =>
  needles.some((n) => String(f.label ?? '').toLowerCase().includes(n));

/** Which form fields feed which lead columns. No email field → no lead. */
export function mapLeadFields(fields: PlanField[] | undefined): LeadFieldMap {
  const list = Array.isArray(fields) ? fields : [];
  return {
    email: list.find((f) => f.type === 'email'),
    name: list.find(byLabel(LEAD_FIELD_NEEDLES.name)),
    company: list.find(byLabel(LEAD_FIELD_NEEDLES.company)),
    phone: list.find((f) => f.type === 'phone'),
  };
}

export type DeliveryRail = 'storage' | 'lead' | 'webhook' | 'notification_email' | 'job_application';

export interface DeliveryStep {
  rail: DeliveryRail;
  /** Whether this form's definition engages the rail at all. */
  active: boolean;
  /** One sentence an operator can act on. */
  detail: string;
  /** Rail-specific facts (which fields map where, which address, which posting). */
  facts?: Record<string, unknown>;
}

/**
 * The rails a submission of this form runs, from the block definition alone.
 * Live configuration (is a webhook subscribed, is an email provider wired) is
 * layered on by the skill — this function must stay pure so the public block
 * and the test agree by construction.
 */
export function planFormDelivery(form: PlanFormData): DeliveryStep[] {
  const fields = Array.isArray(form.fields) ? form.fields : [];
  const lead = mapLeadFields(fields);
  const notify = typeof form.notifyEmail === 'string' ? form.notifyEmail.trim() : '';
  const fileField = fields.find((f) => f.type === 'file');

  return [
    {
      rail: 'storage',
      active: true,
      detail: `Stored in form_submissions as "${form.title || 'Contact Form'}" (${fields.length} field${fields.length === 1 ? '' : 's'}); visible in the admin inbox.`,
      facts: { form_name: form.title || 'Contact Form', field_count: fields.length },
    },
    {
      rail: 'lead',
      active: !!lead.email,
      detail: lead.email
        ? `A CRM lead is created or updated through ingest_form_lead (email from "${lead.email.label}"${lead.name ? `, name from "${lead.name.label}"` : ', no name field'}${lead.company ? `, company from "${lead.company.label}"` : ''}${lead.phone ? `, phone from "${lead.phone.label}"` : ''}).`
        : 'No lead: the form has no field of type "email". Add one if submissions should reach the CRM.',
      facts: {
        email_field: lead.email?.label ?? null,
        name_field: lead.name?.label ?? null,
        company_field: lead.company?.label ?? null,
        phone_field: lead.phone?.label ?? null,
      },
    },
    {
      rail: 'webhook',
      active: true,
      detail: 'The form.submitted event is dispatched to every active webhook subscribed to it and to every event automation listening for it.',
      facts: { event: 'form.submitted' },
    },
    {
      rail: 'notification_email',
      active: !!notify,
      detail: notify
        ? `A notification email ("New submission: ${form.title || 'Contact Form'}") goes to ${notify} through the site's email provider.`
        : 'No notification email: the block has no notifyEmail. Set one if a person should be told about each submission.',
      facts: { to: notify || null },
    },
    {
      rail: 'job_application',
      active: !!form.jobPostingId,
      detail: form.jobPostingId
        ? (fileField
          ? `The uploaded CV ("${fileField.label}") is routed to recruitment for job posting ${form.jobPostingId}.`
          : `jobPostingId is set but the form has no file field — no CV can be uploaded, so nothing reaches recruitment.`)
        : 'Not a job application form.',
      facts: { job_posting_id: form.jobPostingId ?? null, file_field: fileField?.label ?? null },
    },
  ];
}
