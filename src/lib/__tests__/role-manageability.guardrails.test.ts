import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A user account created without signup metadata → the trigger's fail-closed
 * path assigned 'customer'; an admin then granted 'sales'. Result: the panel
 * said "Customer" forever (primary role = FIRST ROW, and the customer row is
 * always oldest) and the role could not be removed (the manage-roles popover
 * simply did not list it). A role that can be held must be manageable, and
 * the displayed role must be the most meaningful one — not the oldest row.
 */

describe('every holdable role is manageable', () => {
  const page = readFileSync(resolve(__dirname, '../../pages/admin/UsersPage.tsx'), 'utf-8');

  it("the manage-roles list includes 'customer'", () => {
    const line = page.split('\n').find((l) => l.includes('ASSIGNABLE_ROLES: AppRole[]'));
    expect(line).toBeDefined();
    expect(line).toContain("'customer'");
  });
});

describe('the displayed role is the most meaningful one', () => {
  const auth = readFileSync(resolve(__dirname, '../../hooks/useAuth.tsx'), 'utf-8');

  it('customer is only primary when it is the only role', () => {
    // Not "first row": row order is insertion order, and the fail-closed
    // customer row always predates a granted staff role. The rule lives in ONE
    // exported function since 2026-08-13 — the bug shipped twice precisely
    // because two copies of the derivation existed. Behavior is pinned in
    // src/hooks/__tests__/primary-role.guardrails.test.ts; this pins that both
    // call sites actually use it.
    expect(auth).toMatch(/setRole\(primaryRole\(/);
    expect(auth).toMatch(/effectivePrimary: AppRole \| null = primaryRole\(/);
  });
});
