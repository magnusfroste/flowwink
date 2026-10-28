/**
 * The business's home, read from site_settings — the one server-side reader.
 * A failed read is logged and falls back (the mail still goes out, in the
 * platform default), never thrown: formatting is not worth a lost invoice.
 */
import { HOME_SETTING_KEYS, dateInZone, resolveHome, type Home, type HomeSettingRows } from './home.ts';

interface SettingsReader {
  from(table: 'site_settings'): {
    select(cols: string): {
      in(col: string, values: readonly string[]): PromiseLike<{ data: Array<{ key: string; value: unknown }> | null; error: { message: string } | null }>;
    };
  };
}

export async function loadHome(supabase: unknown): Promise<Home> {
  const { data, error } = await (supabase as SettingsReader)
    .from('site_settings').select('key, value').in('key', HOME_SETTING_KEYS);
  if (error) console.warn('[home] could not read the locale settings, using the platform default:', error.message);
  const rows: HomeSettingRows = {};
  for (const r of data ?? []) (rows as Record<string, unknown>)[r.key] = r.value;
  return resolveHome(rows);
}

/**
 * loadHome, remembered for a minute per isolate — for handlers that need the
 * home currency on a hot path (an agent creating twenty rows). A settings
 * change is seen within the minute.
 */
let cached: { at: number; home: Promise<Home> } | null = null;
export function loadHomeCached(supabase: unknown, ttlMs = 60_000): Promise<Home> {
  const now = Date.now();
  if (!cached || now - cached.at > ttlMs) cached = { at: now, home: loadHome(supabase) };
  return cached.home;
}

/** Today on the business's clock (YYYY-MM-DD) — the default date of a document. */
export async function businessToday(supabase: unknown): Promise<string> {
  return dateInZone((await loadHomeCached(supabase)).timeZone);
}
