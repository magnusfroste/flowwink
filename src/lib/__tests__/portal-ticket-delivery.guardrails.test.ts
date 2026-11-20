import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Portal ticket + delivery-as-status. Two invariants Magnus set on 2026-08-07:
 *
 *  1. THE ALIEXPRESS RULE — one number per thing the CUSTOMER refers to, never
 *     one per internal process. A signed contract IS the order (its number is
 *     the order number); "delivery" is not a new object with its own series, it
 *     is a STATE on the service the contract already minted. A ticket, by
 *     contrast, IS a thing the customer refers to, so a ticket number is earned.
 *
 *  2. THE PORTAL NEVER TRUSTS CLIENT IDENTITY — the customer describes the
 *     problem; the system supplies the context (who they are, which service,
 *     which company) from their own session, so no one can open a ticket "as"
 *     someone else or against a service that isn't theirs.
 */

const enumMig = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260808340000_subscription-provisioning-status.sql'),
  'utf-8',
);
const mig = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/20260808350000_portal-ticket-and-delivery.sql'),
  'utf-8',
);
// Function bodies with SQL comments stripped — comments legitimately mention
// 'order'/'manual'/'email' to explain the rules; only the code must obey them.
const code = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const sheet = readFileSync(
  resolve(__dirname, '../../../src/components/account/ServiceTicketSheet.tsx'),
  'utf-8',
);
const myServices = readFileSync(
  resolve(__dirname, '../../../src/pages/account/MyServicesPage.tsx'),
  'utf-8',
);

const fnBody = (name: string) => {
  const start = code.indexOf(name, code.indexOf('CREATE FUNCTION') >= 0 ? 0 : 0);
  const at = code.indexOf(name);
  const end = code.indexOf('$$;', at);
  return code.slice(at, end === -1 ? undefined : end);
};

describe('delivery is a status, never a new number (the AliExpress rule)', () => {
  it("adds a 'provisioning' status to the subscription enum", () => {
    expect(enumMig).toMatch(/ALTER TYPE public\.subscription_status ADD VALUE[\s\S]*'provisioning'/);
  });

  it('mints NO order number — no order series, no order-number column', () => {
    // The whole point: what an "order number" would have tracked is a state,
    // not an object. If a future edit reaches for a series, this catches it.
    expect(code).not.toMatch(/next_document_number\(\s*['"]order['"]/i);
    expect(code).not.toMatch(/ADD COLUMN[^;]*order_number/i);
  });

  it("a contract-born service is born 'provisioning', awaiting delivery", () => {
    const birth = fnBody('create_subscription_from_contract');
    expect(birth).toMatch(/'provisioning'/);
  });

  it("the one-invoicer rule survives the rewrite — still provider='contract'", () => {
    // create_subscription_from_contract is CREATE OR REPLACE'd here; the
    // provider marker that keeps the subscription cron from double-billing must
    // not regress to a self-billing 'manual' row.
    const birth = fnBody('create_subscription_from_contract');
    expect(birth).toMatch(/'contract'/);
    expect(birth).not.toMatch(/'manual'/);
  });
});

describe('a ticket number IS earned — the customer refers to it', () => {
  it('numbers tickets TIC-… via the shared document sequence', () => {
    expect(mig).toMatch(/next_document_number\(\s*'ticket'\s*,\s*'TIC'\s*\)/);
  });

  it('assigns the number on INSERT via a trigger, and backfills existing rows', () => {
    expect(mig).toMatch(/CREATE TRIGGER tickets_assign_number[\s\S]*BEFORE INSERT ON public\.tickets/);
    expect(mig).toMatch(/UPDATE public\.tickets SET ticket_number[\s\S]*WHERE ticket_number IS NULL/);
  });
});

describe('the portal never trusts client-passed identity', () => {
  const portal = fnBody('create_ticket_from_portal');

  // The body this reads is the function as first shipped. Since 2026-11-19 the
  // identity is the CONFIRMED address (portal_email()) — pinned in
  // portal-trusts-confirmed-email.guardrails.test.ts.
  it('takes the caller email from the JWT, and has no email parameter to spoof', () => {
    expect(portal).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/);
    // The signature must not expose an email/customer param — identity is
    // derived, never supplied.
    const signature = portal.slice(0, portal.indexOf('RETURNS'));
    expect(signature).not.toMatch(/p_email|p_customer|contact_email/i);
  });

  it('refuses a service that is not on the caller’s account', () => {
    expect(portal).toMatch(/lower\(coalesce\(v_sub\.customer_email[\s\S]*<>\s*v_email/);
    expect(portal).toMatch(/RAISE EXCEPTION 'That service is not on your account'/);
  });

  it('derives the company from the service’s contract, not from the client', () => {
    expect(portal).toMatch(/SELECT company_id INTO v_company FROM public\.contracts/);
  });

  it("stamps the ticket source as 'portal' and binds created_by to the caller", () => {
    expect(portal).toMatch(/'portal'/);
    expect(portal).toMatch(/auth\.uid\(\)/);
  });
});

describe('delivery flip is staff-only and one-way', () => {
  const deliver = fnBody('mark_service_delivered');

  it('is gated to service_role or staff', () => {
    expect(deliver).toMatch(/auth\.role\(\)\s*=\s*'service_role'\s*OR\s*is_staff\(auth\.uid\(\)\)/);
  });

  it("only flips provisioning → active, never resurrecting a canceled service", () => {
    expect(deliver).toMatch(/SET status = 'active'/);
    expect(deliver).toMatch(/WHERE id = p_subscription_id AND status = 'provisioning'/);
  });
});

describe('the intake form asks only what the system cannot know', () => {
  it('sends subject + description + subscription id — and no identity fields', () => {
    expect(sheet).toMatch(/create_ticket_from_portal/);
    expect(sheet).toMatch(/p_subject/);
    expect(sheet).toMatch(/p_subscription_id/);
    expect(sheet).not.toMatch(/p_email|customer_email|p_company/);
  });

  it('a sheet keeps the context with the service card (no route hop)', () => {
    expect(sheet).toMatch(/Sheet/);
  });
});

describe('the customer sees delivery as a state, in plain words', () => {
  it("labels 'provisioning' as being set up, not the raw enum", () => {
    // The word lives with the customer's other words now, in the site's language.
    const words = readFileSync('src/lib/customer-words.ts', 'utf8');
    expect(words).toMatch(/status === 'provisioning'\) return t\('service\.status\.provisioning', 'Being set up'\)/);
    expect(myServices).toMatch(/serviceStatusWord\(s\.status, t\)/);
  });

  it('explains the wait while a service is provisioning', () => {
    expect(myServices).toMatch(/status === 'provisioning'/);
  });
});
