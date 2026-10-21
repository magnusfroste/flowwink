/**
 * Who a mail goes out as — ONE rule, two readers.
 *
 * A salesperson is a From line, never a separate destination. The rule from
 * docs/architecture/email-routing-and-mailboxes.md:
 *
 *   > Reply-to must be an address that DELIVERS to the company mailbox.
 *
 * `profiles.email_from_address` is free text. Before this module `email-send`
 * used it as From AND reply-to unchecked, so `kalle@gmail.com` in a profile
 * routed every customer reply out of the building — a typo was enough. Now a
 * personal address is honoured only when it delivers to a registered company
 * mailbox: the mailbox's own address, or any address on one of the mailbox's
 * `alias_domains` (the owned domain with catch-all or aliases the admin
 * registered on the mailbox row). Otherwise the seller keeps their NAME and the
 * mail goes out from the company address: `Kalle at Liteit <info@liteit.se>`.
 * The conversation lands in the same place either way, which is the point.
 *
 * `email-send` asks it for every send with a `sender_user_id`; the profile page
 * asks it to tell the seller what their From line will actually be. Two readers
 * of one decision, one code path.
 *
 * Pure: no Deno, no fetch, no env.
 */

export interface CompanyMailbox {
  email_address: string;
  /** Domains whose addresses all deliver to this mailbox (catch-all / aliases). */
  alias_domains?: string[] | null;
}

export interface SenderProfile {
  email_from_address?: string | null;
  email_from_name?: string | null;
  email_reply_to?: string | null;
  full_name?: string | null;
}

export interface SenderIdentityInput {
  profile: SenderProfile | null | undefined;
  /** The shared, enabled company mailboxes — the registry. */
  mailboxes: CompanyMailbox[];
  /** The transport's default sender (the integration's fromEmail / fromName). */
  transport: { fromEmail: string; fromName: string };
  /** A reply-to the caller chose explicitly (a thread, a system address). Always kept. */
  callerReplyTo?: string | null;
}

/**
 * - `alias`             the profile address delivers to a company mailbox and is the From line
 * - `display_name`      it does not; the seller's name rides on the company mailbox address
 * - `transport_default` no personal identity asked for (or none usable and no mailbox registered)
 */
export type SenderIdentityMode = 'alias' | 'display_name' | 'transport_default';

export interface SenderIdentity {
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  mode: SenderIdentityMode;
  /** One sentence a log line or a profile hint can show. */
  reason: string;
  /** Personal addresses that were asked for and refused, so the degradation is visible. */
  rejected?: { from_address?: string; reply_to?: string };
}

/**
 * Domains nobody owns. Mail to kalle@gmail.com never delivers to the company's
 * Gmail, however the admin fills the registry — so these are refused as alias
 * domains and never match one.
 */
export const PUBLIC_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'hotmail.se', 'live.com', 'live.se',
  'msn.com', 'yahoo.com', 'yahoo.se', 'icloud.com', 'me.com', 'mac.com', 'protonmail.com',
  'proton.me', 'pm.me', 'aol.com', 'gmx.com', 'gmx.de', 'mail.com', 'telia.com', 'spray.se',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string | null | undefined): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

/** `@Company.SE ` → `company.se`; null when it is not a domain. */
export function normalizeDomain(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const d = value.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
  if (!d || /[\s@/]/.test(d) || !d.includes('.')) return null;
  return d;
}

export function domainOf(address: string | null | undefined): string | null {
  if (!isEmailAddress(address)) return null;
  return normalizeDomain(address.trim().slice(address.trim().lastIndexOf('@') + 1));
}

export function isPublicMailDomain(domain: string | null | undefined): boolean {
  const d = normalizeDomain(domain);
  return !!d && PUBLIC_MAIL_DOMAINS.has(d);
}

/**
 * Does mail to `address` arrive in a registered company mailbox? True for a
 * mailbox's own address and for any address on one of its alias domains.
 */
export function deliversToCompanyMailbox(
  address: string | null | undefined,
  mailboxes: CompanyMailbox[],
): CompanyMailbox | null {
  if (!isEmailAddress(address)) return null;
  const addr = address.trim().toLowerCase();
  const domain = domainOf(addr);
  for (const box of mailboxes) {
    if (!isEmailAddress(box.email_address)) continue;
    if (box.email_address.trim().toLowerCase() === addr) return box;
    if (!domain || isPublicMailDomain(domain)) continue;
    for (const raw of box.alias_domains ?? []) {
      const alias = normalizeDomain(raw);
      if (alias && !isPublicMailDomain(alias) && alias === domain) return box;
    }
  }
  return null;
}

function sellerName(profile: SenderProfile | null | undefined): string | null {
  const n = (profile?.email_from_name || profile?.full_name || '').trim();
  return n || null;
}

/** `Kalle at Liteit` — the identity a mailbox without alias support can still carry. */
export function displayNameOnCompanyAddress(seller: string, companyName: string): string {
  const company = companyName.trim();
  if (!company || company.toLowerCase() === seller.toLowerCase() || company === 'FlowWink') return seller;
  return `${seller} at ${company}`;
}

export function resolveSenderIdentity(input: SenderIdentityInput): SenderIdentity {
  const { profile, mailboxes, transport } = input;
  const callerReplyTo = input.callerReplyTo?.trim() || undefined;
  const wanted = profile?.email_from_address?.trim() || '';
  const wantedReplyTo = profile?.email_reply_to?.trim() || '';
  const name = sellerName(profile);

  if (!wanted) {
    return {
      fromEmail: transport.fromEmail,
      fromName: transport.fromName,
      replyTo: callerReplyTo,
      mode: 'transport_default',
      reason: 'No personal From address on the profile; the workspace sender is used.',
    };
  }

  const via = deliversToCompanyMailbox(wanted, mailboxes);
  if (via) {
    const rejected: SenderIdentity['rejected'] = {};
    let replyTo = callerReplyTo;
    if (!replyTo) {
      if (wantedReplyTo && deliversToCompanyMailbox(wantedReplyTo, mailboxes)) replyTo = wantedReplyTo;
      else {
        if (wantedReplyTo) rejected.reply_to = wantedReplyTo;
        replyTo = wanted;
      }
    }
    return {
      fromEmail: wanted,
      fromName: name || transport.fromName,
      replyTo,
      mode: 'alias',
      reason: `${wanted} delivers to the company mailbox ${via.email_address}.`,
      ...(rejected.reply_to ? { rejected } : {}),
    };
  }

  // The personal address does not come home. Keep the person, change the address.
  const company = mailboxes.find((m) => isEmailAddress(m.email_address));
  const rejected: SenderIdentity['rejected'] = { from_address: wanted };
  if (wantedReplyTo && !deliversToCompanyMailbox(wantedReplyTo, mailboxes)) rejected.reply_to = wantedReplyTo;
  const replyTo = callerReplyTo
    || (wantedReplyTo && deliversToCompanyMailbox(wantedReplyTo, mailboxes) ? wantedReplyTo : undefined)
    || company?.email_address.trim()
    || undefined;

  if (company) {
    return {
      fromEmail: company.email_address.trim(),
      fromName: name ? displayNameOnCompanyAddress(name, transport.fromName) : transport.fromName,
      replyTo,
      mode: 'display_name',
      reason: `${wanted} is not on a registered company domain; sent as ${name || transport.fromName} from ${company.email_address.trim()} so replies reach the CRM.`,
      rejected,
    };
  }

  return {
    fromEmail: transport.fromEmail,
    fromName: name ? displayNameOnCompanyAddress(name, transport.fromName) : transport.fromName,
    replyTo,
    mode: 'transport_default',
    reason: `${wanted} is not on a registered company domain and no company mailbox is registered; the workspace sender is used.`,
    rejected,
  };
}
