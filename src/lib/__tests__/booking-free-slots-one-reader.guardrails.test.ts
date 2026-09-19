import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-19, booking. The public widget computed free times in
 * the BROWSER by reading `bookings` — a table an anonymous visitor may no longer
 * read — so it saw no bookings and offered every taken time. The agent computed
 * the same thing a second time in TypeScript, and book_appointment_slot carried
 * a third overlap check of its own. Three readers, three answers, and none knew
 * buffers or capacity. One fact, one reader: booking_free_slots answers exactly
 * what the table's booking_rules accepts.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

/** The occupied window of a booking: its time plus the service's buffers. Reader and rule must write it the same way. */
const OCCUPIED = /tstzrange\(b\.start_time - make_interval\(mins => v_before\), b\.end_time \+ make_interval\(mins => v_after\), '\[\)'\)/;

describe('free times have one reader', () => {
  it('the reader and the table rule count the same occupied window, from the same columns', () => {
    const reader = latestFunctionBody('booking_free_slots');
    const rule = latestFunctionBody('booking_rules');
    expect(reader).toMatch(OCCUPIED);
    expect(rule).toMatch(OCCUPIED);
    for (const body of [reader, rule]) {
      expect(body).toMatch(/buffer_before_minutes/);
      expect(body).toMatch(/buffer_after_minutes/);
      expect(body).toMatch(/s\.capacity/);
      expect(body).toMatch(/b\.status IN \('pending', 'confirmed'\)/);
    }
    expect(reader).toMatch(/taken < v_capacity/);
    expect(rule).toMatch(/v_taken >= v_capacity/);
  });

  it('the reader answers in the platform timezone and carries the exact instant of every slot', () => {
    const reader = latestFunctionBody('booking_free_slots');
    expect(reader).toMatch(/platform_timezone\(\)/);
    expect(reader).toMatch(/'starts_at', starts_at/);
    expect(reader).toMatch(/c\.local_start > v_now/);
    expect(reader).not.toMatch(/customer_(name|email|phone)/); // anonymous callers get times, never people
  });

  it('no caller computes slots of its own any more', () => {
    const hook = read('src/hooks/useBookings.ts');
    expect(hook).toMatch(/rpc\('booking_free_slots' as never/);
    expect(hook).not.toMatch(/\.select\('start_time, end_time, service_id'\)/);
    const edge = read('supabase/functions/agent-execute/index.ts');
    const i = edge.indexOf("if (skillName === 'check_availability') {");
    const branch = edge.slice(i, edge.indexOf('// browse_services', i));
    expect(branch).toMatch(/rpc\('booking_free_slots'/);
    expect(branch).not.toMatch(/const overlaps = busy\.some/);
  });

  it('the booking door carries no overlap rule of its own', () => {
    expect(migrations).toMatch(/anchor missing in book_appointment_slot/);
    expect(migrations).toMatch(/one-rule 20260920040000/);
  });

  it('the public widget books the instant the reader gave, not a time built in the browser', () => {
    const block = read('src/components/public/blocks/SmartBookingBlock.tsx');
    expect(block).toMatch(/new Date\(chosen\.starts_at\)/);
    expect(block).not.toMatch(/startTime\.setHours\(hours, minutes/);
  });
});

describe('the table announces its own status changes', () => {
  it('confirmed and cancelled are emitted by a trigger, once per transition', () => {
    const b = latestFunctionBody('tg_emit_booking_status_events');
    expect(b).toMatch(/NEW\.status IS NOT DISTINCT FROM OLD\.status THEN RETURN NEW/);
    expect(b).toMatch(/'booking\.confirmed'/);
    expect(b).toMatch(/'booking\.cancelled'/);
    expect(migrations).toMatch(/CREATE TRIGGER tg_emit_booking_status_events\s+AFTER UPDATE OF status ON public\.bookings/);
  });
});

describe('the waiting list', () => {
  it('takes a visitor only for a day that is actually full, once per person', () => {
    const b = latestFunctionBody('join_booking_waitlist');
    expect(b).toMatch(/public\.booking_free_slots\(p_service_id, p_date\)/);
    expect(b).toMatch(/still has free times/);
    expect(b).toMatch(/WHEN unique_violation THEN/);
    expect(migrations).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS booking_waitlist_one_per_person/);
  });

  it('is closed to anonymous reads — the queue carries names and addresses', () => {
    expect(migrations).toMatch(/ALTER TABLE public\.booking_waitlist ENABLE ROW LEVEL SECURITY/);
    expect(migrations).toMatch(/REVOKE ALL ON public\.booking_waitlist FROM anon/);
  });

  it('a cancellation offers the freed day to the queue and says so', () => {
    const b = latestFunctionBody('tg_emit_booking_status_events');
    expect(b).toMatch(/SET status = 'offered', offered_at = now\(\)/);
    expect(b).toMatch(/'booking\.waitlist_slot_opened'/);
  });

  it('has both surfaces: two skills and the admin tab', () => {
    type Seed = { name: string; handler: string };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['join_booking_waitlist', 'manage_booking_waitlist']) {
      expect(skills.find((s) => s.name === name)?.handler).toBe(`rpc:${name}`);
    }
    expect(read('src/pages/admin/BookingsPage.tsx')).toMatch(/<BookingWaitlistTab \/>/);
  });
});
