/**
 * What a person can pick to happen "when X" is something the platform raises
 * (2026-11-22).
 *
 * A survey campaign could be set to go out when an order is delivered, a case
 * closed, a booking completed, a contract renewed or a deal won. Five of the six
 * were events nothing raised, and nothing listened for the sixth: no survey
 * ever went out by itself. The events are raised now, the surveys are queued
 * on them and mailed when due — and this guard finds every event the platform
 * raises (scripts/lib/scan-raised-events.mjs) and holds every offer to it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanRaisedEvents } from '../../../scripts/lib/scan-raised-events.mjs';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');
const raised: Set<string> = scanRaisedEvents(ROOT);

describe('events offered are events raised', () => {
  it('every survey trigger a person can pick is raised (or manual)', () => {
    const page = read('src/pages/admin/SurveysPage.tsx').match(/const TRIGGERS = \[([^\]]+)\]/)?.[1] ?? '';
    const triggers = [...page.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).filter((t) => t !== 'manual');
    expect(triggers.length).toBeGreaterThan(5);
    expect(triggers.filter((t) => !raised.has(t))).toEqual([]);
  });

  it('the table allows exactly what the page offers', () => {
    const migration = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.includes('enkaten-gar-ut'))[0];
    const check = read(`supabase/migrations/${migration}`).match(/survey_campaigns_trigger_check\s*\n\s*CHECK \(trigger = ANY \(ARRAY\[([^\]]+)\]/)?.[1] ?? '';
    const page = read('src/pages/admin/SurveysPage.tsx').match(/const TRIGGERS = \[([^\]]+)\]/)?.[1] ?? '';
    const norm = (s: string) => [...s.matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
    expect(norm(check)).toEqual(norm(page));
  });

  it('every event automation a module seeds waits for a raised event', () => {
    const waiting: string[] = [];
    for (const f of readdirSync(join(ROOT, 'src/lib/modules'))) {
      const s = read(`src/lib/modules/${f}`);
      for (const m of s.matchAll(/trigger_type: 'event',\s*\n\s*trigger_config: \{ event: '([a-z_.]+)'/g)) {
        if (!raised.has(m[1])) waiting.push(`${f}: ${m[1]}`);
      }
    }
    expect(waiting).toEqual([]);
  });

  it('the events surveys needed are raised where the state changes', () => {
    for (const e of ['booking.completed', 'order.delivered', 'order.cancelled', 'order.refunded', 'ticket.closed', 'invoice.sent', 'contract.renewed']) {
      expect(raised.has(e), e).toBe(true);
    }
  });
});

describe('the survey goes out', () => {
  const mod = read('src/lib/modules/surveys-module.ts');
  it('each trigger has an automation that queues its surveys', () => {
    for (const e of ['order.delivered', 'order.paid', 'ticket.resolved', 'ticket.closed', 'booking.completed', 'contract.renewed', 'deal.won']) {
      expect(mod).toMatch(new RegExp(`trigger_config: \\{ event: '${e.replace('.', '\\.')}' \\},\\s*\\n\\s*skill_name: 'queue_event_surveys'`));
    }
  });
  it('a sweep mails what is due, and wakes only when something is', () => {
    expect(mod).toMatch(/work_probe: 'due_surveys' \},\s*\n\s*skill_name: 'send_due_surveys'/);
    const sql = read('supabase/migrations/20261122090000_enkaten-gar-ut-nar-det-hander.sql');
    expect(sql).toMatch(/FUNCTION public\.work_probe_due_surveys\(\)/);
    expect(sql).toMatch(/ON CONFLICT \(campaign_id, related_entity_type, related_entity_id\)/);
  });
  it('a queued send is claimed before the mail and given back when nothing went out', () => {
    const send = read('supabase/functions/comms-send/survey_send.ts');
    expect(send).toMatch(/update\(\{ sent_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", row\.id\)\.is\("sent_at", null\)/);
    expect(send).toMatch(/update\(\{ sent_at: null \}\)\.eq\("id", row\.id\)/);
  });
  it('the answer link is built from the site address, not a field nothing writes', () => {
    const send = read('supabase/functions/comms-send/survey_send.ts');
    expect(send).not.toMatch(/\)\?\.public_url/);
    expect(send).toMatch(/\.eq\("key", "general"\)[\s\S]{0,120}siteUrl/);
  });
});
