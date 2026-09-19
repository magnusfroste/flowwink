import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The last package from the 2026-09-19 sweeps. Views: the payroll page selected
 * columns that do not exist, the followers widget embedded a relation with no
 * foreign key, and the carrier list called an RPC that was never created (each
 * failed on every load, found by the view sweep). Mail: an agent-sent quote
 * reached nobody, and invoice reminders were logged as `sent` while nothing was
 * sent and nothing read the table. And the duplicate-lead search compared every
 * pair of leads — nine seconds at 800 leads, a statement timeout beyond that.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const agentExecute = read('supabase/functions/agent-execute/index.ts');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

describe('the views ask for what exists', () => {
  it('payroll reads employees.name and employees.status', () => {
    const src = read('src/pages/admin/PayrollPage.tsx');
    expect(src).toMatch(/\.select\('id, name, monthly_salary_cents, tax_rate_pct, status'\)/);
    expect(src).not.toMatch(/\.select\('[^']*\bfull_name\b[^']*'\)[\s\S]{0,40}\.order\('full_name'\)/);
  });
  it('followers are read without an embed that needs a foreign key', () => {
    const src = read('src/components/admin/EntityFollowers.tsx');
    expect(src).not.toMatch(/profile:profiles\(/);
    expect(src).toMatch(/from\('profiles'\)\.select\('id, full_name, email'\)\.in\('id', userIds\)/);
  });
  it('the carrier list reads the table — manage_carrier is a skill, not a function', () => {
    const src = read('src/hooks/useShippingRates.ts');
    expect(src).not.toMatch(/rpc\('manage_carrier'/);
    expect(src).toMatch(/\.from\('carriers' as never\)/);
  });
});

describe('what is reported as sent was handed to the mail rail', () => {
  it('an agent-sent quote goes through comms-send and says whether the mail went', () => {
    const i = agentExecute.indexOf('// "Send" means the customer gets the quote.');
    expect(i).toBeGreaterThan(-1);
    const b = agentExecute.slice(i, i + 3200);
    expect(b).toMatch(/kind: 'quote_email'/);
    expect(b).toMatch(/email_sent: emailSent/);
    expect(agentExecute).not.toMatch(/Email delivery is a separate concern/);
  });
  it('a reminder is recorded as pending, and only the mail rail makes it sent', () => {
    const m = read('supabase/migrations/20260919235000_paminnelsen-ar-skickad-nar-den-ar-skickad.sql');
    expect(m).toMatch(/''email'', ''pending''/);
    expect(m).toMatch(/anchor missing in send_dunning_reminders/);
    const i = agentExecute.indexOf('async function executeSendDunningReminders(');
    const b = agentExecute.slice(i, i + 4600);
    expect(b).toMatch(/\.eq\('status', 'pending'\)/);
    expect(b).toMatch(/kind: 'invoice_email'/);
    expect(b).toMatch(/status: sent \? 'sent' : 'failed'/);
  });
});

describe('the duplicate search answers in time', () => {
  it('candidates come through indexes, and the search can be scoped to one lead', () => {
    const start = migrations.lastIndexOf('CREATE OR REPLACE FUNCTION public.find_duplicate_leads(');
    const b = migrations.slice(start, migrations.indexOf('$function$;', start));
    expect(b).toMatch(/lower\(a\.name\) % lower\(b\.name\)/);
    expect(b).toMatch(/normalize_email\(a\.email\) = normalize_email\(b\.email\)/);
    expect(b).toMatch(/p_lead_id IS NULL OR a\.id = p_lead_id OR b\.id = p_lead_id/);
    expect(migrations).toMatch(/CREATE INDEX IF NOT EXISTS leads_name_trgm_idx/);
    expect(migrations).toMatch(/DROP FUNCTION IF EXISTS public\.find_duplicate_leads\(numeric, integer\);/);
  });
});
