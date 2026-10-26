import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyAgentError, stampAgentError } from '../../../supabase/functions/_shared/agent-errors';
import { accountingModule } from '@/lib/modules/accounting-module';
import { reconciliationModule } from '@/lib/modules/reconciliation-module';
import { invoicingModule } from '@/lib/modules/invoicing-module';
import { multiCurrencyModule } from '@/lib/modules/multi-currency-module';
import { fixedAssetsModule } from '@/lib/modules/fixed-assets-module';

/**
 * The agent envelope — what every skill answer carries beside its payload:
 *   - a failure has a stable `code`, `retryable` and a `hint` (H7, generalised)
 *   - a finance answer starts with `context` (today, currency, fiscal year,
 *     today's period status, what waits for approval)
 *   - a write declares `risk` / `reversible` / `reversal`, read by the MCP
 *     annotations and the staged envelope — and stripped before a provider
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('failures carry a code an agent can branch on', () => {
  it('a closed period is a rule of the books, never retried', () => {
    const c = classifyAgentError('RPC manage_journal_entry failed: Cannot modify journal entry: period 2026-7 is closed');
    expect(c.code).toBe('PERIOD_LOCKED');
    expect(c.retryable).toBe(false);
    expect(c.hint).toMatch(/reopen_accounting_period/);
    expect(classifyAgentError('Period 2026-7 is locked and cannot be closed again').code).toBe('PERIOD_LOCKED');
  });

  it('a missing exchange rate is a missing fact: supply it, then retry', () => {
    const c = classifyAgentError("No exchange rate EUR → SEK on or before 2026-10-20 — run fetch_ecb_rates, or set_exchange_rate(");
    expect(c.code).toBe('MISSING_EXCHANGE_RATE');
    expect(c.retryable).toBe(true);
    expect(c.hint).toMatch(/fetch_ecb_rates/);
  });

  it('the two PGRST202 causes keep their opposite advice', () => {
    expect(classifyAgentError('RPC x failed: Could not find the function — missing required parameter: [p_date].').code).toBe('MISSING_REQUIRED_PARAMETER');
    expect(classifyAgentError("RPC x failed: Could not find the function public.x in the schema cache — the parameter names likely don't match the function signature.").code).toBe('UNKNOWN_PARAMETERS');
  });

  it('permissions, duplicates, lookups and the platform are told apart', () => {
    expect(classifyAgentError('Only admins can close accounting periods')).toMatchObject({ code: 'FORBIDDEN', retryable: false });
    expect(classifyAgentError('duplicate key value violates unique constraint "x"')).toMatchObject({ code: 'ALREADY_EXISTS', retryable: false });
    expect(classifyAgentError('Vendor invoice 123 not found')).toMatchObject({ code: 'NOT_FOUND', retryable: false });
    expect(classifyAgentError('canceling statement due to statement timeout')).toMatchObject({ code: 'TRANSIENT', retryable: true });
    expect(classifyAgentError('new row violates check constraint "invoices_total_check"')).toMatchObject({ code: 'INVALID_INPUT', retryable: true });
    expect(classifyAgentError('something nobody wrote a rule for')).toEqual({ code: 'HANDLER_ERROR', retryable: false });
  });

  it('a handler that set its own code or hint is not overruled', () => {
    const out = stampAgentError<Record<string, unknown>>({ error: 'Vendor invoice 123 not found', code: 'VENDOR_INVOICE_MISSING', hint: 'list_vendor_invoices first' });
    expect(out.code).toBe('VENDOR_INVOICE_MISSING');
    expect(out.hint).toBe('list_vendor_invoices first');
    expect(out.retryable).toBe(false);
    expect(stampAgentError({ success: true, id: 1 })).toEqual({ success: true, id: 1 });
  });

  it('agent-execute stamps every failure and prepends context to finance answers', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toContain("import { stampAgentError } from '../_shared/agent-errors.ts';");
    expect(src).toMatch(/result = stampAgentError\(result as Record<string, unknown>\);/);
    expect(src).toMatch(/FINANCE_MODULES = new Set<string>\(\['accounting', 'invoicing', 'purchasing', 'expenses'\]\)/);
    expect(src).toMatch(/supabase\.rpc\('agent_context'\)/);
    expect(src).toMatch(/result = \{ context: ctx, \.\.\.\(result as Record<string, unknown>\) \}/);
    // Declared risk outranks the name list in the staged envelope.
    expect(src).toMatch(/const declaredRisk = \(skill as \{ tool_definition\?: \{ risk\?: unknown \} \}\)\?\.tool_definition\?\.risk;/);
  });
});

describe('writes declare how much they can hurt', () => {
  type Seed = { name: string; tool_definition: { risk?: string; reversible?: boolean; reversal?: string } };
  type ModuleLike = { agent?: { skillSeeds?: unknown[] }; skillSeeds?: unknown[] };
  const seedsOf = (m: ModuleLike) => (m.agent?.skillSeeds ?? m.skillSeeds ?? []) as Seed[];
  const finance = [accountingModule, reconciliationModule, invoicingModule, multiCurrencyModule, fixedAssetsModule].flatMap(seedsOf);

  it('every accounting, reconciliation, invoicing, multi-currency and fixed-asset skill declares a risk', () => {
    const undeclared = finance.filter((s) => !['low', 'medium', 'high'].includes(s.tool_definition?.risk)).map((s) => s.name);
    expect(undeclared).toEqual([]);
  });

  it('a medium or high write says whether a counter-action exists, and names it when it does', () => {
    for (const s of finance.filter((x) => x.tool_definition?.risk !== 'low')) {
      expect(typeof s.tool_definition.reversible, `${s.name} must declare reversible`).toBe('boolean');
      if (s.tool_definition.reversible) {
        expect(typeof s.tool_definition.reversal, `${s.name} must name its reversal`).toBe('string');
      } else {
        expect(s.tool_definition.reversal).toBeUndefined();
      }
    }
  });

  it('money leaving, a locked period and a seeded chart are high; a sent reminder is not reversible', () => {
    const byName = new Map(finance.map((s) => [s.name, s.tool_definition]));
    expect(byName.get('close_accounting_period')).toMatchObject({ risk: 'high', reversible: true, reversal: expect.stringContaining('reopen_accounting_period') });
    expect(byName.get('import_accounting_standard')).toMatchObject({ risk: 'high', reversible: false });
    expect(byName.get('send_dunning_reminders')).toMatchObject({ risk: 'medium', reversible: false });
    expect(byName.get('manage_journal_entry')).toMatchObject({ risk: 'medium', reversible: true, reversal: expect.stringContaining('action=void') });
    expect(byName.get('accounting_reports')).toMatchObject({ risk: 'low' });
  });

  it('the MCP gateway turns the declaration into annotations, and the REST catalog carries it', () => {
    const mcp = read('supabase/functions/mcp-server/index.ts');
    expect(mcp).toMatch(/const declaredRisk = td\.risk === "low" \|\| td\.risk === "medium" \|\| td\.risk === "high" \? td\.risk : null;/);
    expect(mcp).toMatch(/declaredRisk === "high" \|\|\s*declaredReversible === false \|\|/);
    expect(mcp).toMatch(/\.\.\.\(declaredRisk \? \{ risk: declaredRisk \} : \{\}\)/);
    expect(mcp).toMatch(/\.\.\.\(d\.risk \? \{ risk: d\.risk \} : \{\}\)/);
  });

  it('the provider boundary sends only type and function — a provider that validates its schema rejects the rest', () => {
    const reason = read('supabase/functions/_shared/pilot/reason.ts');
    expect(reason).toMatch(/return providerToolDefinition\(td\);/);
    expect(reason).toMatch(/return providerToolDefinition\(compactToolDefinition\(td\)\);/);
    expect(reason).toMatch(/return \{ type: td\.type \|\| 'function', function: td\.function \};/);
  });
});
