// Fetch ECB daily reference rates and upsert into public.exchange_rates.
// ECB publishes EUR-base rates as XML at:
//   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
// We parse, then for each rate insert (EUR -> quote, rate). If the deployment's
// base currency isn't EUR we ALSO derive (base -> quote) cross rates via EUR.
// Idempotent — UNIQUE (base, quote, rate_date) on the table.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceClient } from '../_shared/supabase-clients.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const ECB_URL =
  'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

interface RateRow {
  currency: string;
  rate: number;
}

function parseEcbXml(xml: string): { date: string; rates: RateRow[] } {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getServiceClient();

    // Fetch ECB feed
    const ecbRes = await fetch(ECB_URL, {
      headers: { 'User-Agent': 'FlowWink-FX/1.0' },
    });
    if (!ecbRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `ECB ${ecbRes.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const xml = await ecbRes.text();
    const { date, rates } = parseEcbXml(xml);
    if (rates.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No rates parsed from ECB feed' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Determine deployment's base currency
    const { data: baseRow } = await supabase
      .from('currencies')
      .select('code')
      .eq('is_base', true)
      .maybeSingle();
    const base = baseRow?.code ?? 'SEK';

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
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        rate_date: date,
        base_currency: base,
        rows_upserted: rows.length,
        source: 'ecb',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('fetch-fx-rates error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
