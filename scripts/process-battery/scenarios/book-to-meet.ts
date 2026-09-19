import type { Scenario, ScenarioModule } from '../lib';

/**
 * Book-to-Meet: a 60-minute service, open Tuesdays 09–12 Swedish time. Three
 * customers want the same morning. The end state that must hold: one booking
 * per slot however the requests arrive (in sequence, in parallel, through the
 * legacy skill, by resurrecting a cancelled booking); nothing is booked where
 * check_availability says nothing is free (closed hours, blocked date, the
 * past); a booked slot stops being offered; cancelling frees the slot and keeps
 * the trace; the status machine ends where the doc says it ends.
 *
 * All times are written the way the skill instructions say: local Swedish time
 * with an explicit offset. The dates are January Tuesdays → +01:00.
 */
async function run(s: Scenario): Promise<void> {
  const [day, blockedDay] = await twoFreeTuesdays(s);
  const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+01:00`;
  const customer = (n: string) => ({ p_customer_name: `Kund ${n} ${s.tag}`, p_customer_email: `kund-${n}-${s.tag}@example.test` });

  // ── Service setup ────────────────────────────────────────────────────────
  // A fresh install has no services, and nothing can be booked until one exists: the menu has a skill.
  const svc = await s.must('a 60-minute service is put on the menu', 'manage_booking_service', {
    action: 'create', name: `Rådgivning 60 min ${s.tag}`, description: 'process battery', duration_minutes: 60, price_cents: 120_000, currency: 'SEK',
  });
  const serviceId = s.idOf(svc, 'booking_service');

  const services = await s.must('the service is on the menu', 'browse_services', {});
  const listed = ((services.services ?? []) as Array<{ id: string; duration_minutes: number; price_cents: number }>).find((x) => x.id === serviceId);
  s.equal('…with its duration and price', `${listed?.duration_minutes}|${listed?.price_cents}`, '60|120000');

  const hours = await s.must('opening hours are read', 'manage_booking_availability', { action: 'list_hours' });
  const tuesday = ((hours.hours ?? []) as Array<{ day_of_week: number; start_time: string; end_time: string; is_active: boolean; service_id: string | null }>)
    .filter((h) => h.day_of_week === 2 && h.is_active && h.service_id === null);
  if (tuesday.length === 0) {
    await s.must('Tuesdays are opened 09–12', 'manage_booking_availability', { action: 'set_hours', day_of_week: 2, start_time: '09:00', end_time: '12:00' });
  } else {
    s.check('Tuesdays are open 09–12 (set by an earlier run)', tuesday.length === 1 && tuesday[0].start_time.startsWith('09:00') && tuesday[0].end_time.startsWith('12:00'), JSON.stringify(tuesday));
  }

  // FINDING 2026-09-19: the skill instructions promise "Setting hours replaces existing hours for
  // that day"; the handler INSERTs a new row every time, there is no action that removes hours,
  // and check_availability then offers every slot once per duplicate window.
  await s.must('Saturday hours are set 10–12', 'manage_booking_availability', { action: 'set_hours', day_of_week: 6, start_time: '10:00', end_time: '12:00' });
  const satBefore = await s.one<{ n: string }>(`select count(*) as n from booking_availability where day_of_week = 6 and is_active and service_id is null`);
  await s.must('Saturday hours are changed to 10–14', 'manage_booking_availability', { action: 'set_hours', day_of_week: 6, start_time: '10:00', end_time: '14:00' });
  const satAfter = await s.one<{ n: string }>(`select count(*) as n from booking_availability where day_of_week = 6 and is_active and service_id is null`);
  s.check('setting hours for a day replaces that day\'s hours — one window, not one more',
    Number(satAfter?.n) === 1, `Saturday had ${satBefore?.n} window(s), now ${satAfter?.n}`);

  // ── Availability → booking ───────────────────────────────────────────────
  const open = await s.must('free slots are asked for', 'check_availability', { date: day, service_id: serviceId });
  s.equal('09–12 on a 60-minute grid offers three slots', (open.free_slots as string[]).join(','), '09:00,10:00,11:00');
  s.equal('the grid is the service duration', open.slot_minutes, 60);

  const b1 = await s.must('customer A books 10:00', 'book_appointment_slot', { p_service_id: serviceId, ...customer('a'), p_start_time: at(day, '10:00'), p_customer_phone: '+46 70 555 01 01' });
  const bookingA = s.idOf(b1, 'booking');
  const rowA = await s.one<{ status: string; minutes: string; starts: string }>(
    `select status, extract(epoch from (end_time - start_time)) / 60 as minutes,
            to_char(start_time at time zone 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') as starts from bookings where id = $1`, [bookingA]);
  s.equal('the booking is pending, 60 minutes, at 10:00 Stockholm time', `${rowA?.status}|${Number(rowA?.minutes)}|${rowA?.starts}`, `pending|60|${day} 10:00`);
  const created = await s.one<{ n: string }>(`select count(*) as n from agent_events where event_name = 'booking.created' and payload->>'id' = $1`, [bookingA]);
  s.equal('booking.created is emitted once', created?.n, 1);

  // FINDING 2026-09-19: check_availability compares opening hours (local wall-clock, no zone)
  // with bookings converted to UTC minutes (getUTCHours). A 10:00+01:00 booking is 09:00Z, so
  // "09:00" disappears and the booked "10:00" keeps being offered → the next caller gets
  // slot_unavailable on a slot the platform just offered.
  const afterA = await s.must('free slots are asked for again', 'check_availability', { date: day, service_id: serviceId });
  s.equal('the booked 10:00 is no longer offered — 09:00 and 11:00 are', (afterA.free_slots as string[]).join(','), '09:00,11:00');

  await s.mustRefuse('customer B cannot take the same 10:00', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('b'), p_start_time: at(day, '10:00') }, /slot_unavailable/);
  await s.mustRefuse('…nor 10:30, which overlaps it', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('b'), p_start_time: at(day, '10:30') }, /slot_unavailable/);
  const b2 = await s.must('customer B takes 11:00 — back-to-back is allowed', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('b'), p_start_time: at(day, '11:00') });
  const bookingB = s.idOf(b2, 'booking');

  // Four callers hit 09:00 at the same moment. "Rejects double-bookings at the database level."
  // FINDING 2026-09-19 (if red): the overlap test is a plain IF EXISTS … INSERT with no lock and
  // no exclusion constraint on bookings, so concurrent requests can all pass the check.
  const racers = await Promise.all(['c', 'd', 'e', 'f'].map((n) =>
    s.skill('book_appointment_slot', { p_service_id: serviceId, ...customer(n), p_start_time: at(day, '09:00') })));
  const nine = await s.sql<{ id: string }>(
    `select id from bookings where service_id = $1 and status <> 'cancelled' and start_time = $2::timestamptz`, [serviceId, at(day, '09:00')]);
  // A race is intermittent (3 of 4 booked on one run, 1 of 4 on the next), and a check that flips
  // cannot be a ratchet key. What the doc promises is structural, so that is what is asserted:
  // an exclusion constraint on bookings, or a lock in the RPC. The race result rides along as detail.
  // The rule lives on the TABLE since 20260919180000 (booking_rules, BEFORE INSERT OR UPDATE): every writer obeys it.
  const guard = await s.one<{ excl: string; locks: boolean }>(
    `select (select count(*) from pg_constraint where conrelid = 'public.bookings'::regclass and contype = 'x') as excl,
            (pg_get_functiondef('public.book_appointment_slot'::regproc) || coalesce((select string_agg(pg_get_functiondef(t.tgfoid), ' ')
               from pg_trigger t where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal), '')) ~* 'pg_advisory_xact_lock|for update|lock table' as locks`);
  s.check('double-booking is refused at the database level: an exclusion constraint, or a lock in the RPC',
    Number(guard?.excl) > 0 || guard?.locks === true,
    `no exclusion constraint on bookings and no lock in book_appointment_slot or a trigger on bookings; this run ${nine.length} bookings hold 09:00 and ${racers.filter((r) => r.ok).length} of 4 callers were told "booked"`);
  // With the lock in place the race is deterministic, so the behaviour is asserted too.
  s.equal('four simultaneous requests for 09:00 produce ONE booking', nine.length, 1);
  const bookingC = nine[0]?.id;

  // The legacy skill reads date+time as UTC: 10:00Z = 11:00 Stockholm = customer B's hour.
  // FINDING 2026-09-19: book_appointment (legacy, still exposed) inserts with no overlap check.
  await s.mustRefuse('the legacy book_appointment cannot double-book customer B\'s hour either', 'book_appointment',
    { service_id: serviceId, customer_name: `Kund g ${s.tag}`, customer_email: `kund-g-${s.tag}@example.test`, date: day, time: '10:00' }, /unavailable|overlap|taken/i);

  // ── Where nothing is free, nothing can be booked ─────────────────────────
  // FINDING 2026-09-19: book_appointment_slot checks the service and the overlap — nothing else.
  // Opening hours, blocked dates and the past are only honoured by check_availability.
  await s.mustRefuse('03:00 at night is outside opening hours', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('h'), p_start_time: at(day, '03:00') }, /outside|availab|hours|closed/i);

  await s.must('the following Tuesday is blocked (staff day)', 'manage_booking_availability', { action: 'block_date', date: blockedDay, reason: `Personaldag ${s.tag}` });
  const blocked = await s.must('availability on the blocked day', 'check_availability', { date: blockedDay, service_id: serviceId });
  s.equal('a blocked day offers nothing', `${blocked.is_blocked}|${(blocked.free_slots as string[]).length}`, 'true|0');
  await s.mustRefuse('a booking on the blocked day is refused', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('i'), p_start_time: at(blockedDay, '10:00') }, /blocked|availab|closed/i);
  await s.must('the block is lifted again', 'manage_booking_availability', { action: 'unblock_date', date: blockedDay });

  await s.mustRefuse('a booking in the past is refused', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('j'), p_start_time: '2020-01-07T10:00:00+01:00' }, /past|availab/i);

  const strays = await s.one<{ n: string }>(
    `select count(*) as n from bookings where service_id = $1 and status <> 'cancelled'
        and not (start_time >= $2::timestamptz and start_time < $3::timestamptz)`, [serviceId, at(day, '09:00'), at(day, '12:00')]);
  s.equal('no live booking exists outside the Tuesday 09–12 window', strays?.n, 0);

  // ── Confirm, staff, find-my-booking, calendar ────────────────────────────
  await s.must('A is confirmed', 'manage_bookings', { action: 'update_status', booking_id: bookingA, status: 'confirmed' });
  await s.mustRefuse('a status outside the machine is refused', 'manage_bookings', { action: 'update_status', booking_id: bookingA, status: 'done' }, /check|status|invalid/i);

  const emp = await s.must('an employee exists', 'manage_employee', { action: 'create', name: `Rådgivare ${s.tag}`, email: `radgivare-${s.tag}@example.test` });
  const employeeId = s.idOf(emp, 'employee');
  await s.must('A is assigned to the employee', 'manage_bookings', { action: 'assign_staff', booking_id: bookingA, assigned_employee_id: employeeId });
  await s.mustRefuse('assigning someone who is not an employee is refused', 'manage_bookings',
    { action: 'assign_staff', booking_id: bookingA, assigned_employee_id: '00000000-0000-4000-8000-000000000000' }, /foreign key|employee|not found/i);
  const staffed = await s.one<{ status: string; emp: string | null }>('select status, assigned_employee_id as emp from bookings where id = $1', [bookingA]);
  s.equal('A is confirmed and staffed', `${staffed?.status}|${staffed?.emp}`, `confirmed|${employeeId}`);

  const mineList = await s.must('"when is my appointment?" by e-mail, any letter case', 'manage_bookings', { action: 'list', customer_email: `KUND-A-${s.tag}@Example.Test` });
  const found = (mineList.bookings ?? []) as Array<{ id: string }>;
  s.check('finds exactly A\'s booking', found.length === 1 && found[0].id === bookingA, JSON.stringify(found).slice(0, 200));
  const byPhone = await s.must('…and by the last digits of the phone number', 'manage_bookings', { action: 'list', customer_phone: '070-555 01 01', customer_email: `kund-a-${s.tag}@example.test` });
  s.equal('the phone lookup finds it too', ((byPhone.bookings ?? []) as unknown[]).length, 1);

  const cal = await s.must('the unified calendar is read for the day', 'list_events', { action: 'list_events', start: `${day}T00:00:00Z`, end: `${day}T23:59:59Z`, sources: ['bookings'] });
  s.check('A\'s booking is on the calendar', ((cal.events ?? []) as Array<{ id: string }>).some((e) => e.id === `booking:${bookingA}`), JSON.stringify(cal).slice(0, 200));

  s.skip('confirmation e-mail and the 24 h reminder sweep', 'needs an e-mail provider; the sweep is cron-only (no skill)');

  // ── Cancel frees the slot — once ─────────────────────────────────────────
  await s.must('A calls off', 'manage_bookings', { action: 'cancel', booking_id: bookingA, cancelled_reason: 'sjuk' });
  const gone = await s.one<{ status: string; stamped: boolean; reason: string | null }>(
    'select status, cancelled_at is not null as stamped, cancelled_reason as reason from bookings where id = $1', [bookingA]);
  s.equal('cancelled, stamped, with the reason', `${gone?.status}|${gone?.stamped}|${gone?.reason}`, 'cancelled|true|sjuk');
  const b3 = await s.must('customer K takes the freed 10:00 (reschedule = cancel + new booking)', 'book_appointment_slot',
    { p_service_id: serviceId, ...customer('k'), p_start_time: at(day, '10:00') });
  const bookingK = s.idOf(b3, 'booking');

  // FINDING 2026-09-19: manage_bookings update_status writes any status over any status. A
  // cancelled booking can be "confirmed" again on top of the customer who took the freed slot.
  await s.mustRefuse('A\'s cancelled booking cannot be revived on top of K', 'manage_bookings',
    { action: 'update_status', booking_id: bookingA, status: 'confirmed' }, /cancel|unavailable|overlap|terminal|transition/i);
  const tenOClock = await s.one<{ n: string }>(
    `select count(*) as n from bookings where service_id = $1 and status <> 'cancelled'
        and tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $2::timestamptz + interval '60 minutes', '[)')`, [serviceId, at(day, '10:00')]);
  s.equal('10:00 is held by exactly one live booking', tenOClock?.n, 1);

  // ── The meeting happens — or not ─────────────────────────────────────────
  await s.must('K is confirmed', 'manage_bookings', { action: 'update_status', booking_id: bookingK, status: 'confirmed' });
  await s.must('K\'s meeting is completed', 'manage_bookings', { action: 'update_status', booking_id: bookingK, status: 'completed' });
  s.equal('K is completed', (await s.one<{ status: string }>('select status from bookings where id = $1', [bookingK]))?.status, 'completed');
  // FINDING 2026-09-19: same free-for-all — "completed" is documented as terminal, update_status reopens it.
  await s.mustRefuse('a completed meeting is terminal — it cannot go back to pending', 'manage_bookings',
    { action: 'update_status', booking_id: bookingK, status: 'pending' }, /terminal|transition|completed/i);
  await s.must('B is confirmed', 'manage_bookings', { action: 'update_status', booking_id: bookingB, status: 'confirmed' });
  await s.must('B never showed up', 'manage_bookings', { action: 'update_status', booking_id: bookingB, status: 'no_show' });
  if (bookingC) await s.must('C calls off through update_status', 'manage_bookings', { action: 'update_status', booking_id: bookingC, status: 'cancelled' });

  const end = await s.sql<{ id: string; status: string; stamped: boolean }>(
    `select id, status, cancelled_at is not null as stamped from bookings where id = any($1::uuid[])`, [[bookingB, bookingC].filter(Boolean)]);
  const st = (id?: string) => end.find((r) => r.id === id);
  s.equal('B is on record as a no-show', st(bookingB)?.status, 'no_show');
  if (bookingC) s.equal('cancelling through update_status stamps cancelled_at too', `${st(bookingC)?.status}|${st(bookingC)?.stamped}`, 'cancelled|true');

  // ── Buffers: the time around a booking is not offered to the next customer ──
  type Slot = { time: string; starts_at: string; places_left: number };
  const slotsOf = (answer: Record<string, unknown>) => (answer.slots ?? []) as Slot[];
  const treatment = await s.must('a treatment with 30 minutes of cleaning after it is put on the menu', 'manage_booking_service', {
    action: 'create', name: `Behandling ${s.tag}`, duration_minutes: 60, buffer_after_minutes: 30, price_cents: 90_000, currency: 'SEK',
  });
  const treatmentId = s.idOf(treatment, 'booking_service');
  const emptyDay = await s.must('free slots for the treatment', 'check_availability', { date: day, service_id: treatmentId });
  s.equal('an empty day offers the whole grid', (emptyDay.free_slots as string[]).join(','), '09:00,10:00,11:00');
  s.equal('the answer says what buffer it counted', emptyDay.buffer_after_minutes, 30);
  const ten = slotsOf(emptyDay).find((x) => x.time === '10:00');
  s.check('every slot carries its exact instant', typeof ten?.starts_at === 'string' && !Number.isNaN(Date.parse(String(ten?.starts_at))), JSON.stringify(ten));
  const treated = await s.must('T books 10:00 by the instant the reader gave', 'book_appointment_slot',
    { p_service_id: treatmentId, ...customer('T'), p_start_time: ten?.starts_at });
  const bookingT = s.idOf(treated, 'booking');
  const bufferedDay = await s.must('free slots are asked for again', 'check_availability', { date: day, service_id: treatmentId });
  s.equal('with a 30-minute buffer neither 09:00 nor 11:00 is offered any more', (bufferedDay.free_slots as string[]).join(','), '');
  await s.mustRefuse('the table refuses what the reader no longer offers', 'book_appointment_slot',
    { p_service_id: treatmentId, ...customer('U'), p_start_time: slotsOf(emptyDay).find((x) => x.time === '11:00')?.starts_at }, /buffer|unavailable|overlap/i);

  // ── The table announces its own status changes ───────────────────────────
  await s.must('T is confirmed', 'manage_bookings', { action: 'update_status', booking_id: bookingT, status: 'confirmed' });
  s.equal('booking.confirmed is emitted once — by the table, whoever the writer', (await s.one<{ n: string }>(
    `select count(*) as n from agent_events where event_name = 'booking.confirmed' and payload->>'id' = $1`, [bookingT]))?.n, 1);

  // ── The waiting list ─────────────────────────────────────────────────────
  const queued = await s.must('W queues for the fully booked day', 'join_booking_waitlist', {
    p_service_id: treatmentId, p_date: day, p_customer_name: `Kund W ${s.tag}`, p_customer_email: `KUND-W-${s.tag}@example.test`,
  });
  const queuedAgain = await s.must('W asks again, in lower case', 'join_booking_waitlist', {
    p_service_id: treatmentId, p_date: day, p_customer_name: `Kund W ${s.tag}`, p_customer_email: `kund-w-${s.tag}@example.test`,
  });
  s.equal('one place in the queue per person, service and day', queuedAgain.waitlist_id, queued.waitlist_id);
  await s.must('T calls off', 'manage_bookings', { action: 'cancel', booking_id: bookingT, cancelled_reason: 'förhinder' });
  s.equal('booking.cancelled is emitted once', (await s.one<{ n: string }>(
    `select count(*) as n from agent_events where event_name = 'booking.cancelled' and payload->>'id' = $1`, [bookingT]))?.n, 1);
  const queue = await s.must('the waiting list is read', 'manage_booking_waitlist', { p_action: 'list', p_service_id: treatmentId });
  const entry = ((queue.entries ?? []) as Array<{ waitlist_id: string; status: string }>).find((e) => e.waitlist_id === queued.waitlist_id);
  s.equal('the cancellation offers the freed day to the queue', entry?.status, 'offered');
  s.equal('the opening is announced once', (await s.one<{ n: string }>(
    `select count(*) as n from agent_events where event_name = 'booking.waitlist_slot_opened' and payload->>'service_id' = $1`, [treatmentId]))?.n, 1);
  await s.mustRefuse('a day with free times takes no queue — book instead', 'join_booking_waitlist', {
    p_service_id: treatmentId, p_date: day, p_customer_name: `Kund X ${s.tag}`, p_customer_email: `kund-x-${s.tag}@example.test`,
  }, /free times/i);
  await s.must('W takes the time — the entry is closed', 'manage_booking_waitlist', { p_action: 'set_status', p_waitlist_id: queued.waitlist_id, p_status: 'booked' });

  // ── Capacity: a class takes several at the same time ─────────────────────
  const klass = await s.must('a class with two places is put on the menu', 'manage_booking_service', {
    action: 'create', name: `Yogaklass ${s.tag}`, duration_minutes: 60, capacity: 2, price_cents: 20_000, currency: 'SEK',
  });
  const klassId = s.idOf(klass, 'booking_service');
  const klassDay = await s.must('free slots for the class', 'check_availability', { date: day, service_id: klassId });
  const klassNine = slotsOf(klassDay).find((x) => x.time === '09:00');
  s.equal('an empty class has both places', klassNine?.places_left, 2);
  await s.must('the first place is booked', 'book_appointment_slot', { p_service_id: klassId, ...customer('Y1'), p_start_time: klassNine?.starts_at });
  const onePlace = await s.must('free slots for the class again', 'check_availability', { date: day, service_id: klassId });
  s.equal('one place is left at 09:00', slotsOf(onePlace).find((x) => x.time === '09:00')?.places_left, 1);
  await s.must('the second place is booked', 'book_appointment_slot', { p_service_id: klassId, ...customer('Y2'), p_start_time: klassNine?.starts_at });
  await s.mustRefuse('the third is refused — the class is full', 'book_appointment_slot',
    { p_service_id: klassId, ...customer('Y3'), p_start_time: klassNine?.starts_at }, /full|unavailable/i);
  const fullClass = await s.must('free slots for the full class', 'check_availability', { date: day, service_id: klassId });
  s.equal('a full class is no longer offered, the other times are', (fullClass.free_slots as string[]).join(','), '10:00,11:00');
}

/** Two consecutive Tuesdays in a far-away January, spread by the run tag so reruns do not share a day. */
/**
 * Two consecutive Tuesdays nobody has booked. The calendar is shared across services, so a day an
 * earlier run used would hand this run its leftovers (it did: a hash over 800 days collided after
 * a dozen runs and "09–12 offers three slots" went red on someone else's bookings). Start from a
 * year derived from the tag, then walk forward until both days are empty.
 */
async function twoFreeTuesdays(s: Scenario): Promise<[string, string]> {
  let h = 0;
  for (const ch of s.tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const d = new Date(Date.UTC(2040 + (h % 400), 0, 1));
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  for (let tries = 0; tries < 5000; tries++) {
    const first = d.toISOString().slice(0, 10);
    const second = new Date(d.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    const used = await s.one<{ n: string }>(
      `select (select count(*) from bookings where start_time::date in ($1::date, $2::date))
            + (select count(*) from booking_blocked_dates where date in ($1::date, $2::date)) as n`, [first, second]);
    if (Number(used?.n) === 0) return [first, second];
    d.setUTCDate(d.getUTCDate() + 14);
  }
  throw new Error('no free pair of Tuesdays found');
}

export default { process: 'book-to-meet', run } satisfies ScenarioModule;
