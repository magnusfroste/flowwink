import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bookingModule } from '@/lib/modules/booking-module';

/**
 * The meeting place and the questions belong to the booking, decided by the table.
 *
 * A video service gives every booking its link when the time is booked (an own
 * WebMeet room, or the service's fixed URL) — not when someone remembers to copy
 * one from /admin/webmeet. The questions a service asks are answered before the
 * booking exists, and a booking that skips a required one is refused by the same
 * trigger, for every writer (the public block, the agent); staff in the admin may
 * fill them in afterwards. The link rides the confirmation and the reminder.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(sig: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${sig}`);
  expect(start, `${sig} is defined in a migration`).toBeGreaterThan(-1);
  // The body ends at its own dollar-quote terminator — `$$;` or `$function$;`, whichever comes first.
  const rest = migrations.slice(start);
  const ends = ['\n$$;', '\n$function$;'].map((t) => rest.indexOf(t)).filter((i) => i > 0);
  return rest.slice(0, Math.min(...ends));
}

describe('the table decides the meeting place and the questions', () => {
  const trig = latestFunctionBody('booking_meeting_and_intake()');

  it('runs after booking_rules, so a refused time never creates a room', () => {
    expect(migrations).toMatch(/CREATE TRIGGER zz_booking_meeting_and_intake_trg BEFORE INSERT OR UPDATE ON public\.bookings/);
    expect('booking_rules_trg' < 'zz_booking_meeting_and_intake_trg').toBe(true);
  });

  it('a video service gets an own room or the fixed link; cancel closes the room', () => {
    expect(trig).toMatch(/v_slug := public\.gen_webmeet_slug\(\);/);
    expect(trig).toMatch(/INSERT INTO webmeet_rooms \(slug, name, host_user_id, max_participants, expires_at\)/);
    expect(trig).toMatch(/NEW\.meeting_url := '\/meet\/' \|\| v_slug;/);
    expect(trig).toMatch(/NEW\.meeting_url := NULLIF\(trim\(COALESCE\(v_svc\.video_url, ''\)\), ''\);/);
    expect(trig).toMatch(/UPDATE webmeet_rooms SET ended_at = COALESCE\(ended_at, now\(\)\) WHERE slug = substr\(NEW\.meeting_url, 7\);/);
  });

  it('required questions are enforced for visitors and agents, not for staff in the admin', () => {
    expect(trig).toMatch(/intake_required: % asks for % before booking/);
    expect(trig).toMatch(/NOT \(auth\.role\(\) <> 'service_role' AND auth\.uid\(\) IS NOT NULL AND public\.can_access_module\(auth\.uid\(\), 'bookings'\)\)/);
    expect(trig).toMatch(/NEW\.intake_answers := NEW\.metadata->'intake';/); // the public block's answers
  });

  it('book_appointment_slot takes the answers and returns the link, with one signature', () => {
    expect(migrations).toMatch(/DROP FUNCTION IF EXISTS public\.book_appointment_slot\(uuid, text, text, timestamptz, text, text\);/);
    const fn = latestFunctionBody('book_appointment_slot(');
    expect(fn).toMatch(/p_intake jsonb DEFAULT NULL/);
    expect(fn).toMatch(/'meeting_url', v_meeting/);
  });
});

describe('the link reaches the customer, the answers reach the admin and the agent', () => {
  it('confirmation and reminder mails carry an absolute meeting link', () => {
    const conf = read('supabase/functions/comms-send/booking_confirmation.ts');
    expect(conf).toMatch(/meeting_block: meetingBlock,/);
    expect(conf).toMatch(/rawMeeting\.startsWith\('\/'\) \? `\$\{siteUrl\}\$\{rawMeeting\}` : rawMeeting/);
    expect(conf).toMatch(/!tpl\.html\.includes\('\{\{meeting_block\}\}'\)/); // older templates still get the link
    const rem = read('supabase/functions/comms-send/booking_reminders.ts');
    expect(rem).toMatch(/start_time, end_time, notes, meeting_url,/);
    expect(rem).toMatch(/Join the meeting/);
  });

  it('the service skill declares the fields and the slot skill the answers', () => {
    const svc = bookingModule.skillSeeds?.find((s) => s.name === 'manage_booking_service');
    const props = (svc?.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    for (const k of ['location_type', 'video_provider', 'video_url', 'intake_fields']) expect(props, k).toHaveProperty(k);
    const slot = bookingModule.skillSeeds?.find((s) => s.name === 'book_appointment_slot');
    const sprops = (slot?.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    expect(sprops).toHaveProperty('p_intake');
  });

  it('the public block asks the questions and checks the required ones before sending', () => {
    const block = read('src/components/public/blocks/SmartBookingBlock.tsx');
    expect(block).toMatch(/data-intake-field=\{f\.id\}/);
    expect(block).toMatch(/intake: Object\.keys\(intake\)\.length > 0 \? intake : undefined,/);
    expect(block).toMatch(/const missingIntake = \(selectedService\?\.intake_fields \?\? \[\]\)\.filter/);
    const admin = read('src/pages/admin/BookingsPage.tsx');
    expect(admin).toMatch(/data-booking-meeting-url/);
    expect(admin).toMatch(/data-booking-intake/);
    expect(read('src/components/admin/booking/BookingServicesTab.tsx')).toMatch(/data-service-intake/);
  });
});
