import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The inbound mailbox follows the connection.
 *
 * Connecting Gmail through Composio is the intent "replies should land in
 * FlowWink". For a long time the admin then had to say yes twice more, on
 * another page: register the router row, enable the trigger. Instances where
 * nobody did sat with a connected Gmail and a dormant webhook path.
 *
 * composio-proxy now owns the whole registration as ONE idempotent handler,
 * `ensureInboundMailbox`, and both roads lead to it: the admin UI the moment an
 * ACTIVE Gmail account is shown, and the gmail_reconcile cron so a headless
 * instance catches up within one tick. These pin that there is one handler,
 * that both roads reach it, and that the cron's gate lets the first run through.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const proxy = read('supabase/functions/composio-proxy/index.ts');
const accountsList = read('src/components/admin/integrations/ComposioAccountsList.tsx');
const inboundSection = read('src/components/admin/email/InboundMailboxesSection.tsx');

describe('composio-proxy owns the registration', () => {
  it('has one handler that writes the row, the webhook subscription and the trigger', () => {
    const start = proxy.indexOf('async function ensureInboundMailbox(');
    expect(start).toBeGreaterThan(-1);
    const body = proxy.slice(start, proxy.indexOf("if (action === 'ensure_inbound_mailbox')", start));
    expect(body).toMatch(/\.from\('inbound_email_accounts'\)/);
    expect(body).toMatch(/enabled: true/);
    expect(body).toMatch(/ensureWebhookSubscription\(/);
    expect(body).toMatch(/enableTriggerInstance\(GMAIL_TRIGGER/);
  });

  it('exposes it as the ensure_inbound_mailbox action', () => {
    expect(proxy).toMatch(/if \(action === 'ensure_inbound_mailbox'\)/);
  });

  it('matches the existing row the way the unique index does (case-insensitive)', () => {
    expect(proxy).toMatch(/\.ilike\('email_address'/);
  });

  it('defaults the route mode from the tickets module, not from a hardcoded value', () => {
    expect(proxy).toMatch(/isModuleEnabled\(supabase, 'tickets'\)\) \? 'crm_then_ticket' : 'crm_only'/);
  });

  it('is reused by the enable_trigger and ensure_webhook_subscription actions, not duplicated', () => {
    expect(proxy.match(/trigger_instances\/\$\{triggerSlug\}\/upsert/g)?.length).toBe(1);
    expect(proxy.match(/method: 'PATCH'/g)?.length).toBe(1);
  });
});

describe('the gmail_reconcile cron is the headless road', () => {
  const start = proxy.indexOf("if (action === 'gmail_reconcile')");
  const branch = proxy.slice(start, proxy.indexOf("if (action === 'gmail_get')", start));

  it('registers the mailbox when the connected account has no enabled row', () => {
    expect(branch).toMatch(/\.eq\('composio_account_id', accountId\)\s*\.eq\('enabled', true\)/);
    expect(branch).toMatch(/ensureInboundMailbox\(\{ accountId, source: 'gmail_reconcile' \}\)/);
  });

  it('never lets the anon caller read the mailbox address back', () => {
    // The cron shape carries registered/inbound/reason only.
    expect(branch).toMatch(/isCronCaller\s*\?\s*\{ registered: inboundMailbox\.registered, inbound: inboundMailbox\.inbound, reason: inboundMailbox\.reason \}/);
  });

  it('is let through by the pg_cron gate when Composio is on, mailbox or not', () => {
    const dir = resolve(root, 'supabase/migrations');
    const defs = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => read(`supabase/migrations/${f}`).includes('CREATE OR REPLACE FUNCTION public.run_gmail_reconcile()'));
    const latest = read(`supabase/migrations/${defs[defs.length - 1]}`);
    expect(latest).toMatch(/key = 'integrations'[\s\S]{0,200}'composio' ->> 'enabled'/);
  });
});

describe('the admin UI is the visible road', () => {
  it('the Composio account list asks for registration once per ACTIVE Gmail account and shows the outcome', () => {
    expect(accountsList).toMatch(/action: 'ensure_inbound_mailbox'/);
    expect(accountsList).toMatch(/attemptedAccounts/);
    expect(accountsList).toMatch(/Inbound: /);
  });

  it('the Email Router button is one call to the same handler, not a re-implementation', () => {
    expect(inboundSection).toMatch(/action: "ensure_inbound_mailbox"/);
    expect(inboundSection).not.toMatch(/GMAIL_GET_PROFILE/);
    expect(inboundSection).not.toMatch(/action: "list_apps"/);
  });

  it('refreshes the company-mailbox query so the rest of the admin sees the inbox', () => {
    expect(accountsList).toMatch(/queryKey: \['company-mailbox'\]/);
    expect(inboundSection).toMatch(/queryKey: \["company-mailbox"\]/);
  });
});
