import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapLeadFields, planFormDelivery } from '../../../supabase/functions/_shared/forms/delivery-plan';

/**
 * A form's delivery chain has ONE description (delivery-plan.ts): the public
 * block executes it and test_form_delivery reports it. Hermes (#619 point 7)
 * could not check whether submissions reached anyone without sending a real
 * one — which makes a real lead and a real email. If the block and the test
 * ever disagreed, the test would lie in whichever direction the drift went, so
 * the block must not carry its own copy of the field heuristics.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the public block runs the shared plan', () => {
  const block = read('src/components/public/blocks/FormBlock.tsx');

  it('reads the lead-field map from delivery-plan.ts and keeps no heuristics of its own', () => {
    expect(block).toMatch(/mapLeadFields\(data\.fields\)/);
    expect(block).toMatch(/_shared\/forms\/delivery-plan'/);
    // The shape that drifted before: a label needle typed inline in the block.
    expect(block).not.toMatch(/includes\('name'\)|'namn'|'företag'|'verksamhet'/);
  });

  it('the skill handler builds its rails from the same plan', () => {
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/import \{ planFormDelivery \} from '\.\.\/_shared\/forms\/delivery-plan\.ts'/);
    const start = edge.indexOf("if (skillName === 'test_form_delivery')");
    expect(start).toBeGreaterThan(0);
    const body = edge.slice(start, edge.indexOf("if (skillName === 'manage_form')", start));
    expect(body).toMatch(/planFormDelivery\(/);
    // dry_run never stores or creates: no insert into form_submissions, no lead RPC.
    expect(body).not.toMatch(/from\('form_submissions'\)\s*\.insert|\.rpc\('ingest_form_lead'/);
    // the email rail is judged by email-send's own dry run, not a second provider resolver
    expect(body).toMatch(/dry_run: true/);
    expect(body).not.toMatch(/RESEND_API_KEY|SMTP_HOST/);
  });

  it('email-send answers a dry run before anything is sent or logged', () => {
    const src = read('supabase/functions/email-send/index.ts');
    const dry = src.indexOf('if (body.dry_run === true)');
    const simulate = src.indexOf('// SIMULATE MODE');
    const sendStart = src.indexOf('const activeCfg =');
    expect(dry).toBeGreaterThan(0);
    expect(dry).toBeLessThan(simulate);
    expect(simulate).toBeLessThan(sendStart);
    expect(src.slice(dry, simulate)).not.toMatch(/logComm\(/);
  });
});

describe('lead fields speak the site\'s language', () => {
  it('maps Swedish and English labels alike', () => {
    const map = mapLeadFields([
      { id: 'a', type: 'text', label: 'Namn' },
      { id: 'b', type: 'email', label: 'E-post' },
      { id: 'c', type: 'text', label: 'Verksamhet' },
      { id: 'd', type: 'phone', label: 'Telefon' },
    ]);
    expect(map.email?.id).toBe('b');
    expect(map.name?.id).toBe('a');
    expect(map.company?.id).toBe('c');
    expect(map.phone?.id).toBe('d');
    expect(mapLeadFields([{ id: 'x', type: 'text', label: 'Message' }]).email).toBeUndefined();
    expect(mapLeadFields(undefined)).toEqual({ email: undefined, name: undefined, company: undefined, phone: undefined });
  });
});

describe('the plan names every rail and says why it is off', () => {
  it('a contact form with a notify address and no email field', () => {
    const plan = planFormDelivery({
      title: 'Kontakta oss',
      notifyEmail: ' hello@example.com ',
      fields: [{ id: '1', type: 'text', label: 'Namn' }, { id: '2', type: 'textarea', label: 'Meddelande' }],
    });
    const by = Object.fromEntries(plan.map((s) => [s.rail, s]));
    expect(Object.keys(by).sort()).toEqual(['job_application', 'lead', 'notification_email', 'storage', 'webhook']);
    expect(by.storage.active).toBe(true);
    expect(by.lead.active).toBe(false);
    expect(by.lead.detail).toMatch(/no field of type "email"/);
    expect(by.notification_email.active).toBe(true);
    expect(by.notification_email.facts?.to).toBe('hello@example.com');
    expect(by.webhook.facts?.event).toBe('form.submitted');
    expect(by.job_application.active).toBe(false);
  });

  it('a job application without a file field is flagged, not silently accepted', () => {
    const plan = planFormDelivery({ jobPostingId: 'job-1', fields: [{ id: '1', type: 'email', label: 'Email' }] });
    const job = plan.find((s) => s.rail === 'job_application')!;
    expect(job.active).toBe(true);
    expect(job.detail).toMatch(/no file field/);
    const lead = plan.find((s) => s.rail === 'lead')!;
    expect(lead.active).toBe(true);
    expect(lead.detail).toMatch(/no name field/);
  });
});

describe('the skill is declared where operators look', () => {
  it('forms-module seeds test_form_delivery with its modes', () => {
    const mod = read('src/lib/modules/forms-module.ts');
    expect(mod).toMatch(/name: 'test_form_delivery'/);
    expect(mod).toMatch(/enum: \['dry_run', 'send_test'\]/);
  });
});
