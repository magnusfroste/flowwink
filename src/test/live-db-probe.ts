/**
 * Global setup: is the live Supabase instance actually reachable?
 *
 * Five test files exercise real RPCs against a live instance — they are the
 * only tests that can prove a SECURITY DEFINER function behaves, so they earn
 * their keep. They already skip when the env vars are absent (CI without a DB).
 *
 * What they did NOT handle is the case that keeps happening: env vars PRESENT,
 * instance DOWN. Then `fetch failed` surfaces as an assertion failure and the
 * suite goes red for a reason that has nothing to do with the code under
 * review. That happened three times on 2026-08-12 alone, the last time
 * blocking a security fix — a red build nobody can act on teaches everyone to
 * ignore red builds.
 *
 * So probe once, before any test runs, and publish the verdict as an env flag
 * the suites can branch on synchronously. Unreachable → those suites report as
 * SKIPPED (with the reason on stdout), never as failed. Reachable → they run
 * exactly as before, and a genuine RPC regression still fails the build.
 */
export default async function setup() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    process.env.FLOWWINK_LIVE_DB = 'unconfigured';
    console.log('[live-db] no VITE_SUPABASE_URL/KEY — live-DB suites will skip.');
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Any authenticated PostgREST root response proves the project answers;
    // we deliberately do not care WHAT it says, only that something replies.
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (res.status >= 500) throw new Error(`instance returned ${res.status}`);
    process.env.FLOWWINK_LIVE_DB = 'up';
    console.log(`[live-db] ${new URL(url).host} reachable — live-DB suites will run.`);
  } catch (e) {
    process.env.FLOWWINK_LIVE_DB = 'down';
    console.log(
      `[live-db] ${url} unreachable (${e instanceof Error ? e.message : e}) — ` +
        'live-DB suites will SKIP. This is an environment fact, not a code failure.',
    );
  } finally {
    clearTimeout(timer);
  }
}
