/**
 * The business's home, read from site_settings — the one server-side reader.
 * A failed read is logged and falls back (the mail still goes out, in the
 * platform default), never thrown: formatting is not worth a lost invoice.
 */
import { HOME_SETTING_KEYS, resolveHome, type Home, type HomeSettingRows } from './home.ts';

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
