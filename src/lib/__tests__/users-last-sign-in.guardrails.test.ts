import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// "When was Anna last here?" is one look at the Users table, and the same
// answer an agent gets from users_list — both read admin_user_sign_ins.
const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('last sign-in on the Users table and in users_list', () => {
  const sql = read('supabase/migrations/20261104090000_users-last-sign-in.sql');

  it('reads auth.users through an admin-only definer function, never for anon', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.admin_user_sign_ins\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/auth\.role\(\) = 'service_role' OR public\.has_role\(auth\.uid\(\), 'admin'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_user_sign_ins\(\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/last_sign_in_at/);
    expect(sql).toMatch(/auth\.sessions/);
  });

  it('the Users page shows it', () => {
    const page = read('src/pages/admin/UsersPage.tsx');
    expect(page).toMatch(/rpc\('admin_user_sign_ins'/);
    expect(page).toMatch(/Last sign-in/);
  });

  it('users_list answers it (parity with the page)', () => {
    const edge = read('supabase/functions/_shared/execute/core.ts');
    const profiles = edge.slice(edge.indexOf("case 'profiles': {"), edge.indexOf("case 'crm_tasks': {"));
    expect(profiles).toMatch(/rpc\('admin_user_sign_ins'\)/);
    expect(profiles).toMatch(/last_sign_in_at/);
    expect(profiles).toMatch(/last_active_at/);
  });
});
