import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifySkillModule } from '../../../supabase/functions/_shared/mcp/groups';
import { accountingModule } from '@/lib/modules/accounting-module';

/**
 * The books health check (20261026130000): one read-only answer to "what
 * needs attention in the books?" — check_books — fed by a statutory calendar
 * that only speaks for a country someone wrote rules for, and the same list
 * on the Overview card and in the daily briefing.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261026130000_bokforingens-halsokontroll.sql');

describe('check_books — one prioritised fix list for the books', () => {
  it('the three readers exist, are read-only and declare their audience', () => {
    for (const fn of ['statutory_deadlines(p_from date', 'check_books(p_as_of date', 'agent_context()']) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.check_books\(date\) TO authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.statutory_deadlines\(date, integer\) TO authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.agent_context\(\) TO authenticated, service_role/);
    // The frontend calls check_books directly: the matrix guard wants the module door, not a role list.
    expect((migration.match(/can_access_module\(auth\.uid\(\), 'accounting'\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Read-only: STABLE, and nothing in the bodies writes.
    expect(migration).not.toMatch(/\n\s*(INSERT INTO|UPDATE|DELETE FROM) public\.(?!site_settings|payroll_runs)/);
  });

  it('the calendar never claims a return is overdue — it has no filing record to know', () => {
    expect(migration).toMatch(/'status', CASE WHEN .* <= 7 THEN 'due_soon' ELSE 'upcoming' END/);
    expect(migration).not.toMatch(/'status', '?overdue/);
  });

  it('a country without rules answers an empty list with a note, never invented dates', () => {
    expect(migration).toMatch(/IF v_country IS DISTINCT FROM 'SE' THEN/);
    expect(migration).toMatch(/No statutory calendar is written for/);
    expect(migration).toMatch(/No country set in Site settings/);
  });

  it('income tax and annual report dates need a DECLARED legal form', () => {
    expect(migration).toMatch(/IF v_legal IN \('limited_company', 'sole_trader'\) THEN/);
    expect(migration).toMatch(/Legal form not set in Accounting → Settings/);
  });

  it('every finding names the skill that fixes it and the tab that shows it', () => {
    const findings = migration.match(/'id', '[a-z_]+',\s*'severity'/g) ?? [];
    expect(findings.length).toBeGreaterThanOrEqual(10);
    const fixes = migration.match(/'fix', jsonb_build_object\('skill', '[a-z_]+'/g) ?? [];
    expect(fixes.length).toBeGreaterThanOrEqual(10);
    for (const skill of ['run_bookkeeping_sweep', 'book_unbooked_invoices', 'post_journal_entry', 'explain_voucher_gap',
      'send_dunning_reminders', 'pay_vendor_invoice', 'approve_pending_operation', 'close_accounting_period',
      'fetch_ecb_rates', 'book_expense_report', 'cron_health_report', 'prepare_vat_return']) {
      expect(migration).toContain(`'skill', '${skill}'`);
    }
  });

  it('the proof covers the agency rules and rolls back', () => {
    expect(migration).toContain("'vat_return:2026-09-30@2026-11-12'");
    expect(migration).toContain("'income_tax_return:2026-06-30@2026-12-15'");
    expect(migration).toContain("'annual_report:2026-06-30@2027-02-01'");
    expect(migration).toContain("'vat_return:2026-11-30@2027-01-18'"); // 17th in January, weekend → Monday
    expect(migration).toContain("RAISE EXCEPTION '__books_proof_ok__'");
  });
});

describe('check_books and statutory_deadlines are skills of the accounting module', () => {
  type Seed = { name: string; handler: string; trust_level?: string; description: string; instructions?: string; tool_definition: { risk?: string; function: { parameters: { properties: Record<string, unknown> } } } };
  const seeds = (accountingModule.agent?.skillSeeds ?? accountingModule.skillSeeds ?? []) as unknown as Seed[];
  const byName = new Map(seeds.map((s) => [s.name, s]));

  it.each(['check_books', 'statutory_deadlines'])('%s is a read-only RPC skill with Use when / NOT for', (name) => {
    const s = byName.get(name);
    expect(s).toBeDefined();
    expect(s!.handler).toBe(`rpc:${name}`);
    expect(s!.trust_level).toBe('auto');
    expect(s!.description).toMatch(/Use when:/);
    expect(s!.description).toMatch(/NOT for:/);
    expect(s!.tool_definition.risk).toBe('low');
    expect(typeof s!.instructions).toBe('string');
  });

  it('the parameter names match the function signatures (the self-correcting hint depends on it)', () => {
    expect(Object.keys(byName.get('check_books')!.tool_definition.function.parameters.properties)).toEqual(['p_as_of']);
    expect(Object.keys(byName.get('statutory_deadlines')!.tool_definition.function.parameters.properties)).toEqual(['p_from', 'p_days']);
  });

  it('the MCP ?groups=accounting filter sees them', () => {
    expect(classifySkillModule('check_books', 'rpc:check_books')).toBe('accounting');
    expect(classifySkillModule('statutory_deadlines', 'rpc:statutory_deadlines')).toBe('accounting');
    expect(classifySkillModule('year_end_readiness', 'rpc:year_end_readiness')).toBe('accounting');
    expect(classifySkillModule('list_voucher_gaps', 'rpc:list_voucher_gaps')).toBe('accounting');
  });
});

describe('the same list reaches people', () => {
  it('the Overview shows it first, and the card opens the tab or module that fixes a finding', () => {
    const overview = read('src/components/admin/accounting/dashboard/OverviewTab.tsx');
    expect(overview).toMatch(/<BooksAttentionCard onNavigate=\{onNavigate\} \/>\s*<EventsToBookCard/);
    const card = read('src/components/admin/accounting/dashboard/BooksAttentionCard.tsx');
    expect(card).toContain("supabase.rpc('check_books'");
    for (const route of ['/admin/invoices', '/admin/purchasing', '/admin/expenses', '/admin/approvals']) expect(card).toContain(route);
  });

  it('the daily briefing carries a Books section and a high-priority action item', () => {
    const briefing = read('supabase/functions/flowpilot-lifecycle/briefing.ts');
    expect(briefing).toContain('supabase.rpc("check_books")');
    expect(briefing).toContain('title: "📒 Books"');
    expect(briefing).toMatch(/booksHigh\.length > 0/);
    expect(briefing).toContain('books_findings: booksFindings.length');
    // Non-fatal: a briefing without the section beats no briefing.
    expect(briefing).toMatch(/\[briefing\] books section skipped \(non-fatal\)/);
  });

  it('the VAT period and legal form are declared in Accounting → Settings, with honest defaults', () => {
    const hooks = read('src/hooks/useSiteSettings.tsx');
    expect(hooks).toMatch(/vatReturnPeriod: 'monthly' \| 'quarterly' \| 'yearly';/);
    expect(hooks).toMatch(/legalForm: '' \| 'limited_company' \| 'sole_trader' \| 'partnership' \| 'other';/);
    expect(hooks).toMatch(/vatReturnPeriod: 'quarterly',\s*legalForm: '',/);
    const settings = read('src/components/admin/accounting/SettingsTab.tsx');
    expect(settings).toContain("patch({ vatReturnPeriod:");
    expect(settings).toContain('<SelectItem value="unset">Not set</SelectItem>');
    // The VAT declaration tab opens on the declared period.
    const vat = read('src/components/admin/accounting/MomsdeklarationTab.tsx');
    expect(vat).toMatch(/prefs\?\.vatReturnPeriod === 'quarterly'\) setMode\('quarter'\)/);
  });
});
