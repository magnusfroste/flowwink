import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountingModule } from '@/lib/modules/accounting-module';
import { ADMIN_ONLY_RPCS } from '@/lib/admin-only-rpcs';

/**
 * Two Accounted borrowings (2026-10-27):
 *   - month_close_checklist — the checklist a month is closed against, read by
 *     the Month close tab and by an agent alike; the close itself stays an
 *     admin act.
 *   - the read-only API key — reads run, writes with dry_run are forced into
 *     it, every other write is refused with READ_ONLY_KEY, before agent-execute.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261027090000_manadsstangningen-har-en-checklista.sql');
const mcp = read('supabase/functions/mcp-server/index.ts');

describe('month_close_checklist — one checklist for the tab and the agent', () => {
  it('is read-only, follows the module matrix and declares its audience', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.month_close_checklist(p_year integer, p_month integer)');
    expect(migration).toMatch(/LANGUAGE plpgsql STABLE SECURITY DEFINER/);
    expect(migration).toMatch(/can_access_module\(auth\.uid\(\), 'accounting'\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.month_close_checklist\(integer, integer\) TO authenticated, service_role/);
  });

  it('checks what the close would refuse on and what is still outside the books, in order', () => {
    for (const id of ['previous_month_closed', 'bank_events_booked', 'invoices_booked', 'no_drafts', 'approvals_settled',
      'expense_reports_booked', 'vendor_invoices_processed', 'exchange_rates_known', 'voucher_series_unbroken', 'balanced', 'vat_return_due']) {
      expect(migration).toContain(`'id', '${id}'`);
    }
    // The month lives on the fiscal calendar, not the calendar year.
    expect(migration).toContain('v_start := public.fiscal_period_start(p_year, p_month);');
    // `next` is the exact close call, and after a close the reopen — never a guess.
    expect(migration).toMatch(/'next', CASE WHEN v_status = 'open'\s*THEN jsonb_build_object\('skill', 'close_accounting_period'/);
    expect(migration).toContain("RAISE EXCEPTION '__month_close_proof_ok__'");
  });

  it('the skill says run it first, and the close points back at it', () => {
    const seeds = (accountingModule.agent?.skillSeeds ?? accountingModule.skillSeeds ?? []) as unknown as Array<{ name: string; description: string; instructions?: string; handler: string; tool_definition: { risk?: string; function: { parameters: { properties: Record<string, unknown>; required?: string[] } } } }>;
    const s = seeds.find((x) => x.name === 'month_close_checklist')!;
    expect(s).toBeDefined();
    expect(s.handler).toBe('rpc:month_close_checklist');
    expect(s.tool_definition.risk).toBe('low');
    expect(s.tool_definition.function.parameters.required).toEqual(['p_year', 'p_month']);
    expect(s.instructions).toMatch(/Months close in order/);
    expect(s.instructions).toMatch(/never by reopening/);
    const close = seeds.find((x) => x.name === 'close_accounting_period')!;
    expect(close.description).toContain('month_close_checklist says ready');
  });

  it('the Month close tab is the close UI; closing stays an admin act on the allowlist', () => {
    const page = read('src/pages/admin/AccountingPage.tsx');
    expect(page).toContain("{ id: 'close', label: 'Month close' }");
    expect(page).toContain('<TabsContent value="close"><MonthCloseTab');
    const tab = read('src/components/admin/accounting/MonthCloseTab.tsx');
    expect(tab).toContain("supabase.rpc('month_close_checklist'");
    expect(tab).toContain("supabase.rpc('close_accounting_period'");
    expect(tab).toContain("supabase.rpc('reopen_accounting_period'");
    expect(tab).toContain('disabled={!list.ready || close.isPending}');
    expect(ADMIN_ONLY_RPCS.close_accounting_period).toBeTruthy();
    expect(ADMIN_ONLY_RPCS.reopen_accounting_period).toBeTruthy();
    // The dashboard leads here.
    expect(read('src/components/admin/accounting/dashboard/PeriodStatusCard.tsx')).toContain("onClick={() => onNavigate?.('close')}");
    expect(read('src/components/admin/accounting/dashboard/BooksAttentionCard.tsx')).toContain("if (f.id === 'periods_left_open') { onNavigate?.('close'); return; }");
  });
});

describe('the read-only API key', () => {
  it('is a mode on the key (the read_only scope), never a grant', () => {
    expect(mcp).toContain('const READ_ONLY_SCOPE = "read_only";');
    expect(mcp).toMatch(/const grants = \(scopes \?\? \[\]\)\.filter\(\(s\) => s !== READ_ONLY_SCOPE\);/);
    expect(mcp).toMatch(/readOnly\?: boolean \}>\(\);/);
    expect(mcp).toMatch(/const readOnly = isReadOnlyKey\(c\.get\("apiKeyScopes" as never\) as string\[\] \| undefined\);/);
  });

  it('is enforced in executeSkill — every transport, before agent-execute — with the same annotations tools/list shows', () => {
    const fn = mcp.slice(mcp.indexOf('async function executeSkill('), mcp.indexOf('// ---------- lock helpers ----------'));
    expect(fn).toContain('if (requestContext.getStore()?.readOnly) {');
    expect(fn).toContain('buildToolAnnotations(row as SkillRow)');
    expect(fn).toContain('if (!annotations.readOnlyHint) {');
    expect(fn).toContain('args = { ...args, dry_run: true };');
    expect(fn).toContain('code: "READ_ONLY_KEY"');
    expect(fn).toContain('retryable: false');
    // A forced dry run says so in the answer.
    expect(fn).toContain('read_only_key: true, forced_dry_run: true');
    // The refusal happens before the fetch to agent-execute.
    expect(fn.indexOf('code: "READ_ONLY_KEY"')).toBeLessThan(fn.indexOf('const res = await fetch(url'));
  });

  it('is one checkbox at creation and a badge in the list', () => {
    const page = read('src/pages/admin/ApiKeysPage.tsx');
    expect(page).toContain("scopes: readOnly ? ['read_only'] : undefined");
    expect(page).toContain('id="key-read-only"');
    expect(page).toContain("key.scopes?.includes('read_only')");
  });
});
