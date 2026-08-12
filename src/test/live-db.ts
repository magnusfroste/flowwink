import { describe } from 'vitest';

/**
 * `describe` for suites that talk to a live Supabase instance.
 *
 * Runs when the instance is configured AND answered the startup probe (see
 * src/test/live-db-probe.ts); skips otherwise. Two skip reasons, both
 * environment facts rather than code defects:
 *   • unconfigured — no VITE_SUPABASE_URL/KEY (CI without a DB)
 *   • down — configured but the project did not answer
 *
 * Import this instead of hand-rolling `URL && KEY ? describe : describe.skip`,
 * which only covered the first case and let the second surface as `fetch
 * failed` assertion errors.
 */
export const LIVE_DB_STATE = () => process.env.FLOWWINK_LIVE_DB ?? 'unconfigured';

export const describeIfLiveDb = ((...args: Parameters<typeof describe>) => {
  if (LIVE_DB_STATE() === 'up') return describe(...args);
  return describe.skip(...args);
}) as typeof describe;
