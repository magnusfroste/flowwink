import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: identity-ladder rung 3 (B2B) P2 — write + roles. Company-scoped
 * WRITES resolve/act ONLY within the caller's active company (server-injected
 * _company_id) AND require a minimum company role (server-injected _company_role),
 * enforced authoritatively in the handler — the chat offer surface only mirrors it.
 * Invites activate on signup via an explicit membership row, never by email domain.
 * (identity-ladder-rung3-b2b.md §7 P2 / §9 decisions; agent-safe-by-construction.)
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('rung 3 (B2B) P2 write+roles guardrails', () => {
  const agentExec = read('supabase/functions/agent-execute/index.ts');
  const chat = read('supabase/functions/chat-completion/index.ts');
  const companiesMod = read('src/lib/modules/companies-module.ts');
  const migration = read('supabase/migrations/20260716100000_company-contacts-rung3-p2.sql');

  it('the role gate requires BOTH the injected company and a minimum role rank', () => {
    const fn = agentExec.slice(agentExec.indexOf('function companyScopeGuard'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/_company_id/);
    expect(body).toMatch(/_company_role/);
    // ranks ascend viewer<buyer<approver<admin and a lower rank is refused
    expect(agentExec).toMatch(/COMPANY_ROLE_RANK[^\n]*viewer:\s*0[^\n]*buyer:\s*1[^\n]*approver:\s*2[^\n]*admin:\s*3/);
    expect(body).toMatch(/COMPANY_ROLE_RANK\[role\][^\n]*<[^\n]*COMPANY_ROLE_RANK\[minRole\]/);
  });

  it('each write handler is gated at the right minimum role', () => {
    const ret = agentExec.slice(agentExec.indexOf('async function executeRequestCompanyReturn'));
    expect(ret.slice(0, 400)).toMatch(/companyScopeGuard\(args, 'buyer'\)/);
    const quote = agentExec.slice(agentExec.indexOf('async function executeApproveCompanyQuote'));
    expect(quote.slice(0, 400)).toMatch(/companyScopeGuard\(args, 'approver'\)/);
    const contacts = agentExec.slice(agentExec.indexOf('async function executeManageCompanyContacts'));
    expect(contacts.slice(0, 400)).toMatch(/companyScopeGuard\(args, 'admin'\)/);
  });

  it('every company write filters/asserts on the injected company id (never a body claim)', () => {
    for (const fnName of ['executeRequestCompanyReturn', 'executeApproveCompanyQuote', 'executeManageCompanyContacts']) {
      const fn = agentExec.slice(agentExec.indexOf(`async function ${fnName}`));
      const body = fn.slice(0, fn.indexOf('\n}\n\n//'));
      // scope comes from the guard, and every table touch is bound to companyId
      expect(body).toMatch(/\.eq\('company_id', companyId\)/);
      // never trusts a model-supplied company/customer field for the scope
      expect(body).not.toMatch(/\.eq\('company_id',\s*args\./);
    }
  });

  it('the quote-accept write re-asserts scope + is idempotent + status-guarded', () => {
    const fn = agentExec.slice(agentExec.indexOf('async function executeApproveCompanyQuote'));
    const body = fn.slice(0, fn.indexOf('\n}\n\n//'));
    expect(body).toMatch(/already_accepted/);
    expect(body).toMatch(/QUOTE_ACCEPTABLE_FROM/);
    // the UPDATE re-binds company_id AND the acceptable statuses (defence-in-depth)
    expect(body).toMatch(/\.update\(\{ status: 'accepted'[\s\S]*?\.eq\('company_id', companyId\)[\s\S]*?\.in\('status', QUOTE_ACCEPTABLE_FROM\)/);
  });

  it('contacts admin cannot strand the company without an admin', () => {
    const fn = agentExec.slice(agentExec.indexOf('async function executeManageCompanyContacts'));
    const body = fn.slice(0, fn.indexOf('\n}\n\n//'));
    expect(body).toMatch(/only admin/i);
    // the guard fires on revoke or a demotion away from admin
    expect(body).toMatch(/action === 'revoke' \|\| \(action === 'set_role' && role !== 'admin'\)/);
  });

  it('chat-completion offers each company skill only up to the caller\'s role', () => {
    expect(chat).toMatch(/request_company_return:\s*'buyer'/);
    expect(chat).toMatch(/approve_company_quote:\s*'approver'/);
    expect(chat).toMatch(/manage_company_contacts:\s*'admin'/);
    // reads stay open to any active member
    expect(chat).toMatch(/list_company_orders:\s*'viewer'/);
    // role-aware filter: hide a skill whose min role outranks the caller
    expect(chat).toMatch(/haveRank >= COMPANY_ROLE_RANK\[need\]/);
  });

  it('the three write skills are external + auto with internal handlers', () => {
    for (const name of ['request_company_return', 'approve_company_quote', 'manage_company_contacts']) {
      const block = companiesMod.slice(companiesMod.indexOf(`name: '${name}'`));
      expect(block.slice(0, 900)).toMatch(/scope:\s*'external'/);
      expect(block.slice(0, 900)).toMatch(/trust_level:\s*'auto'/);
      expect(block.slice(0, 900)).toMatch(new RegExp(`handler:\\s*'internal:${name}'`));
    }
    // all three are registered on the module
    expect(companiesMod).toMatch(/'request_company_return',\s*\n\s*'approve_company_quote',\s*\n\s*'manage_company_contacts',/);
  });

  it('invites activate by explicit membership on signup — never by email domain', () => {
    // trigger links an INVITED row to the new profile by exact email, sets active
    expect(migration).toMatch(/create trigger trg_link_invited_company_contacts[\s\S]*?after insert on public\.profiles/);
    expect(migration).toMatch(/status\s*=\s*'active'/);
    expect(migration).toMatch(/lower\(cc\.contact_email\)\s*=\s*lower\(new\.email\)/);
    // document backfill walks an explicit FK, NOT a fuzzy email→company guess
    expect(migration).toMatch(/from public\.quotes q\s*\n\s*where q\.invoice_id = i\.id/);
    expect(migration).not.toMatch(/customer_email\s*=\s*.*contact_email/i);
  });
});
