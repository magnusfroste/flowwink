import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ASSIGNABLE_WORK_ROLES, ROLE_LABELS, type AppRole } from '@/types/cms';

/**
 * Guardrail: SHADOW ROLE LISTS — rollsvepet #102, app-lagret.
 *
 * The matrix (role_module_access, read through can_access_module /
 * useModuleAccess) is the only dial. Every hardcoded role list that lives
 * beside it drifts, and it always drifts the same direction: a role the
 * operator granted a module still meets a closed door — or, worse, an empty
 * list, which is a denial that never announces itself.
 *
 * Three concrete regressions this pins:
 *   1. `subscriptions` gated cancel/resume on a literal ["admin","approver"],
 *      so a role granted the subscriptions module saw the buttons and got
 *      "Insufficient permissions".
 *   2. The two approval screens each carried their OWN shorter role list (3
 *      roles on one, 7 on the other), making warehouse/marketing/purchasing/
 *      projects unroutable although `approval_rules.required_role` is typed
 *      `app_role` and resolve_approval() checks has_role() against whatever is
 *      stored.
 *   3. A role added to AppRole later must not be born unroutable — the
 *      canonical list is derived, not retyped.
 */

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('shadow role lists (matrix is the only dial)', () => {
  it('no edge function authorizes with a hardcoded role array', () => {
    const files = walk(join(root, 'supabase/functions'));
    // A membership test against a literal array of role names, e.g.
    //   ["admin", "approver"].includes(r.role)
    // Authorization belongs to _shared/edge-auth.ts (requireServiceOrModule /
    // requireServiceOrStaff / requireServiceOrRole) or to can_access_module().
    const shadow = /\[\s*["'](?:admin|approver|writer)["'][^\]]*\]\s*\.\s*includes\s*\(/;
    const offenders = files.filter((f) => {
      if (f.endsWith('_shared/edge-auth.ts')) return false;
      return shadow.test(readFileSync(f, 'utf8'));
    });
    expect(
      offenders.map((f) => f.slice(root.length + 1)),
      '\nHardcoded role list used for authorization in an edge function.\n' +
        'Use requireServiceOrModule(req, supabase, "<moduleId>") from _shared/edge-auth.ts\n' +
        'so the Role Permissions matrix is what decides.',
    ).toEqual([]);
  });

  it('the approval screens pick roles from the canonical list, not a literal', () => {
    for (const rel of [
      'src/pages/admin/ApprovalsPage.tsx',
      'src/pages/admin/ApprovalChainsPage.tsx',
    ]) {
      const src = readFileSync(join(root, rel), 'utf8');
      expect(src, `${rel} must import ASSIGNABLE_WORK_ROLES`).toContain(
        'ASSIGNABLE_WORK_ROLES',
      );
      // No re-typed role catalogue beside the canonical one.
      expect(
        /\[\s*'admin',\s*'approver',\s*'writer'/.test(src),
        `${rel} still carries a literal role list`,
      ).toBe(false);
    }
  });

  it('ASSIGNABLE_WORK_ROLES covers every staff role in the catalogue', () => {
    const catalogue = (Object.keys(ROLE_LABELS) as AppRole[]).filter(
      (r) => r !== 'customer',
    );
    const assignable = new Set<string>(ASSIGNABLE_WORK_ROLES);
    const missing = catalogue.filter((r) => !assignable.has(r));
    expect(
      missing,
      '\nA staff role exists in ROLE_LABELS but cannot be assigned work.\n' +
        'Add it to ASSIGNABLE_WORK_ROLES in src/types/cms.ts — a role that\n' +
        'cannot be named as an approver is granted on paper only.',
    ).toEqual([]);
    expect(assignable.has('customer')).toBe(false);
  });
});
