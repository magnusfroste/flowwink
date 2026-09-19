import type { Scenario, ScenarioModule } from '../lib';

/**
 * Support-to-Resolution: an urgent case is opened on a business day at 10:00,
 * gets an internal note at 10:30, the first customer-facing reply at 12:30
 * (150 business minutes against a 60-minute promise) and is resolved the next
 * business day at 11:00 (540 against 480). A second case is answered after 30
 * minutes and resolved after 300. An e-mail becomes a case, its reply lands on
 * the same case and reopens it.
 * The end state that must hold: the SLA clock stops at the right event and the
 * violation carries the minutes computed by hand, one violation per policy and
 * case, a case inside its promise has none, a mail is one case however often
 * it is delivered, and a resolved case that the customer answers is open again.
 */
async function run(s: Scenario): Promise<void> {
  // D = the latest Mon–Thu that is at least two days back: D and D+1 are business days, both inside the sweep's 7-day lookback.
  const day = (await s.one<{ d: string }>(
    `select to_char(d, 'YYYY-MM-DD') as d from generate_series(current_date - 8, current_date - 2, interval '1 day') d
      where extract(dow from d) between 1 and 4 order by d desc limit 1`))!.d;
  const next = (await s.one<{ d: string }>(`select to_char($1::date + 1, 'YYYY-MM-DD') as d`, [day]))!.d;
  const at = (d: string, hhmm: string) => `${d}T${hhmm}:00+00:00`;
  const calendar = await s.one<{ open: string; holidays: string }>(
    `select (select count(*) from business_hours where is_open and weekday between 1 and 5 and open_time = '09:00' and close_time = '17:00') as open,
            (select count(*) from business_holidays where day in ($1::date, $2::date)) as holidays`, [day, next]);
  s.equal('the SLA calendar is the documented default: Mon–Fri 09–17, no holiday on the two days used', `${calendar?.open}/${calendar?.holidays}`, '5/0');

  // ── Self-service: the knowledge the frontline answers from ────────────────
  const article = await s.must('a KB article answers the recurring question', 'manage_kb_article', {
    action: 'create', title: `Battery reset guide ${s.tag}`, question: `How do I reset the battery ${s.tag}?`,
    answer: 'Hold the button for ten seconds until the light blinks twice.', category: 'Battery',
  });
  const articleId = s.idOf(article, 'article');
  s.skip('FlowPilot answers the visitor from the KB (chat-completion)', 'needs an AI provider');

  // ── The promise ───────────────────────────────────────────────────────────
  await s.mustRefuse('an SLA policy without a threshold is refused', 'manage_sla_policy',
    { action: 'create', name: `Battery no threshold ${s.tag}`, entity_type: 'ticket', metric: 'first_response' }, /threshold/i);
  const frPolicy = s.idOf(await s.must('policy: urgent cases get a first reply within 60 minutes', 'manage_sla_policy', {
    action: 'create', name: `Battery first reply ${s.tag}`, entity_type: 'ticket', metric: 'first_response', threshold_minutes: 60, priority: 'urgent', enabled: true,
  }), 'policy');
  const resPolicy = s.idOf(await s.must('policy: urgent cases are resolved within 480 minutes', 'manage_sla_policy', {
    action: 'create', name: `Battery resolution ${s.tag}`, entity_type: 'ticket', metric: 'resolution', threshold_minutes: 480, priority: 'urgent', enabled: true,
  }), 'policy');

  try {
    // ── The late case ───────────────────────────────────────────────────────
    const late = await s.must('an urgent case is registered as opened at 10:00', 'manage_ticket', {
      action: 'create', subject: `Battery will not charge ${s.tag}`, description: 'Customer cannot charge the unit.', priority: 'urgent', category: 'bug',
      contact_name: 'Battery Kund', contact_email: `kund-${s.tag}@example.test`, source: 'agent', tags: ['battery', s.tag], created_at: at(day, '10:00'),
    });
    const lateId = s.idOf(late, 'ticket');
    const opened = await s.one<{ ticket_number: string; status: string; sla_metric: string; deadline: string }>(
      `select ticket_number, status, sla_metric, to_char(sla_deadline at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as deadline from tickets where id = $1`, [lateId]);
    s.check('the case gets a number and starts as new', /^TIC-\d+$/.test(opened?.ticket_number ?? '') && opened?.status === 'new', JSON.stringify(opened));
    s.equal('its deadline is the first reply, 60 business minutes after opening', `${opened?.sla_metric}/${opened?.deadline}`, `first_response/${day}T11:00`);

    await s.mustRefuse('a status the case cannot have is refused', 'manage_ticket', { action: 'update', id: lateId, status: 'done' }, /enum|invalid|status/i);

    // The human reply is a FlowBox action; the only reply skill (reply_to_ticket_via_email) needs a mailbox.
    s.skip('staff reply through a skill', 'reply_to_ticket_via_email needs a connected mailbox — no skill writes a ticket comment without one');
    await comment(s, lateId, at(day, '10:30'), true, 'agent', 'Internal: checking with the warehouse.');
    const afterNote = await s.one<{ sla_metric: string }>('select sla_metric from tickets where id = $1', [lateId]);
    s.equal('an internal note does not stop the first-reply clock', afterNote?.sla_metric, 'first_response');
    await comment(s, lateId, at(day, '12:30'), false, 'agent', 'We are sending a replacement charger.');
    const afterReply = await s.one<{ sla_metric: string; deadline: string }>(
      `select sla_metric, to_char(sla_deadline at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as deadline from tickets where id = $1`, [lateId]);
    s.equal('after the reply the deadline is the resolution: 480 business minutes → next day 10:00', `${afterReply?.sla_metric}/${afterReply?.deadline}`, `resolution/${next}T10:00`);

    // ── Waiting on the customer pauses the clock ────────────────────────────
    await s.must('the case waits on the customer', 'manage_ticket', { action: 'update', id: lateId, status: 'waiting' });
    s.equal('the clock is paused', (await pauses(s, lateId)), '1/1');
    await s.must('the customer answered — work resumes', 'manage_ticket', { action: 'update', id: lateId, status: 'in_progress' });
    s.equal('the pause is closed, not duplicated', (await pauses(s, lateId)), '1/0');

    // ── The case inside its promise ─────────────────────────────────────────
    const good = s.idOf(await s.must('a second urgent case is opened at 10:00', 'manage_ticket', {
      action: 'create', subject: `Battery manual missing ${s.tag}`, priority: 'urgent', category: 'question',
      contact_email: `kund2-${s.tag}@example.test`, tags: ['battery', s.tag], created_at: at(day, '10:00'),
    }), 'ticket');
    await comment(s, good, at(day, '10:30'), false, 'agent', 'Here is the manual.');
    await s.must('it is resolved at 15:00 the same day', 'manage_ticket', { action: 'update', id: good, status: 'resolved', resolved_at: at(day, '15:00') });
    s.equal('the stated resolution time is what the case carries',
      (await s.one<{ t: string }>(`select to_char(resolved_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as t from tickets where id = $1`, [good]))?.t, `${day}T15:00`);

    // ── Resolution ──────────────────────────────────────────────────────────
    await s.must('a canned response carries the standard answer', 'manage_canned_response', {
      p_action: 'create', p_title: `Battery replacement sent ${s.tag}`, p_shortcut: `/bat-${s.tag}`, p_body_md: 'Hi {{customer_name}}, a replacement is on its way.',
    });
    // Ticket → KB linkage. The column is only ever written by AI triage; the contract of manage_ticket does not declare it.
    s.skip('triage suggests KB articles on the case (ticket_triage)', 'needs an AI provider');
    const linked = await s.skill('manage_ticket', { action: 'update', id: lateId, suggested_kb_article_ids: [articleId] });
    const link = await s.one<{ ids: string[] }>('select suggested_kb_article_ids as ids from tickets where id = $1', [lateId]);
    s.check('the article that solved the case can be linked to it', linked.ok && (link?.ids ?? []).includes(articleId), linked.error || JSON.stringify(link));

    await s.must('the late case is resolved the next day at 11:00', 'manage_ticket', { action: 'update', id: lateId, status: 'resolved', resolved_at: at(next, '11:00') });
    const sweep = await s.must('the SLA sweep runs', 'sla_check', { p_entity_type: 'ticket' });
    s.equal('it measures on the business-hours clock', sweep.business_hours_clock, true);
    s.check('no policy is left without a clock', ((sweep.unmapped_metrics ?? []) as unknown[]).length === 0, JSON.stringify(sweep.unmapped_metrics));
    const fr = await violation(s, frPolicy, lateId);
    s.equal('the late first reply is one violation: 150 minutes against 60', `${fr.n}/${fr.actual}/${fr.threshold}`, '1/150/60');
    const res = await violation(s, resPolicy, lateId);
    s.equal('the late resolution is one violation: 540 minutes against 480 (7 h + 2 h)', `${res.n}/${res.actual}/${res.threshold}`, '1/540/480');
    s.check('both clocks have stopped, so the sweep closes what it opened', fr.resolved && res.resolved, `first reply closed: ${fr.resolved}, resolution closed: ${res.resolved}`);
    await s.must('the sweep runs a second time', 'sla_check', { p_entity_type: 'ticket' });
    s.equal('still one violation per policy on the late case',
      `${(await violation(s, frPolicy, lateId)).n}/${(await violation(s, resPolicy, lateId)).n}`, '1/1');
    s.equal('the case inside its promise has none', `${(await violation(s, frPolicy, good)).n}/${(await violation(s, resPolicy, good)).n}`, '0/0');
    const closedRow = await s.one<{ status: string; deadline: string | null }>('select status, sla_deadline::text as deadline from tickets where id = $1', [lateId]);
    s.equal('a resolved case has no deadline left', `${closedRow?.status}/${closedRow?.deadline}`, 'resolved/null');

    const listed = await s.must('open and closed violations are listed', 'list_sla_violations', { action: 'list', entity_type: 'ticket', include_resolved: true, limit: 200 });
    s.check('the list carries the late case', JSON.stringify(listed).includes(lateId), JSON.stringify(listed).slice(0, 200));
    const found = await s.must('the case is found by its words', 'search_tickets', { p_query: `charge ${s.tag}` });
    s.check('search returns exactly the late case', ((found.results ?? []) as Array<{ id: string }>).map((r) => r.id).join() === lateId, JSON.stringify(found).slice(0, 300));
    const esc = await s.must('the escalation sweep runs', 'run_ticket_escalations', {});
    s.check('it reports no broken rules', ((esc.skipped_rules ?? []) as unknown[]).length === 0, JSON.stringify(esc).slice(0, 300));

    // ── Reopen ──────────────────────────────────────────────────────────────
    await s.must('the late case is reopened', 'manage_ticket', { action: 'update', id: lateId, status: 'open' });
    // FINDING 2026-09-19: reopening through manage_ticket leaves resolved_at — the resolution clock reads it as stopped,
    // so a reopened case can never breach again and has no deadline (email_to_ticket clears it; manage_ticket does not).
    s.equal('a reopened case is no longer stamped as resolved',
      (await s.one<{ r: string | null }>('select resolved_at::text as r from tickets where id = $1', [lateId]))?.r ?? null, null);
    await s.must('… and closed for good', 'manage_ticket', { action: 'update', id: lateId, status: 'closed' });

    // ── E-mail → case ───────────────────────────────────────────────────────
    const mail = { message_id: `bat-msg-${s.tag}`, thread_id: `bat-thread-${s.tag}`, from: `Eva Kund <eva-${s.tag}@example.test>`, subject: `Invoice question ${s.tag}`, body_text: 'Why was I charged twice?' };
    const first = await s.must('an inbound e-mail becomes a case', 'email_to_ticket', mail);
    const mailTicket = String(first.ticket_id);
    const again = await s.must('the same e-mail is delivered again', 'email_to_ticket', mail);
    s.check('the second delivery is recognised', again.deduped === true && again.ticket_id === mailTicket, JSON.stringify(again));
    const skipped = await s.must('a newsletter is delivered', 'email_to_ticket', { message_id: `bat-noise-${s.tag}`, from: 'news@example.test', subject: `Deals ${s.tag}`, classification: 'noise' });
    s.equal('noise never becomes a case', skipped.skipped, 'noise');
    await s.must('the e-mail case is resolved', 'manage_ticket', { action: 'update', id: mailTicket, status: 'resolved' });
    // FINDING 2026-09-19: manage_ticket's contract says "resolved/closed also stamp resolved_at/closed_at" — the generic
    // handler stamps neither; only a caller that passes the timestamp itself gets one.
    const stamps = await s.one<{ resolved_at: string | null; closed_at: string | null }>(
      `select (select resolved_at::text from tickets where id = $1) as resolved_at, (select closed_at::text from tickets where id = $2) as closed_at`, [mailTicket, lateId]);
    s.check('resolving stamps resolved_at and closing stamps closed_at', stamps?.resolved_at != null && stamps?.closed_at != null, JSON.stringify(stamps));
    const reply = { message_id: `bat-msg2-${s.tag}`, thread_id: mail.thread_id, from: mail.from, subject: `Re: ${mail.subject}`, body_text: 'It happened again.' };
    const threaded = await s.must('the customer replies on the thread', 'email_to_ticket', reply);
    s.check('the reply lands on the same case and reopens it', threaded.ticket_id === mailTicket && threaded.reopened === true, JSON.stringify(threaded));
    await s.must('the reply is delivered a second time', 'email_to_ticket', reply);
    const mailState = await s.one<{ tickets: string; comments: string; status: string; resolved_at: string | null }>(
      `select (select count(*) from tickets where contact_email = $2) as tickets,
              (select count(*) from ticket_comments where ticket_id = $1 and author_type = 'customer') as comments,
              status, resolved_at::text from tickets where id = $1`, [mailTicket, `eva-${s.tag}@example.test`]);
    s.equal('one case for the customer, open again, not stamped resolved', `${mailState?.tickets}/${mailState?.status}/${mailState?.resolved_at}`, '1/open/null');
    // FINDING 2026-09-19: email_to_ticket dedupes on tickets.source_id only — a redelivered REPLY has no such row and is appended again.
    s.equal('the redelivered reply is one comment, not two', mailState?.comments, 1);

    // ── Hand-off and feedback ───────────────────────────────────────────────
    s.skip('a chat conversation is handed to a person (support_assign_conversation)', 'a conversation only exists after a chat with FlowPilot — needs an AI provider');
    s.skip('feedback → KB gap analysis (analyze_chat_feedback)', 'needs an AI provider');
    const report = await s.must('the compliance report is read', 'sla_compliance_report', { p_days: 30, p_entity_type: 'ticket' });
    s.check('it counts the breaches of this run', /violation/i.test(JSON.stringify(report)), JSON.stringify(report).slice(0, 300));
  } finally {
    // The policies watch every urgent case on the instance — switch them off so the next run starts clean.
    await s.skill('manage_sla_policy', { action: 'update', id: frPolicy, enabled: false });
    await s.skill('manage_sla_policy', { action: 'update', id: resPolicy, enabled: false });
  }
}

/** The human in FlowBox: a comment on the case at a stated time (no skill writes one without a connected mailbox). */
async function comment(s: Scenario, ticketId: string, when: string, internal: boolean, author: string, text: string): Promise<void> {
  await s.asService(
    `insert into ticket_comments (ticket_id, content, is_internal, author_type, author_name, created_at) values ($1, $2, $3, $4, 'Battery Agent', $5)`,
    [ticketId, text, internal, author, when]);
}

async function violation(s: Scenario, policyId: string, ticketId: string): Promise<{ n: number; actual: number | null; threshold: number | null; resolved: boolean }> {
  const row = await s.one<{ n: string; actual: number | null; threshold: number | null; resolved: boolean | null }>(
    `select count(*) as n, max(actual_minutes) as actual, max(threshold_minutes) as threshold, bool_and(resolved_at is not null) as resolved
       from sla_violations where policy_id = $1 and entity_id = $2`, [policyId, ticketId]);
  return { n: Number(row?.n ?? 0), actual: row?.actual ?? null, threshold: row?.threshold ?? null, resolved: row?.resolved === true };
}

/** "<pauses>/<still open>" on a ticket's SLA clock. */
async function pauses(s: Scenario, ticketId: string): Promise<string> {
  const row = await s.one<{ n: string; open: string }>(
    `select count(*) as n, count(*) filter (where resumed_at is null) as open from sla_clock_pauses where entity_type = 'ticket' and entity_id = $1`, [ticketId]);
  return `${row?.n}/${row?.open}`;
}

export default { process: 'support-to-resolution', run } satisfies ScenarioModule;
