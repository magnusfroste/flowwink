import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardrail: identity-ladder rung 3 (B2B) P0 keystone. The company a turn acts
 * for is server-injected from the verified JWT → company_contacts membership,
 * never from model/body claims, and cross-company isolation holds at the data
 * layer. (identity-ladder-rung3-b2b.md §10; agent-safe-by-construction.)
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('rung 3 (B2B) P0 guardrails', () => {
  const migration = read('supabase/migrations/20260714140000_company-contacts-rung3-p0.sql');
  const ctx = read('supabase/functions/_shared/customer-context.ts');
  const agentExec = read('supabase/functions/agent-execute/index.ts');

  it('company_contacts is the membership boundary with RLS + explicit-only membership', () => {
    expect(migration).toMatch(/create table if not exists public\.company_contacts/);
    expect(migration).toMatch(/enable row level security/);
    // a contact reads only their OWN membership rows (+ staff)
    expect(migration).toMatch(/auth_user_id = auth\.uid\(\)/);
    // writes are staff/service only at P0 (first membership is human-provisioned)
    expect(migration).toMatch(/company_contacts_staff_manage[\s\S]*?has_role\(auth\.uid\(\), 'admin'\)/);
    // role + explicit visibility scope exist; membership is never domain-inferred
    expect(migration).toMatch(/company_role text not null[\s\S]*?check[\s\S]*?'admin'/);
    expect(migration).toMatch(/visibility_scope text not null/);
  });

  it('the resolver derives the company from the verified JWT, honouring a requested company only if a member', () => {
    const fn = ctx.slice(ctx.indexOf('export async function resolveCompanyMembership'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    // built on the verified-JWT resolver, never a body claim
    expect(body).toMatch(/resolveAuthenticatedCustomer\(authHeader, anonKey\)/);
    // memberships read by the verified user id
    expect(body).toMatch(/from\('company_contacts'\)[\s\S]*?\.eq\('auth_user_id', customer\.userId\)/);
    // a requested company is honoured ONLY when the user is actually a member
    expect(body).toMatch(/requestedCompanyId && memberships\.some\(\(m\) => m\.companyId === requestedCompanyId\)/);
    // >1 membership and none chosen → never guess
    expect(body).toMatch(/never guess/i);
  });

  it('agent-execute server-injects _company_id/_company_role and forces over model args', () => {
    // forced when present, deleted when absent — exact analog of _caller_email
    expect(agentExec).toMatch(/if \(callerCompanyId\)\s*\{[\s\S]*?_company_id = String\(callerCompanyId\)/);
    expect(agentExec).toMatch(/else\s*\{\s*delete \(args as any\)\._company_id;\s*delete \(args as any\)\._company_role;/);
    // sourced from the request body's server-set field, never from raw model args
    expect(agentExec).toMatch(/company_id: callerCompanyId, company_role: callerCompanyRole \} = body/);
  });

  it('the two security-boundary columns are direct, not derived joins', () => {
    expect(migration).toMatch(/alter table public\.invoices\s+add column if not exists company_id uuid references public\.companies/);
    expect(migration).toMatch(/alter table public\.contracts add column if not exists company_id uuid references public\.companies/);
    // NOT backfilled from email domain (membership-not-assertion)
    expect(migration).toMatch(/NOT backfilled from\s*\n?--?\s*email domain/i);
  });
});
