/**
 * Where this instance lives — one reader for one setting.
 *
 * `site_settings.general.siteUrl` is already the platform's answer to "what is
 * my public address": the contract renderer reads it for {{terms_url}} and
 * {{site_url}} (20260808180000, 20260808230000), and the email shell reads it
 * for the header link. The A2A bridge did not — it carried
 * `https://demo.flowwink.com` as a hardcoded literal into every inbound skill
 * call and into the agent's own system prompt, on every instance in the fleet.
 * That was wrong before the demo project was deleted (it named ONE instance for
 * all of them) and provably wrong after: the domain now NXDOMAINs.
 *
 * Returns null when unset. A caller must then omit the value rather than
 * substitute a guess — a link to nowhere is worse than no link, and the same
 * reasoning the terms renderer already applies ("a missing value must look like
 * words, not like markup").
 */

/** The narrowest shape this needs: something with `.from()`. Kept loose so
 *  every runtime that reads a setting can import it without dragging the
 *  generated client's builder chain into its types. */
export interface SettingsReader {
  from(table: string): unknown;
}

export async function resolveSiteUrl(supabase: SettingsReader): Promise<string | null> {
  try {
    const chain = supabase.from('site_settings') as {
      select(cols: string): {
        eq(col: string, val: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
      };
    };
    const { data } = await chain.select('value').eq('key', 'general').maybeSingle();
    const raw = (data as { value?: { siteUrl?: unknown } } | null)?.value?.siteUrl;
    const url = String(raw ?? '').trim().replace(/\/+$/, '');
    return url.length > 0 ? url : null;
  } catch {
    // An unreadable setting is "unknown", not "demo.flowwink.com". The caller
    // omits rather than guesses.
    return null;
  }
}
