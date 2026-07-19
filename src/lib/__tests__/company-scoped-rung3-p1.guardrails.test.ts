import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: identity-ladder rung 3 (B2B) P1 — the read rung. Company-scoped
 * skills resolve records ONLY within the caller's active company (server-injected
 * _company_id), are offered ONLY to a contact with an active membership, and the
 * verified company is forwarded from chat-completion — never a model/body claim.
 * (identity-ladder-rung3-b2b.md §7; agent-safe-by-construction.)
 *
 * Runtime-proven locally: an Acme contact lists only Acme's 2 orders (never
 * Globex's), Globex sees only its own, no _company_id → denied.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('rung 3 (B2B) P1 read-rung guardrails', () => {
  const agentExec = read('supabase/functions/agent-execute/index.ts');
  const chat = read('supabase/functions/chat-completion/index.ts');
  const companiesMod = read('src/lib/modules/companies-module.ts');

  it('the handler requires the server-injected _company_id and filters on it', () => {
    const fn = agentExec.slice(agentExec.indexOf('async function executeListCompanyRecords'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // requires the verified company scope, fail-closed via the shared guard
    // (the guard reads _company_id and returns the "must be signed in" error).
    expect(body).toMatch(/companyScopeGuard\(args, 'viewer'\)/);
    expect(body).toMatch(/if \('error' in scope\) return/);
    // the isolation predicate: rows filtered by the injected company id
    expect(body).toMatch(/\.eq\('company_id', companyId\)/);
    // never trusts a model-supplied company/customer field for the lookup
    expect(body).not.toMatch(/\.eq\('company_id',\s*args\./);
  });

  it('both read handlers are wired', () => {
    expect(agentExec).toContain("handler === 'internal:list_company_orders'");
    expect(agentExec).toContain("handler === 'internal:list_company_invoices'");
  });

  it('chat-completion offers company skills ONLY with an active membership + forwards the verified company', () => {
    expect(chat).toContain('COMPANY_SCOPED_SKILLS');
    // gate on an active membership
    expect(chat).toMatch(/if \(!companyCtx\?\.activeCompanyId\)\s*\{[\s\S]*?COMPANY_SCOPED_SKILLS\.has/);
    // forwarded company must come from the resolved membership, not a body claim
    expect(chat).toMatch(/company_id: activeCompanyId, company_role: activeCompanyRole/);
    expect(chat).toMatch(/companyCtx\?\.activeCompanyId, companyCtx\?\.activeRole/);
    // company resolved from the SAME verified path as rung 2
    expect(chat).toMatch(/resolveCompanyMembership\(supabase, req\.headers\.get\('Authorization'\)/);
  });

  it('read skills are external + auto and gated at the viewer (read) role', () => {
    const block = companiesMod.slice(companiesMod.indexOf("name: 'list_company_orders'"));
    expect(block).toMatch(/scope:\s*'external'/);
    expect(block).toMatch(/trust_level:\s*'auto'/);
    // The company-scope set is now derived from the role map (P2). The reads must
    // remain open to any active member (viewer); every entry carries a min role so
    // a write can never be offered without an explicit role gate (see the P2 test).
    expect(chat).toMatch(/COMPANY_SCOPED_SKILLS = new Set\(Object\.keys\(COMPANY_SKILL_MIN_ROLE\)\)/);
    expect(chat).toMatch(/list_company_orders:\s*'viewer'/);
    expect(chat).toMatch(/list_company_invoices:\s*'viewer'/);
  });
});
