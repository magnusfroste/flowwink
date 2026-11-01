/**
 * MFA for staff: one rule (src/lib/mfa-gate.ts), mirrored in the database
 * (session_mfa_ok in the role gate), shown by the admin shell, enrolled on the
 * profile, required and reset under Users. Customers are never gated.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EMPTY_MFA_STATE, isStaff, mfaGateFor, type MfaState } from '@/lib/mfa-gate';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIG = 'supabase/migrations/20261029090000_mfa-for-staff.sql';
const loaded = (o: Partial<MfaState>): MfaState => ({ ...EMPTY_MFA_STATE, loaded: true, ...o });

describe('the gate rule', () => {
  it('gates nothing before the standing is loaded, and never a customer', () => {
    expect(mfaGateFor({ roles: ['admin'], mfa: EMPTY_MFA_STATE, requiredForStaff: true })).toBe('none');
    expect(mfaGateFor({ roles: ['customer'], mfa: loaded({ verifiedFactors: 1, currentLevel: 'aal1', nextLevel: 'aal2' }), requiredForStaff: true })).toBe('none');
    expect(isStaff(['customer'])).toBe(false);
    expect(isStaff(['customer', 'sales'])).toBe(true);
    expect(isStaff([])).toBe(false);
  });
  it('an enrolled staff member at aal1 is challenged; at aal2 passes', () => {
    const enrolled = { verifiedFactors: 1, nextLevel: 'aal2' as const };
    expect(mfaGateFor({ roles: ['sales'], mfa: loaded({ ...enrolled, currentLevel: 'aal1' }), requiredForStaff: false })).toBe('challenge');
    expect(mfaGateFor({ roles: ['sales'], mfa: loaded({ ...enrolled, currentLevel: 'aal2' }), requiredForStaff: false })).toBe('none');
  });
  it('the dial requires enrollment of staff without a factor, and only of staff', () => {
    const none = { verifiedFactors: 0, currentLevel: 'aal1' as const, nextLevel: 'aal1' as const };
    expect(mfaGateFor({ roles: ['admin'], mfa: loaded(none), requiredForStaff: true })).toBe('enroll');
    expect(mfaGateFor({ roles: ['admin'], mfa: loaded(none), requiredForStaff: false })).toBe('none');
    expect(mfaGateFor({ roles: ['customer'], mfa: loaded(none), requiredForStaff: true })).toBe('none');
  });
});

describe('the database mirrors the rule', () => {
  const sql = read(MIG);
  it('session_mfa_ok judges only the caller\'s own staff session and reads the same dial key', () => {
    expect(sql).toMatch(/WHEN auth\.role\(\) = 'service_role' THEN true/);
    expect(sql).toMatch(/_user_id IS DISTINCT FROM auth\.uid\(\) THEN true/);
    expect(sql).toMatch(/ur\.role <> 'customer'::public\.app_role\) THEN true/);
    expect(sql).toMatch(/coalesce\(auth\.jwt\(\) ->> 'aal', 'aal1'\) = 'aal2' THEN true/);
    expect(sql).toMatch(/auth\.mfa_factors f WHERE f\.user_id = _user_id AND f\.status = 'verified'\) THEN false/);
    expect(sql).toMatch(/s\.value ->> 'mfaRequiredForStaff'/);
    // The frontend reads the same key.
    expect(read('src/hooks/useSiteSettings.tsx')).toMatch(/mfaRequiredForStaff: boolean/);
  });
  it('has_role and can_access_module both pass through it; the admin RPCs are admin-only', () => {
    expect(sql).toMatch(/\) AND public\.session_mfa_ok\(_user_id\);/);
    expect(sql).toMatch(/SELECT public\.session_mfa_ok\(_user_id\)\n\s+AND \(/);
    expect(sql).toMatch(/FUNCTION public\.admin_mfa_status\(\)/);
    expect(sql).toMatch(/FUNCTION public\.admin_reset_mfa\(_user_id uuid\)/);
    expect(sql).toMatch(/DELETE FROM auth\.mfa_factors WHERE user_id = _user_id;/);
    expect(sql).not.toMatch(/admin_reset_mfa[\s\S]*TO anon/);
    // The proof block asserts all four verdicts.
    for (const m of ['at aal1 must not read as staff', 'aal2 staff session must read as staff', 'on behalf of another user must not be gated', 'service role must not be gated']) expect(sql).toContain(m);
  });
});

describe('the shell, the profile, the users page', () => {
  it('the admin shell shows the challenge or the forced enrollment before judging routes, and the heals wait for it', () => {
    const layout = read('src/components/admin/AdminLayout.tsx');
    expect(layout).toMatch(/const mfaGate = mfaGateFor\(\{ roles: realRoles, mfa, requiredForStaff: security\?\.mfaRequiredForStaff === true \}\)/);
    expect(layout.indexOf("mfaGate === 'challenge'")).toBeLessThan(layout.indexOf('isRouteAllowed('));
    expect(layout).toMatch(/<MfaEnroll forced \/>/);
    expect(read('src/hooks/useFlowPilotBootstrap.ts')).toMatch(/const canHeal = !!user && rolesReady && isAdmin && mfaClear;/);
    expect(read('src/hooks/useTenantLocalePack.ts')).toMatch(/if \(!isAdmin \|\| !mfaClear\) return;/);
  });
  it('enrollment clears abandoned factors first; the users page has the dial, the column and the reset', () => {
    const enroll = read('src/components/admin/mfa/MfaEnroll.tsx');
    expect(enroll).toMatch(/await clearUnverified\(\);\s*const \{ data, error: enErr \} = await supabase\.auth\.mfa\.enroll/);
    expect(enroll).toMatch(/factorType: 'totp'/);
    expect(read('src/pages/admin/ProfilePage.tsx')).toMatch(/<MfaEnroll \/>/);
    const users = read('src/pages/admin/UsersPage.tsx');
    expect(users).toMatch(/supabase\.rpc\('admin_mfa_status' as never\)/);
    expect(users).toMatch(/supabase\.rpc\('admin_reset_mfa' as never, \{ _user_id: userId \} as never\)/);
    // The person flipping the dial on must be enrolled.
    expect(users).toMatch(/disabled=\{updateSecurity\.isPending \|\| \(!security\?\.mfaRequiredForStaff && mfa\.verifiedFactors === 0\)\}/);
    expect(read('src/hooks/useAuth.tsx')).toMatch(/supabase\.auth\.mfa\.getAuthenticatorAssuranceLevel\(\)/);
  });
});
