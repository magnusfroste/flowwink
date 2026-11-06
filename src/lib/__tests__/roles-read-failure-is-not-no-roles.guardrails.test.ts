/**
 * A roles read that FAILED is not "no roles" (2026-11-06). A tab that wakes
 * after hours sends its first requests on an access token the refresh has not
 * replaced yet; PostgREST answers 401 (JWT expired). useAuth used to read
 * `{ data }` alone, so that answer became roles = [] and every admin saw
 * "not staff" for half a second until the refreshed token's read landed —
 * the "FlowWink needs patient users" Magnus noticed. Now the error is read,
 * the roles already held stay, the read is tried once more, and the guard
 * shows a spinner — never a deny — while it runs.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/hooks/useAuth.tsx', 'utf8');

describe('useAuth and a failed roles read', () => {
  it('reads the error of both reads, keeps the held roles, retries once, and only then declares ready', () => {
    expect(src).toMatch(/const \{ data: profileData, error: profileErr \} = await supabase/);
    expect(src).toMatch(/let \{ data: roleData, error: rolesErr \} = await supabase/);
    // On an error: wait, then the same read once more — inside the same call
    // (a self-call would make fetchUserData an unstable effect dependency).
    expect(src).toMatch(/if \(rolesErr\) \{\s+logger\.warn\([^\n]*\);\s+await new Promise\(\(resolve\) => setTimeout\(resolve, 1200\)\);\s+\(\{ data: roleData, error: rolesErr \} = await supabase/);
    // Roles are set only from a read that answered; a second failure keeps what is held.
    const branch = src.slice(src.indexOf('let { data: roleData'), src.indexOf('setRolesReady(true);', src.indexOf('let { data: roleData')));
    expect(branch).not.toMatch(/setRoles\(\[\]\)/);
    expect(branch).toMatch(/keeping the roles already held/);
    expect(branch).toMatch(/\} else \{\s+const allRoles = \(roleData \?\? \[\]\)\.map/);
  });
});
