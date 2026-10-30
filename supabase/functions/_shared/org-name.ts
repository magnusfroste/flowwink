/**
 * The name a customer-facing mail is sent in — the business's, never the
 * platform's.
 *
 * Eleven mail builders (invoice, quote, booking, order, reminders, meeting
 * polls, signing receipts) each read their own guess: `general.site_name`,
 * `general.siteName` — keys no settings screen writes. So every instance whose
 * general row lacked them (Nordbrygg, 2026-10-30) sent "Invoice 1042 from
 * FlowWink" and "Our Website" to its own customers. The name an operator sets
 * lives in Branding (organizationName) or Business Identity (company_name);
 * this reads those first, the legacy keys after, and the site's host last,
 * so a mail never claims to come from the platform.
 *
 * Pure `orgNameFrom` for tests; `loadOrgName` reads the three rows once.
 */

type Row = Record<string, unknown> | null | undefined;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function hostOf(url: string): string {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function orgNameFrom(rows: { branding?: Row; company_profile?: Row; general?: Row }): string {
  const b = rows.branding ?? {};
  const p = rows.company_profile ?? {};
  const g = rows.general ?? {};
  return str(b.organizationName)
    || str(p.company_name)
    || str(g.site_name)
    || str(g.siteName)
    || str(b.adminName)
    || hostOf(str(p.website))
    || hostOf(str(g.siteUrl));
}

interface SettingsReader {
  from(table: 'site_settings'): {
    select(cols: string): {
      in(col: string, keys: string[]): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

/**
 * The business's name, or `fallback` only when nothing at all is configured.
 * Takes any Supabase client — typed or not — and reads it as a settings reader.
 */
export async function loadOrgName(client: unknown, fallback: string): Promise<string> {
  const supabase = client as SettingsReader;
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['branding', 'company_profile', 'general']);
  if (error) {
    console.warn('[org-name] settings unreadable — mail goes out under the fallback name:', error.message);
    return fallback;
  }
  const byKey: Record<string, Row> = {};
  for (const r of (data ?? []) as Array<{ key: string; value: Row }>) byKey[r.key] = r.value;
  return orgNameFrom({ branding: byKey.branding, company_profile: byKey.company_profile, general: byKey.general }) || fallback;
}
