/**
 * Who may run a skill — the decision, extracted so a test can RUN it.
 *
 * The matrix is the only dial (#102): admins run everything, other
 * authenticated users may run a skill iff their role is granted the skill's
 * OWNING module in role_module_access. Platform-owned and unmapped skills stay
 * admin-only.
 *
 * Why this is a function and not four lines inline: tonight's mutation audit
 * (2026-08-30) set `allowed = true` in the inline version and the
 * matrix-only-dial guardrail stayed green on all 15 assertions — it asserted
 * that the string `can_access_module` appeared in the file, not that the
 * decision denied anyone. An authorization guardrail that cannot see
 * fail-open is worse than none: it certifies the thing it never checked.
 *
 * Fail closed, deliberately and in every direction:
 *  - the RPC result must be STRICTLY `true`. A failed rpc gives `null`, and a
 *    null that is read as "no objection" is how authorization quietly inverts.
 *  - an unmapped skill (no owning module) denies rather than defaults open.
 *  - 'platform' is never grantable through the matrix; it is admin-only.
 */
export interface SkillAccessInput {
  /** service-role caller (internal platform call) */
  isServiceCaller: boolean;
  /** the caller holds the admin role */
  isAdmin: boolean;
  /** the module that owns this skill, if any */
  ownerModule: string | undefined | null;
  /** raw can_access_module() result — anything but boolean true is a denial */
  moduleGranted: unknown;
}

export interface SkillAccessDecision {
  allowed: boolean;
  /** why it was denied, in words an operator can act on */
  reason: string | null;
}

export function decideSkillAccess(input: SkillAccessInput): SkillAccessDecision {
  if (input.isServiceCaller) return { allowed: true, reason: null };
  if (input.isAdmin) return { allowed: true, reason: null };

  const owner = typeof input.ownerModule === 'string' ? input.ownerModule : '';
  if (!owner || owner === 'platform') {
    return { allowed: false, reason: 'this skill is platform-level and requires the admin role' };
  }
  if (input.moduleGranted === true) return { allowed: true, reason: null };

  return {
    allowed: false,
    reason: `your role is not granted the "${owner}" module — an admin can grant it under Users → Role Permissions`,
  };
}
