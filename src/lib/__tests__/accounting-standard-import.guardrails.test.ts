import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The rink, not the players.
 *
 * Setting up a country's accounting was a developer task — and the developer
 * never actually did it: our own "BAS 2024" chart was written from memory, with
 * 166 wrong names and 40 invented accounts, because nothing forced a source.
 * These two skills move the job to the agent and keep the platform as the
 * container + the gate:
 *
 *   import_accounting_standard   agent parses the official file, platform
 *                                validates + stores + wires roles. No
 *                                provenance, no import.
 *   propose_posting_templates    templates are published nowhere — they are
 *                                what a company actually books, mined from its
 *                                history. The agent authors; the structural
 *                                gate verifies.
 */

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260809170000_accounting-standard-import.sql'), 'utf-8');
const module_ = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/accounting-module.ts'), 'utf-8');

const importSeed = module_.slice(
  module_.indexOf("name: 'import_accounting_standard'"),
  module_.indexOf("name: 'propose_posting_templates'"));
const proposeSeed = module_.slice(
  module_.indexOf("name: 'propose_posting_templates'"),
  module_.indexOf("name: 'manage_opening_balances'"));

describe('import fails closed on provenance — the whole lesson of the hand-written chart', () => {
  it('refuses without a publisher URL and a sha256 of the parsed file', () => {
    expect(migration).toMatch(/source_url is required and must be the http\(s\) address of the OFFICIAL standard file/);
    expect(migration).toMatch(/\^?\[0-9a-f\]\{64\}/);
    expect(migration).toMatch(/hand-written "BAS 2024" shipped 166 wrong names/);
  });

  it('refuses implausibly small charts — a short parse is a failure, not a chart', () => {
    expect(migration).toMatch(/jsonb_array_length\(p_accounts\) < 40/);
  });

  it('nothing is written on refusal', () => {
    // Errors are collected and returned before any UPDATE/INSERT runs.
    const validationEnd = migration.indexOf("RETURN jsonb_build_object('imported', false");
    const firstWrite = migration.indexOf('UPDATE public.chart_of_accounts');
    expect(validationEnd).toBeGreaterThan(-1);
    expect(validationEnd).toBeLessThan(firstWrite);
  });

  it('demands verbatim names and says why', () => {
    expect(migration).toMatch(/take it VERBATIM from the official file, never paraphrase/);
  });
});

describe('roles make the locale live, so they are required', () => {
  it('the six load-bearing roles are mandatory', () => {
    for (const role of ['bank', 'accounts_receivable', 'accounts_payable', 'sales_revenue', 'vat_output', 'vat_input']) {
      expect(migration).toContain(`'${role}'`);
    }
    expect(migration).toMatch(/roles\.%s is required — the engine cannot post an invoice without it/);
  });

  it('unknown roles are refused against the live vocabulary, not a second list', () => {
    expect(migration).toMatch(/SELECT array_agg\(DISTINCT role\) INTO v_known_roles FROM public\.account_roles/);
  });

  it('a role may only point at an account that was actually delivered', () => {
    expect(migration).toMatch(/that code is not in the accounts you delivered/);
  });
});

describe('an existing locale is protected', () => {
  it('touching it requires replace=true, and delete never happens', () => {
    expect(migration).toMatch(/Pass replace=true to update it/);
    expect(migration).toMatch(/none deleted — posted-to accounts always survive/);
    expect(migration).not.toMatch(/DELETE FROM public\.chart_of_accounts/);
  });
});

describe('provenance is stored, not just checked', () => {
  it('writes source, sha256 and import time where the next reader finds them', () => {
    expect(migration).toMatch(/'accounting_standard_sources'/);
    expect(migration).toMatch(/'sha256', p_source_sha256/);
  });
});

describe('propose_posting_templates is a structural gate, not a pass-through', () => {
  it('refuses when the locale has no chart — there is nothing to verify against', () => {
    expect(migration).toMatch(/has no chart of accounts\. Run import_accounting_standard first/);
  });

  it('every template must balance, with both sides present', () => {
    expect(migration).toMatch(/abs\(v_debit - v_credit\) > 0\.01/);
    expect(migration).toMatch(/at least one debit line and one credit line/);
  });

  it('an account not in the chart rejects the template', () => {
    expect(migration).toMatch(/does not exist in the %s chart/);
  });

  it('names come FROM the chart, and corrections are reported — the anti-drift rule', () => {
    expect(migration).toMatch(/'account_name', v_chart_name/);
    expect(migration).toMatch(/name_corrections/);
    expect(migration).toMatch(/the exact mechanism that let\s+-- four VAT templates keep a wrong account for months/);
  });

  it('rejected templates are NOT stored, and the caller is told so', () => {
    expect(migration).toMatch(/Rejected templates were NOT stored/);
  });

  it('proposed templates are operator-owned, not system', () => {
    expect(migration).toMatch(/is_system=false: agent-proposed templates belong to the operator/);
  });
});

describe('both run through the gateway', () => {
  it('service-role escape on both — auth.uid() is NULL under the MCP gateway', () => {
    const escapes = migration.match(/auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'\)/g) ?? [];
    expect(escapes.length).toBe(2);
  });

  it('grants cover authenticated and service_role', () => {
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.import_accounting_standard[\s\S]*TO authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.propose_posting_templates[\s\S]*TO authenticated, service_role/);
  });
});

describe('the seeds teach what the platform cannot know', () => {
  it('import: rpc handler with params matching the function, so the self-correcting hint stays accurate', () => {
    expect(importSeed).toMatch(/handler: 'rpc:import_accounting_standard'/);
    for (const p of ['locale', 'label', 'source_url', 'source_sha256', 'accounts', 'roles', 'replace']) {
      expect(importSeed).toContain(`${p}: {`);
    }
  });

  it('import description carries the fail-closed rule at the CHOICE tier', () => {
    expect(importSeed).toMatch(/FAIL CLOSED on provenance/);
    expect(importSeed).toMatch(/VERBATIM/);
    expect(importSeed).toMatch(/Use when:/);
    expect(importSeed).toMatch(/NOT for:/);
  });

  it('import points the SIE-legacy case AWAY — that is a mapping problem, not a standard', () => {
    expect(importSeed).toMatch(/legacy chart from SIE — that is a mapping problem, not a standard/);
  });

  it('propose carries the history insight: mine the company\'s transactions', () => {
    // The reason the agent authors these at all: the platform cannot foresee
    // what a specific company books, but an agent holding last year's
    // transactions can.
    expect(proposeSeed).toMatch(/derive the templates from it/);
    expect(proposeSeed).toMatch(/transaction history/);
    expect(proposeSeed).toMatch(/cover ~90% of\ntransaction volume/);
  });

  it('propose forbids reporting done while rejections stand', () => {
    expect(proposeSeed).toMatch(/Do not report the batch as\ndone while rejected is non-empty/);
  });

  it('the two skills chain: import tells the agent to follow with propose', () => {
    expect(migration).toMatch(/Next: propose_posting_templates/);
  });

  it('manage_accounting_template points batch authoring here — one verb per job', () => {
    const single = module_.slice(
      module_.indexOf("name: 'manage_accounting_template'"),
      module_.indexOf("name: 'import_accounting_standard'"));
    expect(single).toMatch(/use propose_posting_templates/);
  });
});
