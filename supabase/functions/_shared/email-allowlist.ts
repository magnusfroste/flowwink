/**
 * email-allowlist — the guard that makes a pilot phase safe by construction.
 *
 * Optic Tunnels is a live company running FlowWink in development. The rule is
 * "no invoice may reach any customer inbox; test only against *@liteit.se".
 * Enforced by care, that rule fails the first time someone forgets. Enforced
 * here, it cannot: the recipient never leaves the building.
 *
 * This is a deliberate inversion of the suppression list next to it.
 * Suppressions are a DENY list — everything sends unless named. An allowlist is
 * the opposite, and it is the only shape that is safe while a real company's
 * data sits in a system nobody has finished testing.
 *
 * FAIL CLOSED. If the setting cannot be read, nothing sends. Sending an email
 * is the side effect you cannot take back; not sending one is a retry. The same
 * reasoning as the resumption guard's idempotent-only allowlist: when the
 * failure modes are asymmetric, the default follows the recoverable one.
 *
 * OFF unless switched on. `enabled: false` or a missing setting means no
 * filtering at all, so instances in production are untouched by this file
 * existing.
 */

export interface EmailAllowlist {
  enabled: boolean;
  domains: string[];
  addresses: string[];
  reason?: string;
  /**
   * Which sends the guard applies to.
   *   'all'             — every outbound mail (the original behaviour, and the
   *                       default when the field is absent, because widening a
   *                       safety rail must never happen by upgrade)
   *   'customer_facing' — everything EXCEPT the sends whose recipient is a
   *                       colleague by construction (see INTERNAL_SOURCES)
   * The risk this guard exists for is mailing a real CUSTOMER by accident.
   * Blocking a colleague invitation protects nobody and trains people to switch
   * the guard off, which is how a rail stops existing.
   */
  scope?: 'all' | 'customer_facing';
}

/**
 * Sends whose recipient is someone inside the company by construction. Kept as
 * a short EXEMPT list rather than a list of guarded sources on purpose: a new
 * sender must be guarded by default. A list of what to guard fails OPEN the day
 * someone adds an invoice mailer and forgets to register it.
 */
export const INTERNAL_SOURCES = new Set([
  'invite-colleague',
  'invite-employee',
  'colleague-password-reset',
  'platform-test',
  'run-platform-tests',
]);

export interface AllowlistDecision {
  /** Recipients that may be sent to. */
  allowed: string[];
  /** Recipients withheld, with the reason a human can act on. */
  blocked: Array<{ address: string; reason: string }>;
  /** True when the allowlist was consulted and is filtering. */
  active: boolean;
  /** Present when the decision was made by failing closed. */
  error?: string;
  note?: string;
}

const SETTING_KEY = 'email_allowlist';

/**
 * The narrowest shape this guard needs from a Supabase client: something with a
 * `from`. Declared this loosely on purpose — matching the generic client's full
 * builder chain structurally makes the type checker recurse until it gives up
 * (TS2589), and this module has no business knowing that chain. It is
 * dependency-free so every runtime that sends mail can import it.
 */
export interface SettingsReader {
  from(table: string): unknown;
}

interface MaybeSingleResult {
  data: unknown;
  error: { message?: string } | null;
}

async function readSetting(supabase: SettingsReader, key: string): Promise<MaybeSingleResult> {
  const chain = supabase.from('site_settings') as {
    select(cols: string): {
      eq(col: string, val: string): { maybeSingle(): PromiseLike<MaybeSingleResult> };
    };
  };
  return await chain.select('value').eq('key', key).maybeSingle();
}

function bareAddress(value: string): string {
  const raw = String(value ?? '').trim();
  const angle = raw.match(/<([^>]+)>/);
  return (angle ? angle[1] : raw).trim();
}

function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at === -1 ? '' : address.slice(at + 1).toLowerCase();
}

/**
 * Decide, for one send, who may receive it.
 *
 * `supabase` is any client with a `.from()` — typed loosely so this module
 * stays dependency-free and importable from every runtime that needs it.
 */
export async function filterRecipients(
  supabase: SettingsReader,
  recipients: string[],
  source?: string | null,
): Promise<AllowlistDecision> {
  const addresses = recipients.map(bareAddress).filter((r) => r.length > 0);

  let row: { value?: unknown } | null = null;
  try {
    const { data, error } = await readSetting(supabase, SETTING_KEY);
    if (error) throw new Error(error.message ?? 'unknown error');
    row = (data ?? null) as { value?: unknown } | null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      allowed: [],
      blocked: addresses.map((a) => ({ address: a, reason: 'allowlist unreadable' })),
      active: true,
      error: `Could not read the ${SETTING_KEY} setting (${msg}), so nothing was sent. This guard fails CLOSED on purpose: an email that should not have gone out cannot be recalled, but a send that did not happen can be retried.`,
    };
  }

  const cfg = (row?.value ?? null) as Partial<EmailAllowlist> | null;
  if (!cfg || cfg.enabled !== true) {
    return { allowed: addresses, blocked: [], active: false };
  }

  // Scope. Absent means 'all' — the behaviour every instance already has, so an
  // upgrade cannot quietly let mail out that was being held yesterday.
  if ((cfg.scope ?? 'all') === 'customer_facing' && source && INTERNAL_SOURCES.has(source)) {
    return {
      allowed: addresses,
      blocked: [],
      active: false,
      note: `The email allowlist is set to customer_facing and "${source}" sends to colleagues, not customers — it is not filtered.`,
    };
  }

  const domains = (cfg.domains ?? []).map((d) => String(d).toLowerCase().replace(/^@/, '').trim()).filter(Boolean);
  const exact = new Set((cfg.addresses ?? []).map((a) => String(a).toLowerCase().trim()).filter(Boolean));

  const allowed: string[] = [];
  const blocked: AllowlistDecision['blocked'] = [];

  for (const address of addresses) {
    const lower = address.toLowerCase();
    const dom = domainOf(lower);
    // A subdomain of an allowed domain is NOT the allowed domain. mail.liteit.se
    // and liteit.se are different mailboxes; guessing they are the same is how a
    // guard leaks.
    if (exact.has(lower) || domains.includes(dom)) {
      allowed.push(address);
    } else {
      blocked.push({
        address,
        reason: cfg.reason
          ? `Outside the email allowlist (${cfg.reason})`
          : 'Outside the email allowlist',
      });
    }
  }

  return {
    allowed,
    blocked,
    active: true,
    note: blocked.length
      ? `The email allowlist is ON: only ${[...domains.map((d) => `*@${d}`), ...exact].join(', ')} receive mail from this instance. ${blocked.length} recipient(s) were withheld — they were NOT sent to and must not be reported as sent.`
      : undefined,
  };
}

/**
 * The envelope for a send where every recipient was withheld.
 * Never `success: true` — a caller that cannot tell "delivered" from "blocked"
 * will write "invoice sent" into a customer record that never got one.
 */
export function blockedResponse(decision: AllowlistDecision): Record<string, unknown> {
  return {
    success: false,
    blocked_by_allowlist: true,
    blocked: decision.blocked,
    error: decision.error
      ?? `All recipients are outside this instance's email allowlist, so nothing was sent. ${decision.note ?? ''}`.trim(),
    how_to_change: `Update site_settings.${SETTING_KEY} — set enabled:false to send freely, or add the domain/address. Do NOT work around this by editing the recipient.`,
  };
}
