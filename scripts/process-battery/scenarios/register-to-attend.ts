import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scenario, ScenarioModule } from '../lib';

/**
 * Register-to-Attend: a two-seat webinar is drafted, published, filled, run,
 * completed and followed up. The end state that must hold: a draft is invisible
 * and closed; every registration is ONE row and ONE scored lead (+15 once, +10
 * on the flip to attended, never twice); the third person does not get a seat —
 * through the skill, in parallel, or through the visitor's own surface; the
 * score the process promises survives the platform's own qualification sweep;
 * the webinar walks draft → published → live → completed and nothing walks it
 * backwards; cancelling waits for a human.
 */
async function run(s: Scenario): Promise<void> {
  const anon = anonKey();
  const inTwoWeeks = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const mail = (n: string) => `deltagare-${n}-${s.tag}@example.test`;

  // ── Draft ────────────────────────────────────────────────────────────────
  const made = await s.must('a two-seat webinar is drafted', 'manage_webinar', {
    action: 'create', title: `Upphandling 101 ${s.tag}`, date: inTwoWeeks, platform: 'zoom',
    meeting_url: 'https://example.test/meet', max_attendees: 2, description: 'process battery',
  });
  const webinarId = s.idOf(made, 'webinar');
  s.equal('a webinar is born a draft', (await status(s, webinarId)), 'draft');
  await s.mustRefuse('a draft takes no registrations', 'register_webinar',
    { p_webinar_id: webinarId, p_name: 'För Tidig', p_email: mail('early') }, /not open/i);
  if (anon) {
    const seen = await anonGet(anon, `webinars?id=eq.${webinarId}&select=id,status`);
    s.check('an anonymous visitor cannot read the draft', seen.ok && seen.rows.length === 0, `${seen.detail} ${JSON.stringify(seen.rows)}`);
  } else s.skip('anonymous read of the draft', 'no local anon key');

  // ── Publish ──────────────────────────────────────────────────────────────
  await s.must('the webinar is published', 'publish_webinar', { p_webinar_id: webinarId });
  await s.mustRefuse('publishing twice is refused', 'publish_webinar', { p_webinar_id: webinarId }, /not in draft/i);
  s.equal('webinar.published is emitted once', await events(s, 'webinar.published', webinarId), 1);
  if (anon) {
    const seen = await anonGet(anon, `webinars?id=eq.${webinarId}&select=id,status`);
    s.check('the published webinar is visible to visitors', seen.rows.length === 1, seen.detail);
  }

  // ── Registration: one row, one lead, +15 once ────────────────────────────
  const regA = await s.must('A (unknown to the CRM) registers', 'register_webinar', { p_webinar_id: webinarId, p_name: `Astrid Ny ${s.tag}`, p_email: mail('a') });
  const leadA = await s.one<{ id: string; source: string; source_id: string; score: number }>('select id, source, source_id, score from leads where email = $1', [mail('a')]);
  s.equal('A is a new lead: source webinar, pointing at the webinar, 15 points', `${leadA?.source}|${leadA?.source_id}|${leadA?.score}`, `webinar|${webinarId}|15`);
  s.equal('the registration carries the lead', regA.lead_id, leadA?.id);

  const known = await s.must('B is already a lead (0 points)', 'add_lead', { email: mail('b'), name: `Birger Känd ${s.tag}`, source: 'manual' });
  const leadB = s.idOf(known, 'lead');
  const regB = await s.must('B registers', 'register_webinar', { p_webinar_id: webinarId, p_name: `Birger Känd ${s.tag}`, p_email: mail('b') });
  const regBId = String(regB.registration_id);
  s.equal('B is linked to the existing lead', regB.lead_id, leadB);
  s.equal('B\'s score is 0 + 15', await score(s, leadB), 15);

  // The webinar is now full (2 of 2). The same person again — other letter case — is the same seat.
  const again = await s.must('B registers again, in CAPITALS, on a full webinar', 'register_webinar',
    { p_webinar_id: webinarId, p_name: `Birger Känd ${s.tag}`, p_email: mail('b').toUpperCase(), p_phone: '+46 70 555 02 02' });
  s.equal('…and gets the same registration back', again.registration_id, regBId);
  s.equal('still 15 points — a registration scores once', await score(s, leadB), 15);
  s.equal('still ONE lead for the address', (await s.one<{ n: string }>('select count(*) as n from leads where lower(email) = $1', [mail('b')]))?.n, 1);

  await s.mustRefuse('C finds the webinar full (2 of 2)', 'register_webinar',
    { p_webinar_id: webinarId, p_name: `Cecilia Sen ${s.tag}`, p_email: mail('c') }, /full/i);
  await s.mustRefuse('a registration without an address is refused', 'register_webinar',
    { p_webinar_id: webinarId, p_name: 'Ingen Adress', p_email: '' }, /email is required/i);

  // FINDING 2026-09-19: the visitor's surface is NOT the RPC. WebinarBlock.tsx inserts straight
  // into webinar_registrations under the policy "Anyone can register for webinars" WITH CHECK (true):
  // no status check, no capacity check. The doc says visitors, chat and operators share one RPC.
  if (anon) {
    const squeezed = await anonPost(anon, 'webinar_registrations', { webinar_id: webinarId, name: 'Dörr Bakväg', email: mail('d') });
    s.check('the visitor surface refuses a third seat on a two-seat webinar', !squeezed.ok, `anon insert answered ${squeezed.detail}`);
  } else s.skip('capacity on the visitor surface', 'no local anon key');
  // FINDING 2026-09-19: manage_webinar still answers an undeclared action "register" with a raw
  // insert — no capacity, no status, no lead.
  await s.mustRefuse('manage_webinar has no side door for registrations', 'manage_webinar',
    { action: 'register', webinar_id: webinarId, name: 'Erik Sidodörr', email: mail('e') }, /unknown|full|not open/i);
  s.equal('the two-seat webinar holds two registrations', (await s.one<{ n: string }>('select count(*) as n from webinar_registrations where webinar_id = $1', [webinarId]))?.n, 2);

  const listed = await s.must('the operator reviews the list', 'manage_webinar', { action: 'registrations', webinar_id: webinarId });
  s.check('the list shows A and B', ['a', 'b'].every((n) => ((listed.registrations ?? []) as Array<{ email: string }>).some((r) => r.email === mail(n))), JSON.stringify(listed).slice(0, 300));

  // One seat, four people at the same moment.
  // FINDING 2026-09-19 (if red): the capacity test is count(*) then INSERT, with no lock on the webinar.
  const tight = await s.must('a ONE-seat webinar is drafted', 'manage_webinar', { action: 'create', title: `Rundabord ${s.tag}`, date: inTwoWeeks, max_attendees: 1 });
  const tightId = s.idOf(tight, 'webinar');
  await s.must('…and published', 'publish_webinar', { p_webinar_id: tightId });
  const rush = await Promise.all(['r1', 'r2', 'r3', 'r4'].map((n) =>
    s.skill('register_webinar', { p_webinar_id: tightId, p_name: `Rusning ${n} ${s.tag}`, p_email: mail(n) })));
  const seated = await s.one<{ n: string }>('select count(*) as n from webinar_registrations where webinar_id = $1', [tightId]);
  // A race flips between runs, and a check that flips cannot be a ratchet key: assert the structure
  // (the RPC locks the webinar row before it counts), and carry the race result as detail.
  const locks = await s.one<{ locks: boolean }>(
    // The rule lives on the TABLE since 20260919100000 (webinar_registration_gate, BEFORE INSERT), so every writer obeys it.
    `select (pg_get_functiondef('public.register_for_webinar'::regproc) || coalesce((select string_agg(pg_get_functiondef(t.tgfoid), ' ') from pg_trigger t
              where t.tgrelid = 'public.webinar_registrations'::regclass and not t.tgisinternal), '')) ~* 'pg_advisory_xact_lock|for update|lock table' as locks`);
  s.check('capacity is counted under a lock, so a rush for the last seat seats one person', locks?.locks === true,
    `neither register_for_webinar nor a trigger on webinar_registrations takes a lock; this run ${seated?.n} registrations landed on a one-seat webinar and ${rush.filter((r) => r.ok).length} of 4 were told "registered"`);
  // With the lock in place the race is deterministic, so the behaviour is asserted too.
  s.equal('four simultaneous registrations for ONE seat seat exactly one person', seated?.n, 1);

  // ── Reminders ────────────────────────────────────────────────────────────
  const sweep1 = await s.skill('send_webinar_reminders', {});
  const stamped = await s.one<{ n: string }>('select count(*) as n from webinar_registrations where webinar_id = $1 and reminder_confirm_sent_at is not null', [webinarId]);
  if (sweep1.ok && Number(stamped?.n) > 0) {
    const first = await s.sql<{ id: string; t: Date }>('select id, reminder_confirm_sent_at as t from webinar_registrations where webinar_id = $1 order by id', [webinarId]);
    await s.must('the reminder sweep runs a second time', 'send_webinar_reminders', {});
    const second = await s.sql<{ id: string; t: Date }>('select id, reminder_confirm_sent_at as t from webinar_registrations where webinar_id = $1 order by id', [webinarId]);
    s.check('the confirmation is stamped once and never re-sent', JSON.stringify(first) === JSON.stringify(second), `${JSON.stringify(first)} → ${JSON.stringify(second)}`);
  } else {
    s.skip('reminder delivery (confirm / T-24h / T-1h / post)', `needs an e-mail provider — sweep said: ${sweep1.error || JSON.stringify(sweep1.data).slice(0, 160)}`);
  }

  // ── Live → completed ─────────────────────────────────────────────────────
  await s.must('the host goes live', 'start_webinar', { p_webinar_id: webinarId });
  await s.mustRefuse('a live webinar cannot be started again', 'start_webinar', { p_webinar_id: webinarId }, /cannot be started/i);
  await s.must('the session is completed with its recording', 'complete_webinar', { p_webinar_id: webinarId, p_recording_url: 'https://example.test/rec.mp4' });
  const closed = await s.one<{ status: string; recording_url: string }>('select status, recording_url from webinars where id = $1', [webinarId]);
  s.equal('completed, recording attached', `${closed?.status}|${closed?.recording_url}`, 'completed|https://example.test/rec.mp4');
  s.equal('webinar.live and webinar.completed were each emitted once',
    `${await events(s, 'webinar.live', webinarId)}|${await events(s, 'webinar.completed', webinarId)}`, '1|1');
  await s.mustRefuse('a completed webinar takes no registrations', 'register_webinar',
    { p_webinar_id: webinarId, p_name: 'För Sen', p_email: mail('late') }, /not open/i);
  await s.mustRefuse('a completed webinar cannot be cancelled', 'cancel_webinar', { p_webinar_id: webinarId, p_reason: 'battery' }, /cannot be cancelled/i);

  // FINDING 2026-09-19: manage_webinar update spreads every argument into the row, status included —
  // the lifecycle RPCs guard the machine, the update action walks around them (completed → draft).
  await s.mustRefuse('manage_webinar update cannot walk a completed webinar back to draft', 'manage_webinar',
    { action: 'update', webinar_id: webinarId, status: 'draft' }, /status|completed|transition|lifecycle/i);
  s.equal('the webinar is still completed', await status(s, webinarId), 'completed');

  // ── Attendance: +10 on the flip, never twice ─────────────────────────────
  await s.must('B attended', 'mark_webinar_attendance', { p_registration_id: regBId, p_attended: true });
  s.equal('B\'s score is 15 + 10', await score(s, leadB), 25);
  await s.must('B is marked attended again', 'mark_webinar_attendance', { p_registration_id: regBId, p_attended: true });
  s.equal('…and still has 25', await score(s, leadB), 25);
  await s.must('the mark is taken back and set again', 'mark_webinar_attendance', { p_registration_id: regBId, p_attended: false });
  await s.must('…B did attend after all', 'mark_webinar_attendance', { p_registration_id: regBId, p_attended: true });
  // FINDING 2026-09-19 (if red): un-marking does not take the +10 back, so every false→true flip adds 10 again.
  s.equal('correcting a mis-click does not hand out another +10', await score(s, leadB), 25);
  const flags = await s.sql<{ email: string; attended: boolean }>('select email, attended from webinar_registrations where webinar_id = $1 and email = any($2::text[]) order by email', [webinarId, [mail('a'), mail('b')]]);
  s.equal('A absent, B attended', flags.map((f) => `${f.email === mail('a') ? 'A' : 'B'}:${f.attended}`).join(','), 'A:false,B:true');
  await s.mustRefuse('attendance on an unknown registration is refused', 'mark_webinar_attendance',
    { p_registration_id: '00000000-0000-4000-8000-000000000000', p_attended: true }, /not found/i);

  // ── The promised score must survive the platform's own qualification ─────
  // FINDING 2026-09-19: register_for_webinar and mark_webinar_attendance add to leads.score but
  // write NO lead_activities row; qualify_lead (also run as a scheduled sweep over every lead with
  // ai_qualified_at IS NULL — i.e. every webinar-born lead) RECOMPUTES score from the ledger and
  // overwrites it. A's 15 becomes 0, B's 25 becomes 0: "every registration is a scored lead" lasts
  // until the next sweep. (The public block's ingest_webinar_lead does write the ledger row.)
  const ledger = await s.one<{ n: string }>(`select count(*) as n from lead_activities where lead_id = any($1::uuid[]) and type like 'webinar%'`, [[leadA?.id, leadB]]);
  s.check('registration and attendance are on the leads\' activity ledger', Number(ledger?.n) >= 2, `${ledger?.n} webinar activities for two registered leads`);
  await s.must('A is qualified (what the scheduled sweep does)', 'qualify_lead', { leadId: leadA?.id });
  // qualify_lead weighs an activity from the last days × 1.5 — by design: 15 → 23.
  s.equal('A keeps the registration\'s points through qualification (15 × 1.5 recency = 23)', await score(s, String(leadA?.id)), 23);
  await s.must('B is qualified', 'qualify_lead', { leadId: leadB });
  s.check('B keeps at least the 25 points registration + attendance gave', (await score(s, leadB)) >= 25, `B now has ${await score(s, leadB)}`);

  // ── Cancel waits for a human; cancelled is terminal ──────────────────────
  const gatesBefore = s.handshakes.length;
  await s.must('the one-seat webinar is cancelled', 'cancel_webinar', { p_webinar_id: tightId, p_reason: 'talaren sjuk' });
  s.check('…only after a human approved it (trust: approve)', s.handshakes.slice(gatesBefore).some((h) => h.skill === 'cancel_webinar' && h.gate === 'human'), JSON.stringify(s.handshakes.slice(gatesBefore)));
  const cancelEvent = await s.one<{ reason: string }>(`select payload->>'reason' as reason from agent_events where event_name = 'webinar.cancelled' and payload->>'webinar_id' = $1`, [tightId]);
  s.equal('webinar.cancelled carries the reason for the automations', cancelEvent?.reason, 'talaren sjuk');
  await s.mustRefuse('a cancelled webinar takes no registrations', 'register_webinar', { p_webinar_id: tightId, p_name: 'Hoppfull', p_email: mail('hope') }, /not open/i);
  await s.mustRefuse('…and cannot be started', 'start_webinar', { p_webinar_id: tightId }, /cannot be started/i);

  s.skip('generate_blog_from_webinar (the content loop)', 'needs an AI provider');
}

async function status(s: Scenario, id: string): Promise<string | undefined> {
  return (await s.one<{ status: string }>('select status from webinars where id = $1', [id]))?.status;
}
async function score(s: Scenario, leadId: string): Promise<number> {
  return Number((await s.one<{ score: number }>('select score from leads where id = $1', [leadId]))?.score ?? NaN);
}
async function events(s: Scenario, name: string, webinarId: string): Promise<number> {
  return Number((await s.one<{ n: string }>(`select count(*) as n from agent_events where event_name = $1 and payload->>'webinar_id' = $2`, [name, webinarId]))?.n);
}

/** The LOCAL stack's anon key — what a visitor's browser holds. Never printed. */
function anonKey(): string | null {
  if (process.env.BATTERY_ANON_KEY) return process.env.BATTERY_ANON_KEY;
  const bin = process.env.SUPABASE_GO_BIN
    ?? '/opt/homebrew/Cellar/supabase/2.107.0/libexec/lib/node_modules/supabase/node_modules/@supabase/cli-darwin-arm64/bin/supabase-go';
  const cwd = process.env.BATTERY_SUPABASE_DIR ?? join(homedir(), 'Code/github/flowwink-qa');
  try {
    const env = execFileSync(bin, ['status', '-o', 'env'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const line = env.split('\n').find((l) => l.startsWith('ANON_KEY='));
    return line ? line.slice('ANON_KEY='.length).replace(/"/g, '').trim() : null;
  } catch { return null; }
}

const REST = (process.env.BATTERY_REST_URL ?? 'http://127.0.0.1:54321/rest/v1').replace(/\/$/, '');

async function anonGet(key: string, path: string): Promise<{ ok: boolean; rows: unknown[]; detail: string }> {
  const res = await fetch(`${REST}/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, rows: Array.isArray(body) ? body : [], detail: `${res.status}` };
}

async function anonPost(key: string, table: string, row: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, detail: `${res.status} ${(await res.text()).slice(0, 160)}` };
}

export default { process: 'register-to-attend', run } satisfies ScenarioModule;
