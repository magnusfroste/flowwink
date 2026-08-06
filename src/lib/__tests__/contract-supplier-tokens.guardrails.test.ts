/**
 * A contract must never invent, and must never quietly omit.
 *
 * Found rehearsing the lead→contract chain the evening before a demo: every
 * `{{token}}` rendered correctly, and the agreement still read
 * `Leverantör: [LEVERANTÖRENS FIRMA], org.nr [ORGNR], [ADRESS]` — because the
 * templates carry 25 bracket placeholders across 164 occurrences that nothing
 * filled, while `company_profile` held all three values.
 *
 * Two properties are worth holding forever, and they pull in opposite
 * directions: fill everything the platform genuinely knows, and leave a VISIBLE
 * placeholder for everything it does not. A blank in a signed agreement is
 * worse than an obvious gap — it looks finished and is not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const sql = read('supabase/migrations/20260808210000_contract-supplier-tokens.sql');
const agentExecute = read('supabase/functions/agent-execute/index.ts');

/** The body of the render function, comments stripped. */
const fn = (() => {
  const from = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_contract_from_template'));
  return from.slice(0, from.indexOf('$$;')).replace(/--[^\n]*/g, '');
})();

const SUPPLIER = [
  ['supplier.name', 'LEVERANTÖRENS FIRMA'],
  ['supplier.org_number', 'ORGNR'],
  ['supplier.address', 'ADRESS'],
  ['supplier.phone', 'TELEFON'],
  ['supplier.email', 'E-POST'],
  ['supplier.signatory', 'NAMN'],
] as const;

describe('what the platform knows reaches the page', () => {
  it.each(SUPPLIER)('fills %s, in both spellings', (token, bracket) => {
    // `{{token}}` for templates written from here on; the bracket form for the
    // 15 already written. Supporting only one would mean a data migration on
    // every instance, and a second thing to keep in sync.
    expect(fn).toContain(`'{{${token}}}', v_sup_`);
    expect(fn).toContain(`'[${bracket}]', v_sup_`);
  });

  it('reads the supplier from the same store as the rest of the platform', () => {
    expect(fn).toMatch(/site_settings WHERE key = 'company_profile'/);
  });

  it('prefers the registered name over the display name', () => {
    // An agreement names the legal entity, not the brand.
    expect(fn).toMatch(/COALESCE\(NULLIF\(trim\(v_profile->>'legal_name'\), ''\),\s*NULLIF\(trim\(v_profile->>'company_name'\), ''\)\)/);
  });

  it('fills the customer side from company master data too', () => {
    expect(fn).toContain(`'[KUNDENS ORGNR]', v_org`);
    expect(fn).toContain(`'[KUNDENS ADRESS]', v_cp_addr`);
  });
});

describe('what it does not know stays visible', () => {
  it.each(SUPPLIER)('leaves %s as a placeholder rather than blank', (token, bracket) => {
    // The unconditional pass runs AFTER the guarded ones and maps the token
    // back to its bracket. Verified live: `contact_phone` and `contact_email`
    // are empty on the instance this was written for, and the rendered contract
    // still reads "…på [TELEFON] / [E-POST]" — not "…på  / ".
    expect(fn).toContain(`replace(v_body, '{{${token}}}', '[${bracket}]')`);
  });

  it('guards every supplier substitution on the value existing', () => {
    // A half-filled profile should contribute the half it has. Each field gets
    // its own IF — one combined guard would make a missing phone number blank
    // out the company name.
    for (const v of ['v_sup_name', 'v_sup_org', 'v_sup_addr', 'v_sup_phone', 'v_sup_email', 'v_sup_signer']) {
      expect(fn).toContain(`IF ${v} IS NOT NULL THEN`);
    }
  });

  it('does not guess a signatory title', () => {
    // The profile stores a `ceo` NAME and no title. Inferring "VD" from the
    // field's own name is a guess, and a signature block is the last place
    // software should guess.
    expect(fn).not.toContain('[TITEL]');
  });

  it('does not guess the CPI base month', () => {
    // It usually equals the start month, but not always — and a wrong number in
    // an indexation clause silently changes what the customer pays every year.
    expect(fn).not.toContain('[MÅNAD ÅR]');
  });
});

describe('the shape the caller actually reads', () => {
  // The bug this caught on the way in: `20260808180000` declares
  // `TABLE(id uuid, …)` while the deployed function returns
  // `TABLE(contract_id uuid, …)`. On an existing instance that migration cannot
  // apply at all (42P13); on a fresh install it would apply and make
  // `manage_contract` answer `contract_id: undefined`. Neither is visible in
  // either file alone — only in the pair.
  it('declares contract_id, because agent-execute reads contract_id', () => {
    expect(agentExecute).toContain('contract_id: row?.contract_id');
    expect(sql).toMatch(/RETURNS TABLE\(contract_id uuid, title text, status public\.contract_status\)/);
  });

  it('drops before creating, since the return type changes', () => {
    const dropAt = sql.indexOf('DROP FUNCTION IF EXISTS public.create_contract_from_template');
    const createAt = sql.indexOf('CREATE OR REPLACE FUNCTION public.create_contract_from_template');
    expect(dropAt).toBeGreaterThan(-1);
    expect(dropAt).toBeLessThan(createAt);
  });
});

describe('the validator and the renderer agree on the token list', () => {
  // The original migration says it in its own comment — "one token list, shared
  // by the authoring skill and the renderer" — so a new token must land in both
  // or `manage_contract_template` rejects a template that renders perfectly.
  const allowlist = sql.slice(sql.indexOf('_contract_template_unrendered_tokens'));

  it.each(SUPPLIER.map(([t]) => t).concat(['counterparty.address']))(
    'accepts %s when authoring a template',
    (token) => {
      expect(allowlist).toContain(`'${token}'`);
    },
  );

  it('keeps every token the renderer already handled', () => {
    for (const t of ['counterparty.name', 'counterparty.email', 'today', 'start_date',
                     'end_date', 'value', 'currency', 'title', 'counterparty.org_number',
                     'terms_url', 'site_url']) {
      expect(allowlist).toContain(`'${t}'`);
    }
  });
});
