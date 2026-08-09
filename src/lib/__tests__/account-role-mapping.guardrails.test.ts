import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Mapping a company's own chart onto the role layer.
 *
 * The reframe that makes it tractable: a real Bokio export (LiteIT 2023) has
 * 1 243 accounts, but FlowWink posts to ROLES — 23 of them — and exactly 29 of
 * those accounts had any balance or movement. So it is ~20 decisions, not 1 243.
 *
 * The first version of propose auto-picked the nearest account in the 2-digit
 * group and produced confident nonsense: vat_input (2641) "proposed" 2611, which
 * is OUTPUT VAT, wrapped in a persuasive sentence about the company's own
 * history deciding. 264x is input VAT and 261x is output VAT; no prefix width is
 * right for every role, since 30xx must span 3001→3011 while 26xx must not.
 * These tests hold the version that hands the disagreement over instead.
 */

const migration = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260809180000_account-role-mapping.sql'), 'utf-8');
const module_ = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/accounting-module.ts'), 'utf-8');
const seed = module_.slice(
  module_.indexOf("name: 'manage_account_roles'"),
  module_.indexOf("name: 'read_sie_file'"));

describe('propose picks NOTHING when the exact account is not used', () => {
  it('lists candidates instead of choosing one', () => {
    expect(migration).toMatch(/v_confidence := 'candidates'/);
    expect(migration).toMatch(/INTO v_used\s+FROM _their WHERE in_use AND left\(code, 2\) = v_prefix/);
  });

  it('carries the incident that made auto-picking unacceptable', () => {
    expect(migration).toMatch(/vat_input\s+--\s+2641 "proposed" 2611, which is OUTPUT VAT|264x is input VAT and 261x is output VAT/);
    expect(migration).toMatch(/A prefix is not a meaning/);
  });

  it('the response has no "proposed" field to mistake for a decision', () => {
    // A field called `proposed` invites an agent to apply it unread.
    const proposeBlock = migration.slice(migration.indexOf("-- ── propose"));
    expect(proposeBlock).not.toMatch(/'proposed', v_candidate/);
    expect(proposeBlock).toMatch(/'candidates', CASE WHEN v_confidence = 'candidates'/);
  });

  it('an exact match is marked confirmed rather than left ambiguous', () => {
    expect(migration).toMatch(/'confirmed', v_confidence = 'exact'/);
  });

  it('no movement in the group is "no evidence", not a reason to change', () => {
    expect(migration).toMatch(/there is no evidence either way/);
    expect(migration).toMatch(/decide with the customer, do not guess/);
  });
});

describe('the customer\'s own history is the authority for their own books', () => {
  it('says so where an agent will read it, with the consequence spelled out', () => {
    expect(migration).toMatch(/Their own history decides what their books mean/);
    expect(migration).toMatch(/different account than years of theirs/);
  });

  it('and the header records the case that proved it', () => {
    // LiteIT books revenue to 3011; our pack says 3001; 3011 is not even in BAS.
    expect(migration).toMatch(/LiteIT books revenue to 3011/);
    expect(migration).toMatch(/diverge on line one/);
  });
});

describe('propose refuses the whole exported chart', () => {
  it('asks for the accounts in USE and explains why the rest is noise', () => {
    expect(migration).toMatch(/Send the ones IN USE, not the whole exported chart/);
    expect(migration).toMatch(/~1200 accounts of which a real company touches about 30/);
  });

  it('reads and writes nothing', () => {
    const proposeBlock = migration.slice(migration.indexOf('-- ── propose'));
    expect(proposeBlock).not.toMatch(/INSERT INTO public\.account_roles/);
    expect(proposeBlock).toMatch(/Nothing was written/);
  });

  it('reports the accounts this instance has never heard of — the real migration', () => {
    expect(migration).toMatch(/accounts_missing_from_chart/);
    expect(migration).toMatch(/Bokio → Dooer, Bokio → FlowWink/);
  });
});

describe('set is guarded, because a bad role fails mid-invoice', () => {
  it('refuses an account that is not in the chart', () => {
    expect(migration).toMatch(/is not in the %s chart\. Add it first/);
    expect(migration).toMatch(/fails mid-invoice, which is the worst moment to find out/);
  });

  it('refuses an unknown role and answers with the valid ones — self-correcting', () => {
    expect(migration).toMatch(/Unknown role "%s"\. Valid roles: %s/);
  });

  it('says plainly that already-booked entries are untouched', () => {
    expect(migration).toMatch(/Entries already booked are unchanged/);
  });

  it('one role at a time — no bulk apply that skips the reading', () => {
    expect(migration).toMatch(/set requires role and account_code/);
    expect(seed).toMatch(/action=set changes one role/);
  });
});

describe('a remapped role leaves a balance behind, and set hands back the entry that clears it', () => {
  it('computes what is stranded on the old account', () => {
    // Saying "already-booked entries are unchanged" is honest and leaves the
    // customer with a P&L split across two accounts. Dooer solved this when
    // LiteIT moved from Bokio: on the closing date it booked "Change to Dooer
    // kontoplan", moving 4 000 kr from 3011 to 3001 — dated, balanced,
    // self-describing. The move became auditable instead of invisible.
    expect(migration).toMatch(/SUM\(l\.debit_cents - l\.credit_cents\)/);
    expect(migration).toMatch(/'stranded_balance_cents', v_balance_cents/);
    expect(migration).toMatch(/Change to Dooer kontoplan/);
  });

  it('the suggested lines balance, whichever side of the sheet the account is on', () => {
    // Sign follows the balance so an asset and a revenue account both work.
    expect(migration).toMatch(/CASE WHEN v_balance_cents < 0 THEN -v_balance_cents ELSE 0 END/);
    expect(migration).toMatch(/CASE WHEN v_balance_cents > 0 THEN v_balance_cents ELSE 0 END/);
  });

  it('it PROPOSES and never books — manage_journal_entry owns the approval rail', () => {
    const setBlock = migration.slice(migration.indexOf("-- ── set"), migration.indexOf('-- ── propose'));
    expect(setBlock).not.toMatch(/INSERT INTO public\.journal_entries/);
    expect(migration).toMatch(/a role change may not quietly write a verification/);
  });

  it('and says plainly what happens if the entry is skipped', () => {
    expect(migration).toMatch(/the figure lives on two accounts at once/);
    expect(migration).toMatch(/neither figure is the truth/);
  });

  it('nothing stranded is stated too, rather than left as silence', () => {
    expect(migration).toMatch(/Nothing is stranded: the old account has no balance/);
  });
});

describe('it reaches the gateway and says the rule at the choice tier', () => {
  it('service-role escape — auth.uid() is NULL under MCP', () => {
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'\)/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.manage_account_roles[\s\S]*TO authenticated, service_role/);
  });

  it('rpc handler with params matching the function, keeping the self-correcting hint accurate', () => {
    expect(seed).toMatch(/handler: 'rpc:manage_account_roles'/);
    for (const p of ['action', 'locale', 'accounts', 'role', 'account_code', 'reason']) {
      expect(seed).toContain(`${p}: {`);
    }
  });

  it('the DESCRIPTION says it never picks, and why', () => {
    expect(seed).toMatch(/it never picks for you/);
    expect(seed).toMatch(/how input VAT ends up on an output VAT account/);
    expect(seed).toMatch(/Use when:/);
    expect(seed).toMatch(/NOT for:/);
  });

  it('the instructions teach the 1243→20 reframe, not just the arguments', () => {
    expect(seed).toMatch(/1 243 accounts/);
    expect(seed).toMatch(/exactly 29 accounts had any balance or movement/);
  });
});

describe('propose survives the session an agent actually calls it from', () => {
  const fix = readFileSync(
    resolve(__dirname, '../../../supabase/migrations/20260810010000_account-roles-propose-truncate-not-delete.sql'), 'utf-8');

  it('clears its temp table with TRUNCATE, not an unqualified DELETE', () => {
    // Supabase runs PostgREST's role with the safeupdate extension, which
    // rejects `DELETE FROM x` with no WHERE. Over psql — where every test of
    // this function had run — safeupdate is off. So the skill worked all through
    // development and failed the first time it was called through the gateway,
    // which is the only way an agent ever calls it. Found on liteit 2026-08-10.
    const body = fix.slice(fix.indexOf('AS $function$'));
    expect(body).toMatch(/TRUNCATE _their;/);
    expect(body).not.toMatch(/DELETE FROM _their;/);
  });

  it('names the class, not just the fix', () => {
    expect(fix).toMatch(/legal in one session and refused\s*--\s*in another/);
  });
});
