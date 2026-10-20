import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  resolveSenderIdentity,
  deliversToCompanyMailbox,
  normalizeDomain,
  isPublicMailDomain,
  displayNameOnCompanyAddress,
} from '../../../supabase/functions/_shared/email/sender-identity';

/**
 * The alias registry: a salesperson is a From line, never a separate destination.
 *
 * `profiles.email_from_address` is free text. Unchecked, `kalle@gmail.com` in a
 * profile routes every customer reply out of the building. The rule is that a
 * personal address is honoured only when it DELIVERS to a registered company
 * mailbox — the mailbox's own address or one of its `alias_domains` — and
 * otherwise the person keeps their name on the company address.
 *
 * One resolver, two readers: email-send and the profile page. These pin the
 * resolver's rows, that email-send reads it (and no longer the profile column
 * directly), that the profile page shows the same answer, and that the
 * registry column exists.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const transport = { fromEmail: 'noreply@liteit.se', fromName: 'Liteit' };
const gmailOnly = [{ email_address: 'liteitdev@gmail.com', alias_domains: [] as string[] }];
const owned = [{ email_address: 'info@company.se', alias_domains: ['company.se', 'Company.COM'] }];

describe('deliversToCompanyMailbox', () => {
  it('accepts the mailbox address itself, case-insensitively', () => {
    expect(deliversToCompanyMailbox('LiteitDev@Gmail.com', gmailOnly)?.email_address).toBe('liteitdev@gmail.com');
  });
  it('accepts an address on a registered alias domain, normalised', () => {
    expect(deliversToCompanyMailbox('kalle@company.se', owned)).toBeTruthy();
    expect(deliversToCompanyMailbox('kalle@COMPANY.com', owned)).toBeTruthy();
  });
  it('refuses a public mail domain even when the mailbox lives there', () => {
    // The company Gmail is at gmail.com; kalle@gmail.com still does not land in it.
    expect(deliversToCompanyMailbox('kalle@gmail.com', gmailOnly)).toBeNull();
    expect(deliversToCompanyMailbox('kalle@gmail.com', [{ email_address: 'x@company.se', alias_domains: ['gmail.com'] }])).toBeNull();
  });
  it('refuses an address on a domain nobody registered', () => {
    expect(deliversToCompanyMailbox('kalle@other.se', owned)).toBeNull();
  });
  it('normalises domains the way the editor stores them', () => {
    expect(normalizeDomain(' @Company.SE. ')).toBe('company.se');
    expect(normalizeDomain('not a domain')).toBeNull();
    expect(normalizeDomain('kalle@company.se')).toBeNull();
    expect(isPublicMailDomain('Outlook.com')).toBe(true);
  });
});

describe('resolveSenderIdentity', () => {
  const kalle = { email_from_address: 'kalle@company.se', full_name: 'Kalle Karlsson' };

  it('alias: the profile address delivers → it is the From line and the reply-to', () => {
    const id = resolveSenderIdentity({ profile: kalle, mailboxes: owned, transport });
    expect(id.mode).toBe('alias');
    expect(id.fromEmail).toBe('kalle@company.se');
    expect(id.fromName).toBe('Kalle Karlsson');
    expect(id.replyTo).toBe('kalle@company.se');
    expect(id.rejected).toBeUndefined();
  });

  it('alias: a profile Reply-To that does not deliver is refused, the From stands in', () => {
    const id = resolveSenderIdentity({ profile: { ...kalle, email_reply_to: 'kalle@gmail.com' }, mailboxes: owned, transport });
    expect(id.mode).toBe('alias');
    expect(id.replyTo).toBe('kalle@company.se');
    expect(id.rejected?.reply_to).toBe('kalle@gmail.com');
  });

  it('display_name: the address does not deliver → the name rides on the company address', () => {
    const id = resolveSenderIdentity({
      profile: { email_from_address: 'kalle@gmail.com', full_name: 'Kalle' },
      mailboxes: gmailOnly,
      transport,
    });
    expect(id.mode).toBe('display_name');
    expect(id.fromEmail).toBe('liteitdev@gmail.com');
    expect(id.fromName).toBe('Kalle at Liteit');
    expect(id.replyTo).toBe('liteitdev@gmail.com');
    expect(id.rejected?.from_address).toBe('kalle@gmail.com');
  });

  it('transport_default: nothing deliverable and no mailbox → the workspace sender, name kept', () => {
    const id = resolveSenderIdentity({
      profile: { email_from_address: 'kalle@gmail.com', full_name: 'Kalle' },
      mailboxes: [],
      transport,
    });
    expect(id.mode).toBe('transport_default');
    expect(id.fromEmail).toBe('noreply@liteit.se');
    expect(id.fromName).toBe('Kalle at Liteit');
    expect(id.replyTo).toBeUndefined();
    expect(id.rejected?.from_address).toBe('kalle@gmail.com');
  });

  it('transport_default: no profile address → unchanged workspace sender', () => {
    const id = resolveSenderIdentity({ profile: { full_name: 'Kalle' }, mailboxes: owned, transport, callerReplyTo: 'thread@x.se' });
    expect(id.mode).toBe('transport_default');
    expect(id.fromEmail).toBe('noreply@liteit.se');
    expect(id.fromName).toBe('Liteit');
    expect(id.replyTo).toBe('thread@x.se');
  });

  it('a caller-chosen reply-to is always kept', () => {
    const id = resolveSenderIdentity({ profile: kalle, mailboxes: owned, transport, callerReplyTo: 'thread+abc@company.se' });
    expect(id.replyTo).toBe('thread+abc@company.se');
    const degraded = resolveSenderIdentity({
      profile: { email_from_address: 'kalle@gmail.com' }, mailboxes: gmailOnly, transport, callerReplyTo: 'thread@company.se',
    });
    expect(degraded.replyTo).toBe('thread@company.se');
  });

  it('does not say "Kalle at FlowWink" when the transport name is the product default', () => {
    expect(displayNameOnCompanyAddress('Kalle', 'FlowWink')).toBe('Kalle');
    expect(displayNameOnCompanyAddress('Kalle', '')).toBe('Kalle');
    expect(displayNameOnCompanyAddress('Kalle', 'Liteit')).toBe('Kalle at Liteit');
  });
});

describe('email-send reads the resolver, not the profile column', () => {
  const src = read('supabase/functions/email-send/index.ts');
  it('imports and calls resolveSenderIdentity with the shared mailboxes as the registry', () => {
    expect(src).toMatch(/import \{ resolveSenderIdentity[^}]*\} from "\.\.\/_shared\/email\/sender-identity\.ts"/);
    expect(src).toMatch(/resolveSenderIdentity\(\{/);
    expect(src).toMatch(/\.from\("inbound_email_accounts"\)\s*\.select\("email_address, alias_domains"\)\s*\.eq\("is_shared", true\)\s*\.eq\("enabled", true\)/);
  });
  it('never assigns the profile address to From or reply-to directly', () => {
    expect(src).not.toMatch(/fromEmail = senderProfile\.email_from_address/);
    expect(src).not.toMatch(/senderProfile\.email_reply_to \|\| senderProfile\.email_from_address/);
  });
  it('records the chosen mode so the routing view can show a degradation', () => {
    expect(src).toMatch(/sender_identity: \{ mode: senderIdentity\.mode/);
    expect((src.match(/sender_identity: senderIdentity/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('the registry exists and both UIs read it', () => {
  it('inbound_email_accounts.alias_domains is a migrated column with a generated type', () => {
    const mig = read('supabase/migrations/20261021000000_aliasregistret-domaner-som-levererar-till-foretagsladan.sql');
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS alias_domains text\[\] NOT NULL DEFAULT/);
    const types = read('src/integrations/supabase/types.ts');
    const block = types.slice(types.indexOf('inbound_email_accounts: {'), types.indexOf('inbound_email_accounts: {') + 2000);
    expect(block).toMatch(/alias_domains: string\[\]/);
  });
  it('the mailbox card edits alias_domains and refuses public mail domains', () => {
    const section = read('src/components/admin/email/InboundMailboxesSection.tsx');
    expect(section).toMatch(/\.update\(\{ alias_domains: domains \}\)/);
    expect(section).toMatch(/isPublicMailDomain\(domain\)/);
  });
  it('the profile page shows the resolver\'s answer, from the same module', () => {
    const hint = read('src/components/admin/email/SenderIdentityHint.tsx');
    expect(hint).toMatch(/_shared\/email\/sender-identity'/);
    expect(hint).toMatch(/resolveSenderIdentity\(\{/);
    expect(read('src/pages/admin/ProfilePage.tsx')).toMatch(/<SenderIdentityHint/);
    expect(read('src/pages/admin/ProfilePage.tsx')).not.toMatch(/Must be on a domain verified with the active email provider/);
  });
});
