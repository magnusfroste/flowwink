import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VatDisplay {
  /** True when a VAT rate is configured for the storefront. */
  enabled: boolean;
  /** Effective VAT rate in percent (e.g. 25). 0 when disabled. */
  ratePct: number;
  /** True = displayed prices include VAT (Swedish B2C baseline). */
  pricesIncludeVat: boolean;
  /** Ready-to-render label, e.g. "inkl. moms (25%)", or null when disabled. */
  label: string | null;
}

/**
 * Storefront VAT display setting (ecommerce module config in site_settings
 * key "modules"). Display + provenance only — no tax computation happens on
 * the storefront; create-checkout stamps the effective rate into order
 * metadata for the invoice side.
 *
 * Anon-safe: site_settings has a public SELECT policy ("Anyone can view site
 * settings"), so this is a plain PostgREST read that works for anonymous
 * visitors with the publishable key — no user JWT, no functions.invoke().
 */
export function useVatDisplay(): VatDisplay {
  const { data } = useQuery({
    queryKey: ['site-settings', 'modules', 'vat-display'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'modules')
        .maybeSingle();
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ecom = (data?.value as any)?.ecommerce ?? {};
      return {
        ratePct: typeof ecom.vatRatePct === 'number' ? ecom.vatRatePct : 0,
        pricesIncludeVat: ecom.pricesIncludeVat !== false,
      };
    },
  });

  const ratePct = data?.ratePct ?? 0;
  const pricesIncludeVat = data?.pricesIncludeVat ?? true;
  const enabled = ratePct > 0;

  return {
    enabled,
    ratePct,
    pricesIncludeVat,
    label: enabled
      ? pricesIncludeVat
        ? `inkl. moms (${ratePct}%)`
        : `exkl. moms (${ratePct}%)`
      : null,
  };
}
