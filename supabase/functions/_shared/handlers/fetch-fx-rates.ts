// fetch_ecb_rates — internal skill handler.
//
// Fetch ECB daily reference rates and upsert into public.exchange_rates.
// ECB publishes EUR-base rates as XML at:
//   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
// We parse, then for each rate insert (EUR -> quote, rate). If the deployment's
// base currency isn't EUR we ALSO derive (base -> quote) cross rates via EUR.
// Idempotent — UNIQUE (base, quote, rate_date) on the table.
//
// Moved from the standalone `fetch-fx-rates` edge function (edge-surface
// refactor B1a, wave 1). Response objects unchanged.

import { loadHomeCached } from '../locale/load-home.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ECB_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

interface RateRow {
  currency: string;
  rate: number;
}

export function parseEcbXml(xml: string): { date: string; rates: RateRow[] } {
  // ECB uses single quotes in attributes; accept both.
  const dateMatch = xml.match(/<Cube time=['"](\d{4}-\d{2}-\d{2})['"]/);
  const date = dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);
  const rates: RateRow[] = [];
  const regex = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(xml)) !== null) {
    const r = parseFloat(m[2]);
    if (Number.isFinite(r) && r > 0) rates.push({ currency: m[1], rate: r });
  }
  return { date, rates };
}

export async function executeFetchFxRates(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  try {
    // Fetch ECB feed
    const ecbRes = await fetch(ECB_URL, {
      headers: { 'User-Agent': 'FlowWink-FX/1.0' },
    });
    if (!ecbRes.ok) {
      return { success: false, error: `ECB ${ecbRes.status}` };
    }
    const xml = await ecbRes.text();
    const { date, rates } = parseEcbXml(xml);
    if (rates.length === 0) {
      return { success: false, error: 'No rates parsed from ECB feed' };
    }

    // Determine deployment's base currency
    const { data: baseRow } = await supabase
      .from('currencies')
      .select('code')
      .eq('is_base', true)
      .maybeSingle();
    // No base currency marked in the catalog: the business's.
    const base = baseRow?.code ?? (await loadHomeCached(supabase)).currency;

    // Allowed quote currencies (only ones in our catalog)
    const { data: enabled } = await supabase
      .from('currencies')
      .select('code')
      .eq('enabled', true);
    const allowed = new Set<string>([
      'EUR',
      ...(enabled?.map((r: { code: string }) => r.code) ?? []),
    ]);

    // Build rows: EUR -> quote (raw)
    const rows: Array<{
      base_currency: string;
      quote_currency: string;
      rate: number;
      rate_date: string;
      source: string;
    }> = [];

    for (const r of rates) {
      if (!allowed.has(r.currency)) continue;
      rows.push({
        base_currency: 'EUR',
        quote_currency: r.currency,
        rate: r.rate,
        rate_date: date,
        source: 'ecb',
      });
    }

    // Cross rates from base if base != EUR
    if (base !== 'EUR') {
      const eurToBase = rates.find((r) => r.currency === base)?.rate;
      if (eurToBase && eurToBase > 0) {
        // base -> EUR
        rows.push({
          base_currency: base,
          quote_currency: 'EUR',
          rate: 1 / eurToBase,
          rate_date: date,
          source: 'ecb',
        });
        // base -> each other quote
        for (const r of rates) {
          if (r.currency === base || !allowed.has(r.currency)) continue;
          rows.push({
            base_currency: base,
            quote_currency: r.currency,
            rate: r.rate / eurToBase,
            rate_date: date,
            source: 'ecb',
          });
        }
      }
    }

    // Upsert
    const { error } = await supabase
      .from('exchange_rates')
      .upsert(rows, { onConflict: 'base_currency,quote_currency,rate_date' });

    if (error) {
      console.error('Upsert error:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      rate_date: date,
      base_currency: base,
      rows_upserted: rows.length,
      source: 'ecb',
    };
  } catch (err) {
    console.error('fetch-fx-rates error:', err);
    return { success: false, error: (err as Error).message };
  }
}
