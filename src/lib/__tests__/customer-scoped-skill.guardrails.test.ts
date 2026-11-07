/**
 * Guardrail: customer-scoped "my" skills (identity ladder rung 2, dial 2) act
 * only on the signed-in customer's own records, and the customer identity is
 * server-injected from the verified JWT — never from model arguments.
 * (conversation-and-retrieval.md Phase 2c; agent-safe-by-construction.)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('customer-scoped skill guardrails', () => {
  const agentExec = read('supabase/functions/_shared/execute/core.ts');
  const chat = read('supabase/functions/chat-completion/index.ts');
  const returnsMod = read('src/lib/modules/returns-module.ts');

  it('caller_email is server-injected over any model-supplied value', () => {
    // The verified email forces itself into args._caller_email (or is deleted).
    expect(agentExec).toMatch(/if \(caller_email\)\s*\{[\s\S]*?_caller_email = String\(caller_email\)\.toLowerCase\(\)/);
    expect(agentExec).toMatch(/else\s*\{\s*delete \(args as any\)\._caller_email/);
  });

  it('request_return resolves the order only among the CALLER’s own orders', () => {
    const fn = agentExec.slice(agentExec.indexOf('async function executeRequestReturn'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // Requires the verified email.
    expect(body).toMatch(/_caller_email/);
    expect(body).toMatch(/must be signed in/i);
    // Ownership: orders filtered by the verified email, matched by id.
    expect(body).toMatch(/from\('orders'\)[\s\S]*?\.eq\('customer_email', email\)/);
    // Never trusts a model-supplied email/customer field for the lookup.
    expect(body).not.toMatch(/\.eq\('customer_email',\s*args\./);
  });

  it('chat-completion forwards ONLY the verified authedCustomer email as caller_email', () => {
    expect(chat).toMatch(/caller_email:\s*authedCustomerEmail/);
    expect(chat).toMatch(/authedCustomer\?\.email/);
    // caller_email must not be sourced from the forgeable body customerEmail.
    expect(chat).not.toMatch(/caller_email:\s*customerEmail/);
  });

  it('customer-scoped skills are hidden from anonymous callers', () => {
    expect(chat).toContain('CUSTOMER_SCOPED_SKILLS');
    expect(chat).toMatch(/if \(!authedCustomer\)\s*\{[\s\S]*?CUSTOMER_SCOPED_SKILLS\.has/);
  });

  it('request_return is external + auto but the destructive RMA steps stay internal', () => {
    const rr = returnsMod.slice(returnsMod.indexOf("name: 'request_return'"));
    const block = rr.slice(0, rr.indexOf('},\n  {'));
    expect(block).toMatch(/scope:\s*'external'/);
    expect(block).toMatch(/handler:\s*'internal:request_return'/);
    // refund_return / approve_return must remain internal (staff-gated).
    const refund = returnsMod.slice(returnsMod.indexOf("name: 'refund_return'"));
    expect(refund.slice(0, 400)).toMatch(/scope:\s*'internal'/);
  });
});
