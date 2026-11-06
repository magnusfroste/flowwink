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
    expect(src).toMatch(/const \{ data: roleData, error: rolesErr \} = await supabase/);
    // On an error: no setRoles([]) — the retry runs first.
    expect(src).toMatch(/if \(rolesErr\) \{[\s\S]*?if \(attempt === 0\) \{\s+setTimeout\(\(\) => \{ void fetchUserData\(userId, 1\); \}, 1200\);\s+return;/);
    // Roles are set only from a read that answered.
    const branch = src.slice(src.indexOf('if (rolesErr) {'), src.indexOf('setRolesReady(true);', src.indexOf('if (rolesErr) {')));
    expect(branch).not.toMatch(/setRoles\(\[\]\)/);
    expect(branch).toMatch(/\} else \{\s+const allRoles = \(roleData \?\? \[\]\)\.map/);
  });
});
