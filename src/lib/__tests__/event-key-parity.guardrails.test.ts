/**
 * Event automations die silently when a dispatcher and the seeds disagree on
 * the trigger_config key. Seeds and the admin UI write `{event: ...}`; older
 * docs said `{event_name: ...}`. event-dispatcher was fixed to accept both —
 * with a comment noting that before the fix NO event automation ever matched.
 * Its twin, send-webhook, carries the same matcher and was missed for months:
 * six seeded event automations per instance looked enabled and matched nothing.
 *
 * This pins every event-automation matcher to the dual-key form, so the next
 * dispatcher (or a refactor of these two) can't reintroduce the split. The
 * failure mode is invisible in production — an unmatched event is
 * indistinguishable from no event — which is exactly why it's pinned at source
 * level instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf-8');

// Every edge function that matches incoming events against agent_automations
// rows with trigger_type='event'. Grep for `trigger_type', 'event'` /
// `trigger_type", "event"` under supabase/functions to find candidates when
// adding one.
const DISPATCHERS = [
  'supabase/functions/send-webhook/index.ts',
  'supabase/functions/event-dispatcher/index.ts',
];

// The dual-key read: event_name with a fallback to event (any spacing/variable).
const DUAL_KEY = /event_name\s*\?\?\s*\w+\??\.\s*event\b/;
// The bug shape: comparing trigger_config's event_name directly, no fallback.
const BARE_EVENT_NAME = /trigger_config\?\.\s*event_name\s*===/;

describe('event-automation key parity across dispatchers', () => {
  it.each(DISPATCHERS)('%s accepts both {event} and {event_name}', (file) => {
    const src = read(file);
    expect(
      DUAL_KEY.test(src),
      `${file} matches event automations without the event_name ?? event fallback — ` +
        `seeds write {event: ...}, so a bare event_name matcher fires on nothing`,
    ).toBe(true);
    expect(
      BARE_EVENT_NAME.test(src),
      `${file} still contains a bare trigger_config?.event_name === comparison`,
    ).toBe(false);
  });

  it('the seeds really do write {event: ...} — the reason the fallback must exist', () => {
    // If this ever flips to event_name across the board, the fallback becomes
    // vestigial rather than load-bearing; update the comment, keep the guard.
    const seedFiles = [
      'src/lib/modules/crm-module.ts',
      'src/lib/modules/forms-module.ts',
      'src/lib/modules/email-module.ts',
    ];
    const hits = seedFiles.filter((f) => /trigger_config:\s*{\s*event:/.test(read(f)));
    expect(hits.length, 'no module seed writes trigger_config {event: ...} any more').toBeGreaterThan(0);
  });

  it('send-webhook has both matchers fixed, not just one', () => {
    // The file matches event automations in TWO places (the no-webhooks early
    // path and the main path). Half-fixing it is this bug all over again.
    const src = read('supabase/functions/send-webhook/index.ts');
    const matcherCount = (src.match(/trigger_type',\s*'event'/g) || []).length;
    const dualKeyCount = (src.match(new RegExp(DUAL_KEY.source, 'g')) || []).length;
    expect(dualKeyCount, `send-webhook filters event automations ${matcherCount}x but carries the dual-key read only ${dualKeyCount}x`).toBeGreaterThanOrEqual(matcherCount);
  });
});
