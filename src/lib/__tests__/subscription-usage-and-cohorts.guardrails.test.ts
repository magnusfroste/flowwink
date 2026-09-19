import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-19, subscriptions: usage-based billing and cohort
 * retention. The rules that must survive the next rewrite of these functions.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  const end = migrations.indexOf('$function$;', start);
  return migrations.slice(start, end);
}

describe('usage is billed once, at the price on the meter', () => {
  const invoice = () => latestFunctionBody('generate_subscription_invoice');

  it('the invoice counts and stamps usage under the subscription lock, with one predicate', () => {
    const b = invoice();
    expect(b).toMatch(/WHERE id = _subscription_id FOR UPDATE/);
    const predicate = /r\.invoice_id IS NULL AND r\.occurred_at <= _usage_cutoff/g;
    expect(b.match(predicate)?.length, 'the same predicate selects what is counted and what is stamped').toBe(2);
    expect(b).toMatch(/GREATEST\(_m\.qty - _m\.included_quantity, 0\)/);
    expect(b).toMatch(/_subtotal := _gross - _applied::integer \+ _usage_total::integer/);
    expect(b).toMatch(/'usage_cents', _usage_total/);
  });

  it('it still carries what #550 put there: the downgrade credit and the not-due refusal', () => {
    const b = invoice();
    expect(b).toMatch(/pending_credit_cents/);
    expect(b).toMatch(/is not due: next invoice date is/);
  });

  it('the table refuses usage without an active meter and edits to billed usage', () => {
    const b = latestFunctionBody('subscription_usage_record_rules');
    expect(b).toMatch(/has no active meter/);
    expect(b).toMatch(/it is final/);
    expect(migrations).toMatch(/CREATE TRIGGER subscription_usage_record_rules\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.subscription_usage_records/);
    expect(migrations).toMatch(/subscription_id uuid NOT NULL REFERENCES public\.subscriptions\(id\) ON DELETE CASCADE,\s+metric text NOT NULL,\s+quantity numeric NOT NULL/);
  });

  it('a report that arrives twice is one record', () => {
    expect(migrations).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS subscription_usage_records_idempotency\s+ON public\.subscription_usage_records \(subscription_id, idempotency_key\)/);
    expect(latestFunctionBody('record_subscription_usage')).toMatch(/WHEN unique_violation THEN/);
  });

  it('both tables follow the role matrix and are closed to anonymous visitors', () => {
    for (const table of ['subscription_usage_meters', 'subscription_usage_records']) {
      expect(migrations).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    }
    expect(migrations).toMatch(/REVOKE ALL ON public\.subscription_usage_meters, public\.subscription_usage_records FROM anon/);
  });
});

describe('cohorts', () => {
  it('a month that has not happened is absent from the answer', () => {
    const b = latestFunctionBody('subscription_cohort_retention');
    expect(b).toMatch(/<= v_this_month\)/);
    expect(b).toMatch(/can_access_module\(auth\.uid\(\), 'subscriptions'\)/);
  });
});

describe('both surfaces exist', () => {
  it('the skills are seeded with the parameter names the functions take', () => {
    type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['manage_usage_meter', 'record_subscription_usage', 'subscription_usage_summary', 'subscription_cohort_retention']) {
      const skill = skills.find((s) => s.name === name);
      expect(skill, `${name} is seeded`).toBeTruthy();
      expect(skill!.handler).toBe(`rpc:${name}`);
      const head = migrations.slice(migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      const signature = head.slice(0, head.indexOf('RETURNS'));
      for (const param of Object.keys(skill!.tool_definition.function.parameters.properties)) {
        expect(signature, `${name} takes ${param}`).toContain(param);
      }
    }
  });

  it('the admin page mounts the usage dialog and the cohort card', () => {
    const page = read('src/pages/admin/SubscriptionsPage.tsx');
    expect(page).toMatch(/<UsageDialog /);
    expect(page).toMatch(/<CohortRetentionCard \/>/);
  });
});
