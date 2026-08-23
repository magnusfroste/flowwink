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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHICH FUNCTION GATES MEASUREMENT: `consentAllows`, never `hasConsent`.
 * ────────────────────────────────────────────────────────────────────────────
 * `hasConsent` answers "did this visitor store a yes?" — nothing more. Stored
 * nothing means no, forever. That is the right answer only on an instance that
 * actually ASKS. FlowWink is self-hosted worldwide: an operator who has no
 * consent obligation turns the banner off, and then nothing ever writes a
 * consent record — so `hasConsent` says no to a question that was never put,
 * and the whole instance measures zero without a single error anywhere.
 *
 * The rule is `consentAllows(category, { collecting })`: respect consent where
 * consent is actually collected. Banner on → wait for the visitor's answer.
 * Banner off → there is no answer to respect, so measure.
 *
 * Consumers must call `consentAllows` (in practice via the `useVisitorConsent`
 * hook, which also supplies `collecting` and a `ready` flag). `hasConsent`
 * stays exported for backward compatibility only.
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

/**
 * Raw storage question: did this visitor store a yes for `category`?
 *
 * NOT the measurement gate. No stored record answers "no" here, which is wrong
 * on any instance that never asks (banner disabled) — see the file header.
 * Use {@link consentAllows} to decide whether something may be measured.
 */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'essential') return true;
  const c = getConsent();
  return c ? Boolean(c[category]) : false;
}

/** Where the visitor is: is this instance actually collecting consent? */
export interface ConsentEnvironment {
  /**
   * True when the cookie banner is enabled, i.e. the visitor is (or will be)
   * asked. Must be the SAME condition the banner renders on — if no banner is
   * shown, nothing can ever be collected, and `collecting` must be false.
   */
  collecting: boolean;
  /**
   * Stored consent to judge against. Defaults to what is in localStorage;
   * pass it explicitly to decide against a known record (tests, SSR, a hook
   * that already holds the value).
   */
  consent?: VisitorConsent | null;
}

/**
 * THE measurement gate. Respect consent where consent is actually collected.
 *
 * | banner (`collecting`) | stored consent | result                          |
 * | --------------------- | -------------- | ------------------------------- |
 * | on                    | yes            | allowed — the visitor said yes  |
 * | on                    | no / none      | blocked — asked, not answered   |
 * | off                   | anything       | allowed — nothing was ever asked|
 *
 * `essential` is always allowed. Pure: no React, no network, no side effects.
 */
export function consentAllows(category: ConsentCategory, env: ConsentEnvironment): boolean {
  if (category === 'essential') return true;
  // Nothing is asked on this instance, so there is no answer to respect.
  // Exporting EU consent bureaucracy to a deployment that has none is not
  // privacy — it is silence where the operator expected measurement.
  if (!env.collecting) return true;
  const c = env.consent === undefined ? getConsent() : env.consent;
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
