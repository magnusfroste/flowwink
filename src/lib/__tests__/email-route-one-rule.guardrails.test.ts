import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chooseEmailProvider } from '../../../supabase/functions/_shared/email/provider-choice';

/**
 * Which provider carries a mail is ONE rule with two readers.
 *
 * synclairvision sent its newsletters through Composio/Gmail and the Newsletter
 * page said "Email integration not configured — Resend API key is missing"
 * (2026-10-05). The page asked "is Resend on?"; email-send asked "who carries
 * this mail?" — two questions, two answers. Now both read
 * _shared/email/provider-choice.ts, and the page says which way mail goes.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const none = { resendKey: false, composioKey: false, smtpHost: false };

describe('chooseEmailProvider', () => {
  it('Composio alone carries a newsletter, and that is not "not configured"', () => {
    const r = chooseEmailProvider({
      integrations: { composio: { enabled: true }, resend: { enabled: false } },
      secrets: { ...none, composioKey: true },
    });
    expect(r.provider).toBe('composio');
    expect(r.preferredInactive).toBe(false);
  });

  it('a chosen provider that is off is reported, and the mail still goes', () => {
    const r = chooseEmailProvider({
      integrations: { composio: { enabled: true }, resend: { enabled: false, config: { emailConfig: { provider: 'resend' } } } },
      secrets: { ...none, composioKey: true },
    });
    expect(r.provider).toBe('composio');
    expect(r.preferred).toBe('resend');
    expect(r.preferredInactive).toBe(true);
  });

  it('nothing active → null, the only case that is a real warning', () => {
    expect(chooseEmailProvider({ integrations: {}, secrets: none }).provider).toBeNull();
  });

  it('keeps email-send\'s order: Resend first for transactional, Composio first when a reply is expected', () => {
    const both = { integrations: { composio: { enabled: true }, resend: {} }, secrets: { ...none, composioKey: true, resendKey: true } };
    expect(chooseEmailProvider(both).provider).toBe('resend');
    expect(chooseEmailProvider({ ...both, expectsReply: true }).provider).toBe('composio');
    expect(chooseEmailProvider({ ...both, perCall: 'composio' }).provider).toBe('composio');
  });

  it('SMTP counts with a host from the card as well as from the vault', () => {
    expect(chooseEmailProvider({ integrations: { smtp: { enabled: true, config: { host: 'mail.example.test' } } }, secrets: none }).provider).toBe('smtp');
    expect(chooseEmailProvider({ integrations: { smtp: { enabled: true } }, secrets: { ...none, smtpHost: true } }).provider).toBe('smtp');
    expect(chooseEmailProvider({ integrations: { smtp: { enabled: true } }, secrets: none }).provider).toBeNull();
  });
});

describe('both readers use it', () => {
  it('email-send resolves its provider through the shared rule, not an inline copy', () => {
    const edge = read('supabase/functions/email-send/index.ts');
    expect(edge).toMatch(/import \{ chooseEmailProvider \} from "\.\.\/_shared\/email\/provider-choice\.ts"/);
    expect(edge).toMatch(/const provider: Provider \| null = choice\.provider;/);
    expect(edge).not.toMatch(/fallbackOrder\.find/);
  });

  it('the Newsletter page shows the route, not a Resend-only warning', () => {
    const page = read('src/pages/admin/NewsletterPage.tsx');
    expect(page).toMatch(/<EmailRouteNotice purpose="Newsletters" \/>/);
    expect(page).not.toMatch(/IntegrationWarning integration="resend"/);
    expect(page).not.toMatch(/useIsResendConfigured/);
    const hook = read('src/hooks/useEmailRoute.ts');
    expect(hook).toMatch(/chooseEmailProvider\(/);
    expect(hook).toMatch(/smtpHost: !!secrets\.integrations\?\.smtp_host/);
    expect(read('supabase/functions/check-secrets/index.ts')).toMatch(/smtp_host: !!Deno\.env\.get\('SMTP_HOST'\)/);
  });

  it('the notice opens doors for admins only, and the Integrations door is the card itself', () => {
    const notice = read('src/components/admin/EmailRouteNotice.tsx');
    expect(notice).toMatch(/const \{ isAdmin \} = useAuth\(\);/);
    expect(notice).toMatch(/\/admin\/integrations\?open=\$\{p\}/);
    expect(notice).toMatch(/\/admin\/email\?tab=sending/);
    expect(notice).toMatch(/An administrator does this under Integrations/);
    const integrations = read('src/pages/admin/IntegrationsStatusPage.tsx');
    expect(integrations).toMatch(/searchParams\.get\('open'\)/);
    expect(integrations).toMatch(/id=\{`integration-\$\{key\}`\}/);
  });
});

describe('the ledger says who carried it', () => {
  it('each accepted delivery records the provider email-send answered with', () => {
    const send = read('supabase/functions/newsletter/send.ts');
    expect(send).toMatch(/provider: provider \?\? null,/);
    expect(send).toMatch(/answer\?\.simulated \? "simulated" : answer\?\.provider \?\? null/);
    const migration = read('supabase/migrations/20261005050000_utskicket-sager-vem-som-bar-det.sql');
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS provider text/);
    expect(migration).toMatch(/can_access_module\(auth\.uid\(\), 'newsletter'\)/);
  });

  it('the Newsletter view reads the ledger, not a counter', () => {
    const page = read('src/pages/admin/NewsletterPage.tsx');
    expect(page).toMatch(/useNewsletterDeliveries\(\)/);
    expect(page).toMatch(/data-newsletter-carriers/);
    expect(read('src/hooks/useNewsletterDeliveries.ts')).toMatch(/'newsletter_delivery_summary'/);
  });
});

