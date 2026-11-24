import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// A customer who holds something gets a way in (2026-11-24). On optic three
// services were made by hand with the customer's address; the portal showed
// them correctly and no customer had an account to see them with — only a
// signed contract invited anyone. And the portal offered a wishlist to a fibre
// customer, because it asked the e-commerce module (which is the product
// catalogue too) instead of the shop dial.
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a customer who holds something gets a way in', () => {
  it('a new service invites its customer, through the one invitation', () => {
    const subs = read('src/lib/modules/subscriptions-module.ts');
    const auto = subs.slice(subs.indexOf("name: 'Portal invitation for a new service'"));
    expect(auto).toMatch(/trigger_config: \{ event: 'subscription\.created' \}/);
    expect(auto).toMatch(/skill_name: 'invite_customer_to_portal'/);
    expect(auto).toMatch(/subscription_id: '\{\{event\.payload\.subscription_id\}\}'/);
    const handler = read('supabase/functions/_shared/handlers/portal-invite.ts');
    expect(handler).toMatch(/provisionPortalAccount\(/);
    // The link opens an account: never written into an unattended run's journal.
    expect(handler).toMatch(/opts\.attended && result\.action_link/);
    expect(read('supabase/functions/_shared/execute/core.ts')).toMatch(/'internal:invite_customer_to_portal'/);
  });

  it('two callers for one address get one account, not a failure', () => {
    const p = read('supabase/functions/_shared/provision-portal-account.ts');
    expect(p).not.toMatch(/listUsers\(\{ page: 1, perPage: 200 \}\)/);
    const onErr = p.slice(p.indexOf('if (linkErr || !linkData?.user)'));
    expect(onErr.indexOf('existingAccount()')).toBeGreaterThan(-1);
    expect(onErr.indexOf('existingAccount()')).toBeLessThan(onErr.indexOf('status: "error"'));
  });

  it('a service raises subscription.created once — the row does', () => {
    const files = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    const last = (name: RegExp) => [...files].reverse().find((f) => name.test(read(`supabase/migrations/${f}`)))!;
    const fnFile = last(/FUNCTION public\.create_manual_subscription\(/);
    const sql = read(`supabase/migrations/${fnFile}`);
    const body = sql.slice(sql.indexOf('FUNCTION public.create_manual_subscription('));
    expect(body.slice(0, body.indexOf('$function$;'))).not.toMatch(/emit_platform_event/);
  });

  it('the portal shows the shop where the site sells, not where the catalogue is on', () => {
    const layout = read('src/pages/account/AccountLayout.tsx');
    expect(layout).toMatch(/useStorefront\(\)/);
    expect(layout).toMatch(/\.\.\.\(selling \? shopNav : \[\]\)/);
    expect(layout).not.toMatch(/ecommerceEnabled \? commerceNav/);
    expect(read('src/pages/account/OrdersPage.tsx')).toMatch(/\{selling && \(/);
  });
});
