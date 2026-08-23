import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { consentAllows, getConsent, type VisitorConsent } from '@/lib/visitor-consent';

/**
 * One reading of "does this instance collect consent?", shared by the cookie
 * banner and by everything that measures.
 *
 * Why a hook and not a `hasConsent()` call: stored consent alone cannot answer
 * whether something may be measured. An operator with no consent obligation
 * turns the banner off; then nothing ever writes a consent record and
 * `hasConsent` says no forever. The decision needs BOTH halves — the stored
 * answer and whether the question is asked at all. See `@/lib/visitor-consent`
 * for the rule (`consentAllows`).
 *
 * `ready` is the third answer, and the load-bearing one. While the setting is
 * in flight we do not know whether consent is being collected, and both
 * guesses are real failures: guess "gated" and a banner-less instance loses its
 * first page view; guess "free" and an EU instance leaks a measurement before
 * the banner is even up. So nothing is decided until the setting has landed.
 * That is not a delay to apologise for — it is the difference between
 * measuring and guessing.
 */

export interface ConsentCategoryConfig {
  label: string;
  description: string;
  required?: boolean;
}

export interface CookieConsentBannerText {
  title: string;
  description: string;
  customize: string;
  acceptAll: string;
  essentialOnly: string;
  preferencesTitle: string;
  back: string;
  saveSelection: string;
}

export interface CookieConsentV2Settings {
  enabled: boolean;
  categories: {
    essential: ConsentCategoryConfig;
    analytics: ConsentCategoryConfig;
    marketing: ConsentCategoryConfig;
  };
  /** Banner copy — every field optional, English defaults live in CookieBanner. */
  text?: Partial<CookieConsentBannerText>;
}

/**
 * ONE query key for ONE setting. The banner and the measurement gate must not
 * hold two opinions about whether the banner is on, and must not cost two
 * network calls to say the same thing.
 */
export const COOKIE_CONSENT_QUERY_KEY = ['site-settings', 'cookie_consent_v2'] as const;

/**
 * Is the banner enabled, i.e. is consent actually being collected?
 *
 * The SAME predicate `CookieBanner` renders on, deliberately: "no banner is
 * shown" and "nothing is collected here" must never be able to drift apart.
 * No stored row means the platform default, which is a banner.
 */
export function bannerIsEnabled(settings: CookieConsentV2Settings | null | undefined): boolean {
  if (settings == null) return true;
  return Boolean(settings.enabled);
}

/**
 * Reads `site_settings.cookie_consent_v2`. Returns the raw row value (or null
 * when there is none) plus `ready`, which turns true once the query has
 * settled — success OR error. An unreachable setting must not freeze
 * measurement forever; it falls back to the platform default (banner on),
 * which is the conservative half of the rule.
 */
export function useCookieConsentSettings(): {
  settings: CookieConsentV2Settings | null;
  ready: boolean;
} {
  const query = useQuery({
    queryKey: COOKIE_CONSENT_QUERY_KEY,
    queryFn: async () => {
      const { data } = await supabase
        .from('site_settings').select('value').eq('key', 'cookie_consent_v2').maybeSingle();
      return (data?.value as unknown as CookieConsentV2Settings) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    settings: query.data ?? null,
    // 'pending' is the only status where the answer is genuinely unknown.
    ready: query.status !== 'pending',
  };
}

export interface VisitorConsentDecision {
  /** May site analytics (own page views, GA4) run? */
  analytics: boolean;
  /** May advertising/marketing tags (Meta Pixel) run? */
  marketing: boolean;
  /** False until the banner setting is known. Decide nothing while false. */
  ready: boolean;
}

/**
 * The measurement gate every consumer should use.
 *
 * Re-evaluates when the visitor answers the banner (`cookie-consent-changed`)
 * or changes it in another tab (`storage`), so a later "accept" starts the
 * tags without a reload.
 */
export function useVisitorConsent(): VisitorConsentDecision {
  const { settings, ready } = useCookieConsentSettings();
  const [stored, setStored] = useState<VisitorConsent | null>(() => getConsent());

  useEffect(() => {
    const read = () => setStored(getConsent());
    window.addEventListener('cookie-consent-changed', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('cookie-consent-changed', read);
      window.removeEventListener('storage', read);
    };
  }, []);

  return useMemo(() => {
    if (!ready) return { analytics: false, marketing: false, ready: false };
    const env = { collecting: bannerIsEnabled(settings), consent: stored };
    return {
      analytics: consentAllows('analytics', env),
      marketing: consentAllows('marketing', env),
      ready: true,
    };
  }, [ready, settings, stored]);
}
