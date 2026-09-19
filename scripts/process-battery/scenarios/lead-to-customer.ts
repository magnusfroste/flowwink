import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scenario, ScenarioModule } from '../lib';

/**
 * Lead-to-Customer: a visitor submits a form twice, the lead is scored and
 * linked to its company, becomes an opportunity with a 120 000 kr deal, the
 * deal walks the pipeline and is won. The end state that must hold: ONE lead,
 * ONE company and ONE party for the person all the way through; the score is
 * what the activities say it is; the forecast is value × stage probability;
 * a won deal turns lead and company into customers exactly once; a lost deal
 * keeps its reason and a reopened one drops it; duplicates can be found AND
 * merged; the activity ledger cannot be rewritten.
 */
async function run(s: Scenario): Promise<void> {
  const domain = `lead-${s.tag}.test`;
  const email = `anna.berg@${domain}`;

  // ── The company is known before the person shows up ──────────────────────
  const company = await s.must('the company is in the register', 'manage_company', {
    action: 'create', name: `Berg & Partners ${s.tag}`, domain, industry: 'consulting',
  });
  const companyId = s.idOf(company, 'company');

  // ── Form capture — the visitor's own surface (anon RPC, no skill exists) ──
  const anon = anonKey();
  if (!anon) {
    s.skip('form capture through the public surface', 'no local anon key (supabase-go status) — set BATTERY_ANON_KEY');
    await s.must('the lead is entered by hand instead', 'add_lead', { email, name: 'Anna Berg', source: 'form' });
  } else {
    const first = await anonRpc(anon, 'ingest_form_lead', {
      p_email: `Anna.Berg@${domain.toUpperCase()}`, p_name: 'Anna Berg', p_form_name: `Kontakt ${s.tag}`,
      p_form_data: { message: 'Vi behöver hjälp med en upphandling' },
    });
    s.check('a visitor can submit the contact form (anon RPC)', first.ok, first.detail);
    const again = await anonRpc(anon, 'ingest_form_lead', {
      p_email: email, p_name: 'Anna Berg', p_phone: '+46 70 123 45 67', p_form_name: `Kontakt ${s.tag}`,
      p_form_data: { message: 'Skickar igen — ni har inte svarat' },
    });
    s.check('the same visitor submits again', again.ok, again.detail);
  }

  const leads = await s.sql<{ id: string; email: string; source: string; score: number; company_id: string | null; phone: string | null }>(
    `select id, email, source, score, company_id, phone from leads where lower(email) = $1`, [email]);
  s.equal('two submissions from one address are ONE lead', leads.length, 1);
  const leadId = leads[0]?.id;
  if (!leadId) throw new Error('no lead to continue with');
  s.equal('the address is stored normalised', leads[0].email, email);
  s.equal('the lead is linked to its company by e-mail domain', leads[0].company_id, companyId);
  if (anon) {
    s.equal('a form lead is born with 10 points — the second submission adds none', leads[0].score, 10);
    s.equal('the second submission filled the missing phone number', leads[0].phone, '+46 70 123 45 67');
    const acts = await s.one<{ n: string }>(`select count(*) as n from lead_activities where lead_id = $1 and type = 'form_submit'`, [leadId]);
    s.equal('each submission is on the activity ledger', acts?.n, 2);
  }

  const known = await s.must('entering the same address by hand finds the existing lead', 'add_lead', { email, name: 'Anna Berg' });
  s.check('add_lead answers existing:true with the same id', known.existing === true && known.lead_id === leadId, JSON.stringify(known));

  // ── Scoring: deterministic, from the ledger ──────────────────────────────
  // Two form_submit activities, 10 points each, ×1.5 inside the 7-day recency
  // window → 15 + 15 = 30 → "warm" (20 ≤ score < 50).
  if (anon) {
    const q1 = await s.must('the lead is qualified', 'qualify_lead', { leadId });
    s.equal('score = 2 × round(10 × 1.5) = 30', q1.score, 30);
    s.equal('30 points is a warm lead', q1.engagement_level, 'warm');
    const q2 = await s.must('qualifying again', 'qualify_lead', { lead_id: leadId });
    s.equal('…recomputes the same 30 — never accumulates', q2.score, 30);
    const stored = await s.one<{ score: number; q: Date | null }>('select score, ai_qualified_at as q from leads where id = $1', [leadId]);
    s.check('the stored score is 30 and the qualification is stamped', stored?.score === 30 && stored?.q != null, JSON.stringify(stored));
  }

  const intent = await s.skill('score_visitor_intent', { lead_id: leadId });
  s.check('visitor-intent scoring runs for a lead without browsing history', intent.ok, intent.error);
  s.skip('enrichment (enrich_company, prospect_research)', 'needs an AI provider / web access');

  // ── Pipeline review: its own filter values must work ─────────────────────
  // FINDING 2026-09-19: lead_pipeline_review advertises status_filter new|contacted|qualified|all
  // but passes the value raw into leads.status (enum lead|opportunity|customer|lost) — three of
  // its four documented values crash with "invalid input value for enum lead_status".
  const filtered = await s.skill('lead_pipeline_review', { status_filter: 'qualified', limit: 5 });
  s.check('lead_pipeline_review accepts its own documented status_filter "qualified"', filtered.ok, filtered.error);

  // ── Lead → opportunity → deal ────────────────────────────────────────────
  const promoted = await s.must('the lead becomes an opportunity', 'manage_leads', { action: 'update', lead_id: leadId, status: 'qualified' });
  s.equal('"qualified" is mapped to the canonical status and says so', `${promoted.status}|${Boolean(promoted.note)}`, 'opportunity|true');

  await s.mustRefuse('a deal with no contact anchor is refused', 'manage_deal',
    { action: 'create', value_cents: 100 }, /contact anchor/i);

  const before = await forecast(s);
  const deal = await s.must('a 120 000 kr deal is opened on the lead', 'manage_deal', {
    action: 'create', lead_id: leadId, value_cents: 12_000_000, stage: 'qualified', notes: `battery ${s.tag}`,
  });
  const dealId = s.idOf(deal, 'deal');
  const dealRow = await s.one<{ lead_id: string; currency: string; stage: string; stage_key: string | null }>(
    `select d.lead_id, d.currency, d.stage, p.key as stage_key from deals d left join pipeline_stages p on p.id = d.stage_id where d.id = $1`, [dealId]);
  s.equal('the deal sits on the lead, in SEK, stage and stage_id agreeing', `${dealRow?.lead_id}|${dealRow?.currency}|${dealRow?.stage}|${dealRow?.stage_key}`, `${leadId}|SEK|qualified|qualified`);

  // 12 000 000 öre × 40 % (qualified) = 4 800 000 öre weighted.
  const after = await forecast(s);
  if (before && after) {
    s.equal('the weighted forecast grew by 120 000 kr × 40 % = 48 000 kr', after.weighted - before.weighted, 4_800_000);
    s.equal('the open pipeline grew by the full 120 000 kr', after.open - before.open, 12_000_000);
  } else {
    s.check('lead_pipeline_review returns a forecast', false, 'no forecast in the response');
  }

  await s.mustRefuse('an unknown stage is refused', 'manage_deal', { action: 'move_stage', deal_id: dealId, stage: 'signed' }, /invalid deal stage/i);
  await s.must('the deal moves to proposal', 'manage_deal', { action: 'move_stage', deal_id: dealId, stage: 'proposal' });
  await s.must('…and on to negotiation', 'manage_deal', { action: 'move_stage', deal_id: dealId, stage: 'negotiating' });
  const hist = await s.one<{ n: string }>(`select count(*) as n from deal_history where deal_id = $1 and field = 'stage'`, [dealId]);
  s.equal('both stage moves are in the deal history', hist?.n, 2);
  // 12 000 000 × 80 % (negotiation) = 9 600 000.
  const late = await forecast(s);
  if (before && late) s.equal('at negotiation the same deal weighs 120 000 kr × 80 % = 96 000 kr', late.weighted - before.weighted, 9_600_000);

  await s.mustRefuse('a deal cannot be deleted', 'manage_deal', { action: 'delete', deal_id: dealId }, /never deleted/i);

  // ── A second person at the same company; a deal that names Anna stays Anna's ─
  const bertil = await s.must('a colleague at the same company is added', 'add_lead', { email: `bertil.ek@${domain}`, name: 'Bertil Ek', source: 'manual' });
  const bertilId = s.idOf(bertil, 'lead');
  // FINDING 2026-09-19: manage_deal create with company_id + lead_email ignores the e-mail and
  // attaches the deal to the company's NEWEST lead (agent-execute executeDealsAction: the company
  // branch resolves lead_id first, the lead_email branch only runs when it found nothing).
  const side = await s.skill('manage_deal', {
    action: 'create', company_id: companyId, lead_email: email, value_cents: 2_500_000, stage: 'proposal', notes: `battery side deal ${s.tag}`,
  });
  s.check('a side deal is created with company_id + lead_email', side.ok, side.error);
  s.check('the deal lands on the person named by lead_email, not on the newest colleague',
    side.data.lead_id === leadId, `expected Anna ${leadId}, got ${String(side.data.lead_id)}${side.data.lead_id === bertilId ? ' (Bertil)' : ''}`);

  // ── Lost discipline on the side deal ─────────────────────────────────────
  if (side.ok) {
    const sideId = s.idOf(side.data, 'deal');
    await s.must('the side deal is lost on price', 'manage_deal', { action: 'move_stage', deal_id: sideId, stage: 'lost', lost_reason: 'price', lost_note: 'too expensive' });
    const lost = await s.one<{ stage: string; lost_reason: string | null; closed: boolean }>(
      'select stage, lost_reason, closed_at is not null as closed from deals where id = $1', [sideId]);
    s.equal('lost keeps its reason and a close date', `${lost?.stage}|${lost?.lost_reason}|${lost?.closed}`, 'closed_lost|price|true');
    await s.must('the side deal is reopened', 'manage_deal', { action: 'move_stage', deal_id: sideId, stage: 'proposal' });
    const reopened = await s.one<{ lost_reason: string | null; closed: boolean }>('select lost_reason, closed_at is not null as closed from deals where id = $1', [sideId]);
    s.equal('reopening clears the reason and the close date', `${reopened?.lost_reason}|${reopened?.closed}`, 'null|false');
    await s.must('…and lost again, so it stays out of the books', 'manage_deal', { action: 'move_stage', deal_id: sideId, stage: 'closed_lost', lost_reason: 'timing' });
  }

  // ── Won: lead and company become customers, once ─────────────────────────
  await s.must('the deal is won', 'manage_deal', { action: 'move_stage', deal_id: dealId, stage: 'won' });
  const won = await s.one<{ stage: string; closed: boolean; lead_status: string; lifecycle: string; since: Date | null }>(
    `select d.stage, d.closed_at is not null as closed, l.status as lead_status, c.lifecycle_stage as lifecycle, c.customer_since as since
       from deals d join leads l on l.id = d.lead_id join companies c on c.id = l.company_id where d.id = $1`, [dealId]);
  s.equal('won closes the deal and turns lead and company into customers', `${won?.stage}|${won?.closed}|${won?.lead_status}|${won?.lifecycle}`, 'closed_won|true|customer|customer');
  await s.must('the won deal is amended afterwards', 'manage_deal', { action: 'update', deal_id: dealId, stage: 'closed_won', notes: `battery ${s.tag} — signed` });
  const since2 = await s.one<{ since: Date | null }>('select customer_since as since from companies where id = $1', [companyId]);
  s.check('customer_since is stamped once and survives a repeat', won?.since != null && since2?.since?.getTime() === won.since.getTime(), `${String(won?.since)} → ${String(since2?.since)}`);
  const bystander = await s.one<{ status: string }>('select status from leads where id = $1', [bertilId]);
  s.equal('the colleague who was never on the won deal is still a lead', bystander?.status, 'lead');
  const wonBoard = await forecast(s);
  if (before && wonBoard) s.equal('booked: the won 120 000 kr counts at 100 %', wonBoard.won - before.won, 12_000_000);

  // ── ONE party through the conversion ─────────────────────────────────────
  const p1 = await s.must('the customer gets a party in the register', 'ensure_lead_partner', { lead_id: leadId });
  const p2 = await s.must('asking again', 'ensure_lead_partner', { lead_id: leadId });
  s.check('…returns the same party and creates nothing', p1.partner_id === p2.partner_id && p2.created === false, JSON.stringify(p2));
  const parties = await s.sql<{ id: string; customer_rank: number; parent_company: string | null }>(
    `select p.id, p.customer_rank, parent.source_company_id as parent_company
       from partners p left join partners parent on parent.id = p.parent_id where lower(p.email) = $1`, [email]);
  s.equal('exactly ONE party carries the address', parties.length, 1);
  s.equal('the party is a customer under the company\'s party', `${parties[0]?.customer_rank}|${parties[0]?.parent_company}`, `1|${companyId}`);
  const orgs = await s.one<{ n: string }>('select count(*) as n from companies where domain = $1', [domain]);
  s.equal('the company is still ONE row', orgs?.n, 1);

  // ── The ledger cannot be rewritten (probed inside a transaction that is rolled back) ─
  const entry = await s.one<{ id: string }>('select id from lead_activities where lead_id = $1 limit 1', [leadId]);
  if (entry) {
    await s.sql('begin');
    let refused = '';
    try {
      await s.sql('update lead_activities set points = 500 where id = $1', [entry.id]);
    } catch (e) { refused = (e as Error).message; }
    await s.sql('rollback');
    s.check('rewriting the points of a ledger entry is refused', /immutable/i.test(refused), refused || 'the update was accepted');
  } else {
    s.skip('ledger immutability', 'no activity on the lead (form capture was skipped)');
  }

  // ── Duplicates: found, then merged ───────────────────────────────────────
  const dupe = await s.must('the same person signs up with a plus-address', 'add_lead', { email: `anna.berg+event@${domain}`, name: 'Anna Berg', source: 'event' });
  const dupeId = s.idOf(dupe, 'lead');
  const task = await s.must('a follow-up task is put on the duplicate', 'crm_task_create', { lead_id: dupeId, title: `Ring Anna ${s.tag}`, priority: 'high' });
  const done = await s.must('…and completed with a note', 'crm_task_update', { id: s.idOf(task, 'task'), completed_at: new Date().toISOString(), completion_note: 'Pratade med Anna' });
  s.equal('completing the task posts it to the lead\'s timeline', done.timeline_posted, true);

  const pairs = await s.must('duplicates are searched', 'find_duplicate_leads', { p_threshold: 0.95, p_limit: 5000 });
  const mine = ((pairs.pairs ?? []) as Array<{ lead_a: string; lead_b: string; same_email: boolean; score: number }>)
    .find((p) => [p.lead_a, p.lead_b].includes(leadId) && [p.lead_a, p.lead_b].includes(dupeId));
  s.check('the plus-address pair is flagged same_email with score 1', mine?.same_email === true && Number(mine?.score) === 1, JSON.stringify(mine ?? null));

  // FINDING 2026-09-19: merge_leads moves lead_activities by UPDATE … SET lead_id, which the
  // ledger guard (lead_activity_ledger_guard) refuses as "the entry is immutable" — so a
  // duplicate that has ANY history (every form lead has) can never be merged.
  const merged = await s.skill('merge_leads', { p_primary_id: leadId, p_duplicate_id: dupeId });
  s.check('the duplicate (which has history) is merged into the customer', merged.ok, merged.error);
  const survivors = await s.one<{ n: string }>(`select count(*) as n from leads where id = any($1::uuid[])`, [[leadId, dupeId]]);
  s.equal('after the merge ONE lead remains', survivors?.n, 1);
  const moved = await s.one<{ n: string }>(`select count(*) as n from lead_activities where lead_id = $1 and type = 'task_completed'`, [leadId]);
  s.equal('…and it carries the duplicate\'s history', moved?.n, 1);
  await s.mustRefuse('a lead cannot be merged into itself', 'merge_leads', { p_primary_id: leadId, p_duplicate_id: leadId }, /same lead/i);

  // FINDING 2026-09-19: add_lead matches the address with .eq('email', …) — case-sensitive —
  // so the same person typed with a capital letter becomes a second lead (leads_email_unique is
  // on the raw text). ingest_form_lead, register_for_webinar and manage_deal all compare lower().
  const shout = await s.skill('add_lead', { email: `Anna.Berg@${domain}`, name: 'Anna Berg' });
  s.check('add_lead recognises the address in another letter case', shout.ok && shout.data.lead_id === leadId,
    `expected existing lead ${leadId}, got ${JSON.stringify(shout.data)}`);

  // ── Company duplicates are detectable ────────────────────────────────────
  // FINDING 2026-09-19: manage_company advertises action "get" but the handler has no such branch.
  const got = await s.skill('manage_company', { action: 'get', company_id: companyId });
  s.check('manage_company get (in the skill\'s action enum) returns the company', got.ok, got.error);

  const twin = await s.must('a second company with the same domain slips in', 'manage_company', { action: 'create', name: `Berg Partners AB ${s.tag}`, domain });
  const twinId = s.idOf(twin, 'company');
  const cPairs = await s.must('company duplicates are searched', 'find_duplicate_companies', { p_threshold: 0.95, p_limit: 5000 });
  const cMine = ((cPairs.pairs ?? []) as Array<{ company_a: string; company_b: string; same_domain: boolean; score: number }>)
    .find((p) => [p.company_a, p.company_b].includes(companyId) && [p.company_a, p.company_b].includes(twinId));
  s.check('the identical domain scores 1.0', cMine?.same_domain === true && Number(cMine?.score) === 1, JSON.stringify(cMine ?? null));
  await s.must('the twin is retired again', 'manage_company', { action: 'update', company_id: twinId, domain: `retired-${s.tag}.test`, notes: 'battery: duplicate, retired' });

  // ── Lost → nurture ───────────────────────────────────────────────────────
  await s.must('the colleague is lost — no response', 'manage_leads', { action: 'update', lead_id: bertilId, status: 'lost', lost_reason: 'no_response', lost_note: 'three calls, no answer' });
  const lostLead = await s.one<{ status: string; lost_reason: string | null }>('select status, lost_reason from leads where id = $1', [bertilId]);
  s.equal('the lost lead keeps its reason', `${lostLead?.status}|${lostLead?.lost_reason}`, 'lost|no_response');
  const nurture = await s.must('a re-engage nurture mail is drafted for the lost lead', 'lead_nurture_sequence', { lead_id: bertilId, sequence_type: 're-engage' });
  const draft = await s.one<{ status: string; sent_at: Date | null }>('select status, sent_at from newsletters where id = $1', [s.idOf(nurture, 'newsletter')]);
  s.equal('the nurture mail is a DRAFT — nothing was sent', `${draft?.status}|${draft?.sent_at}`, 'draft|null');
  s.skip('the nurture copy itself', 'needs an AI provider — the fallback template was used');
}

interface Forecast { weighted: number; open: number; won: number }

async function forecast(s: Scenario): Promise<Forecast | null> {
  const out = await s.skill('lead_pipeline_review', { status_filter: 'all', limit: 1 });
  const f = out.data.forecast as { weighted_pipeline_cents?: number; open_pipeline_cents?: number; won_cents?: number } | null | undefined;
  if (!out.ok || !f) return null;
  return { weighted: Number(f.weighted_pipeline_cents ?? 0), open: Number(f.open_pipeline_cents ?? 0), won: Number(f.won_cents ?? 0) };
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

async function anonRpc(key: string, fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const base = (process.env.BATTERY_REST_URL ?? 'http://127.0.0.1:54321/rest/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify(args),
  });
  return { ok: res.ok, detail: res.ok ? '' : `${res.status}: ${(await res.text()).slice(0, 200)}` };
}

export default { process: 'lead-to-customer', run } satisfies ScenarioModule;
