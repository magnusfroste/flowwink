/**
 * An agreement must know which quote it came from, and be able to name itself.
 *
 * Before this, `contracts` carried only `company_id`. The quote→contract
 * handoff copied VALUES and encoded the origin as prose —
 * `title: 'Avtal — ' || quote_number` — so nothing could query it, and none of
 * the per-deal figures on the quote could ever reach the contract body. And
 * every template asked for `[AVTALSNR]` while contracts had no number at all,
 * though quotes and invoices had drawn from the same counter for months.
 *
 * Proven live on optic: a contract created from a template came back
 * `AGR-2026-00002`, linked to `QUO-2026-00005`, with the number rendered inside
 * its own body — and the originating lead (`onsdag@liteit.se`) reachable
 * through the quote, which is why one link is enough and `deal_id`/`lead_id`
 * were not added.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260808220000_contracts-quote-link-and-number.sql');
const quoteSheet = read('src/components/admin/quotes/QuoteDetailSheet.tsx');
const contractDialog = read('src/components/admin/contracts/NewContractDialog.tsx');

describe('the link survives what happens to the quote', () => {
  it('nulls the link on quote deletion, never cascades', () => {
    // CASCADE here would delete a SIGNED AGREEMENT because someone tidied up a
    // quote. The contract outlives its origin by design.
    expect(sql).toMatch(/quote_id uuid REFERENCES public\.quotes\(id\) ON DELETE SET NULL/);
    expect(sql).not.toMatch(/quotes\(id\) ON DELETE CASCADE/);
  });

  it('indexes the link, since "which contract came from this quote" is the question', () => {
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS contracts_quote_id_idx/);
  });
});

describe('the number is assigned in one place', () => {
  it('assigns it by trigger, not inside one of the three creation paths', () => {
    // A contract is born three ways — the template renderer, the direct create
    // in manage_contract, and the admin dialog. A rule implemented in one of
    // three places is the exact shape of bug this codebase keeps finding.
    expect(sql).toMatch(/CREATE TRIGGER contracts_assign_number\s+BEFORE INSERT ON public\.contracts/);
  });

  it('only fills a NULL, so the renderer can pre-allocate', () => {
    // The renderer needs the number BEFORE the row exists, because it goes
    // inside the body. If the trigger overwrote, every rendered contract would
    // show one number in its text and carry another in its column.
    expect(sql).toMatch(/IF NEW\.contract_number IS NULL OR trim\(NEW\.contract_number\) = '' THEN/);
  });

  it('draws from the same counter as quotes and invoices', () => {
    expect(sql).toMatch(/next_document_number\('contract', 'AGR'\)/);
  });

  it('is AGR, not CTR', () => {
    // `CTR-YYYYMMDD-…` is already the invoice series for contract billing.
    // Numbering the agreement CTR- too means an operator reading CTR-2026-00001
    // cannot tell whether it is the agreement or one of its invoices.
    expect(sql).not.toMatch(/next_document_number\('contract', 'CTR'\)/);
  });

  it('rejects a duplicate number', () => {
    // Verified live: the second insert of the same number raises
    // unique_violation rather than quietly creating a twin.
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS contracts_contract_number_key/);
  });
});

describe('the backfill does not set up a collision', () => {
  it('advances the counter past the rows it numbered', () => {
    // Numbering existing contracts 1..N and leaving the counter at 0 would hand
    // AGR-YYYY-00001 to the next new contract and collide with the backfill —
    // caught by the unique index, as a failed insert in front of a user.
    expect(sql).toMatch(/INSERT INTO public\.document_number_counters\(kind, prefix, last_value\)\s*\n\s*VALUES \('contract', 'AGR', v_max\)/);
    expect(sql).toMatch(/GREATEST\(public\.document_number_counters\.last_value, EXCLUDED\.last_value\)/);
  });
});

describe('the renderer resolves the number it just allocated', () => {
  it('allocates before building the body', () => {
    const alloc = sql.indexOf("v_number := public.next_document_number('contract', 'AGR')");
    const body = sql.indexOf('v_body := v_tpl.body_markdown');
    expect(alloc).toBeGreaterThan(-1);
    expect(alloc).toBeLessThan(body);
  });

  it('fills both spellings of the number', () => {
    expect(sql).toContain("replace(v_body, '{{contract.number}}', v_number)");
    expect(sql).toContain("replace(v_body, '[AVTALSNR]', v_number)");
  });

  it('stores the same number it rendered', () => {
    // Two allocations would put one number in the text and another in the row.
    expect(sql).toMatch(/quote_id, contract_number, start_date/);
    expect(sql).toMatch(/v_company_id, v_quote_id, v_number, v_start/);
  });

  it('accepts contract.number when authoring a template', () => {
    const allowlist = sql.slice(sql.indexOf('_contract_template_unrendered_tokens'));
    expect(allowlist).toContain("'contract.number'");
  });
});

describe('the link actually reaches the database from the UI', () => {
  // The half that is easy to forget: a column nothing populates. Before this,
  // the quote passed its NUMBER as part of a title string and no id at all.
  it('the quote hands its id to the contract dialog', () => {
    const prefill = quoteSheet.slice(quoteSheet.indexOf('<NewContractDialog'));
    const block = prefill.slice(0, prefill.indexOf('/>'));
    expect(block).toMatch(/quote_id: quote\.id/);
  });

  it('the dialog declares it, so a caller cannot pass it silently wrong', () => {
    expect(contractDialog).toMatch(/quote_id\?: string;/);
  });

  it('the dialog forwards it into the RPC overrides', () => {
    // Scoped to the overrides object: a bare /quote_id/ also matches the prop
    // declaration and would pass while the field never reached the call — the
    // same trap that let a visibility picker ship without a payload field.
    const call = contractDialog.slice(contractDialog.indexOf('p_overrides: {'));
    const overrides = call.slice(0, call.indexOf('},'));
    expect(overrides).toMatch(/quote_id: prefill\?\.quote_id \|\| undefined/);
  });
});

describe('the number and the origin are visible to a human', () => {
  // The dual-surface law from CLAUDE.md: a capability needs the agent skill AND
  // an admin surface. `contract_number` shipped in the database and was rendered
  // nowhere — the `Contract` type did not even declare it, so the two places
  // that referenced `c.contract_number` (the field-service and consultant
  // pickers) had been reading `undefined` since before the column existed.
  const list = read('src/components/admin/contracts/ContractsList.tsx');
  const detail = read('src/components/admin/contracts/ContractDetailDialog.tsx');
  const hook = read('src/hooks/useContracts.ts');

  it('declares both new columns on the type', () => {
    expect(hook).toMatch(/contract_number: string \| null;/);
    expect(hook).toMatch(/quote_id: string \| null;/);
  });

  it('joins the quote so a contract can show where it came from', () => {
    // Verified against the live PostgREST embed, not just the string:
    // AGR-2026-00015 → QUO-2026-00008, while the pre-link AGR-2026-00004
    // correctly returns nothing.
    expect(hook).toMatch(/\.select\('\*, quotes\(quote_number\)'\)/);
  });

  it('renders the number in the list and in the detail header', () => {
    expect(list).toMatch(/\{contract\.contract_number\}/);
    expect(detail).toMatch(/\{contract\.contract_number\}/);
  });

  it('renders the originating quote number, not just the title string', () => {
    // The title has always said "Avtal — QUO-…". That is prose; this is the row.
    expect(list).toMatch(/contract\.quotes\?\.quote_number/);
  });
});
