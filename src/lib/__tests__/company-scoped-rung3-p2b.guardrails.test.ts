import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: identity-ladder rung 3 (B2B) P2b — reorder, quote request, and
 * pay-own-invoice via the payment rail. Same construction as P2: every handler
 * resolves ONLY within the caller's active company (server-injected _company_id)
 * and requires the buyer role (server-injected _company_role). Money NEVER moves
 * in an agent write — the payment skill only resolves + hands out the link to
 * the real payment UI (Decision 4). The customer never authors amounts on a
 * quote request. (identity-ladder-rung3-b2b.md §7 P2b / §9 decisions.)
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('rung 3 (B2B) P2b guardrails', () => {
  const agentExec = read('supabase/functions/agent-execute/index.ts');
  const chat = read('supabase/functions/chat-completion/index.ts');
  const companiesMod = read('src/lib/modules/companies-module.ts');

  const fnBody = (name: string) => {
    const fn = agentExec.slice(agentExec.indexOf(`async function ${name}`));
    return fn.slice(0, fn.indexOf('\n}\n\n//'));
  };

  it('all three handlers are wired and gated at buyer', () => {
    for (const name of ['reorder_company_order', 'request_company_quote', 'initiate_company_invoice_payment']) {
      expect(agentExec).toContain(`handler === 'internal:${name}'`);
    }
    expect(fnBody('executeReorderCompanyOrder').slice(0, 400)).toMatch(/companyScopeGuard\(args, 'buyer'\)/);
    expect(fnBody('executeRequestCompanyQuote').slice(0, 400)).toMatch(/companyScopeGuard\(args, 'buyer'\)/);
    expect(fnBody('executeInitiateCompanyInvoicePayment').slice(0, 400)).toMatch(/companyScopeGuard\(args, 'buyer'\)/);
  });

  it('every handler scopes reads AND writes to the injected company id', () => {
    for (const name of ['executeReorderCompanyOrder', 'executeInitiateCompanyInvoicePayment']) {
      const body = fnBody(name);
      expect(body).toMatch(/\.eq\('company_id', companyId\)/);
      expect(body).not.toMatch(/\.eq\('company_id',\s*args\./);
    }
    // the two creating handlers stamp the new row with the verified company
    expect(fnBody('executeReorderCompanyOrder')).toMatch(/company_id: companyId,\s+\/\/ stamped/);
    expect(fnBody('executeRequestCompanyQuote')).toMatch(/company_id: companyId,\s+\/\/ stamped/);
  });

  it('reorder is idempotent and takes no payment', () => {
    const body = fnBody('executeReorderCompanyOrder');
    expect(body).toMatch(/already_open/);
    expect(body).toMatch(/reorder_of/);
    expect(body).toMatch(/status: 'pending'/);
    // no payment/stripe/checkout side effects in the reorder path
    expect(body).not.toMatch(/stripe|checkout|payment_intent/i);
  });

  it('a quote request never lets the customer author amounts', () => {
    const body = fnBody('executeRequestCompanyQuote');
    expect(body).toMatch(/status: 'draft'/);
    expect(body).toMatch(/subtotal_cents: 0, tax_rate: 0, tax_cents: 0, total_cents: 0/);
    // amounts must not come from args
    expect(body).not.toMatch(/total_cents:\s*args\.|subtotal_cents:\s*args\./);
    expect(body).toMatch(/already_open/);
  });

  it('the payment skill moves no money — it only resolves and links the rail', () => {
    const body = fnBody('executeInitiateCompanyInvoicePayment');
    // no writes at all in this handler
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    // no direct charging
    expect(body).not.toMatch(/stripe\.|charges|payment_intents/i);
    // hands out the public payment page, guarded on status
    expect(body).toMatch(/\/invoice\/\$\{invoice\.public_token\}/);
    expect(body).toMatch(/already_paid/);
    expect(body).toMatch(/cancelled/);
  });

  it('the offer surface gates all three at buyer', () => {
    expect(chat).toMatch(/reorder_company_order:\s*'buyer'/);
    expect(chat).toMatch(/request_company_quote:\s*'buyer'/);
    expect(chat).toMatch(/initiate_company_invoice_payment:\s*'buyer'/);
  });

  it('the three skills are external + auto with internal handlers and registered', () => {
    for (const name of ['reorder_company_order', 'request_company_quote', 'initiate_company_invoice_payment']) {
      const block = companiesMod.slice(companiesMod.indexOf(`name: '${name}'`));
      expect(block.slice(0, 900)).toMatch(/scope:\s*'external'/);
      expect(block.slice(0, 900)).toMatch(/trust_level:\s*'auto'/);
      expect(block.slice(0, 900)).toMatch(new RegExp(`handler:\\s*'internal:${name}'`));
    }
    expect(companiesMod).toMatch(/'reorder_company_order',\s*\n\s*'request_company_quote',\s*\n\s*'initiate_company_invoice_payment',/);
  });
});
