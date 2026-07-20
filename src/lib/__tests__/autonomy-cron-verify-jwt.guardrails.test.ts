/**
 * Guardrail: autonomy-cron targets must be verify_jwt = false.
 *
 * The FlowPilot autonomous loop (heartbeat / daily-briefing / learn) is driven
 * by pg_cron jobs created by the `update-autonomy-cron` edge function. That
 * function embeds whatever `SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY` it
 * finds into the cron's `Authorization: Bearer <key>` header.
 *
 * On instances migrated to the **new API-key format**, that env var holds an
 * opaque `sb_publishable_…` key — which is NOT a JWT. If the target function is
 * deployed with the default `verify_jwt = true`, the Supabase gateway rejects
 * the call with `401 UNAUTHORIZED_INVALID_JWT_FORMAT` *before the function body
 * runs*. pg_net still reports the http_post as "succeeded" (it only returns a
 * request_id), so the failure is invisible — the cron looks healthy while the
 * agent silently never runs.
 *
 * This is exactly what happened on www.flowwink.com (2026-06-09): heartbeat +
 * briefing were never added to config.toml, so they ran verify_jwt=true and had
 * not produced a single `heartbeat` activity row since the key migration (~May 9),
 * while `flowpilot-learn` (which WAS in config.toml) kept working.
 *
 * Invariant: any function reachable via `functions/v1/<name>` from the
 * autonomy-cron writer MUST have `verify_jwt = false` in config.toml, because it
 * is called with a (possibly non-JWT) publishable key from pg_cron.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/** Parse config.toml → set of function names that have verify_jwt = false. */
function verifyJwtFalseSet(): Set<string> {
  const toml = readFileSync('supabase/config.toml', 'utf8');
  const set = new Set<string>();
  // Match `[functions.<name>]` followed (allowing blank/comment lines) by
  // `verify_jwt = false` before the next section header.
  const re = /\[functions\.([a-z0-9-]+)\]([\s\S]*?)(?=\n\[|$)/g;
  for (const m of toml.matchAll(re)) {
    if (/verify_jwt\s*=\s*false/.test(m[2])) set.add(m[1]);
  }
  return set;
}

/** Extract the function names the autonomy-cron writer targets via functions/v1/<name>. */
function autonomyCronTargets(): string[] {
  const src = readFileSync(
    'supabase/functions/_shared/handlers/update-autonomy-cron.ts',
    'utf8',
  );
  const targets = new Set<string>();
  for (const m of src.matchAll(/functions\/v1\/([a-z0-9-]+)/g)) targets.add(m[1]);
  return [...targets];
}

describe('autonomy-cron targets are verify_jwt = false', () => {
  const noJwt = verifyJwtFalseSet();
  const targets = autonomyCronTargets();

  it('finds the expected autonomy-cron targets', () => {
    // Sanity: the writer must reference the known loop functions. If this
    // breaks, the extraction regex (or the writer) changed — revisit before
    // trusting the assertion below. (The daily briefing moved off direct cron
    // to automation-dispatcher in 2026-07, so it is no longer a target here.)
    expect(targets).toEqual(
      expect.arrayContaining([
        'flowpilot-heartbeat',
        'flowpilot-lifecycle',
      ]),
    );
  });

  it('every cron-driven flowpilot function bypasses JWT verification', () => {
    const missing = targets.filter((fn) => !noJwt.has(fn));
    expect(
      missing,
      `These functions are scheduled by update-autonomy-cron with a Bearer ` +
        `publishable key but are missing \`[functions.<name>] verify_jwt = false\` ` +
        `in supabase/config.toml.\nWith the new sb_publishable_ key format the ` +
        `gateway will 401 them and the autonomous loop silently never runs:\n` +
        missing.map((m) => `  • ${m}`).join('\n'),
    ).toEqual([]);
  });
});
