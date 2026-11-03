/**
 * MFA for staff — the one rule, in one place, read by the admin shell (which
 * screen to show) and mirrored by session_mfa_ok() in the database (what a
 * session may read). Two readers, one verdict, so the screen can never claim
 * something the database refuses.
 *
 *   challenge — the person enrolled a factor and this session has not proved
 *               it (aal1): ask for the code before anything else.
 *   enroll    — the instance requires MFA of its staff (security dial) and this
 *               staff member has no factor yet: the enrollment screen, nothing
 *               else, until it is done.
 *   none      — carry on.
 *
 * Customers are never gated here: MFA is for the people who run the business.
 */
import type { AppRole } from '@/types/cms';

export type AssuranceLevel = 'aal1' | 'aal2';

export interface MfaState {
  /** The level this session has proved. */
  currentLevel: AssuranceLevel | null;
  /** The level the account can reach (aal2 once a factor is verified). */
  nextLevel: AssuranceLevel | null;
  /** Verified TOTP factors on the account. */
  verifiedFactors: number;
  /** True once the two calls above have answered for this session. */
  loaded: boolean;
}

export const EMPTY_MFA_STATE: MfaState = { currentLevel: null, nextLevel: null, verifiedFactors: 0, loaded: false };

export type MfaGate = 'none' | 'challenge' | 'enroll';

export function isStaff(roles: readonly AppRole[]): boolean {
  return roles.some((r) => r !== 'customer');
}

export function mfaGateFor(input: { roles: readonly AppRole[]; mfa: MfaState; requiredForStaff: boolean }): MfaGate {
  const { roles, mfa, requiredForStaff } = input;
  if (!mfa.loaded) return 'none';
  if (!isStaff(roles)) return 'none';
  const enrolled = mfa.verifiedFactors > 0 || mfa.nextLevel === 'aal2';
  if (enrolled && mfa.currentLevel !== 'aal2') return 'challenge';
  if (!enrolled && requiredForStaff) return 'enroll';
  return 'none';
}

/** The apps the enrollment screen names — TOTP is a standard, any of them works. */
export const AUTHENTICATOR_APPS = ['Google Authenticator', 'Microsoft Authenticator', '1Password', 'Bitwarden', 'Apple Passwords'] as const;
