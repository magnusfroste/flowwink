import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountingModule } from '@/lib/modules/accounting-module';

/**
 * The register of filed returns (20261027130000): the calendar can only say
 * "overdue" because the register says "filed". A filing is a fact a person
 * records (or an agent a person told) with the agency's reference; the
 * figures stay in the ledger.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261027130000_registret-over-inlamnade-deklarationer.sql');
type Seed = { name: string; description: string; instructions?: string; trust_level?: string; tool_definition: { risk?: string; reversible?: boolean; function: { parameters: { properties: Record<string, unknown> } } } };
const seeds = (accountingModule.agent?.skillSeeds ?? accountingModule.skillSeeds ?? []) as unknown as Seed[];

describe('the register', () => {
  it('records the fact of filing, once per kind and period, never in the future', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.statutory_filings \(/);
    expect(migration).toContain('UNIQUE (kind, period_to)');
    expect(migration).toContain("kind IN ('vat_return', 'employer_declaration', 'income_tax_return', 'annual_report', 'periodic_summary', 'other')");
    expect(migration).toMatch(/IF p_filed_at IS NOT NULL AND p_filed_at > public\.platform_today\(\) THEN/);
    expect(migration).toContain('ON CONFLICT (kind, period_to) DO UPDATE SET');
    // Who recorded it: a person through the UI, an agent through the gateway.
    expect(migration).toMatch(/v_source := CASE WHEN auth\.role\(\) = 'service_role' THEN 'agent' ELSE 'manual' END;/);
  });

  it('is read by accounting staff and written only through the RPC, which follows the module matrix', () => {
    expect(migration).toContain('ALTER TABLE public.statutory_filings ENABLE ROW LEVEL SECURITY;');
    expect(migration).toMatch(/CREATE POLICY statutory_filings_read ON public\.statutory_filings FOR SELECT TO authenticated\s+USING \(public\.can_access_module\(auth\.uid\(\), 'accounting'\)\)/);
    expect(migration).not.toMatch(/CREATE POLICY \S+ ON public\.statutory_filings FOR (INSERT|UPDATE|DELETE)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.manage_statutory_filing\(text, text, date, date, date, date, text, bigint, text, uuid, date, date\) TO authenticated, service_role/);
  });
});

describe('the calendar reads the register', () => {
  it('statutory_deadlines gains p_today and drops the old overload first', () => {
    const drop = migration.indexOf('DROP FUNCTION IF EXISTS public.statutory_deadlines(date, integer);');
    const create = migration.indexOf('CREATE OR REPLACE FUNCTION public.statutory_deadlines(p_from date DEFAULT public.platform_today(), p_days integer DEFAULT 90, p_today date DEFAULT public.platform_today())');
    expect(drop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(drop);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.statutory_deadlines\(date, integer, date\) TO authenticated, service_role/);
  });

  it('status is filed / overdue / due_soon / upcoming, judged against p_today, with the filing beside it', () => {
    expect(migration).toMatch(/'status', CASE WHEN f\.id IS NOT NULL THEN 'filed'\s+WHEN \(d ->> 'due_date'\)::date < p_today THEN 'overdue'\s+WHEN \(d ->> 'due_date'\)::date - p_today <= 7 THEN 'due_soon'\s+ELSE 'upcoming' END/);
    expect(migration).toContain("'filing_id', f.id, 'filed_at', f.filed_at, 'reference', f.reference, 'amount_cents', f.amount_cents");
    expect(migration).toMatch(/LEFT JOIN public\.statutory_filings f ON f\.kind = d ->> 'kind' AND f\.period_to = \(d ->> 'period_to'\)::date/);
  });

  it('check_books looks a year back, flags what was due and never recorded as high, and keeps filed returns quiet', () => {
    expect(migration).toContain('v_deadlines := public.statutory_deadlines(p_as_of - 400, 445, p_as_of);');
    expect(migration).toContain("'id', 'deadline_overdue:' || (d ->> 'id'),");
    expect(migration).toMatch(/WHERE x ->> 'status' = 'overdue' LOOP/);
    expect(migration).toMatch(/WHERE x ->> 'status' IN \('due_soon', 'upcoming'\) AND \(x ->> 'days_left'\)::int <= 14 LOOP/);
    expect(migration).toMatch(/'next_deadlines', COALESCE\(\(SELECT jsonb_agg\(x\) FROM \(SELECT x FROM jsonb_array_elements\(COALESCE\(v_deadlines -> 'deadlines', '\[\]'::jsonb\)\) x WHERE x ->> 'status' IN \('due_soon', 'upcoming'\) LIMIT 3\) s\), '\[\]'::jsonb\)/);
    // The overdue finding's fix is to record the filing, on the Filings tab.
    expect(migration).toContain("'fix', jsonb_build_object('skill', 'manage_statutory_filing', 'args', jsonb_build_object('p_action', 'record'");
    expect(migration).toContain("'tab', 'filings');");
  });

  it('the proof covers overdue, recorded, filed, upcoming, the future date and the undo', () => {
    for (const s of ["'proof: Q2 should be overdue with negative days_left, got %'", "'proof: check_books should flag the unrecorded Q2 return'",
      "'proof: a recorded filing should not be flagged'", "'proof: Q3 should be upcoming in 17 days, got %'", "'proof: a future filing date was accepted'",
      "'proof: after delete Q2 should be overdue again, got %'", "RAISE EXCEPTION '__filings_proof_ok__'"]) {
      expect(migration).toContain(s);
    }
  });
});

describe('the skills and the people', () => {
  it('manage_statutory_filing records only what a person said, and is reversible', () => {
    const s = seeds.find((x) => x.name === 'manage_statutory_filing')!;
    expect(s).toBeDefined();
    expect(s.trust_level).toBe('notify');
    expect(s.tool_definition).toMatchObject({ risk: 'medium', reversible: true });
    expect(s.instructions).toContain('a recorded filing silences the calendar, so a guess hides a late return');
    expect(Object.keys(s.tool_definition.function.parameters.properties)).toEqual(['p_action', 'p_kind', 'p_period_to', 'p_period_from', 'p_due_date', 'p_filed_at', 'p_reference', 'p_amount_cents', 'p_notes', 'p_filing_id', 'p_from', 'p_to']);
    const cal = seeds.find((x) => x.name === 'statutory_deadlines')!;
    expect(Object.keys(cal.tool_definition.function.parameters.properties)).toEqual(['p_from', 'p_days', 'p_today']);
    expect(cal.description).toContain('overdue (due before today and not recorded as filed)');
    expect(cal.description).not.toContain('Upcoming only');
    expect(cal.instructions).toContain('it may have been filed and never recorded; ask before concluding it is late');
  });

  it('the Filings tab is the register for people, and the VAT tab records the return where it was prepared', () => {
    const page = read('src/pages/admin/AccountingPage.tsx');
    expect(page).toContain("{ id: 'filings', label: 'Filings' }");
    expect(page).toContain('<TabsContent value="filings"><FilingsTab /></TabsContent>');
    const hook = read('src/hooks/useStatutoryFilings.ts');
    expect(hook).toContain("supabase.rpc('statutory_deadlines'");
    expect(hook).toContain("p_from: addDaysYmd(today, -400), p_days: 765, p_today: today,");
    const tab = read('src/components/admin/accounting/FilingsTab.tsx');
    expect(tab).toContain("p_action: 'record'");
    expect(tab).toContain("p_action: 'delete'");
    expect(tab).toContain('max={businessToday()}');
    const vat = read('src/components/admin/accounting/MomsdeklarationTab.tsx');
    expect(vat).toContain("p_action: 'record', p_kind: 'vat_return'");
    expect(vat).toContain('Mark as filed');
    // The refund direction is recorded as a negative amount.
    expect(vat).toMatch(/data\.direction === 'refund_from_skatteverket' \? -Math\.abs\(data\.net_to_pay_cents\) : Math\.abs\(data\.net_to_pay_cents\)/);
  });
});
