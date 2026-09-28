import type { Scenario, ScenarioModule } from '../lib';

/**
 * Propose-to-Meet: propose three times, three people answer by link, the rule
 * picks the first time everyone can make and puts it on the calendar.
 *
 * The end state that must hold: the base tables are closed to anon while the
 * token RPCs are open to it; the resolved slot is exactly the one every
 * respondent chose; the calendar event carries exactly those respondents;
 * resolving twice creates nothing; a tie under max_attendance goes to the
 * earliest; no common slot resolves nothing — and says so.
 */
const T = (daysAhead: number, hour: number) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + daysAhead); d.setUTCHours(hour, 0, 0, 0); return d.toISOString();
};

async function run(s: Scenario): Promise<void> {
  // ── The wall: anon reaches nothing but the two token RPCs ────────────────
  const openPolicies = await s.one<{ n: string }>(
    `select count(*)::text as n from pg_policies
      where schemaname = 'public' and tablename in ('meeting_polls','meeting_poll_slots','meeting_poll_responses')
        and (roles @> '{anon}' or roles @> '{public}')`, []);
  s.equal('no RLS policy on the poll tables names anon or public', openPolicies?.n, '0');
  const rls = await s.one<{ n: string }>(
    `select count(*)::text as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('meeting_polls','meeting_poll_slots','meeting_poll_responses') and c.relrowsecurity`, []);
  s.equal('RLS is enabled on all three poll tables', rls?.n, '3');
  const priv = await s.one<{ get_ok: boolean; respond_ok: boolean; create_ok: boolean; resolve_ok: boolean }>(
    `select has_function_privilege('anon', 'public.get_meeting_poll_by_token(uuid)', 'EXECUTE') as get_ok,
            has_function_privilege('anon', 'public.respond_to_meeting_poll_by_token(uuid,text,text,uuid[])', 'EXECUTE') as respond_ok,
            has_function_privilege('anon', 'public.create_meeting_poll(text,jsonb,text,text,text,text,text,integer,timestamptz,boolean)', 'EXECUTE') as create_ok,
            has_function_privilege('anon', 'public.resolve_meeting_poll(uuid)', 'EXECUTE') as resolve_ok`, []);
  s.check('anon may read a poll by token', priv?.get_ok === true);
  s.check('anon may answer a poll by token', priv?.respond_ok === true);
  s.check('anon may NOT create a poll', priv?.create_ok === false);
  s.check('anon may NOT resolve a poll', priv?.resolve_ok === false);

  // ── Propose ──────────────────────────────────────────────────────────────
  await s.mustRefuse('first_quorum without a quorum is refused', 'create_meeting_poll', {
    p_title: `Battery ${s.tag} no quorum`, p_slots: [{ starts_at: T(3, 9) }],
    p_organizer_email: `org-${s.tag}@example.test`, p_organizer_name: `Battery Org ${s.tag}`, p_policy: 'first_quorum',
  }, /quorum/i);

  const created = await s.must('the organizer proposes three times', 'create_meeting_poll', {
    p_title: `Battery sync ${s.tag}`, p_description: 'process battery',
    p_slots: [{ starts_at: T(3, 9), duration_min: 45 }, { starts_at: T(3, 13), duration_min: 45 }, { starts_at: T(4, 10), duration_min: 45 }],
    p_organizer_email: `org-${s.tag}@example.test`, p_organizer_name: `Battery Org ${s.tag}`,
    p_timezone: 'Europe/Stockholm', p_policy: 'first_all',
  });
  const pollId = String(created.poll_id ?? '');
  const token = String(created.share_token ?? '');
  s.check('the poll has an id and a share token', /^[0-9a-f-]{36}$/.test(pollId) && /^[0-9a-f-]{36}$/.test(token), JSON.stringify(created).slice(0, 200));
  s.equal('the share path is the public link', created.share_path, `/poll/${token}`);

  const slots = await s.sql<{ id: string; starts_at: string }>(
    'select id, starts_at from meeting_poll_slots where poll_id = $1 order by starts_at', [pollId]);
  s.equal('three slots were stored', slots.length, 3);
  const [slot1, slot2, slot3] = slots.map((r) => r.id);

  // ── Answer, by link, without an account ──────────────────────────────────
  const respond = (email: string, name: string, ids: string[]) =>
    s.must(`${name} answers`, 'respond_to_meeting_poll', { p_token: token, p_email: email, p_name: name, p_slot_ids: ids });

  await respond(`anna-${s.tag}@example.test`, 'Anna Berg', [slot1, slot2]);
  await respond(`bo-${s.tag}@example.test`, 'Bo Lind', [slot2, slot3]);
  const third = await respond(`cia-${s.tag}@example.test`, 'Cia Ek', [slot2]);
  const view = third.poll as { response_count?: number; respondents?: Array<{ initials: string }>; slots?: Array<{ id: string; count: number }> } | undefined;
  s.equal('three people have answered', view?.response_count, 3);
  s.check('the public view shows initials, not e-mails', JSON.stringify(view?.respondents ?? []).includes('"initials":"AB"') && !JSON.stringify(view).includes('@example.test'));
  s.equal('slot 2 is the one all three chose', view?.slots?.find((x) => x.id === slot2)?.count, 3);

  // Answering again replaces, it does not add.
  await respond(`anna-${s.tag}@example.test`, 'Anna Berg', [slot2]);
  const afterRe = await s.one<{ n: string }>('select count(*)::text as n from meeting_poll_responses where poll_id = $1', [pollId]);
  s.equal('a second answer from the same e-mail replaces the first', afterRe?.n, '3');

  // A slot from another poll is a probe, not a preference.
  const other = await s.must('a second poll exists to borrow a slot from', 'create_meeting_poll', {
    p_title: `Battery other ${s.tag}`, p_slots: [{ starts_at: T(6, 9) }],
    p_organizer_email: `org-${s.tag}@example.test`, p_organizer_name: `Battery Org ${s.tag}`,
  });
  const foreignSlot = (await s.one<{ id: string }>('select id from meeting_poll_slots where poll_id = $1', [String(other.poll_id)]))?.id ?? '';
  await s.mustRefuse('a slot id from another poll is refused', 'respond_to_meeting_poll',
    { p_token: token, p_email: `dan-${s.tag}@example.test`, p_name: 'Dan Probe', p_slot_ids: [foreignSlot] }, /do not belong/i);

  // ── Resolve: the rule, not a button ──────────────────────────────────────
  const resolved = await s.must('the organizer resolves the poll', 'resolve_meeting_poll', { p_poll_id: pollId });
  s.equal('the poll resolved', resolved.resolved, true);
  s.equal('first_all picked the one slot every respondent chose', resolved.slot_id, slot2);
  s.equal('three attendees can make it', resolved.attendees, 3);

  const ev = await s.one<{ n: string; attendees: number; related: string; starts_at: string }>(
    `select count(*)::text as n, max(jsonb_array_length(attendees)) as attendees, max(related_entity_id) as related, max(starts_at)::text as starts_at
       from calendar_events where related_entity_type = 'meeting_poll' and related_entity_id = $1`, [pollId]);
  s.equal('exactly one calendar event exists for the poll', ev?.n, '1');
  s.equal('the event carries the three respondents as attendees', Number(ev?.attendees), 3);
  const poll = await s.one<{ status: string; resolved_slot_id: string; calendar_event_id: string | null }>(
    'select status, resolved_slot_id, calendar_event_id from meeting_polls where id = $1', [pollId]);
  s.equal('the poll is resolved', poll?.status, 'resolved');
  s.equal('the poll points at the chosen slot', poll?.resolved_slot_id, slot2);
  s.check('the poll points at its calendar event', !!poll?.calendar_event_id);

  const again = await s.must('resolving again is idempotent', 'resolve_meeting_poll', { p_poll_id: pollId });
  s.equal('the second resolve reports the existing result', again.already, true);
  const evAgain = await s.one<{ n: string }>(`select count(*)::text as n from calendar_events where related_entity_type = 'meeting_poll' and related_entity_id = $1`, [pollId]);
  s.equal('no second calendar event was created', evAgain?.n, '1');

  await s.mustRefuse('a resolved poll takes no more answers', 'respond_to_meeting_poll',
    { p_token: token, p_email: `late-${s.tag}@example.test`, p_name: 'Late Lisa', p_slot_ids: [slot2] }, /resolved|no longer/i);

  // ── max_attendance: a tie goes to the earliest ───────────────────────────
  const tie = await s.must('a max_attendance poll with two candidate times', 'create_meeting_poll', {
    p_title: `Battery tie ${s.tag}`, p_slots: [{ starts_at: T(5, 14) }, { starts_at: T(5, 9) }],
    p_organizer_email: `org-${s.tag}@example.test`, p_organizer_name: `Battery Org ${s.tag}`, p_policy: 'max_attendance',
  });
  const tieId = String(tie.poll_id); const tieToken = String(tie.share_token);
  const tieSlots = await s.sql<{ id: string }>('select id from meeting_poll_slots where poll_id = $1 order by starts_at', [tieId]);
  const [early, late] = tieSlots.map((r) => r.id);
  await s.must('one person picks the early slot', 'respond_to_meeting_poll', { p_token: tieToken, p_email: `e-${s.tag}@example.test`, p_name: 'Early Eva', p_slot_ids: [early] });
  await s.must('one person picks the late slot', 'respond_to_meeting_poll', { p_token: tieToken, p_email: `l-${s.tag}@example.test`, p_name: 'Late Leo', p_slot_ids: [late] });
  const tieRes = await s.must('the tie is resolved', 'resolve_meeting_poll', { p_poll_id: tieId });
  s.equal('a tie under max_attendance goes to the earliest slot', tieRes.slot_id, early);

  // ── first_all with nothing in common resolves nothing — and says so ──────
  const none = await s.must('a poll where nobody agrees', 'create_meeting_poll', {
    p_title: `Battery disjoint ${s.tag}`, p_slots: [{ starts_at: T(7, 9) }, { starts_at: T(7, 13) }],
    p_organizer_email: `org-${s.tag}@example.test`, p_organizer_name: `Battery Org ${s.tag}`, p_policy: 'first_all',
  });
  const noneId = String(none.poll_id); const noneToken = String(none.share_token);
  const ns = await s.sql<{ id: string }>('select id from meeting_poll_slots where poll_id = $1 order by starts_at', [noneId]);
  await s.must('one picks the first', 'respond_to_meeting_poll', { p_token: noneToken, p_email: `x-${s.tag}@example.test`, p_name: 'Xin Yu', p_slot_ids: [ns[0].id] });
  await s.must('one picks the second', 'respond_to_meeting_poll', { p_token: noneToken, p_email: `y-${s.tag}@example.test`, p_name: 'Yara Öst', p_slot_ids: [ns[1].id] });
  const noneRes = await s.must('resolving finds no common slot', 'resolve_meeting_poll', { p_poll_id: noneId });
  s.equal('no common slot resolves nothing', noneRes.resolved, false);
  s.check('and the reason names it', /everyone/i.test(String(noneRes.reason ?? '')), String(noneRes.reason));
  const stillOpen = await s.one<{ status: string }>('select status from meeting_polls where id = $1', [noneId]);
  s.equal('the poll stays open for more answers', stillOpen?.status, 'open');
  const noEvent = await s.one<{ n: string }>(`select count(*)::text as n from calendar_events where related_entity_type = 'meeting_poll' and related_entity_id = $1`, [noneId]);
  s.equal('nothing reached the calendar', noEvent?.n, '0');

  s.skip('the share link is e-mailed to respondents (comms-send)', 'step 2 — no e-mail provider locally');
}

const scenario: ScenarioModule = { process: 'propose-to-meet', run };
export default scenario;
