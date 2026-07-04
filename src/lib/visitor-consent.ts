/**
 * Cookie consent v2 — granular categories.
 *
 * Categories: essential (always on), analytics, marketing.
 * Reads/writes localStorage. Emits `cookie-consent-changed` CustomEvent
 * with the full consent object as detail, so listeners (page-view tracker,
 * marketing pixels) can react without polling.
 *
 * Backward-compat: legacy `cookie-consent=accepted|rejected` is honored on
 * first read and upgraded to the v2 shape.
 */

export type ConsentCategory = 'essential' | 'analytics' | 'marketing';

export interface VisitorConsent {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
}

const KEY_V2 = 'cookie-consent-v2';
const KEY_V1 = 'cookie-consent';

const DEFAULT: VisitorConsent = {
  essential: true,
  analytics: false,
  marketing: false,
  timestamp: new Date(0).toISOString(),
};

function safeRead(): string | null {
  try { return localStorage.getItem(KEY_V2); } catch { return null; }
}

function safeReadLegacy(): 'accepted' | 'rejected' | null {
  try {
    const v = localStorage.getItem(KEY_V1);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch { return null; }
}

export function getConsent(): VisitorConsent | null {
  const raw = safeRead();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as VisitorConsent;
      return { ...DEFAULT, ...parsed, essential: true };
    } catch { /* ignore */ }
  }
  const legacy = safeReadLegacy();
  if (legacy === 'accepted') {
    return { essential: true, analytics: true, marketing: true, timestamp: new Date().toISOString() };
  }
  if (legacy === 'rejected') {
    return { essential: true, analytics: false, marketing: false, timestamp: new Date().toISOString() };
  }
  return null;
}

export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'essential') return true;
  const c = getConsent();
  return c ? Boolean(c[category]) : false;
}

export function setConsent(partial: Partial<Omit<VisitorConsent, 'essential' | 'timestamp'>>): VisitorConsent {
  const current = getConsent() ?? DEFAULT;
  const next: VisitorConsent = {
    essential: true,
    analytics: partial.analytics ?? current.analytics,
    marketing: partial.marketing ?? current.marketing,
    timestamp: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(next));
    // Clear legacy key to avoid drift.
    localStorage.removeItem(KEY_V1);
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: next }));
  } catch { /* ignore */ }
  return next;
}

export function acceptAll(): VisitorConsent {
  return setConsent({ analytics: true, marketing: true });
}

export function rejectAll(): VisitorConsent {
  return setConsent({ analytics: false, marketing: false });
}
