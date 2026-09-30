/**
 * Business Identity grounding gate — frontend half.
 *
 * Outward-facing generation grounds in identity (the grounding doctrine). An
 * objective that produces public content (the blog/social/newsletter class)
 * declares `constraints.requires_business_identity: true` and holds — status
 * 'paused' with a visible hold reason — until site_settings.company_profile
 * carries the core a content skill cannot write without: company_name plus at
 * least one service. A fresh install that skipped this gate published three
 * generic English blog posts before any identity existed (Restagård
 * 2026-08-27).
 *
 * Three rails enforce it, all on this predicate's logic:
 *   1. Seeding (flowpilot-module.ts) — gated starter objectives are born
 *      'paused' when the profile is incomplete.
 *   2. Wake (wake_identity_gated_objectives trigger on site_settings) — flips
 *      them to 'active' the moment a complete profile is written, whichever
 *      surface wrote it.
 *   3. Runtime belt (partitionByIdentityGate in _shared/pilot/reason.ts) —
 *      holds a gated objective that arrives 'active' anyway.
 *
 * Mirrors hasCoreBusinessIdentity in
 * supabase/functions/_shared/domains/business-identity-block.ts — two runtimes
 * (Vite frontend / Deno edge), one contract, parity pinned by
 * src/lib/__tests__/objective-identity-gate.guardrails.test.ts.
 */

/** Constraint key an objective declares to opt into the gate. */
export const REQUIRES_BUSINESS_IDENTITY = 'requires_business_identity';

/** Machine-readable hold reason written to progress.hold.reason (the wake
 * trigger matches on it, so a manually paused objective is never auto-woken). */
export const IDENTITY_HOLD_REASON = 'awaiting_business_identity';

/** Legacy service shapes (string, Record<name, description>) count — a profile
 * nobody has re-saved must not read as absent. */
export function hasCoreBusinessIdentity(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return false;
  const cp = profile as Record<string, unknown>;
  if (!(typeof cp.company_name === 'string' && cp.company_name.trim() !== '')) return false;

  const services = cp.services;
  if (Array.isArray(services)) {
    return services.some((s) =>
      typeof s === 'string'
        ? s.trim() !== ''
        : !!s && typeof s === 'object' &&
          Object.values(s as Record<string, unknown>).some((v) => typeof v === 'string' && v.trim() !== ''),
    );
  }
  if (typeof services === 'string') return services.trim() !== '';
  // Legacy object form: { "Service A": "desc" }
  if (services && typeof services === 'object') return Object.keys(services).length > 0;
  return false;
}

/** True for an objective the UI should explain as "waiting for Business
 * Identity" — paused by the gate, not by a person. */
export function isHeldForBusinessIdentity(objective: {
  status: string;
  progress: Record<string, unknown>;
}): boolean {
  if (objective.status !== 'paused') return false;
  const hold = objective.progress?.hold as Record<string, unknown> | undefined;
  return hold?.reason === IDENTITY_HOLD_REASON;
}
