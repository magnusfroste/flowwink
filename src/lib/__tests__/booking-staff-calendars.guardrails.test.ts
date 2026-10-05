import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bookingModule } from '@/lib/modules/booking-module';

/**
 * Staff calendars: one question about a person, two readers.
 *
 * booking_staff_conflict answers "can this person take this time?" (booked on
 * any service, off, outside their own hours). The table rule asks it before a
 * booking is written, the free-slot reader asks it before a time is offered —
 * the same split as booking_free_slots / booking_rules for the service, so the
 * widget never offers a time the table then refuses because nobody is there.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(sig: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${sig}`);
  expect(start, `${sig} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

describe('one question about a person', () => {
  const rule = latestFunctionBody('booking_rules()');
  const reader = latestFunctionBody('booking_free_slots(');

  it('the table rule and the reader both ask booking_staff_conflict', () => {
    expect(rule).toMatch(/public\.booking_staff_conflict\(NEW\.assigned_employee_id/);
    expect(reader).toMatch(/public\.booking_staff_conflict\(e\.id/);
  });

  it('a person is never double-booked — the overlap test ignores the staff override', () => {
    const conflict = latestFunctionBody('booking_staff_conflict(');
    const overlap = conflict.indexOf("'is already booked then'");
    const ignore = conflict.indexOf('IF p_ignore_schedule THEN RETURN NULL');
    expect(overlap).toBeGreaterThan(-1);
    expect(ignore).toBeGreaterThan(overlap); // the override only skips hours and time off
    expect(rule).toMatch(/pg_advisory_xact_lock\(hashtextextended\('booking-staff:'/);
  });

  it('a change of assignee re-runs the check', () => {
    expect(rule).toMatch(/OR NEW\.assigned_employee_id IS DISTINCT FROM OLD\.assigned_employee_id/);
  });

  it('the reader takes a person, keeps one signature, and tells anonymous callers no names', () => {
    expect(reader).toMatch(/booking_free_slots\(p_service_id uuid, p_date date, p_employee_id uuid DEFAULT NULL\)/);
    expect(migrations).toMatch(/DROP FUNCTION IF EXISTS public\.booking_free_slots\(uuid, date\);/);
    expect(migrations).toMatch(/GRANT EXECUTE ON FUNCTION public\.booking_free_slots\(uuid, date, uuid\) TO anon, authenticated, service_role;/);
    expect(reader).not.toMatch(/'name'|e\.name|customer_(name|email|phone)/);
  });
});

describe('one surface for the admin and the agent', () => {
  it('the skill and the panel call manage_staff_calendar', () => {
    const skill = bookingModule.skillSeeds?.find((s) => s.name === 'manage_staff_calendar');
    expect(skill?.handler).toBe('rpc:manage_staff_calendar');
    expect(read('src/hooks/useStaffCalendars.ts')).toMatch(/'manage_staff_calendar'/);
    expect(read('src/pages/admin/BookingsPage.tsx')).toMatch(/<StaffCalendarsTab \/>/);
  });

  it('check_availability passes the person to the one reader', () => {
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/rpc\('booking_free_slots', \{ p_service_id: service_id \?\? null, p_date: date, p_employee_id: employee_id \?\? null \}\)/);
    const check = bookingModule.skillSeeds?.find((s) => s.name === 'check_availability');
    const props = (check?.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    expect(props).toHaveProperty('employee_id');
  });
});
