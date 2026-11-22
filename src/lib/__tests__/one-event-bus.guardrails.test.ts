/**
 * One event bus: a webhook goes out for what happens, whoever did it
 * (2026-11-22).
 *
 * A webhook went out only when the BROWSER called send-webhook, and that call
 * also ran the event's automations itself, with untemplated arguments. An
 * order paid through Stripe, a booking an agent made, an invoice sent by an
 * automation — raised on the platform's own bus (agent_events) — reached no
 * webhook at all, while Stripe and the checkout posted their own, unsigned.
 * Now the dispatcher hands every processed event to send-webhook ('bus'),
 * and a direct call puts an event on the bus instead of delivering it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRaisedEvents } from '../../../scripts/lib/scan-raised-events.mjs';
import { PLATFORM_RAISED_EVENTS } from '../../../supabase/functions/_shared/events/platform-raised';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

describe('the list of events the platform raises', () => {
  it('is exactly what the code raises (regenerate it from the scanner when you add one)', () => {
    const scanned = [...scanRaisedEvents(ROOT)].filter((e) => e !== 'platform.test.ping').sort();
    expect([...PLATFORM_RAISED_EVENTS].sort()).toEqual(scanned);
  });
});

describe('every event reaches its webhooks once', () => {
  const dispatcher = read('supabase/functions/event-dispatcher/index.ts');
  const sender = read('supabase/functions/send-webhook/index.ts');

  it('the dispatcher hands a subscribed event to send-webhook via the bus', () => {
    expect(dispatcher).toMatch(/from\("webhooks"\)\.select\("events"\)\.eq\("is_active", true\)/);
    expect(dispatcher).toMatch(/JSON\.stringify\(\{ event: ev\.event_name, data: ev\.payload \?\? \{\}, via: "bus" \}\)/);
  });

  it('send-webhook delivers what the bus hands it, and puts a direct call on the bus', () => {
    expect(sender).toMatch(/if \(body\.via !== 'bus'\)/);
    expect(sender).toMatch(/PLATFORM_RAISED_EVENTS\.has\(event\)/);
    expect(sender).toMatch(/rpc\('emit_platform_event'/);
  });

  it('send-webhook no longer runs automations itself (the dispatcher does, with templates)', () => {
    expect(sender).not.toMatch(/functions\/v1\/agent-execute/);
    expect(sender).not.toMatch(/from\('agent_automations'\)/);
  });

  it('no function posts order webhooks of its own', () => {
    for (const f of ['supabase/functions/stripe-webhook/index.ts', 'supabase/functions/create-checkout/index.ts']) {
      expect(read(f), f).not.toMatch(/from\(["']webhooks["']\)/);
    }
  });
});

describe('what a person can subscribe a webhook to', () => {
  // Events in the webhook picker that nothing raises and nothing fires: a
  // subscription to one of them never receives anything. The number may only
  // shrink — raise the event where the state changes, or take it off the list.
  const UNREACHABLE_BASELINE = 17;
  it(`at most ${UNREACHABLE_BASELINE} offered events are unreachable`, () => {
    const offered = [...read('src/lib/webhook-utils.ts').matchAll(/\|\s*'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1]);
    const src = read('src/lib/webhook-utils.ts') + ['booking', 'pages', 'products', 'crm', 'blog', 'forms']
      .map((m) => read(`src/lib/modules/${m}-module.ts`)).join('\n');
    const fired = new Set([...src.matchAll(/triggerWebhook\(\{\s*event:\s*'([a-z_.]+)'/g)].map((m) => m[1]));
    const unreachable = offered.filter((e) => !PLATFORM_RAISED_EVENTS.has(e) && !fired.has(e));
    expect(unreachable.length, unreachable.join(', ')).toBeLessThanOrEqual(UNREACHABLE_BASELINE);
  });
});
