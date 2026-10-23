/**
 * import_from_odoo — Odoo CRM into FlowWink, re-runnable, relations intact.
 *
 * Why an importer over the API and not a CSV: Odoo's list export flattens
 * relations to names, cannot carry the chatter, and cannot be re-run. The
 * external API (JSON-RPC, every edition incl. Odoo Online) reads every model
 * with its ids, so a link table (import_links) can remember Odoo id → FlowWink
 * id. That makes the run idempotent — dry-run today, for real on go-live day,
 * the delta in between — and lets a lead point at the right partner without
 * guessing by name.
 *
 * What maps where (FlowWink's partners backbone was shaped after res.partner
 * on purpose; the UI still reads companies + leads, and backfill_partners()
 * derives partners from those, so this writes the UI tables):
 *
 *   res.users (active)                → profiles, matched on email. Unmatched → reported, never guessed.
 *   res.partner is_company            → companies (org_number, vat, address, tags, parent, lifecycle)
 *   res.partner person, type=contact  → leads (status customer/prospect, company_id) — needs an email
 *   crm.lead                          → leads (status by stage/type/active) + deals for opportunities
 *   crm.stage / crm.lost.reason       → FlowWink's fixed stages (relabelled with the Odoo names where 1:1) and lost_reason enum, by rule
 *   mail.message comment|email        → lead_activities (lead) / activities (company), body as text
 *   mail.activity (open to-dos)       → crm_tasks on the contact (+ its deal) with type, due date, assignee; activities for companies
 *   ir.attachment on those records    → documents (via the same path upload_document takes)
 *
 * Odoo notifications ("stage changed") are noise and are skipped.
 *
 * Budget: the Free tier gives an edge function 150 s. Phases paginate on the
 * Odoo id; `phase: 'all'` runs phase after phase until ~90 s and returns
 * `next` — call again with it. Credentials come from the instance's secrets
 * (ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY), never from arguments: an
 * argument is logged in agent_activity.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const ODOO_PHASES = ['users', 'companies', 'contacts', 'leads', 'messages', 'todos', 'attachments'] as const;
export type OdooPhase = typeof ODOO_PHASES[number];
const SOURCE = 'odoo';
const TIME_BUDGET_MS = 90_000;

export interface OdooConfig { url: string; db: string; username: string; apiKey: string }

export function odooConfigFromEnv(): OdooConfig | null {
  const url = Deno.env.get('ODOO_URL')?.replace(/\/+$/, '');
  const db = Deno.env.get('ODOO_DB');
  const username = Deno.env.get('ODOO_USERNAME');
  const apiKey = Deno.env.get('ODOO_API_KEY');
  if (!url || !db || !username || !apiKey) return null;
  return { url, db, username, apiKey };
}

type Rec = Record<string, unknown>;
type M2O = [number, string] | false;

/** Minimal JSON-RPC client. Odoo Online sits behind Cloudflare, which refuses library default user agents. */
export class OdooClient {
  private uid: number | null = null;
  constructor(private cfg: OdooConfig) {}

  private async rpc(service: string, method: string, args: unknown[]): Promise<unknown> {
    const res = await fetch(`${this.cfg.url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; FlowWink-odoo-import/1.0)' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
    });
    if (!res.ok) throw new Error(`Odoo HTTP ${res.status} on ${service}.${method}`);
    const body = await res.json() as { result?: unknown; error?: { message?: string; data?: { message?: string } } };
    if (body.error) throw new Error(`Odoo ${service}.${method}: ${body.error.data?.message ?? body.error.message ?? 'error'}`);
    return body.result;
  }

  async login(): Promise<number> {
    if (this.uid) return this.uid;
    const uid = await this.rpc('common', 'login', [this.cfg.db, this.cfg.username, this.cfg.apiKey]);
    if (typeof uid !== 'number' || !uid) throw new Error('Odoo login failed — check ODOO_DB, ODOO_USERNAME and ODOO_API_KEY');
    this.uid = uid;
    return uid;
  }

  async version(): Promise<string> {
    const v = await this.rpc('common', 'version', []) as { server_version?: string };
    return v?.server_version ?? 'unknown';
  }

  async call<T = unknown>(model: string, method: string, args: unknown[], kwargs: Rec = {}): Promise<T> {
    const uid = await this.login();
    return await this.rpc('object', 'execute_kw', [this.cfg.db, uid, this.cfg.apiKey, model, method, args, kwargs]) as T;
  }

  private fieldCache = new Map<string, Set<string>>();

  /** Fields differ by version (Odoo 19 folded `mobile` into `phone`); ask once, request only what exists. */
  async fields(model: string): Promise<Set<string>> {
    const cached = this.fieldCache.get(model);
    if (cached) return cached;
    const got = await this.call<Record<string, unknown>>(model, 'fields_get', [], { attributes: ['type'] });
    const set = new Set(Object.keys(got ?? {}));
    this.fieldCache.set(model, set);
    return set;
  }

  async searchRead(model: string, domain: unknown[], fields: string[], opts: { limit?: number; afterId?: number; order?: string; context?: Rec } = {}): Promise<Rec[]> {
    const known = await this.fields(model);
    const dom = opts.afterId ? [['id', '>', opts.afterId], ...domain] : domain;
    return this.call<Rec[]>(model, 'search_read', [dom], { fields: fields.filter((f) => known.has(f)), limit: opts.limit ?? 200, order: opts.order ?? 'id asc', context: opts.context ?? {} });
  }

  searchCount(model: string, domain: unknown[], context: Rec = {}): Promise<number> {
    return this.call<number>(model, 'search_count', [domain], { context });
  }
}

// ── helpers ────────────────────────────────────────────────────────────────
const m2oId = (v: unknown): number | null => (Array.isArray(v) && typeof v[0] === 'number' ? v[0] : null);
const m2oName = (v: unknown): string | null => (Array.isArray(v) && typeof v[1] === 'string' ? v[1] : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const odooDate = (v: unknown): string | null => (typeof v === 'string' && v ? new Date(v.replace(' ', 'T') + (v.length === 19 ? 'Z' : '')).toISOString() : null);

/** Odoo bodies are HTML. The timeline shows text; keep the words, lose the markup. */
export function htmlToText(html: unknown): string {
  if (typeof html !== 'string' || !html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Odoo's free-text lost reason → FlowWink's lost_reason enum; the words travel in lost_note. */
export function mapLostReason(name: string | null): 'price' | 'timing' | 'competitor' | 'no_response' | 'other' {
  const n = (name ?? '').toLowerCase();
  if (/pris|price|expensive|budget|cost|dyr/.test(n)) return 'price';
  if (/timing|later|not now|senare|time/.test(n)) return 'timing';
  if (/competitor|konkurrent|chose|went with/.test(n)) return 'competitor';
  if (/no response|unresponsive|inget svar|no answer|ghost/.test(n)) return 'no_response';
  return 'other';
}

type LeadStatus = 'prospect' | 'lead' | 'opportunity' | 'customer' | 'lost';
type DealStage = 'lead' | 'prospecting' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

/** Odoo's stages are per team and free-named; FlowWink's are fixed. Map by flag first, name second, position last. */
export function mapDealStage(stage: { name: string; is_won: boolean; index: number; total: number }, lost: boolean): DealStage {
  if (lost) return 'closed_lost';
  if (stage.is_won) return 'closed_won';
  const n = stage.name.toLowerCase();
  if (/negotiat|förhandl/.test(n)) return 'negotiation';
  if (/propos|offert|quote|quotation/.test(n)) return 'proposal';
  if (/qualif|kvalif/.test(n)) return 'qualified';
  if (/prospect/.test(n)) return 'prospecting';
  if (/new|ny/.test(n) || stage.index === 0) return 'lead';
  const open = Math.max(1, stage.total - 1);
  const pos = stage.index / open;
  return pos < 0.34 ? 'prospecting' : pos < 0.67 ? 'qualified' : 'proposal';
}

/** The names the seed gives FlowWink's deal stages. A stage the operator renamed is never overwritten. */
export const SEED_DEAL_STAGE_NAMES: Record<DealStage, string> = {
  lead: 'Lead', prospecting: 'Prospecting', qualified: 'Qualified', proposal: 'Proposal',
  negotiation: 'Negotiation', closed_won: 'Closed Won', closed_lost: 'Closed Lost',
};

export interface StageRelabel { key: DealStage; from: string; to: string; stage_id: string }

/**
 * Recognition is the columns. Odoo's pipeline is one wall of opportunities in
 * stages with the team's own names ("Nytt", "Kvalificerad", "Offert skickad");
 * FlowWink's deal stages are a fixed set under configurable names. When exactly
 * one Odoo stage maps onto a FlowWink stage, that stage can carry the Odoo name
 * and the board reads as the pipeline the team has been looking at for years.
 * Two Odoo stages on one key keep the FlowWink name (which one would win?), a
 * renamed stage is left alone (the operator chose it), and won/lost keep their
 * names unless Odoo's are different words for the same thing.
 */
export function planStageRelabels(
  odooStages: Iterable<{ name: string; is_won: boolean; index: number; total: number }>,
  fwStages: Array<{ id: string; entity_type: string; key: string; name: string }>,
): { relabels: StageRelabel[]; shared: Array<{ key: DealStage; odoo: string[] }>; kept: Array<{ key: DealStage; name: string; odoo: string }> } {
  const byKey = new Map<DealStage, string[]>();
  for (const s of odooStages) {
    const key = mapDealStage(s, false);
    byKey.set(key, [...(byKey.get(key) ?? []), s.name.trim()]);
  }
  const relabels: StageRelabel[] = []; const shared: Array<{ key: DealStage; odoo: string[] }> = []; const kept: Array<{ key: DealStage; name: string; odoo: string }> = [];
  for (const [key, names] of byKey) {
    const fw = fwStages.find((f) => f.entity_type === 'deal' && f.key === key);
    if (!fw) continue;
    if (names.length > 1) { shared.push({ key, odoo: names }); continue; }
    const to = names[0];
    if (!to || to === fw.name) continue;
    if (fw.name !== SEED_DEAL_STAGE_NAMES[key]) { kept.push({ key, name: fw.name, odoo: to }); continue; }
    relabels.push({ key, from: fw.name, to, stage_id: fw.id });
  }
  return { relabels, shared, kept };
}

export interface ImportArgs {
  phase?: OdooPhase | 'all';
  dry_run?: boolean;
  limit?: number;
  cursor?: number;
  /** ISO date: only records written in Odoo on or after this. For the delta run before go-live. */
  since?: string;
  /** A person or lead without an email gets `odoo-<model>-<id>@<domain>`; off by default — a leads row needs an email, so without this they are reported and skipped. */
  synthesize_missing_email?: boolean;
  /** Give FlowWink's deal stages the names of the Odoo stages that map onto them, so the kanban columns read as the pipeline the team knows. On by default; only touches a stage that still carries its seed name, and only where exactly one Odoo stage maps onto it. */
  relabel_stages?: boolean;
}

export interface PhaseReport {
  phase: OdooPhase;
  scanned: number;
  created: number;
  updated: number;
  matched_existing: number;
  skipped: number;
  cursor: number | null;
  complete: boolean;
  notes: string[];
}

export interface ImportContext {
  supabase: SupabaseClient;
  callerUserId: string | null;
  /** The same path upload_document takes: storage + create_agent_document. Returns { document_id } or { error }. */
  uploadDocument: (args: Rec) => Promise<unknown>;
}

interface LinkRow { model: string; external_id: string; target_table: string; target_id: string }

class Links {
  private cache = new Map<string, string>();
  private pending: Array<{ source: string; model: string; external_id: string; target_table: string; target_id: string; updated_at: string }> = [];
  constructor(private sb: SupabaseClient, private dry: boolean) {}
  private key(model: string, id: number | string) { return `${model}:${id}`; }
  async preload(model: string): Promise<void> {
    const { data, error } = await this.sb.from('import_links').select('model, external_id, target_table, target_id').eq('source', SOURCE).eq('model', model);
    if (error) throw new Error(`import_links read: ${error.message}`);
    for (const r of (data ?? []) as LinkRow[]) this.cache.set(this.key(r.model, r.external_id), r.target_id);
  }
  get(model: string, id: number | string): string | null { return this.cache.get(this.key(model, id)) ?? null; }
  /** Remembered at once, written in batches: one round trip per 100 links instead of one per row. */
  async set(model: string, id: number | string, table: string, targetId: string): Promise<void> {
    this.cache.set(this.key(model, id), targetId);
    if (this.dry) return;
    this.pending.push({ source: SOURCE, model, external_id: String(id), target_table: table, target_id: targetId, updated_at: new Date().toISOString() });
    if (this.pending.length >= 100) await this.flush();
  }
  async flush(): Promise<void> {
    if (!this.pending.length) return;
    const batch = this.pending; this.pending = [];
    // Last write per key wins within a batch (a key may be set twice in one phase).
    const byKey = new Map(batch.map((r) => [`${r.model}:${r.external_id}`, r]));
    const { error } = await this.sb.from('import_links').upsert([...byKey.values()], { onConflict: 'source,model,external_id' });
    if (error) throw new Error(`import_links write (${batch.length} rows): ${error.message}`);
  }
}

function report(phase: OdooPhase): PhaseReport {
  return { phase, scanned: 0, created: 0, updated: 0, matched_existing: 0, skipped: 0, cursor: null, complete: false, notes: [] };
}

const NOTE_CAP = 25;
function note(r: PhaseReport, s: string) { if (r.notes.length < NOTE_CAP) r.notes.push(s); else if (r.notes.length === NOTE_CAP) r.notes.push('…'); }

function sinceDomain(since?: string): unknown[] {
  return since ? [['write_date', '>=', since.slice(0, 19).replace('T', ' ')]] : [];
}

// ── the importer ───────────────────────────────────────────────────────────
export async function importFromOdoo(ctx: ImportContext, rawArgs: Rec): Promise<unknown> {
  const cfg = odooConfigFromEnv();
  if (!cfg) {
    return { error: 'Odoo is not configured on this instance. Set the secrets ODOO_URL, ODOO_DB, ODOO_USERNAME and ODOO_API_KEY (an API key from the Odoo user\'s preferences), then run again.', status: 'failed' };
  }
  const args: ImportArgs = {
    phase: (typeof rawArgs.phase === 'string' ? rawArgs.phase : 'all') as ImportArgs['phase'],
    dry_run: rawArgs.dry_run !== false,
    limit: Math.min(500, Math.max(10, num(rawArgs.limit) || 200)),
    cursor: num(rawArgs.cursor) || 0,
    since: str(rawArgs.since) ?? undefined,
    synthesize_missing_email: rawArgs.synthesize_missing_email === true,
  };
  if (args.phase !== 'all' && !ODOO_PHASES.includes(args.phase as OdooPhase)) {
    return { error: `Unknown phase "${args.phase}". Phases, in order: ${ODOO_PHASES.join(', ')} — or "all".`, status: 'failed' };
  }
  const odoo = new OdooClient(cfg);
  const started = Date.now();
  let version = 'unknown';
  try { await odoo.login(); version = await odoo.version(); } catch (e) { return { error: e instanceof Error ? e.message : String(e), status: 'failed' }; }

  const links = new Links(ctx.supabase, args.dry_run === true);
  const phases: OdooPhase[] = args.phase === 'all' ? [...ODOO_PHASES] : [args.phase as OdooPhase];
  const reports: PhaseReport[] = [];
  let next: { phase: OdooPhase; cursor: number } | null = null;
  const inventory = args.cursor ? null : await inventoryOf(odoo, args.since);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const cursor = i === 0 ? (args.cursor ?? 0) : 0;
    const r = await runPhase(phase, { ctx, odoo, links, args, cursor, started });
    await links.flush();
    reports.push(r);
    if (!r.complete) { next = { phase, cursor: r.cursor ?? cursor }; break; }
    if (args.phase === 'all' && i < phases.length - 1 && Date.now() - started > TIME_BUDGET_MS) { next = { phase: phases[i + 1], cursor: 0 }; break; }
  }

  // Partners (the customer backbone) follow companies and leads — the same function the UI uses.
  let partners: unknown = null;
  if (!next && !args.dry_run && (phases.includes('companies') || phases.includes('leads') || phases.includes('contacts'))) {
    const { data, error } = await ctx.supabase.rpc('backfill_partners', { p_dry_run: false });
    partners = error ? { error: error.message } : data;
  }

  return {
    status: next ? 'partial' : 'complete',
    dry_run: args.dry_run,
    odoo: { url: cfg.url, db: cfg.db, version },
    inventory,
    reports,
    partners_backfill: partners,
    next: next ? { ...next, how: `Call again with phase="${next.phase}", cursor=${next.cursor}${args.dry_run ? ', dry_run=true' : ', dry_run=false'} to continue.` } : null,
    elapsed_ms: Date.now() - started,
    note: args.dry_run
      ? 'Dry run: nothing was written. Read the reports and notes, then run with dry_run=false.'
      : 'Written. Re-running is safe: every row remembers its Odoo id in import_links and is updated, not duplicated.',
  };
}

async function inventoryOf(odoo: OdooClient, since?: string): Promise<Rec> {
  const s = sinceDomain(since);
  const ctxAll = { active_test: false };
  const [companies, persons, leads, opps, archived, messages, todos, attachments, users] = await Promise.all([
    odoo.searchCount('res.partner', [['is_company', '=', true], ...s]),
    odoo.searchCount('res.partner', [['is_company', '=', false], ['type', '=', 'contact'], ...s]),
    odoo.searchCount('crm.lead', [['type', '=', 'lead'], ...s], ctxAll),
    odoo.searchCount('crm.lead', [['type', '=', 'opportunity'], ...s], ctxAll),
    odoo.searchCount('crm.lead', [['active', '=', false], ...s], ctxAll),
    odoo.searchCount('mail.message', [['model', 'in', ['crm.lead', 'res.partner']], ['message_type', 'in', ['comment', 'email']], ...s]),
    odoo.searchCount('mail.activity', [['res_model', 'in', ['crm.lead', 'res.partner']]]),
    odoo.searchCount('ir.attachment', [['res_model', 'in', ['crm.lead', 'res.partner']], ['res_id', '!=', 0]]),
    odoo.searchCount('res.users', [['share', '=', false]]),
  ]);
  return { users, companies, persons, leads, opportunities: opps, archived_leads: archived, messages, todos, attachments };
}

interface PhaseCtx {
  ctx: ImportContext; odoo: OdooClient; links: Links; args: ImportArgs; cursor: number; started: number;
  /** Phase-scoped caches. */
  partnerIsCompany?: Map<number, true>;
  userByPartner?: Map<number, number>;
}

async function runPhase(phase: OdooPhase, p: PhaseCtx): Promise<PhaseReport> {
  switch (phase) {
    case 'users': return phaseUsers(p);
    case 'companies': return phaseCompanies(p);
    case 'contacts': return phaseContacts(p);
    case 'leads': return phaseLeads(p);
    case 'messages': return phaseMessages(p);
    case 'todos': return phaseTodos(p);
    case 'attachments': return phaseAttachments(p);
  }
}

const outOfTime = (p: PhaseCtx) => Date.now() - p.started > TIME_BUDGET_MS;

// ── users → profiles by email ─────────────────────────────────────────────
async function phaseUsers(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('users');
  await p.links.preload('res.users');
  const rows = await p.odoo.searchRead('res.users', [['share', '=', false]], ['name', 'login', 'email', 'active'], { limit: 500 });
  const { data: profiles, error } = await p.ctx.supabase.from('profiles').select('id, email');
  if (error) throw new Error(`profiles read: ${error.message}`);
  const byEmail = new Map<string, string>();
  for (const pr of (profiles ?? []) as Array<{ id: string; email: string | null }>) if (pr.email) byEmail.set(pr.email.toLowerCase(), pr.id);
  for (const u of rows) {
    r.scanned++;
    const id = num(u.id);
    const candidates = [str(u.email), str(u.login)].filter((x): x is string => !!x && x.includes('@')).map((x) => x.toLowerCase());
    const hit = candidates.map((c) => byEmail.get(c)).find((x): x is string => !!x);
    if (!hit) { r.skipped++; note(r, `user "${str(u.name)}" (${candidates[0] ?? 'no email'}) has no FlowWink profile — their leads and to-dos will be unassigned`); continue; }
    if (p.links.get('res.users', id)) r.updated++; else r.created++;
    await p.links.set('res.users', id, 'profiles', hit);
  }
  r.complete = true;
  return r;
}

// ── companies ─────────────────────────────────────────────────────────────
function domainOf(website: string | null, email: string | null): string | null {
  const w = website?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.toLowerCase();
  if (w && w.includes('.')) return w;
  const e = email?.split('@')[1]?.toLowerCase();
  if (e && !/gmail|hotmail|outlook|yahoo|icloud|live\.|protonmail/.test(e)) return e;
  return null;
}

const PARTNER_FIELDS = ['name', 'is_company', 'parent_id', 'type', 'email', 'phone', 'mobile', 'website', 'vat', 'company_registry', 'street', 'street2', 'city', 'zip', 'country_id', 'category_id', 'user_id', 'customer_rank', 'supplier_rank', 'comment', 'lang', 'function', 'title', 'create_date', 'active', 'commercial_partner_id'];

async function phaseCompanies(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('companies');
  await p.links.preload('res.partner');
  await p.links.preload('res.users');
  await p.links.preload('crm.tag');
  const rows = await p.odoo.searchRead('res.partner', [['is_company', '=', true], ...sinceDomain(p.args.since)], PARTNER_FIELDS, { limit: p.args.limit, afterId: p.cursor });
  const tagNames = await tagNamesOf(p, rows.flatMap((x) => (Array.isArray(x.category_id) ? x.category_id as number[] : [])));
  // Existing companies by lowercase name, for a match without a link (a demo instance has its own rows).
  const { data: existing, error } = await p.ctx.supabase.from('companies').select('id, name');
  if (error) throw new Error(`companies read: ${error.message}`);
  const byName = new Map<string, string>();
  for (const c of (existing ?? []) as Array<{ id: string; name: string }>) byName.set(c.name.trim().toLowerCase(), c.id);

  const parents: Array<{ odooId: number; parentOdooId: number }> = [];
  for (const c of rows) {
    r.scanned++; r.cursor = num(c.id);
    const name = str(c.name);
    if (!name) { r.skipped++; note(r, `company #${c.id} has no name`); continue; }
    const email = str(c.email);
    const row: Rec = {
      name,
      domain: domainOf(str(c.website), email),
      phone: str(c.phone) ?? str(c.mobile),
      website: str(c.website),
      address: [str(c.street), str(c.street2), [str(c.zip), str(c.city)].filter(Boolean).join(' ') || null].filter(Boolean).join(', ') || null,
      country: m2oName(c.country_id),
      org_number: str(c.company_registry),
      vat_number: str(c.vat),
      notes: htmlToText(c.comment) || null,
      tags: (Array.isArray(c.category_id) ? (c.category_id as number[]).map((t) => tagNames.get(t)).filter((x): x is string => !!x) : []),
      lifecycle_stage: num(c.customer_rank) > 0 ? 'customer' : 'prospect',
      account_owner: m2oId(c.user_id) ? p.links.get('res.users', m2oId(c.user_id)!) : null,
    };
    let id = p.links.get('res.partner', num(c.id));
    if (!id && byName.has(name.toLowerCase())) { id = byName.get(name.toLowerCase())!; r.matched_existing++; note(r, `"${name}" matched an existing company by name`); }
    if (id) {
      r.updated++;
      if (!p.args.dry_run) {
        const { error: upErr } = await p.ctx.supabase.from('companies').update(compact(row)).eq('id', id);
        if (upErr) { note(r, `update "${name}": ${upErr.message}`); r.updated--; r.skipped++; continue; }
      }
    } else {
      r.created++;
      if (!p.args.dry_run) {
        const { data: ins, error: insErr } = await p.ctx.supabase.from('companies').insert({ ...row, created_at: odooDate(c.create_date) ?? undefined }).select('id').single();
        if (insErr || !ins) { note(r, `insert "${name}": ${insErr?.message}`); r.created--; r.skipped++; continue; }
        id = (ins as { id: string }).id;
      } else id = `dry-${c.id}`;
    }
    await p.links.set('res.partner', num(c.id), 'companies', id);
    if (m2oId(c.parent_id)) parents.push({ odooId: num(c.id), parentOdooId: m2oId(c.parent_id)! });
    if (outOfTime(p)) break;
  }
  // Second pass: the group hierarchy, once both ends exist.
  if (!p.args.dry_run) {
    for (const { odooId, parentOdooId } of parents) {
      const child = p.links.get('res.partner', odooId); const parent = p.links.get('res.partner', parentOdooId);
      if (child && parent && child !== parent) await p.ctx.supabase.from('companies').update({ parent_company_id: parent }).eq('id', child);
    }
  }
  r.complete = rows.length < (p.args.limit ?? 200) && !outOfTime(p);
  if (r.complete) r.cursor = null;
  return r;
}

async function tagNamesOf(p: PhaseCtx, ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = [...new Set(ids)];
  if (!unique.length) return out;
  const tags = await p.odoo.searchRead('res.partner.category', [['id', 'in', unique]], ['name'], { limit: 500 });
  for (const t of tags) if (str(t.name)) out.set(num(t.id), str(t.name)!);
  return out;
}

function compact(row: Rec): Rec {
  const out: Rec = {};
  for (const [k, v] of Object.entries(row)) if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) out[k] = v;
  return out;
}

// ── persons → leads ───────────────────────────────────────────────────────
async function phaseContacts(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('contacts');
  await p.links.preload('res.partner');
  await p.links.preload('res.users');
  await p.links.preload('res.partner#note');
  const rows = await p.odoo.searchRead('res.partner', [['is_company', '=', false], ['type', '=', 'contact'], ...sinceDomain(p.args.since)], PARTNER_FIELDS, { limit: p.args.limit, afterId: p.cursor });
  for (const c of rows) {
    r.scanned++; r.cursor = num(c.id);
    const email = emailFor(p, 'res.partner', num(c.id), str(c.email));
    if (!email) { r.skipped++; note(r, `contact "${str(c.name)}" (#${c.id}) has no email — a lead needs one (synthesize_missing_email: true to invent one)`); continue; }
    const companyOdoo = m2oId(c.commercial_partner_id) && m2oId(c.commercial_partner_id) !== num(c.id) ? m2oId(c.commercial_partner_id)! : m2oId(c.parent_id);
    const row: Rec = {
      name: str(c.name),
      email,
      phone: str(c.phone) ?? str(c.mobile),
      status: num(c.customer_rank) > 0 ? 'customer' : 'prospect',
      company_id: companyOdoo ? p.links.get('res.partner', companyOdoo) : null,
      assigned_to: m2oId(c.user_id) ? p.links.get('res.users', m2oId(c.user_id)!) : null,
      source: 'odoo',
    };
    const outcome = await upsertLead(p, r, 'res.partner', num(c.id), row, odooDate(c.create_date));
    // The person's Odoo notes, once: the link remembers that they were written.
    if (outcome && (str(c.function) || htmlToText(c.comment)) && !p.links.get('res.partner#note', num(c.id))) {
      const parts = [str(c.function) ? `Title in Odoo: ${str(c.function)}` : '', htmlToText(c.comment)].filter(Boolean);
      await addLeadNote(p, outcome, parts.join('\n\n'), 'From Odoo', odooDate(c.create_date));
      await p.links.set('res.partner#note', num(c.id), 'lead_activities', outcome);
    }
    if (outOfTime(p)) break;
  }
  r.complete = rows.length < (p.args.limit ?? 200) && !outOfTime(p);
  if (r.complete) r.cursor = null;
  return r;
}

function emailFor(p: PhaseCtx, model: string, id: number, email: string | null): string | null {
  if (email && email.includes('@')) return email.toLowerCase();
  if (p.args.synthesize_missing_email) return `odoo-${model.replace('.', '-')}-${id}@import.invalid`;
  return null;
}

/**
 * A status only moves forward. Several Odoo records can land on one leads row
 * (a company's five opportunities with no contact person share the company's
 * email; a re-run meets a lead FlowWink has since won): the row keeps the
 * furthest status any of them reached, never the last one written.
 */
const STATUS_RANK: Record<string, number> = { lost: 0, prospect: 1, lead: 2, opportunity: 3, customer: 4 };

/** leads.email is unique: a row with that email IS the person, whoever made it. */
async function upsertLead(p: PhaseCtx, r: PhaseReport, model: string, odooId: number, row: Rec, createdAt: string | null): Promise<string | null> {
  let id = p.links.get(model, odooId);
  let currentStatus: string | null = null;
  if (!id) {
    const { data: hit, error } = await p.ctx.supabase.from('leads').select('id, status').eq('email', row.email as string).maybeSingle();
    if (error) throw new Error(`leads read: ${error.message}`);
    if (hit) { id = (hit as { id: string; status: string }).id; currentStatus = (hit as { status: string }).status; r.matched_existing++; }
  } else if (!id.startsWith('dry-') && typeof row.status === 'string') {
    const { data: cur, error: curErr } = await p.ctx.supabase.from('leads').select('status').eq('id', id).maybeSingle();
    if (curErr) note(r, `could not read the current status of lead ${row.email}: ${curErr.message} — Odoo's status is applied`);
    currentStatus = (cur as { status?: string } | null)?.status ?? null;
  }
  if (id) {
    r.updated++;
    if (!p.args.dry_run) {
      const patch = compact(row);
      if (typeof patch.status === 'string' && currentStatus && (STATUS_RANK[patch.status] ?? 0) <= (STATUS_RANK[currentStatus] ?? 0)) {
        delete patch.status; delete patch.stage_id; delete patch.lost_reason; delete patch.lost_note;
      }
      const { error } = await p.ctx.supabase.from('leads').update(patch).eq('id', id);
      if (error) { note(r, `update lead ${row.email}: ${error.message}`); r.updated--; r.skipped++; return null; }
    }
  } else {
    r.created++;
    if (!p.args.dry_run) {
      const { data: ins, error } = await p.ctx.supabase.from('leads').insert({ ...compact(row), created_at: createdAt ?? undefined }).select('id').single();
      if (error || !ins) { note(r, `insert lead ${row.email}: ${error?.message}`); r.created--; r.skipped++; return null; }
      id = (ins as { id: string }).id;
    } else id = `dry-${model}-${odooId}`;
  }
  await p.links.set(model, odooId, 'leads', id);
  return id;
}

async function addLeadNote(p: PhaseCtx, leadId: string, body: string, subject: string | null, at: string | null, type: 'note' | 'email' | 'call' | 'meeting' = 'note', extra: Rec = {}): Promise<void> {
  if (p.args.dry_run || leadId.startsWith('dry-')) return;
  const metadata: Rec = { note: body, source: SOURCE, ...extra };
  if (subject) metadata.subject = subject;
  await p.ctx.supabase.from('lead_activities').insert({ lead_id: leadId, type, metadata, points: 0, created_at: at ?? undefined });
}

// ── crm.lead → leads (+ deals) ────────────────────────────────────────────
const LEAD_FIELDS = ['name', 'type', 'active', 'partner_id', 'partner_name', 'contact_name', 'email_from', 'phone', 'mobile', 'stage_id', 'user_id', 'team_id', 'expected_revenue', 'probability', 'date_deadline', 'date_closed', 'lost_reason_id', 'tag_ids', 'description', 'source_id', 'medium_id', 'campaign_id', 'create_date', 'priority', 'company_currency', 'function', 'website', 'street', 'city', 'zip', 'country_id'];

interface StageInfo { name: string; is_won: boolean; index: number; total: number }

async function stagesOf(p: PhaseCtx): Promise<Map<number, StageInfo>> {
  const rows = await p.odoo.searchRead('crm.stage', [], ['name', 'sequence', 'is_won', 'fold'], { limit: 200, order: 'sequence asc, id asc' });
  const out = new Map<number, StageInfo>();
  rows.forEach((s, i) => out.set(num(s.id), { name: str(s.name) ?? `stage ${s.id}`, is_won: s.is_won === true, index: i, total: rows.length }));
  return out;
}

async function phaseLeads(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('leads');
  for (const m of ['res.partner', 'res.users', 'crm.lead', 'crm.lead#deal', 'crm.lead#note']) await p.links.preload(m);
  const stages = await stagesOf(p);
  if (p.cursor === 0) for (const [, s] of stages) note(r, `stage "${s.name}" → deal stage ${mapDealStage(s, false)}`);
  const { data: fwStages, error: stErr } = await p.ctx.supabase.from('pipeline_stages').select('id, entity_type, key, name');
  if (stErr) throw new Error(`pipeline_stages read: ${stErr.message}`);
  // The columns should read as the pipeline the team knows: give a FlowWink
  // deal stage the Odoo name when exactly one Odoo stage maps onto it and the
  // stage still carries its seed name. Once, on the first page of the phase.
  if (p.cursor === 0 && p.args.relabel_stages !== false) {
    const plan = planStageRelabels(stages.values(), (fwStages ?? []) as Array<{ id: string; entity_type: string; key: string; name: string }>);
    for (const rl of plan.relabels) {
      if (!p.args.dry_run) {
        const { error } = await p.ctx.supabase.from('pipeline_stages').update({ name: rl.to }).eq('id', rl.stage_id);
        if (error) throw new Error(`pipeline_stages relabel ${rl.key}: ${error.message}`);
        (fwStages ?? []).forEach((f: { id: string; name: string }) => { if (f.id === rl.stage_id) f.name = rl.to; });
      }
      note(r, `deal stage "${rl.from}" ${p.args.dry_run ? 'would be ' : ''}renamed "${rl.to}" (your Odoo stage)`);
    }
    for (const sh of plan.shared) note(r, `${sh.odoo.length} Odoo stages (${sh.odoo.join(', ')}) share deal stage ${sh.key}; its name is kept`);
    for (const k of plan.kept) note(r, `deal stage ${k.key} keeps your name "${k.name}" (Odoo: "${k.odoo}")`);
  }
  const stageId = (entity: string, key: string) => ((fwStages ?? []) as Array<{ id: string; entity_type: string; key: string }>).find((s) => s.entity_type === entity && s.key === key)?.id ?? null;
  const rows = await p.odoo.searchRead('crm.lead', [...sinceDomain(p.args.since)], LEAD_FIELDS, { limit: p.args.limit, afterId: p.cursor, context: { active_test: false } });
  const tagIds = [...new Set(rows.flatMap((x) => (Array.isArray(x.tag_ids) ? x.tag_ids as number[] : [])))];
  const tags = new Map<number, string>();
  if (tagIds.length) for (const t of await p.odoo.searchRead('crm.tag', [['id', 'in', tagIds]], ['name'], { limit: 500 })) tags.set(num(t.id), str(t.name) ?? '');
  // Partners referenced by leads that the companies/contacts phases have not seen (archived, or outside `since`).
  const partnerIds = [...new Set(rows.map((x) => m2oId(x.partner_id)).filter((x): x is number => !!x))];
  const partnerRows = new Map<number, Rec>();
  if (partnerIds.length) for (const pr of await p.odoo.searchRead('res.partner', [['id', 'in', partnerIds]], ['name', 'is_company', 'email', 'commercial_partner_id', 'parent_id'], { limit: 500, context: { active_test: false } })) partnerRows.set(num(pr.id), pr);

  for (const l of rows) {
    r.scanned++; r.cursor = num(l.id);
    const lost = l.active === false || !!m2oId(l.lost_reason_id);
    const stage = stages.get(m2oId(l.stage_id) ?? -1) ?? { name: 'New', is_won: false, index: 0, total: 1 };
    const isOpp = str(l.type) === 'opportunity';
    const status: LeadStatus = lost ? 'lost' : stage.is_won ? 'customer' : isOpp ? 'opportunity' : 'lead';

    // Who is the person, who is the company.
    const partner = m2oId(l.partner_id) ? partnerRows.get(m2oId(l.partner_id)!) : undefined;
    let companyOdoo: number | null = null;
    let personOdoo: number | null = null;
    if (partner) {
      if (partner.is_company === true) companyOdoo = num(partner.id);
      else { personOdoo = num(partner.id); const cp = m2oId(partner.commercial_partner_id); companyOdoo = cp && cp !== personOdoo ? cp : m2oId(partner.parent_id); }
    }
    let companyId = companyOdoo ? p.links.get('res.partner', companyOdoo) : null;
    const partnerName = str(l.partner_name) ?? (partner && partner.is_company === true ? str(partner.name) : null);
    if (!companyId && partnerName) companyId = await ensureCompanyByName(p, r, partnerName, { website: str(l.website), country: m2oName(l.country_id), address: [str(l.street), [str(l.zip), str(l.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null });

    const email = emailFor(p, 'crm.lead', num(l.id), str(l.email_from) ?? (partner ? str(partner.email) : null));
    if (!email) { r.skipped++; note(r, `lead "${str(l.name)}" (#${l.id}) has no email and no partner email — skipped (synthesize_missing_email: true to invent one)`); continue; }
    const owner = m2oId(l.user_id) ? p.links.get('res.users', m2oId(l.user_id)!) : null;
    const lostName = m2oName(l.lost_reason_id);
    const tagList = (Array.isArray(l.tag_ids) ? (l.tag_ids as number[]).map((t) => tags.get(t)).filter(Boolean) : []) as string[];
    const row: Rec = {
      tags: tagList,
      name: str(l.contact_name) ?? (partner && partner.is_company !== true ? str(partner.name) : null) ?? partnerName ?? str(l.name),
      email,
      phone: str(l.phone) ?? str(l.mobile),
      status,
      stage_id: stageId('lead', status),
      company_id: companyId,
      assigned_to: owner,
      source: m2oName(l.source_id) ?? 'odoo',
      score: Math.round(num(l.probability)),
      lost_reason: lost ? mapLostReason(lostName) : null,
      lost_note: lost ? [lostName, htmlToText(l.description)].filter(Boolean).join(' — ') || null : null,
    };
    if (companyOdoo && !personOdoo && partner && partner.is_company === true) note(r, `"${str(l.name)}" (#${l.id}) has a company (${str(partner.name)}) but no contact person — it hangs off a company-level lead row (${email})`);
    // The person row: the partner's own id when Odoo has one (so the contacts phase and this one agree), else the lead's.
    const personModel = personOdoo ? 'res.partner' : 'crm.lead';
    const personId = personOdoo ?? num(l.id);
    const leadId = await upsertLead(p, r, personModel, personId, row, odooDate(l.create_date));
    if (!leadId) continue;
    if (personOdoo) await p.links.set('crm.lead', num(l.id), 'leads', leadId);

    const title = str(l.name) ?? 'Lead';
    const desc = htmlToText(l.description);
    if (!p.links.get('crm.lead#note', num(l.id))) {
      await addLeadNote(p, leadId, [desc, tagList.length ? `Tags: ${tagList.join(', ')}` : '', m2oName(l.source_id) ? `Source: ${m2oName(l.source_id)}` : ''].filter(Boolean).join('\n\n') || `Imported from Odoo (${isOpp ? 'opportunity' : 'lead'}).`, `Odoo ${isOpp ? 'opportunity' : 'lead'}: ${title}`, odooDate(l.create_date), 'note', { odoo_lead_id: num(l.id), tags: tagList });
      await p.links.set('crm.lead#note', num(l.id), 'lead_activities', leadId);
    }

    // An opportunity (or anything won/lost with a stage) is a deal.
    if (isOpp || stage.is_won || lost) {
      const dealStage = mapDealStage(stage, lost);
      const deal: Rec = {
        lead_id: leadId,
        stage: dealStage,
        stage_id: stageId('deal', dealStage),
        value_cents: Math.round(num(l.expected_revenue) * 100),
        currency: m2oName(l.company_currency) ?? 'SEK',
        expected_close: str(l.date_deadline),
        closed_at: odooDate(l.date_closed),
        notes: [title, desc].filter(Boolean).join('\n\n'),
        owner_id: owner,
        lost_reason: lost ? mapLostReason(lostName) : null,
        lost_note: lost ? lostName : null,
      };
      const existingDeal = p.links.get('crm.lead#deal', num(l.id));
      if (!p.args.dry_run) {
        if (existingDeal) {
          const { error } = await p.ctx.supabase.from('deals').update(compact(deal)).eq('id', existingDeal);
          if (error) note(r, `update deal for "${title}": ${error.message}`);
        } else {
          const { data: ins, error } = await p.ctx.supabase.from('deals').insert({ ...compact(deal), created_at: odooDate(l.create_date) ?? undefined }).select('id').single();
          if (error || !ins) note(r, `insert deal for "${title}": ${error?.message}`);
          else await p.links.set('crm.lead#deal', num(l.id), 'deals', (ins as { id: string }).id);
        }
      } else if (!existingDeal) await p.links.set('crm.lead#deal', num(l.id), 'deals', `dry-deal-${l.id}`);
    }
    if (outOfTime(p)) break;
  }
  r.complete = rows.length < (p.args.limit ?? 200) && !outOfTime(p);
  if (r.complete) r.cursor = null;
  return r;
}

/** Odoo converts a lead's partner_name into a company at conversion time; we do it at import. */
async function ensureCompanyByName(p: PhaseCtx, r: PhaseReport, name: string, extra: Rec): Promise<string | null> {
  const key = `name:${name.trim().toLowerCase()}`;
  const cached = p.links.get('res.partner', key);
  if (cached) return cached;
  const { data: hit, error } = await p.ctx.supabase.from('companies').select('id').ilike('name', name.trim()).limit(1).maybeSingle();
  if (error) throw new Error(`companies read: ${error.message}`);
  let id = hit ? (hit as { id: string }).id : null;
  if (!id) {
    note(r, `company "${name}" created from a lead's partner_name (Odoo had no partner for it)`);
    if (p.args.dry_run) id = `dry-company-${key}`;
    else {
      const { data: ins, error: insErr } = await p.ctx.supabase.from('companies').insert(compact({ name: name.trim(), lifecycle_stage: 'prospect', ...extra, domain: domainOf(str(extra.website), null) })).select('id').single();
      if (insErr || !ins) { note(r, `insert company "${name}": ${insErr?.message}`); return null; }
      id = (ins as { id: string }).id;
    }
  }
  await p.links.set('res.partner', key, 'companies', id);
  return id;
}

// ── chatter → activities ──────────────────────────────────────────────────
function targetOf(p: PhaseCtx, model: string, resId: number): { table: 'leads' | 'companies'; id: string } | null {
  if (model === 'crm.lead') { const id = p.links.get('crm.lead', resId); return id ? { table: 'leads', id } : null; }
  if (model === 'res.partner') { const id = p.links.get('res.partner', resId); return id ? { table: p.partnerIsCompany?.get(resId) ? 'companies' : 'leads', id } : null; }
  return null;
}

async function phaseMessages(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('messages');
  for (const m of ['res.partner', 'res.users', 'crm.lead', 'mail.message']) await p.links.preload(m);
  await loadPartnerKinds(p);
  const rows = await p.odoo.searchRead('mail.message', [['model', 'in', ['crm.lead', 'res.partner']], ['message_type', 'in', ['comment', 'email']], ...sinceDomain(p.args.since)], ['model', 'res_id', 'message_type', 'subject', 'body', 'date', 'author_id', 'email_from', 'partner_ids', 'attachment_ids'], { limit: p.args.limit, afterId: p.cursor });
  for (const m of rows) {
    r.scanned++; r.cursor = num(m.id);
    const target = targetOf(p, str(m.model) ?? '', num(m.res_id));
    if (!target) { r.skipped++; continue; }
    const body = htmlToText(m.body);
    if (!body && !str(m.subject)) { r.skipped++; continue; }
    if (p.links.get('mail.message', num(m.id))) { r.updated++; continue; }
    const type = str(m.message_type) === 'email' ? 'email' : 'note';
    const at = odooDate(m.date);
    const author = m2oName(m.author_id);
    const authorUser = await userForPartner(p, m2oId(m.author_id));
    r.created++;
    if (!p.args.dry_run) {
      if (target.table === 'leads') {
        const metadata: Rec = { note: body, subject: str(m.subject), source: SOURCE, odoo_message_id: num(m.id), author, email_from: str(m.email_from), direction: type === 'email' ? (authorUser ? 'outbound' : 'inbound') : undefined };
        const { error } = await p.ctx.supabase.from('lead_activities').insert({ lead_id: target.id, type, metadata: compact(metadata), points: 0, created_at: at ?? undefined, created_by: authorUser });
        if (error) { note(r, `message #${m.id}: ${error.message}`); r.created--; r.skipped++; continue; }
      } else {
        const { error } = await p.ctx.supabase.from('activities').insert({ entity_type: 'company', entity_id: target.id, activity_type: type, subject: str(m.subject) ?? (type === 'email' ? 'Email' : 'Note'), body, done_at: at, created_at: at ?? undefined, created_by: authorUser, metadata: { source: SOURCE, odoo_message_id: num(m.id), author, email_from: str(m.email_from) } });
        if (error) { note(r, `message #${m.id}: ${error.message}`); r.created--; r.skipped++; continue; }
      }
    }
    await p.links.set('mail.message', num(m.id), target.table === 'leads' ? 'lead_activities' : 'activities', target.id);
    if (outOfTime(p)) break;
  }
  r.complete = rows.length < (p.args.limit ?? 200) && !outOfTime(p);
  if (r.complete) r.cursor = null;
  return r;
}

/** Which Odoo partners are companies — decides whether a chatter line lands on a company or a person. */
async function loadPartnerKinds(p: PhaseCtx): Promise<void> {
  if (p.partnerIsCompany) return;
  const rows = await p.odoo.searchRead('res.partner', [['is_company', '=', true]], ['id'], { limit: 5000, context: { active_test: false } });
  p.partnerIsCompany = new Map(rows.map((x) => [num(x.id), true]));
}

async function userForPartner(p: PhaseCtx, partnerId: number | null): Promise<string | null> {
  if (!partnerId) return null;
  if (!p.userByPartner) {
    const users = await p.odoo.searchRead('res.users', [['share', '=', false]], ['partner_id'], { limit: 500 });
    p.userByPartner = new Map(users.map((u) => [m2oId(u.partner_id) ?? -1, num(u.id)]));
  }
  const uid = p.userByPartner.get(partnerId);
  return uid ? p.links.get('res.users', uid) : null;
}

// ── open to-dos ───────────────────────────────────────────────────────────
async function phaseTodos(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('todos');
  // 'crm.lead#deal' too: the deal a to-do also lands on is read from the link cache, and an unloaded model reads as "no deal".
  for (const m of ['res.partner', 'res.users', 'crm.lead', 'crm.lead#deal', 'mail.activity']) await p.links.preload(m);
  await loadPartnerKinds(p);
  const rows = await p.odoo.searchRead('mail.activity', [['res_model', 'in', ['crm.lead', 'res.partner']]], ['res_model', 'res_id', 'activity_type_id', 'summary', 'note', 'date_deadline', 'user_id', 'create_date'], { limit: p.args.limit, afterId: p.cursor });
  for (const a of rows) {
    r.scanned++; r.cursor = num(a.id);
    const target = targetOf(p, str(a.res_model) ?? '', num(a.res_id));
    if (!target) { r.skipped++; continue; }
    if (p.links.get('mail.activity', num(a.id))) { r.updated++; continue; }
    const kind = (m2oName(a.activity_type_id) ?? 'todo').toLowerCase();
    const activityType = /call|ring|samtal/.test(kind) ? 'call' : /meet|möte/.test(kind) ? 'meeting' : /mail/.test(kind) ? 'email' : 'todo';
    const title = str(a.summary) ?? m2oName(a.activity_type_id) ?? 'To-do';
    const body = htmlToText(a.note) || null;
    const due = str(a.date_deadline) ? `${str(a.date_deadline)}T09:00:00Z` : null;
    const assignee = m2oId(a.user_id) ? p.links.get('res.users', m2oId(a.user_id)!) : null;
    r.created++;
    if (!p.args.dry_run) {
      if (target.table === 'leads') {
        // An open activity on a person or an opportunity is the record's NEXT
        // STEP: it goes where the kanban chip, the overdue stripe and the Tasks
        // card read (crm_tasks), on the contact and on its deal when there is
        // one — so Jan's wall shows the same planned / due / overdue dots here.
        const dealId = str(a.res_model) === 'crm.lead' ? p.links.get('crm.lead#deal', num(a.res_id)) : null;
        const { error } = await p.ctx.supabase.from('crm_tasks').insert({
          lead_id: target.id, deal_id: dealId && !dealId.startsWith('dry-') ? dealId : null,
          title, description: body, due_date: due, assigned_to: assignee, activity_type: activityType, priority: 'medium',
          created_at: odooDate(a.create_date) ?? undefined,
        });
        if (error) { note(r, `to-do #${a.id}: ${error.message}`); r.created--; r.skipped++; continue; }
      } else {
        const { error } = await p.ctx.supabase.from('activities').insert({
          entity_type: 'company', entity_id: target.id, activity_type: activityType === 'todo' ? 'task' : activityType,
          subject: title, body, due_at: due, assigned_to: assignee,
          created_at: odooDate(a.create_date) ?? undefined, metadata: { source: SOURCE, odoo_activity_id: num(a.id), odoo_type: m2oName(a.activity_type_id) },
        });
        if (error) { note(r, `to-do #${a.id}: ${error.message}`); r.created--; r.skipped++; continue; }
      }
    }
    await p.links.set('mail.activity', num(a.id), target.table === 'leads' ? 'crm_tasks' : 'activities', target.id);
    if (outOfTime(p)) break;
  }
  r.complete = rows.length < (p.args.limit ?? 200) && !outOfTime(p);
  if (r.complete) r.cursor = null;
  return r;
}

// ── attachments → documents ───────────────────────────────────────────────
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

async function phaseAttachments(p: PhaseCtx): Promise<PhaseReport> {
  const r = report('attachments');
  for (const m of ['res.partner', 'crm.lead', 'ir.attachment']) await p.links.preload(m);
  await loadPartnerKinds(p);
  const limit = Math.min(p.args.limit ?? 200, 25); // each carries its bytes
  const heads = await p.odoo.searchRead('ir.attachment', [['res_model', 'in', ['crm.lead', 'res.partner']], ['res_id', '!=', 0], ...sinceDomain(p.args.since)], ['name', 'mimetype', 'file_size', 'res_model', 'res_id', 'create_date'], { limit, afterId: p.cursor });
  for (const h of heads) {
    r.scanned++; r.cursor = num(h.id);
    const target = targetOf(p, str(h.res_model) ?? '', num(h.res_id));
    if (!target) { r.skipped++; continue; }
    if (p.links.get('ir.attachment', num(h.id))) { r.updated++; continue; }
    if (num(h.file_size) > MAX_ATTACHMENT_BYTES) { r.skipped++; note(r, `attachment "${str(h.name)}" is ${Math.round(num(h.file_size) / 1048576)} MB — over the 10 MB limit, left in Odoo`); continue; }
    r.created++;
    if (!p.args.dry_run) {
      const [full] = await p.odoo.searchRead('ir.attachment', [['id', '=', num(h.id)]], ['datas'], { limit: 1 });
      const datas = str(full?.datas);
      if (!datas) { r.created--; r.skipped++; note(r, `attachment "${str(h.name)}" has no content (a URL attachment?)`); continue; }
      const out = await p.ctx.uploadDocument({
        title: str(h.name) ?? `Attachment ${h.id}`, file_name: str(h.name) ?? `attachment-${h.id}`, mime_type: str(h.mimetype) ?? 'application/octet-stream',
        content_base64: datas, category: 'odoo-import', tags: ['odoo'], description: `Imported from Odoo ${str(h.res_model)} #${h.res_id}`,
      }) as { document_id?: string; error?: string };
      if (!out?.document_id) { r.created--; r.skipped++; note(r, `attachment "${str(h.name)}": ${out?.error ?? 'upload failed'}`); continue; }
      await p.ctx.supabase.from('documents').update({ related_entity_type: target.table === 'leads' ? 'lead' : 'company', related_entity_id: target.id, source: 'odoo', created_at: odooDate(h.create_date) ?? undefined }).eq('id', out.document_id);
      await p.links.set('ir.attachment', num(h.id), 'documents', out.document_id);
    } else await p.links.set('ir.attachment', num(h.id), 'documents', `dry-att-${h.id}`);
    if (outOfTime(p)) break;
  }
  r.complete = heads.length < limit && !outOfTime(p);
  if (r.complete) r.cursor = null;
  return r;
}
