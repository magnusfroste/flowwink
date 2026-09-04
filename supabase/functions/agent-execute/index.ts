// agent-execute v2026-04-20-stale-deals-with-contact (lead/company in deal_stale_check)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { blocksShapeError, normalizeBlockData, normalizeBlocks, validateBlockData } from '../_shared/normalize-blocks.ts';
import { normalizeSkillArgs } from '../_shared/skill-aliases.ts';
import { buildUnknownParameterBounce } from '../_shared/skills/parameter-contract.ts';
import { retiredSkillResult } from '../_shared/skills/retired-skills.ts';
import { readAllRows } from '../_shared/read-all-rows.ts';
import { applyIdentityPolicy } from '../_shared/site-identity.ts';
import { filterRecipients, blockedResponse } from '../_shared/email-allowlist.ts';
import { resolveSiteUrl } from '../_shared/site-url.ts';
import { readSieFile } from '../_shared/sie-reader.ts';
import {
  buildIncomeStatement,
  loadStatementClassification,
  unclosedResultCents,
  closedToEquityCents,
} from '../_shared/accounting/income-statement.ts';
import { markdownToTiptap, inlineClean, parseInline } from '../_shared/markdown-to-tiptap.ts';
import {
  type AuditContext,
  ACCOUNTING_AUDIT_TABLES,
  sha256Hex,
  diffSnapshots,
  writeAuditTrail,
} from '../_shared/agent-audit.ts';
import { retrieve } from '../_shared/retrieval/index.ts';
import { embedQuery } from '../_shared/retrieval/embedder.ts';
// Edge-surface refactor B1a: former standalone edge functions re-homed as
// internal skill handlers — see docs/architecture/edge-surface-classification.md
import { isSameRiverPost, DEDUP_WINDOW_DAYS } from '../_shared/river/fingerprint.ts';
import { executeContactFinder } from '../_shared/handlers/contact-finder.ts';
import { executeVerifyEmail } from '../_shared/handlers/verify-email.ts';
import { executeManageServiceOrder } from '../_shared/handlers/field-service.ts';
import { executeContactCenter } from '../_shared/handlers/contact-center.ts';
import { executeFetchFxRates } from '../_shared/handlers/fetch-fx-rates.ts';
import { executeQualifyLead } from '../_shared/handlers/qualify-lead.ts';
import { executeDistillContactState } from '../_shared/handlers/contact-state.ts';
import { decideSkillAccess } from '../_shared/skill-access.ts';
import { executeEnrichCompany } from '../_shared/handlers/enrich-company.ts';
import { executeProspectFitAnalysis } from '../_shared/handlers/prospect-fit-analysis.ts';
import { executeProcessDueSocialPosts } from '../_shared/handlers/social-publish.ts';
import { executeApproveCampaign } from '../_shared/handlers/campaign-fanout.ts';
import { executeSalesProfileSetup } from '../_shared/handlers/sales-profile-setup.ts';
import { executeProspectResearch } from '../_shared/handlers/prospect-research.ts';
import { executeParseResume } from '../_shared/handlers/parse-resume.ts';
import { executeGmailInboxScan } from '../_shared/handlers/gmail-inbox-scan.ts';
import { executeIngestInboundEmail } from '../_shared/handlers/ingest-inbound-email.ts';
import { executeVatReturnSe } from '../_shared/handlers/accounting-vat-return-se.ts';
import { executeCopilotAction } from '../_shared/handlers/copilot-action.ts';
import { executeCustomer360 } from '../_shared/handlers/customer-360.ts';
import { executeCompanyProfile } from '../_shared/handlers/company-profile.ts';
import { executeReconciliation } from '../_shared/handlers/reconciliation.ts';
// B1b admin-tool handlers — kept VERBATIM as Request→Response functions and
// adapted through callResponseHandler below (zero body changes on the move).
import { handleEmailAdmins as hEmailAdmins } from '../_shared/handlers/email-admins.ts';
import { handleDraftEmailReply } from '../_shared/handlers/draft-email-reply.ts';
import { handleReplyToEmail } from '../_shared/handlers/reply-to-email.ts';
import { handler as hEnrichCompanyProfile } from '../_shared/handlers/enrich-company-profile.ts';
import { handler as hExtractReceipt } from '../_shared/handlers/extract-receipt.ts';
import { handler as hAnalyzeBrand } from '../_shared/handlers/analyze-brand.ts';
import { handler as hDocsSync } from '../_shared/handlers/docs-sync.ts';
import { handler as hGithubContentSync } from '../_shared/handlers/github-content-sync.ts';
import { handler as hUnsplashSearch } from '../_shared/handlers/unsplash-search.ts';
import { handler as hFetchImage } from '../_shared/handlers/fetch-image.ts';
import { handler as hTestAiConnection } from '../_shared/handlers/test-ai-connection.ts';
import { handler as hUpdateAutonomyCron } from '../_shared/handlers/update-autonomy-cron.ts';
import { executeCheckIntegrations } from '../_shared/handlers/check-integrations.ts';
import { executeDescribeBlocks } from '../_shared/handlers/describe-blocks.ts';
// describe_blocks' other half: "what can I build" ↔ "what did I build".
import { executeInspectRenderedPage } from '../_shared/handlers/inspect-rendered-page.ts';
import { executeAgentTrace } from '../_shared/handlers/agent-trace.ts';
import { buildCrudErrorHint } from '../_shared/crud-error-hint.ts';

// Former standalone functions whose serve() bodies moved verbatim. They still
// read a Request and return a Response; this adapter closes the gap so the
// bodies needed zero changes. The edge: dispatch always parsed the JSON body
// regardless of HTTP status, so parsing here preserves exactly what callers saw.
const RESPONSE_HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  'internal:email_admins': hEmailAdmins,
  'internal:enrich_company_profile': hEnrichCompanyProfile,
  'internal:extract_receipt': hExtractReceipt,
  'internal:analyze_brand': hAnalyzeBrand,
  'internal:sync_docs_from_github': hDocsSync,
  'internal:sync_handbook_from_github': hGithubContentSync,
  'internal:search_unsplash': hUnsplashSearch,
  'internal:fetch_image_base64': hFetchImage,
  'internal:test_ai_connection': hTestAiConnection,
  'internal:update_autonomy_cadence': hUpdateAutonomyCron,
};

async function callResponseHandler(
  fn: (req: Request) => Promise<Response>,
  args: Record<string, unknown>,
  skillName: string,
): Promise<unknown> {
  const req = new Request('http://internal.agent-execute/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, _skill: skillName }),
  });
  const resp = await fn(req);
  try {
    return await resp.json();
  } catch {
    return { error: `Handler returned non-JSON (HTTP ${resp.status})` };
  }
}
// Starter-template bundle — regenerated by `bun run scripts/templates-to-json.ts`.
// Keyed by template id; used by list_templates / install_template.
import bundledTemplates from "./_templates.json" with { type: "json" };
// Chart-of-accounts data per locale pack, generated by scripts/skills-to-json.ts.
// Lets install_template activate a template's accounting locale end-to-end
// without a browser session (the engine itself is empty-until-chosen).
import bundledLocalePacks from "./_locale-packs.json" with { type: "json" };
// Every skill seed the codebase defines, generated by scripts/skills-to-json.ts.
// This is what makes the 4th deploy layer (agent_skills) follow the other
// three: the edge deploy carries its skill payload, and sync_skills_from_code
// reconciles the instance against it — no browser, no DATABASE_URL.
import bundledModuleSkills from "./_module-skills.json" with { type: "json" };
// Supabase edge runtime: keeps a promise alive after the response is sent.
// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

// ─── Skill → owning module (rollsvepet #102) ─────────────────────────────
// The auth gate below authorizes non-admin staff per the skill's OWNING
// MODULE via can_access_module() — the same single dial (role_module_access)
// that gates nav, RLS and workspace-chat. The ownership map comes from the
// bundled seed artifact, so it deploys atomically with this function and can
// never drift from the DB rows it seeded. Skills owned by the `platform`
// pseudo-module (search_web, manage_site_settings, …) and skills absent from
// the artifact (a future agent-created origin) stay admin-only: fail closed.
const SKILL_OWNER_MODULE: Record<string, string> = {};
for (const mod of (bundledModuleSkills as { modules: Array<{ moduleId: string; skills: Array<{ name: string }> }> }).modules) {
  for (const s of mod.skills) SKILL_OWNER_MODULE[s.name] = mod.moduleId;
}

// ─── Felhemmade skapare: modulen som äger EFFEKTEN, inte den som äger koden ──
// Matrisens andra svep fann en hel klass av samma bugg: skills som ställer ut en
// SKARP kundfaktura — fakturanummer ur serien, rader i huvudboken — men som är
// seedade i den modul vars process råkade utlösa dem. Ägarkartan ovan läser bara
// var seedet står, så grinden hamnade på fel modul: `sales` har `ecommerce` och
// kunde därmed skapa en riktig faktura via send_invoice_for_order utan att
// någonsin ha beviljats `invoicing`. Modulratten var påslagen — men inte den för
// det som faktiskt hände.
//
// Regeln: ett skill auktoriseras av modulen som äger DET SOM BLIR TILL, inte av
// modulen vars arbetsflöde startade det. Fakturaskapande är `invoicing`, vare sig
// avsändaren är en butiksorder, ett serviceuppdrag, ett avtal, en kassaförsäljning
// eller en prenumeration. Åtkomst till källobjektet kräver fortfarande sin egen
// modul via RLS — överskrivningen LÄGGER TILL ett krav, den byter inte ut ett.
//
// Överskrivningen står här och inte i modulseedet med flit: `moduleId` i
// src/lib/modules/* styr också navigering, katalogisering och sync:skills, och
// skill:et hör verkligen hemma i sin processmodul. Det är AUKTORISATIONEN som ska
// följa effekten, inte katalogiseringen.
//
// EJ i listan: initiate_company_invoice_payment (companies). Verifierat
// 2026-08-20 — den SKAPAR ingen faktura. Den slår upp en av det egna företagets
// redan utställda obetalda fakturor inom company-scope och returnerar
// betalningslänken (/invoice/<public_token>); ingen state skrivs. Den bär sin egen
// enforcement via companyScopeGuard(args, 'buyer') på rung 3 och nås genom
// kundportalens chat-completion-väg med service-nyckeln (isServiceCaller), så
// modulgrinden nedan gäller den ändå aldrig. Att flytta den till `invoicing` hade
// varit teater på en yta där den riktiga grinden är företagstillhörighet.
const SKILL_OWNER_MODULE_OVERRIDES: Record<string, string> = {
  send_invoice_for_order: 'invoicing',        // seedad i ecommerce (products-module)
  service_order_to_invoice: 'invoicing',      // seedad i fieldService
  generate_contract_invoice: 'invoicing',     // seedad i contracts
  pos_sale_to_invoice: 'invoicing',           // seedad i pos
  generate_subscription_invoice: 'invoicing', // seedad i subscriptions
};
for (const [name, moduleId] of Object.entries(SKILL_OWNER_MODULE_OVERRIDES)) {
  SKILL_OWNER_MODULE[name] = moduleId;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Agentic bookkeeping: shared template scoring + expansion ───────────────
// These mirror the inline logic in the manage_journal_entry create path
// (db:journal_entries). They are used by db:propose_bookkeeping so the queue
// proposes the SAME double-entry the booking path would produce.
// These helpers are the ONLY template expand/score implementations — the
// manage_journal_entry create path calls them too (the inline copies drifted:
// the old substring scorer survived there and could auto-book to the wrong
// account — robustness review finding C1, fixed 2026-07-08).
function acctExpandTemplateLines(tplLines: any[], baseCents: number, grossCents?: number): any[] {
  const out = tplLines.map((l: any) => ({
    account_code: l.account_code,
    account_name: l.account_name,
    description: l.description ?? null,
    debit_cents: Math.round(((l.debit_pct ?? 0) / 100) * baseCents),
    credit_cents: Math.round(((l.credit_pct ?? 0) / 100) * baseCents),
  }));
  // Bank-leg pinning (review finding H1): the gross→net→gross round trip can
  // drift the recomputed bank leg 1 öre off the REAL bank amount (gross 102 →
  // net round(81.6)=82 → bank round(102.5)=103). The entry balances but 1930
  // no longer ties to the bank statement — a reconciliation break. When the
  // actual gross is known (booking a bank event), pin the 19xx leg to it
  // exactly; rounding is absorbed by a non-bank line below.
  if (grossCents && grossCents > 0) {
    const bankLine = out.find((l: any) => String(l.account_code || '').startsWith('19')
      && (l.debit_cents > 0 || l.credit_cents > 0));
    if (bankLine) {
      if (bankLine.debit_cents > 0) bankLine.debit_cents = grossCents;
      else bankLine.credit_cents = grossCents;
    }
  }
  const d = out.reduce((s: number, l: any) => s + l.debit_cents, 0);
  const c = out.reduce((s: number, l: any) => s + l.credit_cents, 0);
  if (d !== c) {
    const diff = d - c;
    // Absorb rounding on the largest NON-bank line (usually the VAT or
    // expense/revenue line) — never on the 19xx leg, which must stay equal to
    // what actually moved in the bank.
    const candidates = out.filter((l: any) => !String(l.account_code || '').startsWith('19'));
    const pool = candidates.length > 0 ? candidates : out;
    const biggest = pool.reduce((a: any, b: any) =>
      Math.max(b.debit_cents, b.credit_cents) > Math.max(a.debit_cents, a.credit_cents) ? b : a);
    if (biggest.debit_cents >= biggest.credit_cents) biggest.debit_cents -= diff;
    else biggest.credit_cents += diff;
  }
  return out;
}
function acctIsPctTemplate(tplLines: any[]): boolean {
  return Array.isArray(tplLines) && tplLines.some((l: any) => (l.debit_pct ?? 0) > 0 || (l.credit_pct ?? 0) > 0);
}
// Gross→net: a percentage template's counter (bank) side is e.g. 125% of the
// NET base. A bank line is GROSS (incl. VAT), so the NET base to feed the
// template = gross / (sum(debit_pct)/100). E.g. 1000 gross, 125% total → 800.
function acctNetBaseFromGross(tplLines: any[], grossCents: number): number {
  // The gross that hit the bank IS the 19xx bank leg's percentage of the net
  // base — NOT the sum of the debit side. Using Σ debit_pct mis-scaled any
  // compound template whose bank leg ≠ full debit side: net salary (bank leg
  // 70%) was off 1.88×, VAT settlement (bank leg 20%) off 5× (sweep finding B1).
  let bankPct = 0;
  for (const l of tplLines || []) {
    if (!String(l.account_code || '').startsWith('19')) continue;
    bankPct = Math.max(l.debit_pct ?? 0, l.credit_pct ?? 0);
    break;
  }
  return bankPct > 0 ? Math.round(grossCents / (bankPct / 100)) : grossCents;
}
// Direction of a template's bank leg: a template that CREDITS a 19xx account
// pays money OUT (expense/payment); one that DEBITS 19xx takes money IN
// (revenue/refund). Templates with no 19xx leg are not bank-event-bookable
// (accruals, year-end adjustments). Matching an outflow to a revenue template
// books bank fees as income — the real-data failure this guards against.
function acctTemplateBankDirection(tplLines: any[]): 'inflow' | 'outflow' | null {
  for (const l of tplLines || []) {
    const code = String(l.account_code || '');
    if (!code.startsWith('19')) continue;
    if ((l.credit_pct ?? 0) > 0 || (l.credit_cents ?? 0) > 0) return 'outflow';
    if ((l.debit_pct ?? 0) > 0 || (l.debit_cents ?? 0) > 0) return 'inflow';
  }
  return null;
}
// Word-boundary + Swedish-compound aware template scoring.
// The old scorer did raw substring matching (terms.includes(keyword)), which
// false-matched short keywords INSIDE unrelated words: "el" ∈ "webbhot(el)l"
// booked webhosting as electricity; "kontor" ∈ "(kontor)sgiganten" booked
// office supplies as rent. Fix: match keywords against tokenised words, count a
// COMPOUND prefix/suffix (tåg~tågresa, resa~tjänsteresa) but never a coincidental
// infix. Confidence leans toward "propose" (human review) over "auto" — a wrong
// auto-book is the costliest failure.
// Fold diacritics before matching. Real bank exports are frequently ASCII —
// MT940 and many CSV feeds strip å/ä/ö — so "ELRAKNING" must match the
// keyword "elräkning". Found by the 2026-07-21 litmus run: of 12 imported
// events, exactly the three whose template keywords carry diacritics (el,
// lön, försäkring) came back unmatched, and the Swish sale lost its scoring
// duel for the same reason. Unicode NFD + strip combining marks is
// locale-neutral (ü, é fold the same way) — normalization, not a country
// branch.
function acctFold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function acctTokenize(s: string): string[] {
  return acctFold(String(s || '').toLowerCase())
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 2);
}
function acctScoreTemplates(
  allTemplates: any[],
  searchTerms: string,
): { template: any; score: number; confidence: number; matchDetails: string[] }[] {
  const terms = acctFold((searchTerms || '').toLowerCase().trim());
  const words = acctTokenize(terms);
  const wordSet = new Set(words);

  // Points for one single-token keyword against all search words.
  const wordMatch = (kw: string): number => {
    let best = 0;
    for (const sw of words) {
      if (kw === sw) return 40; // exact whole word — strongest, short-circuit
      const minLen = Math.min(kw.length, sw.length);
      // compound HEAD (prefix): tåg~tågresa, data~datakommunikation — min 4
      if (minLen >= 4 && (kw.startsWith(sw) || sw.startsWith(kw))) best = Math.max(best, 26);
      // compound TAIL (suffix): resa~tjänsteresa, hyra~lokalhyra — min 4
      else if (minLen >= 4 && (kw.endsWith(sw) || sw.endsWith(kw))) best = Math.max(best, 20);
    }
    return best;
  };

  const scored = (allTemplates || []).map((t: any) => {
    let score = 0;
    const details: string[] = [];
    for (const kwRaw of (t.keywords || [])) {
      const kw = acctFold(String(kwRaw).toLowerCase().trim());
      if (!kw) continue;
      if (kw.includes(' ')) {
        // multi-word phrase keyword ("office supplies") — substring is fine
        if (terms.includes(kw)) { score += 40; details.push(`phrase:${kw}`); }
        continue;
      }
      const pts = wordMatch(kw);
      if (pts) { score += pts; details.push(`kw:${kw}+${pts}`); }
    }
    // template-name words that appear as whole search words (small tiebreaker)
    for (const nw of acctTokenize(t.template_name)) {
      if (nw.length >= 3 && wordSet.has(nw)) { score += 12; details.push(`name:${nw}`); }
    }
    score += Math.min(10, (t.usage_count || 0) * 2);
    // Confidence curve: one clean keyword (40) → ~75% (propose); strong
    // multi-signal (80+) → ~95% (auto). Biases to human review.
    const confidence = score <= 0 ? 0 : Math.min(100, Math.round(55 + score * 0.5));
    return { template: t, score, confidence, matchDetails: details };
  });
  // Deterministic ordering: score, then most-used, then name, then id — so
  // near-duplicate templates never resolve to an arbitrary account by insertion
  // order (sweep finding B5: Milersättning 5860 vs 7331 posted at random).
  scored.sort((a, b) =>
    b.score - a.score ||
    (b.template.usage_count || 0) - (a.template.usage_count || 0) ||
    String(a.template.template_name || '').localeCompare(String(b.template.template_name || '')) ||
    String(a.template.id || '').localeCompare(String(b.template.id || '')),
  );
  return scored;
}

// Postgres RPCs whose signature is exactly `(args jsonb)` — they receive the
// whole argument object under a single `args` key instead of one `p_`-prefixed
// param per field. The rpc: dispatcher forwards `{ args: {...} }` for these.
// Keep in sync with `select proname from pg_proc where
// pg_get_function_identity_arguments(oid)='args jsonb'`.
const JSONB_ARG_RPCS = new Set<string>([
  'mcp_register_fixed_asset',
  'mcp_dispose_fixed_asset',
  'mcp_run_monthly_depreciation',
  'mcp_revalue_open_balances',
  'mcp_set_exchange_rate',
  'mcp_create_payroll_run',
  'mcp_approve_payroll_run',
  'mcp_mark_payroll_paid',
  'mcp_list_payroll_runs',
  'mcp_list_payroll_lines',
]);

// RPCs whose parameters are `_`-prefixed (not the usual `p_`). These are also
// called directly by the frontend and the billing cron with `_` names, so the
// signature is kept `_` (renaming would force an un-coordinatable frontend +
// DB + cron lockstep under Vercel auto-deploy). agent-execute maps skill args
// to `_<name>` for these instead of `p_<name>`.
const UNDERSCORE_PARAM_RPCS = new Set<string>([
  'create_manual_subscription',
  'cancel_manual_subscription',
  'generate_subscription_invoice',
  'generate_contract_invoice',
  // Added 2026-07-21 by the tool_definition-vs-pg_proc sweep. These three RPCs
  // also take _-prefixed params but were never listed here, so their skills
  // were unusable in BOTH directions: an argument named `_post_id` was stripped
  // as agent-internal, and `post_id` became `p__post_id` / `p_post_id`, neither
  // of which the function has. agent_activity shows zero calls to any of them
  // on any instance — which is why nobody noticed.
  'mark_social_post_posted',
  'moderate_blog_comment',
  'utm_attribution_report',
]);

interface ExecuteRequest {
  skill_id?: string;
  skill_name?: string;
  arguments: Record<string, unknown>;
  agent_type: 'flowpilot' | 'chat' | 'mcp';
  conversation_id?: string;
  /** Trace ID from the parent reason() loop for end-to-end observability */
  trace_id?: string;
  /** When called via MCP, the user who owns the api_key. Used for ownership/created_by. */
  caller_user_id?: string;
  /** When called via MCP, the api_key id (and inbound peer) that initiated the call. */
  caller_api_key_id?: string;
  /**
   * The VERIFIED email of a signed-in customer (identity ladder rung 2). Set by
   * chat-completion from the resolved JWT — NEVER from model output. Customer-
   * scoped skills (e.g. request_return) use it to enforce "acts on the caller's
   * own records only". Injected into args as `_caller_email`.
   */
  caller_email?: string;
  /**
   * Identity ladder rung 3 (B2B): the ACTIVE company + role of a signed-in
   * B2B contact, resolved by chat-completion from the verified JWT →
   * company_contacts membership — NEVER from model output. Company-scoped
   * skills use them to enforce "acts only within the caller's own company".
   * Injected into args as `_company_id` / `_company_role`. (P0 plumbing — no
   * company-scoped skill consumes them yet; wired in P1.)
   */
  company_id?: string;
  company_role?: string;
  objective_context?: {
    goal: string;
    step: string;
    why: string;
  };
}

// normalizeSkillArgs is now imported from ../_shared/skill-aliases.ts

// PostgREST .or() uses ',' to separate conditions and '()' to group. Strip those
// (and backslash) from user-supplied search terms so a value like
// "foo,role.eq.admin" can't inject an extra OR condition (filter injection).
// MUST be module-level: top-level handler functions (e.g. executeBookingAction,
// executeLeadAction) call it from outside serve()'s closure.
const sanitizeOrTerm = (v: unknown): string => String(v ?? '').replace(/[,()\\]/g, ' ').trim();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // NOTE: kept inline createClient here because downstream handler plugins
  // capture `supabase` and `serviceKey` from this scope. When we extract
  // handlers/* in phase 2b, swap to getServiceClient() from _shared/supabase-clients.
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ─── AUTH GATE ───────────────────────────────────────────────────────
    // agent-execute runs any enabled skill with the service-role client (RLS
    // off) and is deployed --no-verify-jwt, so it MUST authenticate in-body or
    // it is an unauthenticated universal skill executor reachable from the
    // internet. Legitimate callers are exactly two: internal edge functions
    // (mcp-server, voice-ingest, a2a, automation-dispatcher, send-webhook,
    // run-autonomy-tests) which send Bearer <service_role key>, and the admin
    // UI which sends the logged-in user's JWT via functions.invoke.
    //
    // AUTHENTICATION happens here (who are you); AUTHORIZATION for JWT callers
    // happens after the skill lookup (may you run THIS skill) — admins run
    // everything, other staff run skills whose owning module their role is
    // granted in role_module_access. Before #102 this gate required admin for
    // every JWT caller, which 401'd module-granted staff out of every skill-
    // backed surface (accounting tabs, staged FlowWork actions, order actions).
    const authHeader = req.headers.get('Authorization') ?? '';
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    let gateUserId: string | null = null;
    let gateIsAdmin = false;
    let isServiceCaller = false;
    if (bearer && serviceKey && bearer === serviceKey) {
      isServiceCaller = true; // trusted internal edge caller
    } else if (bearer && bearer !== anonKey) {
      const { data: userData } = await supabase.auth.getUser(bearer);
      if (userData?.user) {
        gateUserId = userData.user.id;
        const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: gateUserId, _role: 'admin' });
        gateIsAdmin = isAdmin === true;
      }
    }
    if (!isServiceCaller && !gateUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: ExecuteRequest = await req.json();
    // ─── ASYNC HANDOFF ──────────────────────────────────────────────────────
    // A dispatcher must not sit on a 20-second skill (the responder, a send)
    // for every event in its batch: on Resta the event-dispatcher died mid-
    // batch, left events unmarked, re-ran the same ones every minute and never
    // reached new mail (2026-09-04). With async:true the caller gets 202 at
    // once and the skill runs here in the background; the activity log is the
    // result. Only for callers already authenticated above.
    if ((body as any).async === true) {
      const { async: _async, ...rest } = body as any;
      const run = fetch(`${supabaseUrl}/functions/v1/agent-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify(rest),
      }).then((r) => r.text()).catch((e) => console.error('[agent-execute] async handoff failed:', e));
      if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any)?.waitUntil) (EdgeRuntime as any).waitUntil(run);
      return new Response(JSON.stringify({ accepted: true, async: true, skill: rest.skill_name ?? rest.skill_id ?? null, note: 'Running in the background — the activity log carries the result.' }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { skill_id, skill_name, arguments: rawArgs = {}, agent_type, conversation_id, objective_context, trace_id, caller_user_id: bodyCallerUserId, caller_api_key_id, caller_email, company_id: callerCompanyId, company_role: callerCompanyRole } = body;
    // A verified admin JWT is the authoritative caller identity — internal edge
    // callers (service key) keep passing caller_user_id/caller_api_key_id in the body.
    const caller_user_id = gateUserId ?? bodyCallerUserId;

    // ─── Argument normalization ──────────────────────────────────────────
    const _rawHasData = rawArgs && typeof rawArgs === 'object' && 'data' in (rawArgs as any);
    const args: Record<string, unknown> = normalizeSkillArgs(rawArgs);
    // Forward caller identity to handlers (used to set created_by/author_id for MCP-originated writes)
    if (caller_user_id && !(args as any)._caller_user_id) {
      (args as any)._caller_user_id = caller_user_id;
    }
    if (caller_api_key_id && !(args as any)._caller_api_key_id) {
      (args as any)._caller_api_key_id = caller_api_key_id;
    }
    // Verified signed-in customer email (rung 2). Server-injected only — force
    // it over anything the model may have put in args, so a customer-scoped
    // skill can never be tricked into acting for another account.
    if (caller_email) {
      (args as any)._caller_email = String(caller_email).toLowerCase().trim();
    } else {
      delete (args as any)._caller_email;
    }
    // Server-set channel flag: is this a PUBLIC-CHAT caller (a website visitor,
    // possibly anonymous) rather than an internal operator (FlowPilot heartbeat,
    // admin UI via callSkill, external MCP)? A `scope:'both'` skill uses this to
    // decide whether an absent _caller_email means "sign in first" (public chat)
    // or "look up any record" (internal). Model output can never set it.
    (args as any)._public_chat = agent_type === 'chat';
    // Verified active company + role (rung 3). Same rule as _caller_email:
    // server-injected only, forced over anything the model put in args, so a
    // company-scoped skill can never be tricked into acting for another company.
    if (callerCompanyId) {
      (args as any)._company_id = String(callerCompanyId).trim();
      (args as any)._company_role = callerCompanyRole ? String(callerCompanyRole).trim() : 'viewer';
    } else {
      delete (args as any)._company_id;
      delete (args as any)._company_role;
    }
    if (_rawHasData) {
      console.log('[normalize-debug] rawKeys:', Object.keys(rawArgs as any), 'flatKeys:', Object.keys(args), 'sample:', JSON.stringify(args).slice(0,200));
    }

    if (!skill_id && !skill_name) {
      return new Response(JSON.stringify({ error: 'skill_id or skill_name required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 0. Retired names answer with a direction, not a wall. Checked BEFORE the
    //    lookup so the answer is the same on an instance that has synced (row
    //    disabled → "Skill not found") and one that has not (row still enabled
    //    → module executor's "Unknown skill" default).
    //    Deliberately HTTP 200: reason.ts discards the body of any non-2xx
    //    response from agent-execute and reports only "HTTP <status>", so a
    //    410 would throw away the very pointer this exists to deliver.
    const retired = skill_name ? retiredSkillResult(String(skill_name)) : null;
    if (retired) {
      return new Response(JSON.stringify(retired), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Look up the skill
    let query = supabase.from('agent_skills').select('*').eq('enabled', true);
    if (skill_id) query = query.eq('id', skill_id);
    else if (skill_name) query = query.eq('name', skill_name);

    const { data: skills, error: skillError } = await query.limit(1).single();
    if (skillError || !skills) {
      return new Response(JSON.stringify({ error: `Skill not found: ${skill_id || skill_name}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const skill = skills;

    // 1b. AUTHORIZATION (JWT callers): the matrix is the only dial (#102).
    // Admins run everything. Other authenticated users may run a skill iff
    // their role is granted the skill's OWNING module in role_module_access —
    // the same can_access_module() that gates nav, RLS and workspace-chat.
    // Platform-owned and unmapped skills stay admin-only (fail closed).
    if (!isServiceCaller && !gateIsAdmin) {
      const ownerModule = SKILL_OWNER_MODULE[skill.name];
      let granted: unknown = false;
      if (ownerModule && ownerModule !== 'platform') {
        const { data: canAccess } = await supabase.rpc('can_access_module', {
          _user_id: gateUserId, _module_id: ownerModule,
        });
        granted = canAccess;
      }
      // The decision itself lives in _shared/skill-access.ts so a test can CALL
      // it. Inline, it was invisible to its own guardrail: setting allowed=true
      // left all 15 assertions green (mutation audit 2026-08-30).
      const decision = decideSkillAccess({
        isServiceCaller, isAdmin: gateIsAdmin, ownerModule, moduleGranted: granted,
      });
      if (!decision.allowed) {
        const why = decision.reason;
        return new Response(JSON.stringify({ error: `Forbidden: "${skill.name}" — ${why}` }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Validate scope
    if (agent_type === 'chat' && skill.scope === 'internal') {
      await logActivity(supabase, {
        agent: agent_type, skill_id: skill.id, skill_name: skill.name,
        input: args, output: { error: 'Scope violation' },
        status: 'failed', conversation_id, duration_ms: Date.now() - startTime,
        error_message: `Skill '${skill.name}' is internal-only, cannot run from public chat`,
      });
      return new Response(JSON.stringify({ error: 'This action is not available' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3a. STAGING ENVELOPE — preview-first MCP protocol for high-impact writes.
    //     Skills flagged requires_staging=true return a staged envelope on first call,
    //     creating a pending_operations row. Caller must approve_pending_operation, then
    //     re-invoke with _approved_operation_id=<uuid> to actually execute.
    // force_staged: the caller demands the staging envelope regardless of the
    // skill's own flags. FlowWork's write path sets this — an employee's chat
    // proposes, a human click executes. The flag lives in the BODY, never in
    // skill arguments, so a model cannot un-set it.
    const forceStaged = (body as any).force_staged === true;
    const requiresStaging = (skill as any).requires_staging === true || forceStaged;
    const approvedOpId = (args as any)?._approved_operation_id as string | undefined;
    if (approvedOpId) delete (args as any)._approved_operation_id;

    if (requiresStaging && !approvedOpId) {
      // Compute period_status if entry_date or date in args
      let periodStatus: string | null = null;
      const aa = args as any;
      const dateStr = aa?.entry_date || aa?.date || aa?.posting_date;
      if (dateStr) {
        try {
          const d = new Date(dateStr);
          if (!isNaN(d.getTime())) {
            const { data: per } = await supabase
              .from('accounting_periods')
              .select('status')
              .eq('fiscal_year', d.getFullYear())
              .eq('period_month', d.getMonth() + 1)
              .maybeSingle();
            periodStatus = (per?.status as string) ?? 'open';
          }
        } catch { /* ignore */ }
      }

      const riskLevel: 'low'|'medium'|'high' =
        ['close_accounting_period','close_pos_session_v2','record_accounting_correction'].includes(skill.name) ? 'high'
        : 'medium';

      const { data: opRow, error: opErr } = await supabase
        .from('pending_operations')
        .insert({
          skill_id: skill.id,
          skill_name: skill.name,
          args: args as any,
          preview: { intent: `Will execute skill "${skill.name}"`, args, computed_at: new Date().toISOString() },
          risk_level: riskLevel,
          period_status: periodStatus,
          created_by_user_id: caller_user_id ?? null,
          created_by_agent: agent_type,
          conversation_id: conversation_id ?? null,
        })
        .select('id')
        .single();

      if (opErr) {
        console.error('[agent-execute] staging insert failed:', opErr);
      }

      // Double-gated skills (requires_staging AND trust_level=approve) need BOTH flags
      // on the re-invoke, or they stop at the trust gate with status=pending_approval.
      // Spell that out in the envelope so an agent following the message alone completes.
      const isDoubleGated = ((skill as any).trust_level === 'approve');
      const reinvokeArgs = isDoubleGated
        ? `_approved_operation_id="${opRow?.id}" AND _approved=true`
        : `_approved_operation_id="${opRow?.id}"`;
      return new Response(JSON.stringify({
        staged: true,
        operation_id: opRow?.id,
        skill: skill.name,
        risk_level: riskLevel,
        period_status: periodStatus,
        actor: agent_type,
        double_gated: isDoubleGated,
        message: `Skill "${skill.name}" is staged. Review the preview, then call approve_pending_operation(p_id="${opRow?.id}") followed by re-invoking with ${reinvokeArgs}.${isDoubleGated ? ' (This skill also requires approval, so BOTH flags are needed — passing only _approved_operation_id stops at the trust gate.)' : ''}`,
        preview: { args },
        next: {
          approve: { skill: 'approve_pending_operation', args: { p_id: opRow?.id } },
          reinvoke_args: isDoubleGated ? { _approved_operation_id: opRow?.id, _approved: true } : { _approved_operation_id: opRow?.id },
          reject: { skill: 'reject_pending_operation', args: { p_id: opRow?.id, p_reason: '<reason>' } },
        },
      }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Who the journal credits. Normally the caller's agent_type — but an
    // approved staged operation is EXECUTED by whoever clicked approve, while
    // the work belongs to the agent that proposed it. FlowWork writes were all
    // landing in agent_activity as 'flowpilot' because the re-invoke carried
    // the default agent_type; the proposing agent is on the row itself.
    let effectiveAgent: string = agent_type;

    if (approvedOpId) {
      // Verify approval before continuing
      const { data: op } = await supabase
        .from('pending_operations')
        .select('status, skill_name, expires_at, created_by_agent')
        .eq('id', approvedOpId)
        .maybeSingle();
      if (op?.created_by_agent) effectiveAgent = op.created_by_agent as string;
      if (!op || op.status !== 'approved' || op.skill_name !== skill.name) {
        return new Response(JSON.stringify({
          error: 'pending operation not approved or skill mismatch',
          operation_id: approvedOpId,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // Approval windows are finite: an approved-but-unexecuted operation past
      // expires_at must NOT execute with stale context (sweep finding #B5).
      if (op.expires_at && new Date(op.expires_at).getTime() < Date.now()) {
        await supabase.from('pending_operations')
          .update({ status: 'expired' })
          .eq('id', approvedOpId);
        return new Response(JSON.stringify({
          error: `pending operation expired at ${op.expires_at} — re-stage the skill call to get a fresh approval`,
          operation_id: approvedOpId,
        }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      // NOT marked executed here. A DOUBLE-GATED skill (requires_staging AND
      // trust_level='approve' — install_template, the accounting closers) still
      // has the trust gate below to clear. Consuming the operation before that
      // gate has decided burned the approval on a call that then did nothing:
      // status flipped to 'executed' with execution_result NULL, no work done,
      // and the retry got 403 'not approved' because the row was no longer
      // 'approved'. The status lied about the outcome and the operator had to
      // re-stage. The consumption now happens once the call is actually going
      // to run (below the trust gate).
    }

    // 3. Check trust level (auto → execute, notify → execute + notify, approve → block)
    //    `_approved: true` is the bypass flag set when an admin approves a pending activity.
    //    FlowPilot 2.0: the INTERNAL operator's effective trust is shaped by the
    //    flowpilot_autonomy posture + agent_trust_policies (open-by-default, narrow-by-policy).
    //    chat/mcp keep the skill's own trust_level — the external boundary is unchanged, so a
    //    DB round-trip is spent only for agent_type='flowpilot'.
    let trustLevel = skill.trust_level || 'auto';
    if (agent_type === 'flowpilot') {
      const { data: resolved } = await supabase.rpc('resolve_agent_trust', {
        p_skill_name: skill.name,
        p_skill_category: (skill as any).category ?? null,
        p_base_trust: trustLevel,
        p_agent_type: agent_type,
      });
      if (typeof resolved === 'string' && resolved) trustLevel = resolved;
    }
    const bypassApproval = (args as any)?._approved === true;
    if (bypassApproval) delete (args as any)._approved;

    if (trustLevel === 'approve' && !bypassApproval) {
      const activityId = await logActivity(supabase, {
        agent: agent_type, skill_id: skill.id, skill_name: skill.name,
        input: args, output: {}, status: 'pending_approval',
        conversation_id, duration_ms: Date.now() - startTime,
      });

      // Spår B consolidation: create a real approval_requests row so /admin/approvals
      // is the single source of truth for ALL pending decisions (business objects + agent skills).
      // Surfaces amount_cents from common arg shapes so amount-threshold rules can match.
      let amountCents: number | null = null;
      const a = args as Record<string, unknown>;
      if (typeof a?.amount_cents === 'number') amountCents = a.amount_cents as number;
      else if (typeof a?.budget_cents === 'number') amountCents = a.budget_cents as number;
      else if (typeof a?.total_cents === 'number') amountCents = a.total_cents as number;

      let approvalRequestId: string | null = null;
      try {
        const { data: reqId, error: reqErr } = await supabase.rpc('request_skill_approval', {
          p_skill_name: skill.name,
          p_skill_id: skill.id,
          p_args: args,
          p_activity_id: activityId,
          p_agent: agent_type,
          p_conversation_id: conversation_id ?? null,
          p_amount_cents: amountCents,
          p_currency: (typeof a?.currency === 'string' ? (a.currency as string) : 'SEK'),
          p_reason: `Skill "${skill.name}" requires approval before execution`,
        });
        if (reqErr) {
          console.error('[agent-execute] request_skill_approval failed:', reqErr);
        } else {
          approvalRequestId = reqId as string;
        }
      } catch (e) {
        console.error('[agent-execute] request_skill_approval threw:', e);
      }

      return new Response(JSON.stringify({
        status: 'pending_approval',
        activity_id: activityId,
        approval_request_id: approvalRequestId,
        skill: skill.name,
        trust_level: 'approve',
        message: `Action '${skill.name}' requires approval. Decision page: /admin/approvals${approvalRequestId ? `?request=${approvalRequestId}` : ''}. Poll agent_activity for status='approved' then re-call with _approved=true.`,
        input: args,
      }), {
        status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Every gate is cleared — the call IS going to run, so the staged operation
    // is consumed now. Doing it here (rather than before the trust gate) means
    // a blocked double-gated call leaves the approval intact and retryable.
    if (approvedOpId) {
      await supabase.from('pending_operations')
        .update({ status: 'executed', executed_at: new Date().toISOString() })
        .eq('id', approvedOpId);
    }

    // 4. Route to handler — wrapped in try/catch for normalized error handling
    // Attribution travels to handlers via args, SERVER-stamped here (overwrites
    // anything model-supplied, so it cannot be spoofed): handlers that record
    // provenance on rows (wiki created_by/_agent) read these two keys.
    (args as Record<string, unknown>)._effective_agent = effectiveAgent;
    if (caller_user_id) (args as Record<string, unknown>)._caller_user_id = caller_user_id;
    let result: unknown;
    const handler = skill.handler as string;

    try {
      if (handler.startsWith('ai-task:')) {
        // Consolidated AI task hub — handler value is the task name.
        const taskName = handler.replace('ai-task:', '');
        const response = await fetch(`${supabaseUrl}/functions/v1/ai-task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ task: taskName, input: args }),
        });
        const taskResult = await response.json();
        if (!response.ok && !taskResult.error) {
          taskResult.error = `ai-task '${taskName}' returned HTTP ${response.status}`;
        }
        result = taskResult;

      } else if (handler.startsWith('edge:') || handler.startsWith('function:')) {
        const fnName = handler.startsWith('edge:')
          ? handler.replace('edge:', '')
          : handler.replace('function:', '');

        // For composio-proxy, map skill_name to the expected action/params format.
        // For other multi-skill routers, inject `_skill` so the function can dispatch.
        let edgeBody: Record<string, any> = { ...args, _skill: skill.name };
        if (fnName === 'composio-proxy') {
          const skillToAction: Record<string, string> = {
            composio_gmail_read: 'gmail_read',
            composio_gmail_send: 'gmail_send',
            composio_search_tools: 'search_tools',
            composio_execute: 'execute',
          };
          const action = skillToAction[skill.name] || skill.name.replace('composio_', '');
          edgeBody = { action, params: args };
        }
        
        const response = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(edgeBody),
        });
        const edgeResult = await response.json();
        if (!response.ok && !edgeResult.error) {
          edgeResult.error = `Edge function '${fnName}' returned HTTP ${response.status}`;
        }
        result = edgeResult;

      } else if (handler.startsWith('module:')) {
        const moduleName = handler.replace('module:', '');
        await autoActivateModule(supabase, moduleName);
        result = await executeModuleAction(supabase, moduleName, skill.name, args);

      } else if (handler.startsWith('db:')) {
        const table = handler.replace('db:', '');
        const auditCtx: AuditContext = {
          agent_type, caller_user_id, caller_api_key_id,
          conversation_id, trace_id,
          skill_id: skill.id, skill_name: skill.name,
        };
        result = await executeDbAction(supabase, table, skill.name, args, auditCtx);

      } else if (handler.startsWith('webhook:')) {
        result = await executeWebhook(supabase, args);

      } else if (handler.startsWith('responses:')) {
        const peerName = handler.replace('responses:', '');
        result = await executeOpenResponsesRequest(peerName, args);

      } else if (handler.startsWith('a2a:')) {
        const peerName = handler.replace('a2a:', '');
        result = await executeA2ARequest(supabase, peerName, args);

      } else if (handler === 'internal:process_due_social_posts') {
        result = await executeProcessDueSocialPosts(supabase, args as Record<string, unknown>, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:approve_content_campaign') {
        result = await executeApproveCampaign(supabase, args as Record<string, unknown>, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:verify_email') {
        result = await executeVerifyEmail(supabase, args as Record<string, unknown>);

      } else if (handler === 'internal:contact_finder') {
        result = await executeContactFinder(args);

      } else if (handler === 'internal:manage_service_order') {
        result = await executeManageServiceOrder(supabase, args);

      } else if (handler === 'internal:fetch_ecb_rates') {
        result = await executeFetchFxRates(supabase);

      } else if (handler === 'internal:read_sie_file') {
        // Bytes, never a string. SIE 4 is specified as IBM CP437 and Bokio still
        // writes it that way; a text read decodes it as UTF-8 and destroys every
        // å ä ö before the skill sees it, irrecoverably. See _shared/sie-reader.ts.
        const b64 = typeof args.content_base64 === 'string'
          ? (args.content_base64 as string).replace(/^data:[^,]+,/, '') : '';
        if (!b64) {
          result = {
            error: 'content_base64 is required. Read the SIE file as BYTES and base64-encode it — do NOT read it as text. SIE 4 is specified as IBM CP437; a text read decodes it as UTF-8 and destroys every å ä ö before the file reaches this skill, and nothing here can undo that.',
            status: 'failed',
          };
        } else {
          let sieBytes: Uint8Array | null = null;
          try {
            const bin = atob(b64);
            sieBytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) sieBytes[i] = bin.charCodeAt(i);
          } catch (e) {
            result = { error: `content_base64 is not valid base64: ${e instanceof Error ? e.message : String(e)}`, status: 'failed' };
          }
          if (sieBytes) {
            const sieInclude = Array.isArray(args.include)
              ? (args.include as unknown[]).map((x) => String(x).toLowerCase()) : [];
            result = readSieFile(sieBytes, sieInclude);
          }
        }

      } else if (handler === 'internal:describe_blocks') {
        result = executeDescribeBlocks(args as Record<string, unknown>);
      } else if (handler === 'internal:inspect_rendered_page') {
        result = await executeInspectRenderedPage(supabase, args as Record<string, unknown>);
      } else if (handler === 'internal:check_integrations') {
        result = await executeCheckIntegrations(supabase, args as Record<string, unknown>);

      } else if (handler === 'internal:get_agent_trace') {
        result = await executeAgentTrace(supabase, args as Record<string, unknown>);

      } else if (handler === 'internal:reset_sandbox') {
        result = await executeResetSandbox(supabase, args as Record<string, unknown>);

      } else if (handler === 'internal:knowledge_index_status') {
        const { data: stats, error: statsErr } = await supabase.rpc('knowledge_index_stats');
        result = statsErr ? { success: false, error: statsErr.message } : { success: true, ...(stats as Record<string, unknown>) };

      } else if (handler === 'internal:set_skill_trust') {
        // The trust dial, exposed to an operator with a mandate. One column,
        // read back after the write so "updated" is never a lie.
        const name = String((args as any).skill_name ?? '').trim();
        const level = String((args as any).trust_level ?? '').trim();
        if (!name || !['auto', 'notify', 'approve'].includes(level)) {
          result = { success: false, error: 'skill_name and trust_level (auto | notify | approve) are required' };
        } else {
          const { data: before, error: readErr } = await supabase.from('agent_skills').select('id, trust_level, enabled').eq('name', name).maybeSingle();
          if (readErr || !before) {
            result = { success: false, error: readErr ? readErr.message : `no skill named ${name} on this instance` };
          } else {
            const { data: after, error: updErr } = await supabase.from('agent_skills').update({ trust_level: level }).eq('id', before.id).select('trust_level').single();
            result = updErr
              ? { success: false, error: updErr.message }
              : { success: true, skill_name: name, previous: before.trust_level, trust_level: after?.trust_level, reason: (args as any).reason ?? null, note: 'Read on the next call of the skill. sync_skills_from_code leaves it alone.' };
          }
        }

      } else if (handler === 'internal:sync_skills_from_code') {
        result = await executeSyncSkillsFromCode(supabase, args as Record<string, unknown>);

      } else if (handler === 'internal:qualify_lead') {
        result = await executeQualifyLead(supabase, args, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:distill_contact_state') {
        result = await executeDistillContactState(supabase, args as Record<string, unknown>);

      } else if (handler === 'internal:enrich_company') {
        result = await executeEnrichCompany(supabase, args, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:prospect_fit_analysis') {
        result = await executeProspectFitAnalysis(supabase, args, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:sales_profile_setup') {
        result = await executeSalesProfileSetup(supabase, args, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:prospect_research') {
        result = await executeProspectResearch(supabase, args, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:parse_resume') {
        result = await executeParseResume(supabase, args);

      } else if (handler === 'internal:scan_gmail_inbox') {
        result = await executeGmailInboxScan(supabase, args, { supabaseUrl, serviceKey, callerUserId: caller_user_id });

      } else if (handler === 'internal:ingest_inbound_email') {
        result = await executeIngestInboundEmail(supabase, args, { supabaseUrl, serviceKey });

      } else if (handler === 'internal:prepare_vat_return') {
        result = await executeVatReturnSe(supabase, args);

      } else if (handler === 'internal:build_site_step') {
        result = await executeCopilotAction(supabase, args);

      } else if (RESPONSE_HANDLERS[handler]) {
        result = await callResponseHandler(RESPONSE_HANDLERS[handler], args, skill.name);

      } else if (handler.startsWith('internal:reconciliation/')) {
        // Sub-path routing preserved from the edge function:
        // internal:reconciliation/auto-match → action 'auto-match'.
        result = await executeReconciliation(handler.split('/')[1], args);

      } else if (handler === 'internal:company_profile') {
        // Multi-skill: get_company_profile / update_company_profile
        result = await executeCompanyProfile(supabase, args, skill.name);

      } else if (handler === 'internal:get_customer_360') {
        result = await executeCustomer360(supabase, args);

      } else if (handler === 'internal:contact_center') {
        // Multi-skill router: dispatches on the skill name (the edge function
        // used the _skill field the edge: dispatch injected for the same purpose).
        result = await executeContactCenter(supabase, args, skill.name);

      } else if (handler === 'internal:upload_document') {
        result = await executeUploadDocument(supabase, args, { caller_user_id, caller_api_key_id });

      } else if (handler === 'internal:search_knowledge') {
        result = await executeSearchKnowledge(supabase, args);

      } else if (handler === 'internal:request_return') {
        result = await executeRequestReturn(supabase, args);

      } else if (handler === 'internal:list_company_orders') {
        result = await executeListCompanyRecords(supabase, args, 'orders');

      } else if (handler === 'internal:list_company_invoices') {
        result = await executeListCompanyRecords(supabase, args, 'invoices');

      } else if (handler === 'internal:request_company_return') {
        result = await executeRequestCompanyReturn(supabase, args);

      } else if (handler === 'internal:approve_company_quote') {
        result = await executeApproveCompanyQuote(supabase, args);

      } else if (handler === 'internal:manage_company_contacts') {
        result = await executeManageCompanyContacts(supabase, args);

      } else if (handler === 'internal:reorder_company_order') {
        result = await executeReorderCompanyOrder(supabase, args);

      } else if (handler === 'internal:request_company_quote') {
        result = await executeRequestCompanyQuote(supabase, args);

      } else if (handler === 'internal:initiate_company_invoice_payment') {
        result = await executeInitiateCompanyInvoicePayment(supabase, args);

      } else if (handler === 'internal:lint_skill') {
        result = await executeLintSkill(supabase, args);

      } else if (handler === 'internal:update_skill_instructions') {
        result = await executeUpdateSkillInstructions(supabase, args);

      } else if (handler === 'internal:list_communications') {
        result = await executeListCommunications(supabase, args);

      } else if (handler === 'internal:get_communication') {
        result = await executeGetCommunication(supabase, args);

      } else if (handler === 'internal:email_to_ticket') {
        result = await executeEmailToTicket(supabase, args);

      } else if (handler === 'internal:draft_email_reply') {
        result = await handleDraftEmailReply(supabase, args);

      } else if (handler === 'internal:reply_to_email') {
        result = await handleReplyToEmail(supabase, args);

      } else if (handler === 'internal:reply_to_ticket_via_email') {
        result = await executeReplyToTicketViaEmail(supabase, args);

      } else if (handler === 'internal:social_post_batch') {
        result = await executeSocialPostBatch(supabase, args, supabaseUrl, serviceKey);

      } else if (handler === 'internal:ad_creative_generate') {
        result = await executeAdCreativeGenerate(supabase, args, supabaseUrl, serviceKey);

      } else if (handler === 'internal:ad_optimize') {
        result = await executeAdOptimize(supabase, args);

      } else if (handler === 'internal:competitor_monitor') {
        result = await executeCompetitorMonitor(supabase, args, supabaseUrl, serviceKey);

      } else if (handler === 'internal:invoice_from_timesheets') {
        result = await executeInvoiceFromTimesheets(supabase, args);

      } else if (handler.startsWith('rpc:')) {
        const fnName = handler.replace('rpc:', '');

        // jsonb-args RPCs take a single `args jsonb` parameter instead of one
        // param per field. The generic `p_`-prefix mapping below would send
        // `p_name`, `p_cost_cents`, … which never match the lone `args` param,
        // so every call silently failed. For these, forward the cleaned args
        // object whole under `args`. Keep this set in sync with Postgres
        // functions whose signature is exactly `(args jsonb)` — the skill
        // linter (Layer 1) auto-detects the same shape.
        // Strip underscore-prefixed agent-internal fields (e.g. _caller_user_id,
        // _approved, _bypass_approval, _objective_context, trace_id) up front —
        // they must never reach an RPC under any naming convention.
        const cleanedArgs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(args || {})) {
          if (k.startsWith('_')) continue;
          if (k === 'trace_id' || k === 'objective_context') continue;
          cleanedArgs[k] = v;
        }

        let rpcArgs: Record<string, unknown>;
        if (JSONB_ARG_RPCS.has(fnName)) {
          // jsonb-args RPCs take a single `args jsonb` parameter instead of one
          // param per field. The generic `p_`-prefix mapping would send
          // `p_name`, `p_cost_cents`, … which never match the lone `args` param,
          // so every call silently failed. Forward the cleaned args object whole.
          rpcArgs = { args: cleanedArgs };
        } else if (UNDERSCORE_PARAM_RPCS.has(fnName)) {
          // These RPCs keep `_`-prefixed params (also called by the frontend/cron
          // with `_` names). Map skill args to `_<name>` instead of `p_<name>`.
          rpcArgs = {};
          for (const [k, v] of Object.entries(cleanedArgs)) {
            rpcArgs[k.startsWith('_') ? k : `_${k}`] = v;
          }
        } else {
          // Map skill arg names → RPC param names by prefixing p_.
          rpcArgs = {};
          for (const [k, v] of Object.entries(cleanedArgs)) {
            rpcArgs[k.startsWith('p_') ? k : `p_${k}`] = v;
          }
          // Backward-compatible aliases for mcp_global_search (query/limit → search_query/result_limit).
          if (fnName === 'mcp_global_search') {
            if (rpcArgs.p_search_query === undefined && rpcArgs.p_query !== undefined) {
              rpcArgs.p_search_query = rpcArgs.p_query;
            }
            if (rpcArgs.p_result_limit === undefined && rpcArgs.p_limit !== undefined) {
              rpcArgs.p_result_limit = rpcArgs.p_limit;
            }
            delete rpcArgs.p_query;
            delete rpcArgs.p_limit;
          }
        }

        const { data: rpcData, error: rpcErr } = await supabase.rpc(fnName, rpcArgs);
        if (rpcErr) {
          let rpcMsg = `RPC ${fnName} failed: ${rpcErr.message}`;
          // Self-correcting hint. PostgREST returns PGRST202 ("Could not find the
          // function … in the schema cache") when the supplied parameter NAMES
          // don't match the function signature — the #1 autonomous-operator
          // mistake (e.g. sending p_payment_method instead of p_method). Echo
          // what was sent and the exact names this skill declares so the agent
          // can fix it on the next turn instead of seeing an opaque error.
          if ((rpcErr as any).code === 'PGRST202' || /Could not find the function|schema cache/i.test(rpcErr.message || '')) {
            const sent = Object.keys(rpcArgs);
            const params = (skill as any)?.tool_definition?.function?.parameters;
            const declared = Object.keys(params?.properties ?? {});
            // PGRST202 has TWO causes and they need opposite advice. Wrong
            // NAMES is the famous one. But an OMITTED required parameter
            // produces the identical error — and there the name hint actively
            // misleads: it lists back the names the caller already sent and
            // tells them to use those exact names, which they did. Check for
            // the omission first and name it.
            const requiredList: string[] = Array.isArray(params?.required)
              ? params.required.map(String) : [];
            const missing = requiredList.filter((k) => {
              const v = (args as Record<string, unknown>)[k];
              return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
            });
            if (missing.length) {
              rpcMsg += ` — missing required parameter${missing.length > 1 ? 's' : ''}: [${missing.join(', ')}].`
                + ` This skill requires [${requiredList.join(', ')}]; you sent [${Object.keys(args).join(', ')}].`
                + ` Supply the missing value(s) explicitly — do not rely on a default.`;
            } else {
              rpcMsg += ` — the parameter names likely don't match the function signature.`
                + ` You sent: [${sent.join(', ')}].`
                + (declared.length
                    ? ` This skill's declared parameters are: [${declared.join(', ')}]. Use these EXACT names (RPC params are p_-prefixed; do not substitute synonyms).`
                    : ` Pass the exact p_-prefixed parameter names from this skill's input schema.`);
            }
          }
          result = { error: rpcMsg, status: 'failed' };
        } else {
          result = (rpcData as Record<string, unknown>) ?? { success: true };
        }

      } else {
        result = { error: `Unknown handler type: ${handler}` };
      }
    } catch (handlerErr: any) {
      // Normalize all handler exceptions to {error: string} format
      console.error(`[agent-execute] Handler '${handler}' threw:`, handlerErr.message);
      result = { error: `Handler exception: ${handlerErr.message || 'Unknown error'}`, status: 'failed' };
    }

    // 5. Log activity (with objective context and trace_id if provided)
    const activityInput: Record<string, unknown> = { ...args };
    if (objective_context) activityInput._objective_context = objective_context;
    if (trace_id) activityInput.trace_id = trace_id;
    if (caller_api_key_id) activityInput._caller_api_key_id = caller_api_key_id;
    if (caller_user_id) activityInput._caller_user_id = caller_user_id;
    // Determine if the handler actually succeeded
    const handlerFailed = !!(result as any)?.error;
    const activityId = await logActivity(supabase, {
      // effectiveAgent, not agent_type: an approved staged write is credited to
      // the agent that proposed it (see where it is resolved above).
      agent: effectiveAgent, skill_id: skill.id, skill_name: skill.name,
      input: activityInput, output: result as Record<string, unknown>,
      status: handlerFailed ? 'failed' : 'success', conversation_id,
      duration_ms: Date.now() - startTime,
      error_message: handlerFailed ? String((result as any).error).slice(0, 500) : undefined,
      trace_id: trace_id || undefined,
    });

    // 5a. Close the staged operation's loop. The row carried status='executed'
    // with execution_result NULL forever, so the approval trail could not say
    // whether the approved action actually did anything — and a handler that
    // returned { error } still read as a clean 'executed'. Record both.
    if (approvedOpId) {
      await supabase.from('pending_operations')
        .update({
          status: handlerFailed ? 'failed' : 'executed',
          execution_result: (result ?? {}) as never,
        })
        .eq('id', approvedOpId);
    }

    // 5b. Outcome tracking: leave outcome_status as NULL
    // The heartbeat's evaluate_outcomes tool picks up activities with NULL outcome_status.
    // Note: 'pending' is NOT in the activity_outcome_status enum — do not set it.

    // 6. Auto-track objective progress
    if (activityId) {
      try {
        await trackObjectiveProgress(supabase, skill.name, activityId);
      } catch (trackErr) {
        console.error(`[agent-execute] Objective tracking failed after '${skill.name}':`, trackErr);
      }
    }

    // 7. 'notify' trust level: activity is already recorded in agent_activities
    // and visible in /admin/activities + Live Activity feed. We deliberately do
    // NOT inject a chat_messages row here — chat is for dialogue, not exec logs.
    // (See mem://features/internal-flowchat-and-noise-separation.)

    // The envelope tells the same truth as the journal. This used to hardcode
    // 'success' three lines after computing handlerFailed and logging 'failed'
    // to agent_activity — so every caller that trusted the top-level status saw
    // four green checkmarks over four failed page updates, while the log quietly
    // disagreed. An agent that believes that envelope then reports work it never
    // did, which is the exact incident class the objective-evidence guardrail
    // exists for. Known consumers (callSkill, the pilot's step evaluator) already
    // check result.error as well, so honesty here breaks nobody and fixes the
    // ones that only read status.
    return new Response(JSON.stringify({ status: handlerFailed ? 'failed' : 'success', result, trust_level: trustLevel }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('agent-execute error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// markdownToTiptap / inlineClean / parseInline imported from ../_shared/markdown-to-tiptap.ts

// =============================================================================
// Auto-activate module when FlowPilot uses it
// =============================================================================

// Maps handler module names to site_settings module keys
const MODULE_HANDLER_TO_SETTING: Record<string, string> = {
  blog: 'blog',
  crm: 'leads',
  booking: 'bookings',
  newsletter: 'newsletter',
  orders: 'ecommerce',
  objectives: 'analytics',
  products: 'ecommerce',
  media: 'media',
  consultants: 'consultants',
  pages: 'pages',
  kb: 'knowledgeBase',
  globalElements: 'globalElements',
  deals: 'deals',
  companies: 'companies',
  forms: 'forms',
  webinars: 'webinars',
  handbook: 'handbook',
  purchasing: 'purchasing',
  wiki: 'wiki',
  river: 'river',
  docs: 'docs',
};

async function autoActivateModule(
  supabase: any,
  moduleName: string,
): Promise<void> {
  const settingKey = MODULE_HANDLER_TO_SETTING[moduleName];
  if (!settingKey) return;

  try {
    const { data: existing } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'modules')
      .maybeSingle();

    if (!existing?.value) return;

    const modules = existing.value as Record<string, any>;
    const moduleConfig = modules[settingKey];
    
    // Already enabled or doesn't exist in settings
    if (!moduleConfig || moduleConfig.enabled) return;

    // Enable the module
    modules[settingKey] = { ...moduleConfig, enabled: true };
    
    await supabase
      .from('site_settings')
      .update({ value: modules })
      .eq('key', 'modules');

    console.log(`[agent-execute] Auto-activated module: ${settingKey} (triggered by handler module:${moduleName})`);

    // The module just went ON, so the skill registry's requirement just grew.
    // Nothing else in the chain notices — that gap is how an instance ends up
    // with modules enabled and no skills behind them.
    const synced = await executeSyncSkillsFromCode(supabase, {});
    const missing = (synced as { after?: { missing?: number } })?.after?.missing;
    if (missing) {
      console.error(
        `[agent-execute] auto-activated ${settingKey} but ${missing} required skill(s) are still missing`,
      );
    }
  } catch (err) {
    // Non-fatal — don't break skill execution
    console.error(`[agent-execute] Failed to auto-activate module ${settingKey}:`, err);
  }
}

// =============================================================================
// Handler implementations
// =============================================================================

async function executeModuleAction(
  supabase: any,
  moduleName: string,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Defensive normalize — guarantees `data:{}` is always unwrapped
  args = normalizeSkillArgs(args as Record<string, unknown>);
  switch (moduleName) {
    case 'blog': {
      if (skillName === 'manage_blog_posts') {
        return await executeBlogPostsManagement(supabase, args);
      }
      return await executeBlogAction(supabase, skillName, args);
    }

    case 'crm': {
      if (skillName === 'manage_leads') {
        return await executeLeadsAction(supabase, args);
      }
      if (skillName === 'send_email_to_lead') {
        return await executeSendEmailToLead(supabase, args);
      }
      if (skillName === 'lead_pipeline_review') {
        return await executeLeadPipelineReview(supabase, args);
      }
      // Only add_lead falls through to insert. Guard against accidental routing
      // of read-only skills (e.g. lead_pipeline_review) into the insert path.
      if (skillName !== 'add_lead') {
        return { error: `Unknown CRM skill routed to module:crm: ${skillName}` };
      }
      // add_lead — upsert to handle duplicate emails gracefully
      const { email, name, source = 'chat', phone } = args as any;
      if (!email) {
        return { error: 'email is required for add_lead' };
      }
      // Check if lead already exists
      const { data: existing } = await supabase.from('leads')
        .select('id, email, status, name').eq('email', email).maybeSingle();
      if (existing) {
        // Update existing lead with any new info
        const updates: Record<string, unknown> = {};
        if (name && name !== existing.name) updates.name = name;
        if (phone) updates.phone = phone;
        if (Object.keys(updates).length > 0) {
          await supabase.from('leads').update(updates).eq('id', existing.id);
        }
        return { lead_id: existing.id, email: existing.email, status: existing.status, existing: true };
      }
      const { data, error } = await supabase.from('leads').insert({
        email, name, source, phone,
      }).select().single();
      if (error) throw new Error(`Lead insert failed: ${error.message}`);
      return { lead_id: data.id, email: data.email, status: data.status, existing: false };
    }

    case 'booking': {
      if (skillName === 'manage_bookings') {
        return await executeBookingsManagement(supabase, args);
      }
      return await executeBookingAction(supabase, skillName, args);
    }

    case 'newsletter': {
      return await executeNewsletterAction(supabase, skillName, args);
    }

    case 'orders': {
      if (skillName === 'send_invoice_for_order') {
        return await executeSendInvoiceForOrder(supabase, args);
      }
      return await executeOrdersAction(supabase, skillName, args);
    }

    case 'objectives': {
      const { goal, constraints = {}, success_criteria = {} } = args as any;
      if (!goal) throw new Error('goal is required');
      const { data, error } = await supabase.from('agent_objectives').insert({
        goal,
        constraints,
        success_criteria,
        status: 'active',
        progress: {},
      }).select('id, goal, status').single();
      if (error) throw new Error(`Objective insert failed: ${error.message}`);
      return { objective_id: data.id, goal: data.goal, status: data.status };
    }

    case 'analytics': {
      return await executeAnalyticsAction(supabase, skillName, args);
    }

    case 'automations': {
      const a = args as any;
      const action = a.action ?? 'create'; // backwards compat: pre-action callers always created

      if (action === 'list') {
        const lim = Math.min(Math.max(Number(a.limit) || 50, 1), 200);
        const { data, error } = await supabase.from('agent_automations')
          .select('id, name, description, trigger_type, trigger_config, skill_name, enabled, executor, created_at')
          .order('created_at', { ascending: false }).limit(lim);
        if (error) throw new Error(`List automations failed: ${error.message}`);
        return { automations: data || [], count: (data || []).length };
      }

      if (action === 'enable' || action === 'disable') {
        if (!a.automation_id) throw new Error('automation_id is required');
        const { data, error } = await supabase.from('agent_automations')
          .update({ enabled: action === 'enable', updated_at: new Date().toISOString() })
          .eq('id', a.automation_id).select('id, name, enabled').single();
        if (error) throw new Error(`Toggle automation failed: ${error.message}`);
        return { automation_id: data.id, name: data.name, enabled: data.enabled };
      }

      if (action === 'delete') {
        if (!a.automation_id) throw new Error('automation_id is required');
        const { error } = await supabase.from('agent_automations').delete().eq('id', a.automation_id);
        if (error) throw new Error(`Delete automation failed: ${error.message}`);
        return { deleted: true, automation_id: a.automation_id };
      }

      if (action === 'update') {
        if (!a.automation_id) throw new Error('automation_id is required');
        const allowed = ['name', 'description', 'trigger_type', 'trigger_config', 'skill_name', 'skill_arguments', 'enabled', 'executor'];
        const upd: Record<string, unknown> = {};
        for (const k of allowed) if (a[k] !== undefined) upd[k] = a[k];
        if (!Object.keys(upd).length) throw new Error('No updatable fields provided');
        upd.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('agent_automations')
          .update(upd).eq('id', a.automation_id)
          .select('id, name, trigger_type, enabled').single();
        if (error) throw new Error(`Update automation failed: ${error.message}`);
        return { automation_id: data.id, name: data.name, trigger_type: data.trigger_type, enabled: data.enabled };
      }

      // action === 'create' (default for backwards compat)
      const { name, description, trigger_type = 'cron', trigger_config = {}, skill_name: targetSkill, skill_arguments = {}, enabled = false, executor = 'platform' } = a;
      if (!name || !targetSkill) throw new Error('name and skill_name are required for action=create');

      // Look up skill_id from skill_name
      const { data: skillRef } = await supabase.from('agent_skills')
        .select('id, tool_definition').eq('name', targetSkill).eq('enabled', true).limit(1).maybeSingle();

      // A cron/manual automation fires its skill with STATIC arguments — there
      // is no reasoning loop on any executor path (see automation-dispatcher).
      // So every REQUIRED parameter of the target skill must be supplied here,
      // as a literal or an {{event}} template. Without this check a generative
      // skill like write_blog_post (requires model-produced title+content)
      // silently fails on every fire — a "daily blog" automation on liteit
      // errored at 07:00 every day for a week (2026-07-23). Signal/event
      // automations are exempt: their payload fills args at runtime.
      if (action === 'create' && (trigger_type === 'cron' || trigger_type === 'manual')) {
        const req: string[] = skillRef?.tool_definition?.function?.parameters?.required ?? [];
        const supplied = new Set(Object.keys(skill_arguments ?? {}));
        const missing = req.filter((p) => !supplied.has(p));
        if (missing.length) {
          throw new Error(
            `Cannot create this automation: "${targetSkill}" requires ${missing.map((m) => `"${m}"`).join(', ')}, ` +
            `but a ${trigger_type} automation fires with only the static skill_arguments you provide — there is no reasoning loop to generate them. ` +
            `If "${targetSkill}" needs model-produced content each run (e.g. a fresh blog post), it cannot be an automation: create a recurring OBJECTIVE with constraints.cadence instead, which runs through FlowPilot's loop. ` +
            `Otherwise add the missing arguments.`,
          );
        }
      }

      const { data, error } = await supabase.from('agent_automations').insert({
        name,
        description: description || null,
        trigger_type, // honor the actual trigger_type, no longer silently forced to cron
        trigger_config,
        skill_id: skillRef?.id || null,
        skill_name: targetSkill,
        skill_arguments,
        enabled,
        executor,
      }).select('id, name, trigger_type, enabled').single();
      if (error) throw new Error(`Automation insert failed: ${error.message}`);
      return { automation_id: data.id, name: data.name, trigger_type: data.trigger_type, enabled: data.enabled };
    }

    case 'media': {
      const { action = 'list', folder, search, file_path, url, filename } = args as any;

      if (action === 'import_from_url') {
        if (!url || !/^https?:\/\//i.test(url)) {
          throw new Error(`import_from_url requires a http(s) "url" — got: ${url}`);
        }
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) throw new Error(`Source fetch failed: HTTP ${resp.status} for ${url}`);
        const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim() || '';
        if (!contentType.startsWith('image/')) {
          throw new Error(`Source is not an image (content-type: ${contentType || 'unknown'}) — import_from_url only sideloads images`);
        }
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const MAX_BYTES = 15 * 1024 * 1024;
        if (bytes.byteLength > MAX_BYTES) {
          throw new Error(`Image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB — the 15 MB import cap protects storage and page weight`);
        }
        const targetFolder = (folder || 'imports').replace(/[^a-z0-9_-]/gi, '');
        const urlBase = new URL(url).pathname.split('/').pop() || 'image';
        const safeName = (filename || urlBase)
          .replace(/[^a-zA-Z0-9._-]/g, '-')
          .replace(/-{2,}/g, '-')
          .toLowerCase();
        const path = `${targetFolder}/${safeName}`;
        // upsert: same source name lands on the same path — re-imports overwrite
        // instead of accreting copies, so the returned URL is stable.
        const { error: upErr } = await supabase.storage
          .from('cms-images')
          .upload(path, bytes, { contentType, upsert: true });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
        const { data: { publicUrl } } = supabase.storage
          .from('cms-images')
          .getPublicUrl(path);
        return { imported: true, path, url: publicUrl, bytes: bytes.byteLength, content_type: contentType, source_url: url };
      }

      if (action === 'list') {
        const targetFolders = folder ? [folder] : ['pages', 'imports', 'templates', 'uploads'];
        const allFiles: Array<{ name: string; folder: string; url: string; size?: number; type?: string; created_at?: string }> = [];

        for (const f of targetFolders) {
          const { data: files } = await supabase.storage
            .from('cms-images')
            .list(f, { sortBy: { column: 'created_at', order: 'desc' }, limit: 50 });
          if (files) {
            for (const file of files) {
              if (file.name === '.emptyFolderPlaceholder') continue;
              const { data: { publicUrl } } = supabase.storage
                .from('cms-images')
                .getPublicUrl(`${f}/${file.name}`);
              allFiles.push({
                name: file.name,
                folder: f,
                url: publicUrl,
                size: (file.metadata as any)?.size,
                type: (file.metadata as any)?.mimetype,
                created_at: file.created_at,
              });
            }
          }
        }

        // Optional search filter
        const filtered = search
          ? allFiles.filter(f => f.name.toLowerCase().includes((search as string).toLowerCase()))
          : allFiles;

        return { files: filtered.slice(0, 30), total: filtered.length };
      }

      if (action === 'get_url' && file_path) {
        const { data: { publicUrl } } = supabase.storage
          .from('cms-images')
          .getPublicUrl(file_path);
        return { url: publicUrl, path: file_path };
      }

      if (action === 'delete' && file_path) {
        const { error } = await supabase.storage
          .from('cms-images')
          .remove([file_path]);
        if (error) throw new Error(`Delete failed: ${error.message}`);
        return { deleted: file_path };
      }

      if (action === 'clear_all') {
        const targetFolders = ['pages', 'imports', 'templates', 'uploads', 'blog'];
        let totalDeleted = 0;
        for (const f of targetFolders) {
          const { data: files } = await supabase.storage
            .from('cms-images')
            .list(f, { limit: 1000 });
          if (files?.length) {
            const paths = files
              .filter((file: any) => file.name !== '.emptyFolderPlaceholder')
              .map((file: any) => `${f}/${file.name}`);
            if (paths.length > 0) {
              const { error } = await supabase.storage.from('cms-images').remove(paths);
              if (!error) totalDeleted += paths.length;
            }
          }
        }
        return { action: 'clear_all', total_deleted: totalDeleted, folders_cleaned: targetFolders };
      }

      return { error: `Unknown media action: ${action}` };
    }

    case 'approvals': {
      return await executeApprovalsAction(supabase, skillName, args);
    }

    case 'consultants': {
      return await executeConsultantsAction(supabase, skillName, args);
    }

    case 'pages': {
      return await executePagesAction(supabase, skillName, args);
    }

    case 'kb': {
      return await executeKbAction(supabase, skillName, args);
    }

    case 'wiki': {
      return await executeWikiAction(supabase, skillName, args);
    }

    case 'river': {
      return await executeRiverAction(supabase, skillName, args);
    }

    case 'flowtable': {
      return await executeFlowtableAction(supabase, skillName, args);
    }

    case 'globalElements': {
      return await executeGlobalBlocksAction(supabase, skillName, args);
    }

    case 'deals': {
      return await executeDealsAction(supabase, skillName, args);
    }

    case 'products': {
      return await executeProductsAction(supabase, skillName, args);
    }

    case 'companies': {
      return await executeCompaniesAction(supabase, skillName, args);
    }

    case 'forms': {
      return await executeFormsAction(supabase, skillName, args);
    }

    case 'webinars': {
      return await executeWebinarsAction(supabase, skillName, args);
    }

    case 'openclaw': {
      return await executeOpenClawAction(supabase, skillName, args);
    }

    case 'handbook': {
      return await executeHandbookAction(supabase, skillName, args);
    }

    case 'timesheets': {
      return await executeTimesheetsAction(supabase, skillName, args);
    }

    case 'calendar': {
      return await executeCalendarAction(supabase, skillName, args);
    }

    case 'templates': {
      return await executeTemplatesAction(supabase, skillName, args);
    }

    case 'docs': {
      const a = args as { query?: string; category?: string; slug?: string; limit?: number };
      const limit = Math.min(Math.max(a.limit ?? 5, 1), 25);

      // Direct fetch by category+slug
      if (a.slug && a.category) {
        const { data, error } = await supabase
          .from('docs_pages')
          .select('category, slug, title, content, frontmatter, synced_at')
          .eq('category', a.category)
          .eq('slug', a.slug)
          .eq('is_published', true)
          .maybeSingle();
        if (error) return { error: `docs fetch failed: ${error.message}`, status: 'failed' };
        if (!data) return { results: [], count: 0, message: 'Page not found' };
        return {
          page: { ...data, url: `/docs/${data.category}/${data.slug}` },
        };
      }

      let q = supabase
        .from('docs_pages')
        .select('category, slug, title, content, synced_at')
        .eq('is_published', true)
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .limit(limit);

      if (a.category) q = q.eq('category', a.category);
      if (a.query && a.query.trim()) {
        const term = a.query.trim().replace(/[%_]/g, '\\$&');
        q = q.or(`title.ilike.%${sanitizeOrTerm(term)}%,content.ilike.%${sanitizeOrTerm(term)}%`);
      }

      const { data, error } = await q;
      if (error) return { error: `docs search failed: ${error.message}`, status: 'failed' };

      const results = (data ?? []).map((r: any) => {
        let excerpt = '';
        if (a.query && r.content) {
          const idx = r.content.toLowerCase().indexOf(a.query.toLowerCase());
          if (idx >= 0) {
            const start = Math.max(0, idx - 80);
            excerpt = (start > 0 ? '…' : '') + r.content.slice(start, idx + 200) + '…';
          } else {
            excerpt = r.content.slice(0, 200) + '…';
          }
        } else if (r.content) {
          excerpt = r.content.slice(0, 200) + '…';
        }
        return {
          category: r.category,
          slug: r.slug,
          title: r.title,
          url: `/docs/${r.category}/${r.slug}`,
          excerpt,
          synced_at: r.synced_at,
        };
      });

      return { results, count: results.length };
    }

    default:
      return { error: `Unknown module: ${moduleName}` };
  }
}

// =============================================================================
// Calendar module handler — aggregates events across enabled domain tables
// =============================================================================
async function executeCalendarAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName !== 'list_events') {
    return { error: `Unknown calendar skill: ${skillName}` };
  }
  const a = args as { start?: string; end?: string; sources?: string[] };
  if (!a.start || !a.end) {
    return { error: 'start and end (ISO dates) are required', status: 'failed' };
  }
  const start = a.start;
  const end = a.end;
  const wanted = (a.sources && a.sources.length) ? new Set(a.sources) : null;
  const include = (id: string) => !wanted || wanted.has(id);

  const events: Array<Record<string, unknown>> = [];

  if (include('bookings')) {
    const { data } = await supabase
      .from('bookings')
      .select('id, customer_name, start_time, end_time, status')
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: true })
      .limit(500);
    for (const r of data ?? []) {
      events.push({
        id: `booking:${r.id}`, sourceId: 'bookings',
        title: `Booking — ${r.customer_name}`,
        start: r.start_time, end: r.end_time, status: r.status,
        url: `/admin/bookings`,
      });
    }
  }

  if (include('tasks')) {
    const { data } = await supabase
      .from('project_tasks')
      .select('id, title, due_date, status, project_id')
      .gte('due_date', start)
      .lte('due_date', end)
      .order('due_date', { ascending: true })
      .limit(500);
    for (const r of data ?? []) {
      events.push({
        id: `task:${r.id}`, sourceId: 'tasks',
        title: `Task — ${r.title}`,
        start: r.due_date, allDay: true, status: r.status,
        url: `/admin/projects/${r.project_id}`,
      });
    }
  }

  if (include('leave')) {
    const { data } = await supabase
      .from('leave_requests')
      .select('id, employee_id, start_date, end_date, leave_type, status')
      .gte('start_date', start)
      .lte('start_date', end)
      .order('start_date', { ascending: true })
      .limit(500);
    for (const r of data ?? []) {
      events.push({
        id: `leave:${r.id}`, sourceId: 'leave',
        title: `Leave — ${r.leave_type}`,
        start: r.start_date, end: r.end_date, allDay: true, status: r.status,
        url: `/admin/hr`,
      });
    }
  }

  if (include('contracts')) {
    const { data } = await supabase
      .from('contracts')
      .select('id, title, end_date, status')
      .gte('end_date', start)
      .lte('end_date', end)
      .order('end_date', { ascending: true })
      .limit(500);
    for (const r of data ?? []) {
      events.push({
        id: `contract:${r.id}`, sourceId: 'contracts',
        title: `Contract renewal — ${r.title}`,
        start: r.end_date, allDay: true, status: r.status,
        url: `/admin/contracts/${r.id}`,
      });
    }
  }

  events.sort((x: any, y: any) => String(x.start).localeCompare(String(y.start)));
  return { success: true, count: events.length, events };
}

// =============================================================================
// Templates module handler — catalog, server-side install, site export.
// Server-side mirror of src/hooks/useTemplateInstaller.ts (install) and
// src/hooks/useTemplateExport.ts + src/lib/template-exporter.ts (export).
// Template data comes from ./_templates.json (regenerated by
// `bun run scripts/templates-to-json.ts`).
// =============================================================================

const TEMPLATE_MAP = bundledTemplates as Record<string, any>;

function tplCatalog() {
  return Object.values(TEMPLATE_MAP).map((t: any) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline || '',
    category: t.category || 'startup',
    pages: Array.isArray(t.pages) ? t.pages.length : 0,
    blog_posts: Array.isArray(t.blogPosts) ? t.blogPosts.length : 0,
    kb_categories: Array.isArray(t.kbCategories) ? t.kbCategories.length : 0,
    products: Array.isArray(t.products) ? t.products.length : 0,
    required_modules: t.requiredModules || [],
  }));
}

// Mirror of src/lib/tiptap-utils.ts createDocumentFromText — KB answers are Q&A text.
function tplDocFromText(text: string): Record<string, unknown> {
  const paragraphs = String(text || '').split(/\n\n+/).filter((p) => p.trim());
  if (!paragraphs.length) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return {
    type: 'doc',
    content: paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p.trim() }] })),
  };
}

function tplReadingTime(content: unknown): number {
  try {
    const words = JSON.stringify(content ?? '').split(/\s+/).length;
    return Math.max(1, Math.round(words / 200));
  } catch {
    return 1;
  }
}

// install_template — staged skill (requires_staging=true). Mirrors the admin
// installer's table shapes and manifest bookkeeping, with one deliberate
// deviation: existing live content is PRESERVED (colliding slugs/names are
// skipped and reported) instead of the hook's clear-all fallback. Only
// resources tracked in the previous template's manifest are removed.
async function tplInstall(supabase: any, args: Record<string, unknown>): Promise<unknown> {
  const a = args as any;
  const templateId = a.template_id || a.templateId || a.id;
  if (!templateId || typeof templateId !== 'string') {
    return { error: 'template_id is required', available_templates: Object.keys(TEMPLATE_MAP) };
  }
  let template = TEMPLATE_MAP[templateId];
  let storedTemplateSource: string | null = null;
  if (!template) {
    // Not in the bundled catalog — try a template STORED on this instance
    // (site_templates). This is what closes the authoring loop: an agent
    // composes a template with manage_site_template, and the same installer
    // that seeds the shipped catalog can put it on the site. The stored
    // template_json IS a StarterTemplate body, so it takes the identical path.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);
    const q = supabase.from('site_templates').select('id, name, template_json').eq('is_active', true);
    const { data: stored } = isUuid
      ? await q.eq('id', templateId).maybeSingle()
      : await q.ilike('name', templateId).maybeSingle();
    if (stored?.template_json) {
      // The installer reads template.id/.name for the manifest — give the
      // stored row the same shape the catalog entries have.
      template = { ...(stored.template_json as Record<string, unknown>), id: stored.id, name: stored.name } as never;
      storedTemplateSource = 'site_templates';
    }
  }
  if (!template) {
    const { data: storedList } = await supabase
      .from('site_templates').select('name').eq('is_active', true).limit(25);
    return {
      error: `Unknown template "${templateId}"`,
      available_templates: Object.keys(TEMPLATE_MAP),
      stored_templates: (storedList ?? []).map((t: { name: string }) => t.name),
      hint: 'Catalog ids come from list_templates; templates authored on this instance come from manage_site_template action=list.',
    };
  }

  const publish = a.publish !== false;
  const applySettings = a.apply_settings === true;
  const include = {
    pages: a.include_pages !== false,
    blog: a.include_blog_posts !== false && Array.isArray(template.blogPosts) && template.blogPosts.length > 0,
    kb: a.include_kb !== false && Array.isArray(template.kbCategories) && template.kbCategories.length > 0,
    products: a.include_products !== false && Array.isArray(template.products) && template.products.length > 0,
  };
  const callerUserId = (a._caller_user_id as string | undefined) ?? null;
  const errors: string[] = [];
  const skipped = { pages: [] as string[], blog_posts: [] as string[], kb_categories: [] as string[], products: [] as string[] };

  // 1. Uninstall the previous template via its manifest (mirrors useTemplateInstaller).
  const { data: prev } = await supabase
    .from('installed_template')
    .select('id, template_id, template_name, manifest')
    .order('installed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let uninstalledPrevious: { template_id: string; template_name: string } | null = null;
  if (prev?.manifest) {
    const m = prev.manifest as any;
    const del = async (table: string, ids?: string[]) => {
      if (Array.isArray(ids) && ids.length) {
        try { await supabase.from(table).delete().in('id', ids); } catch { /* already deleted */ }
      }
    };
    await del('pages', m.pageIds);
    await del('blog_posts', m.blogPostIds);
    await del('kb_categories', m.kbCategoryIds);
    await del('products', m.productIds);
    await del('consultant_profiles', m.consultantIds);
    // Availability before services (FK), same order as the admin installer.
    await del('booking_availability', m.bookingAvailabilityIds);
    await del('booking_services', m.bookingServiceIds);
    uninstalledPrevious = { template_id: prev.template_id, template_name: prev.template_name };
  }
  await supabase.from('installed_template').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // 2. Slug handling: purge TRASHED pages colliding with template slugs
  //    (mirrors the hook); skip template pages whose slug is live.
  const templateSlugs: string[] = (template.pages || []).map((p: any) => p.slug);
  const liveSlugs = new Set<string>();
  if (include.pages && templateSlugs.length) {
    const { data: trashed } = await supabase
      .from('pages').select('id, slug')
      .not('deleted_at', 'is', null).in('slug', templateSlugs);
    for (const p of trashed ?? []) {
      try { await supabase.from('pages').delete().eq('id', p.id); } catch { /* already deleted */ }
    }
    const { data: live } = await supabase
      .from('pages').select('slug')
      .is('deleted_at', null).in('slug', templateSlugs);
    for (const p of live ?? []) { liveSlugs.add(p.slug); skipped.pages.push(p.slug); }
  }

  // 3. Create pages.
  const pageIds: string[] = [];
  if (include.pages) {
    const pages = template.pages || [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (liveSlugs.has(page.slug)) continue;
      const { data, error } = await supabase.from('pages').insert({
        title: page.title,
        slug: page.slug,
        status: publish ? 'published' : 'draft',
        content_json: page.blocks || [],
        meta_json: page.meta || {},
        menu_order: page.menu_order ?? i,
        show_in_menu: page.showInMenu ?? true,
        created_by: callerUserId,
        updated_by: callerUserId,
      }).select('id').single();
      if (error) { errors.push(`Page "${page.slug}": ${error.message}`); continue; }
      if (data?.id) pageIds.push(data.id);
    }
  }

  // 4. Create products (+ best-effort stock, mirrors admin installer).
  const productIds: string[] = [];
  if (include.products) {
    const products = template.products || [];
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const { data: exists } = await supabase
        .from('products').select('id').eq('name', product.name).limit(1).maybeSingle();
      if (exists) { skipped.products.push(product.name); continue; }
      const { data: created, error } = await supabase.from('products').insert({
        name: product.name,
        description: product.description,
        price_cents: product.price_cents,
        currency: product.currency,
        type: product.type,
        image_url: product.image_url || null,
        is_active: product.is_active ?? true,
        sort_order: i,
        stripe_price_id: null,
      }).select('id').single();
      if (error) { errors.push(`Product "${product.name}": ${error.message}`); continue; }
      if (created?.id) {
        productIds.push(created.id);
        if (product.stock) {
          try {
            await supabase.from('product_stock').insert({
              product_id: created.id,
              quantity_on_hand: product.stock.quantity_on_hand,
              reorder_point: product.stock.reorder_point ?? 0,
            });
            await supabase.from('products').update({
              track_inventory: true,
              stock_quantity: product.stock.quantity_on_hand,
              low_stock_threshold: product.stock.reorder_point ?? 5,
            }).eq('id', created.id);
          } catch { /* non-fatal — stock seeding is best-effort */ }
        }
      }
    }
  }

  // 5. Consultant profiles + booking services/availability (if the template has them).
  const consultantIds: string[] = [];
  for (const c of template.consultants || []) {
    const { data, error } = await supabase.from('consultant_profiles').insert({
      name: c.name, title: c.title, summary: c.summary, bio: c.bio || null,
      skills: c.skills, experience_years: c.experience_years,
      certifications: c.certifications || [], languages: c.languages || ['English'],
      availability: c.availability, hourly_rate_cents: c.hourly_rate_cents || null,
      // Omit when the template carries no currency — the column default is the
      // instance's own currency, and a hardcoded fallback here overrides it.
      currency: c.currency || undefined, avatar_url: c.avatar_url || null,
      linkedin_url: c.linkedin_url || null, is_active: c.is_active ?? true,
    }).select('id').single();
    if (error) { errors.push(`Consultant "${c.name}": ${error.message}`); continue; }
    if (data?.id) consultantIds.push(data.id);
  }
  const bookingServiceIds: string[] = [];
  const services = template.bookingServices || [];
  for (let i = 0; i < services.length; i++) {
    const s = services[i];
    const { data, error } = await supabase.from('booking_services').insert({
      name: s.name, description: s.description || null,
      duration_minutes: s.duration_minutes, price_cents: s.price_cents,
      currency: s.currency, color: s.color || '#3b82f6',
      is_active: s.is_active ?? true, sort_order: i,
    }).select('id').single();
    if (error) { errors.push(`Booking service "${s.name}": ${error.message}`); continue; }
    if (data?.id) bookingServiceIds.push(data.id);
  }
  const bookingAvailabilityIds: string[] = [];
  for (const slot of template.bookingAvailability || []) {
    const { data, error } = await supabase.from('booking_availability').insert({
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      is_active: slot.is_active ?? true,
    }).select('id').single();
    if (error) { errors.push(`Booking availability: ${error.message}`); continue; }
    if (data?.id) bookingAvailabilityIds.push(data.id);
  }

  // 6. Blog posts.
  const blogPostIds: string[] = [];
  if (include.blog) {
    const posts = template.blogPosts || [];
    const postSlugs = posts.map((p: any) => p.slug);
    const { data: existingPosts } = await supabase
      .from('blog_posts').select('slug').in('slug', postSlugs);
    const existingPostSlugs = new Set((existingPosts ?? []).map((r: any) => r.slug));
    for (const post of posts) {
      if (existingPostSlugs.has(post.slug)) { skipped.blog_posts.push(post.slug); continue; }
      const { data, error } = await supabase.from('blog_posts').insert({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content_json: post.content ?? null,
        featured_image: post.featured_image,
        featured_image_alt: post.featured_image_alt,
        author_id: callerUserId,
        meta_json: post.meta || {},
        reading_time_minutes: tplReadingTime(post.content),
        created_by: callerUserId,
        updated_by: callerUserId,
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date().toISOString() : null,
      }).select('id').single();
      if (error) { errors.push(`Blog post "${post.slug}": ${error.message}`); continue; }
      if (data?.id) blogPostIds.push(data.id);
    }
  }

  // 7. KB categories + articles.
  const kbCategoryIds: string[] = [];
  let kbArticleCount = 0;
  if (include.kb) {
    for (const category of template.kbCategories || []) {
      const { data: exists } = await supabase
        .from('kb_categories').select('id').eq('slug', category.slug).limit(1).maybeSingle();
      if (exists) { skipped.kb_categories.push(category.slug); continue; }
      const { data: cat, error } = await supabase.from('kb_categories').insert({
        name: category.name, slug: category.slug,
        description: category.description, icon: category.icon,
        is_active: true,
      }).select('id').single();
      if (error || !cat?.id) { errors.push(`KB category "${category.slug}": ${error?.message ?? 'insert failed'}`); continue; }
      kbCategoryIds.push(cat.id);
      for (const article of category.articles || []) {
        const { error: aErr } = await supabase.from('kb_articles').insert({
          category_id: cat.id,
          title: article.title,
          slug: article.slug,
          question: article.question,
          answer_json: tplDocFromText(article.answer_text),
          answer_text: article.answer_text,
          is_published: publish,
          is_featured: article.is_featured,
          include_in_chat: article.include_in_chat,
        });
        if (aErr) { errors.push(`KB article "${article.slug}": ${aErr.message}`); continue; }
        kbArticleCount++;
      }
    }
  }

  // 8. Optionally merge template settings into site_settings (off by default —
  //    branding/SEO/homepage swaps are a bigger blast radius than content seeding).
  const settingsApplied: string[] = [];
  /** Result of the post-install skill reconcile (see 8b), or null when no module changed. */
  let skillsSynced: unknown = null;
  if (applySettings) {
    const mergeSetting = async (key: string, value: any) => {
      if (!value || typeof value !== 'object') return;
      const { data: row } = await supabase.from('site_settings').select('value').eq('key', key).maybeSingle();
      const merged = { ...((row?.value as Record<string, unknown>) ?? {}), ...value };
      const { error } = await supabase.from('site_settings').upsert({ key, value: merged }, { onConflict: 'key' });
      if (error) { errors.push(`Setting "${key}": ${error.message}`); return; }
      settingsApplied.push(key);
    };
    await mergeSetting('branding', template.branding);
    await mergeSetting('chat', template.chatSettings);
    await mergeSetting('header', template.headerSettings);
    await mergeSetting('footer', template.footerSettings);
    await mergeSetting('seo', template.seoSettings);
    await mergeSetting('aeo', template.aeoSettings);
    await mergeSetting('cookie_banner', template.cookieBannerSettings);
    await mergeSetting('general', {
      homepageSlug: template.siteSettings?.homepageSlug,
      selectedTemplate: template.id,
    });
    if (Array.isArray(template.requiredModules) && template.requiredModules.length) {
      const { data: modRow } = await supabase.from('site_settings').select('value').eq('key', 'modules').maybeSingle();
      const modules = { ...((modRow?.value as Record<string, any>) ?? {}) };
      for (const id of template.requiredModules) {
        if (modules[id]) modules[id] = { ...modules[id], enabled: true };
      }
      const { error } = await supabase.from('site_settings').upsert({ key: 'modules', value: modules }, { onConflict: 'key' });
      if (!error) settingsApplied.push('modules');
    }
  }

  // 8b. Turning modules ON changes what the skill layer must contain — and
  //     NOTHING else in the deploy chain notices. This was the trigger that
  //     armed the 96-of-347 instance: the template enabled seven modules
  //     server-side, no bootstrap ran for them, and the hash-gated sync then
  //     answered "unchanged" forever. Reconcile here, right where the
  //     requirement changed. Non-fatal — a template install must not fail on it.
  if (settingsApplied.includes('modules')) {
    try {
      skillsSynced = await executeSyncSkillsFromCode(supabase, {});
    } catch (err) {
      errors.push(`skill sync after module enable: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  // 9. Record the manifest so the next install (or a cleanup) can uninstall precisely.
  const manifest = {
    pageIds, blogPostIds, kbCategoryIds, productIds,
    consultantIds, bookingServiceIds, bookingAvailabilityIds,
  };
  const { error: manifestErr } = await supabase.from('installed_template').insert({
    template_id: template.id,
    template_name: template.name,
    manifest,
  });
  if (manifestErr) errors.push(`installed_template manifest: ${manifestErr.message}`);

  // Activate the template's accounting locale — same rule as the admin
  // installer: the install carries the default choice (WordPress-installer
  // model), the engine stays empty-until-chosen, and an EXISTING choice is
  // never overridden. Chart accounts come from the bundled pack artifact so
  // the agent path needs no browser session afterwards.
  // Precedence is the Odoo model: existing choice > the BUSINESS's country >
  // the template's default. Content and jurisdiction are different axes — a
  // German customer may want this (English) template but needs German books,
  // so the company country outranks where the template happens to come from.
  // Country comes from the caller (`country` arg — an agent provisioning an
  // instance states it) or site_settings general.country; an exact pack match
  // beats the '*' generic fallback.
  const packForCountryCode = (country: unknown): string | null => {
    if (typeof country !== 'string' || !country.trim()) return null;
    const code = country.trim().toUpperCase();
    const packs = (bundledLocalePacks as any).packs ?? [];
    const exact = packs.find((p: any) => (p.countries ?? []).some((c: string) => c.toUpperCase() === code));
    const generic = packs.find((p: any) => (p.countries ?? []).includes('*'));
    return exact?.id ?? generic?.id ?? null;
  };

  let localeActivated: string | null = null;
  {
    const { data: generalRow } = await supabase
      .from('site_settings').select('value').eq('key', 'general').maybeSingle();
    const businessCountry = a.country ?? (generalRow?.value as any)?.country;
    const localeToActivate =
      packForCountryCode(businessCountry) ??
      (typeof template.accountingLocale === 'string' && template.accountingLocale
        ? template.accountingLocale
        : null);

    const { data: existingLocale } = await supabase
      .from('site_settings').select('key').eq('key', 'accounting_locale').maybeSingle();
    if (localeToActivate && !existingLocale) {
      const { error: locErr } = await supabase
        .from('site_settings')
        .insert({ key: 'accounting_locale', value: localeToActivate });
      if (locErr) {
        errors.push(`accounting_locale activation: ${locErr.message}`);
      } else {
        localeActivated = localeToActivate;
        const pack = (bundledLocalePacks as any).packs?.find(
          (p: any) => p.id === localeToActivate,
        );
        if (pack) {
          // Let the CONSTRAINT decide what already exists — never a read.
          //
          // This used to select every account_code for the locale, build a Set
          // and insert the difference. PostgREST caps an unfiltered select at
          // 1000 rows and says nothing about it; se-bas2024 ships 1262
          // accounts, so the read could never see the last 262. They were
          // counted as missing on every single install, the insert hit
          // chart_of_accounts_locale_code_key, and the loop `break`ed with a
          // duplicate-key error pushed into the install report. The unique
          // constraint kept the data honest — it was the only thing that did.
          //
          // The read is gone rather than paginated: upsert/DO NOTHING removes
          // the whole class, including the read→write window where a
          // concurrent seed inserts a code between the two statements, and it
          // is idempotent for free. Target is the real constraint
          // UNIQUE (locale, account_code), not a guess.
          const rows = (pack.accounts as any[])
            // is_active comes from the pack — the whole standard is seeded, but
            // only the accounts a company plausibly uses start visible.
            .map((acc) => ({ ...acc, is_active: acc.is_active !== false, locale: pack.id }));
          for (let i = 0; i < rows.length; i += 100) {
            const { error: coaErr } = await supabase
              .from('chart_of_accounts')
              .upsert(rows.slice(i, i + 100), {
                onConflict: 'locale,account_code',
                ignoreDuplicates: true,
              });
            if (coaErr) { errors.push(`chart seed: ${coaErr.message}`); break; }
          }
        }
      }
    }
  }

  return {
    success: errors.length === 0,
    template_id: template.id,
    template_name: template.name,
    // 'catalog' = shipped with the product; 'site_templates' = authored on this
    // instance. Worth reporting: it is the difference between a demo and the
    // customer's own template, and the manifest keeps that provenance.
    template_source: storedTemplateSource ?? 'catalog',
    accounting_locale_activated: localeActivated,
    uninstalled_previous: uninstalledPrevious,
    created: {
      pages: pageIds.length,
      blog_posts: blogPostIds.length,
      kb_categories: kbCategoryIds.length,
      kb_articles: kbArticleCount,
      products: productIds.length,
      consultants: consultantIds.length,
      booking_services: bookingServiceIds.length,
      booking_availability: bookingAvailabilityIds.length,
    },
    skipped,
    settings_applied: settingsApplied,
    // Enabling modules changes what the skill registry must hold; the reconcile
    // runs here so an installed template is never one manual click away from an
    // agent surface that cannot do the job the template promises.
    skills_synced: skillsSynced ?? undefined,
    errors: errors.length ? errors : undefined,
    manifest,
    notes: [
      'Existing live content is preserved — colliding slugs/names were skipped (see "skipped"). The previous installed template (if any) was uninstalled via its manifest.',
      'Image URLs are used exactly as referenced by the template (no server-side download to the media library; the admin Template Gallery offers that interactively).',
      applySettings
        ? 'Template settings (branding/SEO/homepage/modules) were merged into site_settings.'
        : 'Site settings untouched — re-run with apply_settings=true to also apply branding/SEO/homepage/modules.',
    ],
  };
}

// sync_skills_from_code — the 4th deploy layer follows the other three.
//
// A GitHub push deploys schema (migrations), edge functions (config.toml) and
// frontend (Vercel) — but agent_skills is table DATA born from TypeScript
// seeds, which no deploy layer ever touched. Every fresh install and every
// release therefore drifted until someone clicked "Sync skills from code" or
// ran sync-skills.ts with database credentials (observed: the new sandbox sat
// at 5 skills with 18 modules enabled).
//
// This handler closes the loop: the deploy bundles the full seed artifact
// (_module-skills.json) into this function, and reconciling against it is a
// skill call — service-role cron, an admin JWT from browser bootstrap, or an
// operator over MCP. Semantics mirror sync-skills.ts/bootstrapModule exactly:
// only ENABLED modules (+ platform, always); INSERT missing skills complete;
// UPDATE existing rows' definition fields only — NEVER trust_level, so runtime
// trust overrides survive every release.
//
// ── Varför grinden mäter TÄCKNING och inte bara artefaktens hash ─────────────
// Den första versionen kortslöt på `site_settings.skills_artifact_sha === sha`:
// "har den här deployens artefakt redan applicerats?". Fel fråga — den mäter
// koden, inte instansen. Verkligt utfall på en färsk, fullt provisionerad
// instans (verifierat av tre oberoende QA-körningar): 96 av 347 förväntade
// skills i `agent_skills`, medan svaret var {"status":"unchanged"}.
//
// Kedjan som armerade fällan:
//   1. Första admin-laddningen kör synken när `site_settings.modules` ännu bara
//      bär KODENS default (ett fåtal moduler på) → ~96 rader skrivs …
//   2. … och sha:n STÄMPLAS, som om lagret vore komplett.
//   3. `install_template` (apply_settings) slår sedan på commerce, contracts,
//      subscriptions, invoicing, tickets, sla, field-service i modulraden.
//      Ingen deploy, ingen migration och ingen bootstrap rör skill-lagret.
//   4. Varje efterföljande synk ser samma artefakt-sha och svarar "unchanged"
//      för alltid. Villkoret kan aldrig mer bli sant — samma klass som
//      självläkningen som väntade på att en migrationsseedad skill skulle SAKNAS.
//
// Rätt fråga är tillståndsfrågan: "stämmer `agent_skills` med vad de PÅSLAGNA
// modulerna säger att den ska innehålla?". Den mäts alltid (en namn-kolumnläsning,
// paginerad), och hash-grinden får leva kvar enbart som snabbväg OVANPÅ den:
// stämpeln räknas bara när täckningen faktiskt är hel.
//
// ── Varför svaret läses tillbaka ────────────────────────────────────────────
// Samma körning rapporterade `inserted: 0` medan 251 rader skrevs. En räknare
// som inte kan motsägas är ingen mätning. Svaret bär därför tabellens antal FÖRE
// och EFTER skrivningen, vad som saknades, vad som fortfarande saknas, och
// flaggar avvikelsen om raddeltat inte motsvarar de påstådda insertarna.

/** All rader ur agent_skills — paginerad, så PostgREST:s radtak aldrig kan tysta bort svansen. */
async function readAllSkills(supabase: any, columns: string): Promise<{ rows: any[]; error?: string }> {
  const PAGE = 500;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('agent_skills')
      .select(columns)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { rows: out, error: error.message };
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return { rows: out };
}

async function executeSyncSkillsFromCode(supabase: any, args: Record<string, unknown>): Promise<unknown> {
  const force = args.force === true;

  const raw = JSON.stringify(bundledModuleSkills);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const sha = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

  const { data: settings } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['skills_artifact_sha', 'modules']);
  const byKey = new Map<string, unknown>((settings ?? []).map((r: any) => [r.key, r.value]));

  const enabledMap = (byKey.get('modules') ?? {}) as Record<string, { enabled?: boolean }>;
  const isEnabled = (id: string) => id === 'platform' || enabledMap[id]?.enabled === true;
  // Utan modulraden läser servern VARJE modul som av (_shared/modules.ts gör
  // ingen default-merge, med flit), så "täckningen är hel" skulle betyda
  // "plattformslagret finns" — sant, och samtidigt vilseledande. Säg det.
  const modulesRowPresent = Object.keys(enabledMap).length > 0;

  // ── 1. Vad de PÅSLAGNA modulerna kräver ───────────────────────────────────
  const expected = new Map<string, any>();
  const skippedModules: string[] = [];
  for (const mod of (bundledModuleSkills as any).modules as Array<{ moduleId: string; skills: any[] }>) {
    if (!isEnabled(mod.moduleId)) { skippedModules.push(mod.moduleId); continue; }
    for (const seed of mod.skills) {
      if (seed && typeof seed === 'object' && seed.name) expected.set(seed.name, seed);
    }
  }
  const expectedNames = [...expected.keys()];

  // ── 2. Verklig mätning (billig: bara namn + de två synlighetsflaggorna) ────
  const probe = await readAllSkills(supabase, 'name, enabled, mcp_exposed');
  if (probe.error) return { error: `Could not read agent_skills: ${probe.error}` };
  const presentBefore = new Map<string, any>(probe.rows.map((r: any) => [r.name, r]));
  const missingBefore = expectedNames.filter((n) => !presentBefore.has(n));
  const hiddenBefore = expectedNames.filter((n) => {
    const r = presentBefore.get(n);
    return r && (r.enabled !== true || r.mcp_exposed !== true);
  });
  const rowsBefore = probe.rows.length;

  const coverage = (missing: string[], hidden: string[], total: number) => ({
    expected_for_enabled_modules: expected.size,
    present: expected.size - missing.length,
    missing: missing.length,
    missing_names: missing.slice(0, 40),
    disabled_or_unexposed: hidden.length,
    agent_skills_rows: total,
    modules_skipped_disabled: skippedModules.length,
    modules_row_present: modulesRowPresent,
    modules_row_warning: modulesRowPresent
      ? undefined
      : 'site_settings.modules is absent or empty — the server reads every module as OFF, so this coverage covers the platform layer alone. Seed the row (ensure_modules_settings) before trusting it.',
  });

  // ── 3. Snabbväg — men bara när MÄTNINGEN håller med stämpeln ──────────────
  //     Hash-lika artefakt räcker inte: den säger att koden är densamma, inte
  //     att instansen bär den. Täckningen måste vara hel också.
  if (
    !force &&
    byKey.get('skills_artifact_sha') === sha &&
    missingBefore.length === 0 &&
    hiddenBefore.length === 0
  ) {
    return {
      status: 'unchanged',
      sha,
      coverage: coverage(missingBefore, hiddenBefore, rowsBefore),
      note:
        `Verified, not assumed: all ${expected.size} skills the ${
          (bundledModuleSkills as any).modules.length - skippedModules.length
        } enabled module(s) require are present and exposed, and the instance carries this deploy's artifact. ` +
        'Pass {"force": true} to re-assert every definition field anyway.',
    };
  }

  // ── 4. Full avstämning ────────────────────────────────────────────────────
  const full = await readAllSkills(
    supabase,
    'name, description, category, handler, scope, instructions, enabled, mcp_exposed, tool_definition',
  );
  if (full.error) return { error: `Could not read agent_skills: ${full.error}` };
  const existing = new Map<string, any>(full.rows.map((r: any) => [r.name, r]));

  // Key-order-insensitive comparison, mirroring sync-skills.ts.
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as any)[k])]))
      : v;
  const norm = (v: unknown) => JSON.stringify(canon(v));

  const inserted: string[] = [];
  const updated: string[] = [];
  const failures: string[] = [];
  let unchanged = 0;

  // En trasig seed får inte lämna resten av lagret oskrivet: samla felet och gå
  // vidare. Den gamla varianten returnerade vid första felet, så en enda dålig
  // rad kunde lämna 250 skills oseedade — och rapportera det som ett fel om EN.
  for (const [name, seed] of expected) {
    const row = existing.get(name);
    if (!row) {
      const { error } = await supabase.from('agent_skills').insert({
        name: seed.name,
        description: seed.description,
        category: seed.category,
        handler: seed.handler,
        scope: seed.scope,
        tool_definition: seed.tool_definition,
        instructions: seed.instructions ?? null,
        enabled: true,
        mcp_exposed: true,
        origin: 'bundled',
        trust_level: seed.trust_level ?? 'notify',
        requires_staging: seed.requires_staging ?? false,
      });
      if (error) { failures.push(`insert ${name}: ${error.message}`); continue; }
      inserted.push(name);
    } else {
      const drifted =
        (seed.description ?? '') !== (row.description ?? '') ||
        (seed.category ?? '') !== (row.category ?? '') ||
        (seed.handler ?? '') !== (row.handler ?? '') ||
        (seed.scope ?? '') !== (row.scope ?? '') ||
        (seed.instructions ?? null) !== (row.instructions ?? null) ||
        norm(seed.tool_definition) !== norm(row.tool_definition) ||
        row.enabled !== true || row.mcp_exposed !== true;
      if (!drifted) { unchanged++; continue; }
      const { error } = await supabase.from('agent_skills').update({
        enabled: true,
        mcp_exposed: true,
        description: seed.description,
        instructions: seed.instructions ?? null,
        tool_definition: seed.tool_definition,
        category: seed.category,
        handler: seed.handler,
        scope: seed.scope,
      }).eq('name', name);
      if (error) { failures.push(`update ${name}: ${error.message}`); continue; }
      updated.push(name);
    }
  }

  // ── 5. Läs tillbaka. Skrivarens egen räkning är inte bevis ────────────────
  const after = await readAllSkills(supabase, 'name, enabled, mcp_exposed');
  const presentAfter = new Map<string, any>(after.rows.map((r: any) => [r.name, r]));
  const missingAfter = after.error ? missingBefore : expectedNames.filter((n) => !presentAfter.has(n));
  const hiddenAfter = after.error ? hiddenBefore : expectedNames.filter((n) => {
    const r = presentAfter.get(n);
    return r && (r.enabled !== true || r.mcp_exposed !== true);
  });
  const rowsAfter = after.error ? null : after.rows.length;
  const rowDelta = rowsAfter === null ? null : rowsAfter - rowsBefore;

  const complete = !after.error && missingAfter.length === 0 && hiddenAfter.length === 0 && failures.length === 0;

  // Stämpeln är ett PÅSTÅENDE om att lagret är komplett. En halvkörning får
  // aldrig stämpla — det var precis så den här instansen låstes i "unchanged".
  if (complete) {
    await supabase
      .from('site_settings')
      .upsert({ key: 'skills_artifact_sha', value: sha }, { onConflict: 'key' });
  }

  // Motsägelsen som `inserted: 0` gömde: om tabellen inte växte lika mycket som
  // vi påstår att vi skrev, säg det rakt ut i stället för att låta siffran stå.
  const discrepancy =
    rowDelta !== null && rowDelta !== inserted.length
      ? `agent_skills grew by ${rowDelta} row(s) while ${inserted.length} insert(s) were reported — another writer ran concurrently, or an insert silently no-opped. Treat the read-back (missing_after) as the truth.`
      : undefined;

  return {
    status: complete ? 'synced' : 'incomplete',
    sha,
    stamped: complete,
    // Bevisbärande: vad som saknades, vad som skrevs, vad som står kvar.
    before: coverage(missingBefore, hiddenBefore, rowsBefore),
    wrote: {
      inserted: inserted.length,
      updated: updated.length,
      unchanged,
      failed: failures.length,
      inserted_names: inserted.slice(0, 40),
      updated_names: updated.slice(0, 40),
      failures: failures.slice(0, 20),
    },
    after: after.error
      ? { read_back_failed: after.error }
      : coverage(missingAfter, hiddenAfter, rowsAfter as number),
    agent_skills_row_delta: rowDelta,
    discrepancy,
    // Bakåtkompatibla toppnivåfält — äldre läsare (module-bootstrap-loggen,
    // äldre operatörsrunbooks) läser dessa namn.
    inserted: inserted.length,
    updated: updated.length,
    unchanged,
    modules_skipped_disabled: skippedModules.length,
    note: complete
      ? undefined
      : `Skill layer still incomplete: ${missingAfter.length} of ${expected.size} required skill(s) missing after the write` +
        (failures.length ? `, ${failures.length} write(s) failed` : '') +
        '. The artifact hash was NOT stamped, so the next call re-attempts instead of short-circuiting.',
  };
}

// reset_sandbox — the nightly destroy-and-rebuild for sandbox.flowwink.com.
//
// Sequence: sandbox_reset_wipe() (SQL, triple-gated, atomic) → tplInstall()
// with the instance's configured sandbox template. FlowPilot's soul and
// objectives are NOT seeded here on purpose — the flowpilot auto-bootstrap
// owns those and re-seeds its defaults on the next heartbeat/app load.
// The gate is checked here TOO (belt and braces with the SQL function): a
// non-sandbox instance answers with a refusal, never a wipe.
async function executeResetSandbox(supabase: any, args: Record<string, unknown>): Promise<unknown> {
  // ONE toggle owns the demo lifecycle (2026-08-12): demo_mode — the visible
  // System-settings switch — is the gate. sandbox_mode is honored as a legacy
  // alias until the old sandbox instance is retired; no UI writes it anymore.
  const { data: flags } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['demo_mode', 'sandbox_mode', 'sandbox_template', 'testbed_mode']);
  const byKey = new Map<string, unknown>((flags ?? []).map((r: any) => [r.key, r.value]));
  const enabled = (v: unknown) => v === true || (v as any)?.enabled === true;
  // testbed WINS over demo_mode/sandbox_mode, and is checked before them.
  // A testbed accumulates — its months of history are the whole reason it
  // exists — so there is no argument combination that resets one. The SQL
  // function refuses too (assert_not_testbed); this is the first line, so the
  // refusal is a clean skill result instead of a Postgres exception.
  if (enabled(byKey.get('testbed_mode'))) {
    return {
      error: 'reset_sandbox refused: this instance is a TESTBED (site_settings.testbed_mode is enabled). A testbed is never reset — testbed_mode deliberately overrides demo_mode and sandbox_mode, so setting either of those does not re-arm this. Remove testbed_mode from site_settings if the instance really is disposable.',
    };
  }
  if (!enabled(byKey.get('demo_mode')) && !enabled(byKey.get('sandbox_mode'))) {
    return {
      error: 'reset_sandbox refused: this instance is not a demo (site_settings.demo_mode is not enabled). Demo Mode in System settings is the one switch that makes an instance disposable.',
    };
  }

  const { data: wipe, error: wipeErr } = await supabase.rpc('sandbox_reset_wipe', {
    p_confirm: 'WIPE-SANDBOX',
  });
  if (wipeErr) return { error: `Sandbox wipe failed (nothing changed — the wipe is atomic): ${wipeErr.message}` };

  // Which template the rebuild restores lives in the toggle's own value
  // ({enabled, template_id}) — the answer travels with the question. The
  // legacy sandbox_template key and the platform default remain as fallbacks.
  const demoVal = byKey.get('demo_mode') as any;
  const legacyTpl = byKey.get('sandbox_template') as any;
  const templateId =
    (typeof demoVal === 'object' && demoVal?.template_id) ||
    (typeof legacyTpl === 'string' ? legacyTpl : legacyTpl?.id) ||
    'flowwink-platform';

  const install = await tplInstall(supabase, {
    template_id: templateId,
    publish: true,
    apply_settings: true,
  });
  const installFailed = (install as any)?.error;

  return {
    reset: 'complete',
    wipe,
    template: templateId,
    install: installFailed ? { error: installFailed } : install,
    note: installFailed
      ? 'Wipe succeeded but the template install reported an error — the sandbox is empty; re-run install_template.'
      : 'Sandbox rebuilt. FlowPilot objectives re-seed via auto-bootstrap on the next heartbeat.',
  };
}

/**
 * export_site_template — the live site, read back as a template.
 *
 * This used to serialize and stop: it handed back JSON, and whoever wanted to
 * keep it had to feed that JSON into manage_site_template by hand. That gap was
 * invisible until an agent actually built a site over MCP — having just authored
 * nine pages, saving them meant transcribing its own work back through a second
 * skill. So `save_as` closes the loop here rather than adding a second verb
 * somewhere else: three skill descriptions already point at this name for
 * "export the current site", and a surface with two words for one job grows two
 * half-working generations.
 *
 * Two other things changed, for the same reason the site sensor changed:
 *  - KB and products can be included. They were silently absent before, and a
 *    caller could not tell "this site has none" from "export does not carry them".
 *  - the response names what it skipped, and counts the image URLs that will
 *    still resolve to THIS instance after the template is installed elsewhere.
 *    A template whose pictures point home is a mirror, not a template.
 *
 * Validation is NOT reimplemented here. _site_template_structure_report is the
 * one the RPC enforces on write; calling it means the preview cannot disagree
 * with the refusal.
 */
async function tplExportSite(supabase: any, args: Record<string, unknown>): Promise<unknown> {
  const a = args as any;
  const saveAs = typeof a.save_as === 'string' ? a.save_as.trim() : '';
  const include: string[] = Array.isArray(a.include)
    ? a.include.map((x: unknown) => String(x).toLowerCase())
    : ['pages', 'blog'];
  // Default ON. A template is a design that travels; the origin instance's name,
  // contact details and agent prompts are not design. The failure mode of the
  // other default is a customer's chat widget greeting visitors with somebody
  // else's login — so keeping identity is the choice that must be made out loud.
  const stripIdentity = a.strip_identity !== false;

  const meta = {
    id: String(a.id || a.template_id || saveAs || 'site-export').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: String(a.name || saveAs || 'Site Export'),
    description: String(a.description || 'Template exported from the current site.'),
    category: String(a.category || 'enterprise'),
    icon: String(a.icon || 'Sparkles'),
    tagline: String(a.tagline || ''),
  };

  const skipped: Array<{ section: string; count: number; how: string }> = [];

  const { data: pages, error: pagesError } = await supabase
    .from('pages')
    .select('title, slug, content_json, meta_json, menu_order, show_in_menu, status')
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('menu_order');
  if (pagesError) return { error: `Failed to fetch pages: ${pagesError.message}` };

  // A draft is work in progress. Shipping it inside a template publishes it on
  // somebody else's instance — so it is excluded, and said out loud.
  const { count: draftCount } = await supabase
    .from('pages').select('id', { count: 'exact', head: true })
    .neq('status', 'published').is('deleted_at', null);
  if (draftCount) {
    skipped.push({
      section: 'draft pages', count: draftCount,
      how: 'Publish them first — a template seeds content, and an unpublished draft has not been approved for anyone to see.',
    });
  }

  const { data: settingsRows, error: settingsError } = await supabase
    .from('site_settings').select('key, value');
  if (settingsError) return { error: `Failed to fetch site settings: ${settingsError.message}` };
  const settings: Record<string, any> = {};
  for (const row of settingsRows ?? []) settings[row.key] = row.value;

  const wantBlog = include.includes('blog');
  const { data: blogPosts } = wantBlog
    ? await supabase
        .from('blog_posts')
        .select('title, slug, excerpt, featured_image, featured_image_alt, content_json, meta_json')
        .eq('status', 'published')
    : { data: [] as any[] };

  // ── Knowledge base (opt-in) ───────────────────────────────────────────────
  let kbCategories: any[] = [];
  if (include.includes('kb')) {
    const { data: cats } = await supabase
      .from('kb_categories').select('id, name, slug, description, icon, sort_order')
      .eq('is_active', true).order('sort_order');
    const { data: arts } = await supabase
      .from('kb_articles')
      .select('category_id, title, slug, question, answer_text, is_featured, include_in_chat, sort_order')
      .eq('is_published', true).order('sort_order');
    kbCategories = (cats ?? []).map((c: any) => ({
      name: c.name, slug: c.slug, description: c.description || undefined, icon: c.icon || undefined,
      articles: (arts ?? []).filter((x: any) => x.category_id === c.id).map((x: any) => ({
        title: x.title, slug: x.slug, question: x.question || '',
        answer_text: x.answer_text || '',
        is_featured: x.is_featured || undefined, include_in_chat: x.include_in_chat || undefined,
      })),
    }));
  } else {
    const { count } = await supabase
      .from('kb_articles').select('id', { count: 'exact', head: true }).eq('is_published', true);
    if (count) skipped.push({ section: 'KB articles', count, how: 'Add "kb" to include.' });
  }

  // ── Products (opt-in: commerce data is its own decision) ──────────────────
  let products: any[] | undefined;
  if (include.includes('products')) {
    const { data: rows } = await supabase
      .from('products').select('name, description, price_cents, currency, type, image_url')
      .eq('is_active', true).order('name');
    products = (rows ?? []).map((p: any) => ({
      name: p.name, description: p.description || '', price_cents: p.price_cents,
      currency: p.currency, type: p.type, image_url: p.image_url || undefined,
    }));
  } else {
    const { count } = await supabase
      .from('products').select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (count) skipped.push({ section: 'products', count, how: 'Add "products" to include.' });
  }

  const homepageSlug = settings.general?.homepageSlug || 'home';
  const templatePages = (pages ?? []).map((p: any) => ({
    title: p.title,
    slug: p.slug,
    isHomePage: p.slug === homepageSlug,
    blocks: p.content_json || [],
    meta: p.meta_json || {},
    menu_order: p.menu_order,
    showInMenu: p.show_in_menu,
  }));

  const template: Record<string, unknown> = {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    category: meta.category,
    icon: meta.icon,
    tagline: meta.tagline,
    aiChatPosition: 'bottom-right',
    pages: templatePages,
    blogPosts: (blogPosts ?? []).map((bp: any) => ({
      title: bp.title,
      slug: bp.slug,
      excerpt: bp.excerpt || '',
      featured_image: bp.featured_image || undefined,
      featured_image_alt: bp.featured_image_alt || undefined,
      content: bp.content_json || [],
    })),
    branding: settings.branding || {},
    chatSettings: settings.chat,
    headerSettings: settings.header,
    footerSettings: settings.footer,
    seoSettings: settings.seo,
    aeoSettings: settings.aeo,
    cookieBannerSettings: settings.cookie_banner,
    accountingLocale: settings.accounting_locale || undefined,
    siteSettings: { homepageSlug },
  };
  if (kbCategories.length) template.kbCategories = kbCategories;
  if (products) template.products = products;

  const enabledModules = Object.entries(settings.modules ?? {})
    .filter(([, cfg]: [string, any]) => cfg?.enabled)
    .map(([k]) => k);
  if (enabledModules.length) (template as any).requiredModules = enabledModules;

  // ── Assets: what will still point HERE after the template travels ─────────
  const assetHosts: Record<string, number> = {};
  for (const m of JSON.stringify(template).matchAll(/https?:\/\/([^"/\s]+)[^"\s]*\.(?:png|jpe?g|webp|gif|svg|avif)/gi)) {
    assetHosts[m[1]] = (assetHosts[m[1]] ?? 0) + 1;
  }
  const assetCount = Object.values(assetHosts).reduce((a, b) => a + b, 0);

  // ── Identity: what belongs to THIS instance must not travel ───────────────
  const policy = applyIdentityPolicy(template, stripIdentity);
  const body = policy.template;

  // ── Validation: the SAME function the write enforces ──────────────────────
  // A preview that validates differently from the refusal is worse than no
  // preview at all.
  let validation: any;
  const { data: report, error: reportError } = await supabase
    .rpc('_site_template_structure_report', { p_template: body });
  if (reportError || !report) {
    validation = {
      valid: false,
      errors: [`Could not validate: ${reportError?.message ?? 'no report returned'}`],
      warnings: [],
      note: 'Validation runs in the database (_site_template_structure_report) so the preview cannot disagree with the write.',
    };
  } else {
    validation = report;
  }

  // ── Save (only when asked) ────────────────────────────────────────────────
  let saved: any = null;
  if (saveAs) {
    const { data: existing } = await supabase
      .from('site_templates').select('id, template_json').ilike('name', saveAs).maybeSingle();

    // An update REPLACES the body. Re-exporting with a narrower `include` than
    // last time therefore drops sections the stored template had — caught live:
    // a re-save without include turned 12 products into 0. The write is still
    // correct (replace is what update means), but a caller who is not told has
    // no way to notice.
    const removed: Array<{ section: string; was: number }> = [];
    if (existing?.template_json) {
      const before = existing.template_json as Record<string, unknown>;
      for (const [key, label] of [['products', 'products'], ['kbCategories', 'KB categories'], ['blogPosts', 'blog posts']] as const) {
        const had = Array.isArray(before[key]) ? (before[key] as unknown[]).length : 0;
        const now = Array.isArray((body as any)[key]) ? ((body as any)[key] as unknown[]).length : 0;
        if (had > 0 && now === 0) removed.push({ section: label, was: had });
      }
    }
    const { data: writeResult, error: writeError } = await supabase.rpc('manage_site_template', {
      p_action: existing ? 'update' : 'create',
      p_template: existing ? String(existing.id) : null,
      p_name: saveAs,
      p_description: meta.description,
      p_category: meta.category,
      p_icon: meta.icon,
      p_tagline: meta.tagline,
      p_template_json: body,
    });
    if (writeError) {
      return {
        success: false,
        error: `Export succeeded but the save was refused: ${writeError.message}`,
        template: body, validation, identity: policy.identity,
        hint: 'A refused save means the structure report found errors — fix those and call again with the same save_as.',
      };
    }
    saved = {
      template_id: (writeResult as any)?.template_id ?? existing?.id ?? null,
      created: !existing,
      updated: !!existing,
      name: saveAs,
      removed_from_stored_template: removed.length ? removed : undefined,
      removal_note: removed.length
        ? 'An update REPLACES the stored body. These sections were in the saved template and are not in this export — re-run with a wider `include` if you meant to keep them.'
        : undefined,
    };
  }

  return {
    success: true,
    template: body,
    validation,
    identity: policy.identity,
    saved,
    stats: {
      pages: templatePages.length,
      blocks: templatePages.reduce((acc: number, p: any) => acc + (Array.isArray(p.blocks) ? p.blocks.length : 0), 0),
      blog_posts: (blogPosts ?? []).length,
      kb_categories: kbCategories.length,
      products: products?.length ?? 0,
      required_modules: enabledModules.length,
    },
    export_report: {
      included: include,
      homepage_slug: homepageSlug,
      skipped,
      assets: {
        absolute_image_urls: assetCount,
        hosts: Object.entries(assetHosts).map(([host, count]) => ({ host, count })),
        note: assetCount
          ? 'These URLs are absolute: installed on another instance they keep resolving to their current host, and break the day it goes away. Copy the files into the target instance\'s storage if the new site must stand alone.'
          : 'No absolute image URLs — nothing points outside the installed instance.',
      },
      note: saved
        ? 'Saved. install_template with this name reproduces the site on any instance.'
        : 'Nothing was written — this is a preview. Call again with save_as="<template name>" to store it.',
    },
  };
}

async function executeTemplatesAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'list_templates': {
      const { data: installed } = await supabase
        .from('installed_template')
        .select('template_id, template_name, installed_at')
        .order('installed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        success: true,
        catalog: tplCatalog(),
        installed: installed ?? null,
        note: 'Install via the install_template skill (staged — first call returns a pending-operation envelope) or the admin Template Gallery UI.',
      };
    }
    case 'export_site_template':
      return await tplExportSite(supabase, args);
    case 'install_template':
      return await tplInstall(supabase, args);
    default:
      return { error: `Unknown templates skill: ${skillName}` };
  }
}


// =============================================================================
// Timesheets module handler
// =============================================================================

async function executeTimesheetsAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'log_time': {
      const a = args as any;
      const ALLOWED_ACTIONS = ['create', 'list', 'delete'];

      // STRICT: action must be explicit. No auto-inference — agents must declare intent.
      if (!a.action || typeof a.action !== 'string') {
        return {
          error: `action required and must be one of: ${ALLOWED_ACTIONS.join(', ')}. Write operations MUST pass action="create" explicitly.`,
          status: 'failed',
          received: { action: a.action ?? null },
        };
      }
      const action = a.action;
      if (!ALLOWED_ACTIONS.includes(action)) {
        return {
          error: `Invalid action "${action}". Allowed: ${ALLOWED_ACTIONS.join(', ')}.`,
          status: 'failed',
        };
      }

      const project_id = a.project_id;
      const project_name = a.project_name || a.project;
      const entry_date = a.entry_date || a.date;
      const hasHoursField = a.hours !== undefined && a.hours !== null && a.hours !== '';
      const hours = hasHoursField ? Number(a.hours) : undefined;
      const description = a.description || a.note || a.notes || null;
      const is_billable = a.is_billable;
      const user_id = a.user_id;
      const entry_id = a.entry_id || a.id;
      const week_offset = a.week_offset ?? 0;
      const _caller_user_id = a._caller_user_id;

      if (action === 'create') {
        // Hard validation — fail loudly, no silent no-ops, no defaults for required fields.
        const missing: string[] = [];
        const invalid: Array<{ field: string; reason: string; got: unknown }> = [];

        if (!hasHoursField) {
          missing.push('hours');
        } else if (typeof hours !== 'number' || isNaN(hours)) {
          invalid.push({ field: 'hours', reason: 'must be a number', got: a.hours });
        } else if (hours <= 0) {
          invalid.push({ field: 'hours', reason: 'must be > 0', got: a.hours });
        } else if (hours > 24) {
          invalid.push({ field: 'hours', reason: 'must be <= 24 (single day entry)', got: a.hours });
        }

        if (!project_id && !project_name) {
          missing.push('project_id or project_name');
        } else if (project_id && typeof project_id !== 'string') {
          invalid.push({ field: 'project_id', reason: 'must be a string (uuid)', got: project_id });
        } else if (project_name && typeof project_name !== 'string') {
          invalid.push({ field: 'project_name', reason: 'must be a string', got: project_name });
        }

        if (entry_date && !/^\d{4}-\d{2}-\d{2}$/.test(String(entry_date))) {
          invalid.push({ field: 'entry_date', reason: 'must be YYYY-MM-DD', got: entry_date });
        }

        if (missing.length || invalid.length) {
          return {
            error: 'log_time validation failed',
            status: 'failed',
            missing_fields: missing,
            invalid_fields: invalid,
            hint: 'log_time create requires: action="create", hours (>0, <=24), and project_id OR project_name.',
          };
        }

        let resolvedProjectId = project_id;
        if (!resolvedProjectId && project_name) {
          const { data: proj, error: projErr } = await supabase
            .from('projects')
            .select('id, name')
            .ilike('name', `%${project_name}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();
          if (projErr) return { error: `Project lookup failed: ${projErr.message}`, status: 'failed' };
          if (!proj) return { error: `No active project matching "${project_name}"`, status: 'failed' };
          resolvedProjectId = proj.id;
        }

        const resolvedUserId = user_id
          || _caller_user_id
          || (await supabase.auth.getUser()).data?.user?.id;
        if (!resolvedUserId) {
          return { error: 'user_id required (pass user_id explicitly, or _caller_user_id from MCP context)', status: 'failed' };
        }

        const { data, error } = await supabase.from('time_entries').insert([{
          user_id: resolvedUserId,
          project_id: resolvedProjectId,
          entry_date: entry_date || new Date().toISOString().slice(0, 10),
          hours,
          description,
          is_billable: is_billable ?? true,
        }]).select('*, projects(name)').single();
        if (error) return { error: `Insert failed: ${error.message}`, status: 'failed' };
        return {
          success: true,
          entry: data,
          message: `Logged ${hours}h on ${data.projects?.name || 'project'} (${data.entry_date})`,
        };
      }

      if (action === 'delete') {
        if (!entry_id) return { error: 'entry_id required', status: 'failed' };
        const { error } = await supabase.from('time_entries').delete().eq('id', entry_id).eq('is_invoiced', false);
        if (error) return { error: error.message, status: 'failed' };
        return { success: true };
      }

      // list (default)
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (week_offset as number) * 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const ws = monday.toISOString().slice(0, 10);
      const we = sunday.toISOString().slice(0, 10);

      let query = supabase.from('time_entries').select('*, projects(name, color, client_name)').gte('entry_date', ws).lte('entry_date', we).order('entry_date');
      if (user_id) query = query.eq('user_id', user_id);
      if (project_id) query = query.eq('project_id', project_id);
      const { data, error } = await query;
      if (error) return { error: error.message, status: 'failed' };
      const total = (data || []).reduce((s: number, e: any) => s + Number(e.hours), 0);
      return { entries: data, total_hours: total, period: `${ws} to ${we}` };
    }

    case 'manage_projects': {
      const { action = 'list', project_id, name, client_name, description, color, hourly_rate_cents, currency, is_billable } = args as any;

      if (action === 'create') {
        const { data, error } = await supabase.from('projects').insert([{
          name: name || 'New Project',
          client_name: client_name || null,
          description: description || null,
          color: color || '#6366f1',
          hourly_rate_cents: hourly_rate_cents || 0,
          currency: currency || 'SEK',
          is_billable: is_billable ?? true,
        }]).select().single();
        if (error) return { error: error.message };
        return { success: true, project: data };
      }

      if (action === 'update' || action === 'deactivate') {
        if (!project_id) return { error: 'project_id required' };
        const updates: any = {};
        if (name) updates.name = name;
        if (client_name !== undefined) updates.client_name = client_name;
        if (description !== undefined) updates.description = description;
        if (color) updates.color = color;
        if (hourly_rate_cents !== undefined) updates.hourly_rate_cents = hourly_rate_cents;
        if (currency) updates.currency = currency;
        if (is_billable !== undefined) updates.is_billable = is_billable;
        if (action === 'deactivate') updates.is_active = false;
        const { error } = await supabase.from('projects').update(updates).eq('id', project_id);
        if (error) return { error: error.message };
        return { success: true };
      }

      // list
      const { data, error } = await supabase.from('projects').select('*').eq('is_active', true).order('name');
      if (error) return { error: error.message };
      return { projects: data };
    }

    case 'timesheet_summary': {
      const a = args as any;
      // Accept aliases — agents commonly send from_date/to_date or start/end
      const explicitStart = a.start_date || a.from_date || a.from || a.start;
      const explicitEnd = a.end_date || a.to_date || a.to || a.end;
      // If explicit dates passed, force custom mode regardless of period arg
      const period = (explicitStart || explicitEnd) ? 'custom' : (a.period || 'this_week');
      const project_id = a.project_id;
      const user_id = a.user_id;
      const billable_only = a.billable_only;
      const include_revenue = a.include_revenue;

      let ws: string, we: string;
      const now = new Date();

      switch (period) {
        case 'this_week': {
          const day = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          ws = monday.toISOString().slice(0, 10);
          we = sunday.toISOString().slice(0, 10);
          break;
        }
        case 'last_week': {
          const day = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          ws = monday.toISOString().slice(0, 10);
          we = sunday.toISOString().slice(0, 10);
          break;
        }
        case 'this_month': {
          ws = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
          we = now.toISOString().slice(0, 10);
          break;
        }
        case 'last_month': {
          const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
          ws = lastMonth.toISOString().slice(0, 10);
          we = lastDay.toISOString().slice(0, 10);
          break;
        }
        case 'custom':
        default: {
          if (!explicitStart || !explicitEnd) {
            return {
              error: 'custom period requires start_date and end_date (or aliases from_date/to_date). Got: ' +
                JSON.stringify({ start: explicitStart, end: explicitEnd }),
              status: 'failed',
            };
          }
          ws = explicitStart;
          we = explicitEnd;
        }
      }

      let query = supabase.from('time_entries').select('*, projects(name, hourly_rate_cents, currency)').gte('entry_date', ws).lte('entry_date', we);
      if (project_id) query = query.eq('project_id', project_id);
      if (user_id) query = query.eq('user_id', user_id);
      if (billable_only) query = query.eq('is_billable', true);
      const { data: entries, error } = await query;
      if (error) return { error: error.message, status: 'failed' };

      // Group by project
      const byProject = new Map<string, { project_id: string; name: string; hours: number; billable_hours: number; revenue_cents: number; currency: string }>();
      for (const e of entries || []) {
        const key = e.project_id;
        const existing = byProject.get(key) || { project_id: key, name: e.projects?.name || 'Unknown', hours: 0, billable_hours: 0, revenue_cents: 0, currency: e.projects?.currency || 'SEK' };
        existing.hours += Number(e.hours);
        if (e.is_billable) {
          existing.billable_hours += Number(e.hours);
          if (include_revenue && e.projects?.hourly_rate_cents) {
            existing.revenue_cents += Number(e.hours) * e.projects.hourly_rate_cents;
          }
        }
        byProject.set(key, existing);
      }

      const totalHours = (entries || []).reduce((s: number, e: any) => s + Number(e.hours), 0);
      const totalBillable = (entries || []).filter((e: any) => e.is_billable).reduce((s: number, e: any) => s + Number(e.hours), 0);

      return {
        period: `${ws} to ${we}`,
        total_hours: totalHours,
        billable_hours: totalBillable,
        by_project: Array.from(byProject.values()),
        entry_count: (entries || []).length,
      };
    }

    default:
      return { error: `Unknown timesheets skill: ${skillName}` };
  }
}


async function executeHandbookAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { query, slug, limit = 5 } = args as any;

  if (slug) {
    // Fetch specific chapter by slug
    const { data, error } = await supabase
      .from('handbook_chapters')
      .select('title, slug, content, sort_order, frontmatter')
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { error: `Chapter "${slug}" not found` };
    return { chapter: data };
  }

  if (query) {
    // Search across chapters
    const q = `%${sanitizeOrTerm(query)}%`;
    const { data, error } = await supabase
      .from('handbook_chapters')
      .select('title, slug, content, sort_order')
      .or(`title.ilike.${q},content.ilike.${q}`)
      .order('sort_order', { ascending: true })
      .limit(Number(limit));
    if (error) throw new Error(error.message);

    // Trim content to relevant snippet
    const results = (data || []).map((ch: any) => {
      const idx = ch.content.toLowerCase().indexOf(query.toLowerCase());
      const start = Math.max(0, idx - 200);
      const end = Math.min(ch.content.length, idx + 500);
      return {
        title: ch.title,
        slug: ch.slug,
        snippet: ch.content.slice(start, end),
      };
    });
    return { results, total: results.length };
  }

  // List all chapters (TOC)
  const { data, error } = await supabase
    .from('handbook_chapters')
    .select('title, slug, sort_order, frontmatter')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return { chapters: data };
}

// =============================================================================
// OpenClaw Beta Tester module handlers
// =============================================================================

/**
 * Resolve the trustworthy attribution slug for a reported finding.
 *
 * Self-reported attribution (`reported_by` arg) is forgeable — a caller could
 * claim any peer's name. So the AUTHENTICATED identity (the MCP api_key behind
 * the call) is the source of truth: the claimed slug is honored only when it is
 * corroborated by the key's own name, otherwise the key's identity wins. With
 * no key context (internal service-role call) the arg is trusted as-is.
 *
 * Keeps the historical short-slug convention (reported_by='openclaw'/'claude')
 * rather than the verbose key name, but only when the key actually is that peer.
 */
function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(mcp\)/g, ' ')
    .replace(/mcp key for peer/g, ' ')  // federation-invite key-name template
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'peer';
}

async function resolveReportedBy(
  supabase: any,
  args: Record<string, unknown>,
): Promise<string | null> {
  const claimed = typeof args.reported_by === 'string' ? args.reported_by.trim().toLowerCase() : '';
  const keyId = (args as any)._caller_api_key_id as string | undefined;

  // No authenticated key (internal service-role call) → trust the arg.
  if (!keyId) return claimed || null;

  const { data: key } = await supabase.from('api_keys').select('name').eq('id', keyId).maybeSingle();
  let authName: string = key?.name || '';
  if (!authName) {
    const { data: peer } = await supabase.from('a2a_peers').select('name').eq('api_key_id', keyId).maybeSingle();
    authName = peer?.name || '';
  }
  // Key context exists but is unnameable → still prefer a claimed slug over null.
  if (!authName) return claimed || null;

  const authLower = authName.toLowerCase();
  // Honor the clean claimed slug ONLY if the authenticated key corroborates it.
  if (claimed && authLower.includes(claimed)) return claimed;
  // Otherwise the authenticated identity wins (rejects impersonation).
  return slugifyAgentName(authName);
}

async function executeOpenClawAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'start_qa_session': {
      const { scenario, peer_name = 'agent', metadata = {} } = args as any;
      if (!scenario) return { error: 'scenario is required' };

      const { data, error } = await supabase
        .from('beta_test_sessions')
        .insert({ scenario, peer_name, metadata, status: 'running' })
        .select('id, scenario, status, started_at')
        .single();
      if (error) throw new Error(`Session start failed: ${error.message}`);
      return { success: true, session: data };
    }

    case 'end_qa_session': {
      const { session_id, summary, status = 'completed' } = args as any;
      if (!session_id) return { error: 'session_id is required' };

      const { data: session } = await supabase
        .from('beta_test_sessions')
        .select('started_at')
        .eq('id', session_id)
        .single();

      const durationMs = session
        ? Date.now() - new Date(session.started_at).getTime()
        : null;

      const { error } = await supabase
        .from('beta_test_sessions')
        .update({ status, summary, completed_at: new Date().toISOString(), duration_ms: durationMs })
        .eq('id', session_id);
      if (error) throw new Error(`Session end failed: ${error.message}`);
      return { success: true, session_id, duration_ms: durationMs };
    }

    case 'report_finding': {
      const { session_id, type, severity = 'medium', title, description, context = {}, screenshot_url, auto_objective = true } = args as any;
      const normalizedType = typeof type === 'string'
        ? ({ observation: 'suggestion', seo: 'suggestion', seo_audit: 'suggestion' } as Record<string, string>)[type.trim()] ?? type.trim()
        : '';
      const validFindingTypes = ['bug', 'ux_issue', 'suggestion', 'positive', 'performance', 'missing_feature'];

      if (!normalizedType || !title) return { error: 'type and title are required' };
      if (!validFindingTypes.includes(normalizedType)) {
        return { error: `invalid finding type "${normalizedType}". Allowed: ${validFindingTypes.join(', ')}` };
      }

      // Save finding (session_id now optional for MCP-driven reports).
      // reported_by is the audit-trail attribution. It is DERIVED from the
      // authenticated api_key (not trusted from the arg) so a peer can't
      // impersonate another — see resolveReportedBy. This closes the gap where
      // gateway-filed findings landed reported_by=NULL and broke the collab
      // loop's `WHERE reported_by='<peer>'` grouping.
      const reportedBy = await resolveReportedBy(supabase, args as any);
      const { data, error } = await supabase
        .from('beta_test_findings')
        .insert({ session_id: session_id || null, type: normalizedType, severity, title, description, context, screenshot_url, reported_by: reportedBy })
        .select('id, type, severity, title, reported_by')
        .single();
      if (error) throw new Error(`Finding report failed: ${error.message}`);

      // Auto-create objective for high/critical findings
      let objective = null;
      if (auto_objective && (severity === 'high' || severity === 'critical')) {
        const goalPrefix = normalizedType === 'bug'
          ? 'Fix'
          : normalizedType === 'ux_issue'
            ? 'Improve UX'
            : normalizedType === 'missing_feature'
              ? 'Add'
              : normalizedType === 'performance'
                ? 'Optimize'
                : 'Address';
        const { data: obj, error: objErr } = await supabase
          .from('agent_objectives')
          .insert({
            goal: `${goalPrefix}: ${title}`,
            status: 'active',
            constraints: { source: 'openclaw_report_finding', finding_id: data.id, severity, type: normalizedType, created_by: 'peer_report' },
            success_criteria: { description_met: description || title },
          })
          .select('id, goal')
          .single();
        if (objErr) throw new Error(`objective insert failed: ${objErr.message}`);
        objective = obj;
      }

      return { success: true, finding: data, normalized_type: normalizedType, objective };
    }

    case 'openclaw_exchange': {
      const { session_id, direction = 'openclaw_to_flowpilot', message_type = 'observation', content, payload = {} } = args as any;
      if (!content) return { error: 'content is required' };

      // Save to local exchange log
      const { data, error } = await supabase
        .from('beta_test_exchanges')
        .insert({ session_id: session_id || null, direction, message_type, content, payload })
        .select('id, direction, message_type, created_at')
        .single();
      if (error) throw new Error(`Exchange failed: ${error.message}`);

      // Actually send to ClawOne via A2A when direction is outbound
      let peerResponse: any = null;
      if (direction === 'flowpilot_to_openclaw') {
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const outboundRes = await fetch(`${supabaseUrl}/functions/v1/a2a/outbound`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              peer_name: 'Clawone',
              skill: 'message',
              message: `[${message_type}] ${content}`,
            }),
          });
          const outboundData = await outboundRes.json();
          peerResponse = outboundData;

          // Extract text from A2A response
          let responseText = '';
          if (outboundData?.result?.status?.message?.parts) {
            responseText = outboundData.result.status.message.parts.map((p: any) => p.text).filter(Boolean).join('\n');
          } else if (outboundData?.result?.artifacts) {
            responseText = outboundData.result.artifacts.flatMap((a: any) => a.parts || []).map((p: any) => p.text).filter(Boolean).join('\n');
          } else if (outboundData?.error?.message) {
            responseText = `⚠️ ${outboundData.error.message}`;
          }

          // Log ClawOne's reply back as an inbound exchange
          if (responseText) {
            await supabase.from('beta_test_exchanges').insert({
              session_id: session_id || null,
              direction: 'openclaw_to_flowpilot',
              message_type: 'acknowledgment',
              content: responseText,
              payload: { raw_response: outboundData },
            });
          }
        } catch (fetchErr: any) {
          console.error('[openclaw_exchange] A2A outbound call failed:', fetchErr.message);
          peerResponse = { error: fetchErr.message };
        }
      }

      return { success: true, exchange: data, peer_response: peerResponse };
    }

    case 'openclaw_get_status': {
      // Return sessions, findings, exchanges, pending tests, AND site context
      const [sessionsRes, findingsRes, exchangesRes, pendingTestsRes, siteMemory] = await Promise.all([
        supabase.from('beta_test_sessions').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('beta_test_findings').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('beta_test_exchanges').select('*').order('created_at', { ascending: false }).limit(30),
        supabase.from('beta_test_exchanges')
          .select('*')
          .eq('direction', 'flowpilot_to_openclaw')
          .eq('message_type', 'test_request')
          .is('payload->acknowledged_at', null)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('agent_memory').select('value').eq('key', 'identity').single(),
      ]);

      // The QA agent tests THIS instance. This was the literal
      // 'https://demo.flowwink.com' — one instance named for the whole fleet,
      // and since that project was deleted (d5b867f) a host that does not
      // resolve, handed over with an instruction to trust it. Resolved the way
      // the invoice and portal paths in this file already resolve it: env
      // first, then site_settings.general. Omitted when unknown — an agent
      // without an address can say so; an agent with the wrong one reports the
      // site is down.
      const siteUrl = await resolveSiteUrl(supabase);

      return {
        site: {
          ...(siteUrl ? { url: siteUrl } : {}),
          name: 'FlowWink',
          description: siteUrl
            ? 'Autonomous Agentic CMS — test this URL, not any template/example domains'
            : 'Autonomous Agentic CMS — no public site URL is configured on this instance; do not guess one, and say so if a test needs it',
        },
        sessions: sessionsRes.data || [],
        findings: findingsRes.data || [],
        exchanges: exchangesRes.data || [],
        pending_test_requests: pendingTestsRes.data || [],
      };
    }

    case 'scan_beta_findings': {
      // FlowPilot heartbeat skill: scan unresolved findings and return summary
      const { data: unresolvedFindings } = await supabase
        .from('beta_test_findings')
        .select('id, type, severity, title, description, session_id, created_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!unresolvedFindings?.length) {
        return { success: true, summary: 'No unresolved findings.', findings: [], counts: {} };
      }

      const counts: Record<string, number> = {};
      for (const f of unresolvedFindings) {
        counts[f.severity] = (counts[f.severity] || 0) + 1;
      }

      return {
        success: true,
        summary: `${unresolvedFindings.length} unresolved findings: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}`,
        findings: unresolvedFindings,
        counts,
        recommendation: counts['critical'] ? 'Create objective immediately for critical findings' :
          counts['high'] ? 'Consider creating objective for high-severity findings' :
          'Monitor — no urgent action needed',
      };
    }

    case 'queue_beta_test': {
      // FlowPilot queues a test scenario for OpenClaw to pick up
      const { scenario, instructions, priority = 'normal' } = args as any;
      if (!scenario) return { error: 'scenario is required' };

      const { data, error } = await supabase
        .from('beta_test_exchanges')
        .insert({
          direction: 'flowpilot_to_openclaw',
          message_type: 'action_request', // must match beta_test_exchanges_message_type_check
          content: scenario,
          payload: { instructions, priority, scenario_kind: 'test_request', acknowledged_at: null },
        })
        .select('id, created_at')
        .single();
      if (error) throw new Error(`Queue test failed: ${error.message}`);
      return { success: true, test_request_id: data.id, scenario };
    }

    case 'resolve_finding': {
      // Mark a finding as resolved
      const { finding_id, resolution_note } = args as any;
      if (!finding_id) return { error: 'finding_id is required' };

      const { error } = await supabase
        .from('beta_test_findings')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', finding_id);
      if (error) throw new Error(`Resolve failed: ${error.message}`);

      // Log resolution as exchange
      if (resolution_note) {
        await supabase.from('beta_test_exchanges').insert({
          direction: 'flowpilot_to_openclaw',
          message_type: 'resolution',
          content: resolution_note,
          payload: { finding_id },
        });
      }
      return { success: true, finding_id, resolved: true };
    }

    case 'place_order': {
      // MCP skill: external agent (ClawTwo) places an order as a customer
      return await placeOrderShared(supabase, args as any, 'mcp_place_order');
    }


    case 'confirm_fulfillment': {
      // MCP skill: external agent (ClawThree/supplier) confirms delivery of an order or PO
      const { order_id, purchase_order_id, tracking_number, tracking_url, notes: fulfillNotes } = args as any;

      if (order_id) {
        const { data: existing } = await supabase.from('orders').select('id, status, fulfillment_status').eq('id', order_id).single();
        if (!existing) return { error: `Order ${order_id} not found` };

        const { error } = await supabase.from('orders').update({
          fulfillment_status: 'delivered',
          status: existing.status === 'pending' ? 'paid' : existing.status,
          tracking_number: tracking_number || null,
          tracking_url: tracking_url || null,
          fulfillment_notes: fulfillNotes || null,
          updated_at: new Date().toISOString(),
        }).eq('id', order_id);
        if (error) throw new Error(`Fulfillment update failed: ${error.message}`);

        return {
          success: true,
          entity: 'order',
          entity_id: order_id,
          fulfillment_status: 'delivered',
          message: `Order ${order_id} marked as delivered`,
        };
      }

      if (purchase_order_id) {
        const { data: po } = await supabase.from('purchase_orders').select('id, status, po_number').eq('id', purchase_order_id).single();
        if (!po) return { error: `Purchase order ${purchase_order_id} not found` };

        const { error } = await supabase.from('purchase_orders').update({
          status: 'received',
          updated_at: new Date().toISOString(),
        }).eq('id', purchase_order_id);
        if (error) throw new Error(`PO fulfillment update failed: ${error.message}`);

        return {
          success: true,
          entity: 'purchase_order',
          entity_id: purchase_order_id,
          po_number: po.po_number,
          status: 'received',
          message: `PO ${po.po_number} marked as received`,
        };
      }

      return { error: 'Either order_id or purchase_order_id is required' };
    }

    default:
      return { error: `Unknown openclaw skill: ${skillName}` };
  }
}

// =============================================================================
// Consultants module handlers
// =============================================================================

async function executeConsultantsAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'manage_consultant_profile': {
      const { action = 'create', profile_id, ...profileData } = args as any;

      if (action === 'list') {
        const { data, error } = await supabase.from('consultant_profiles')
          .select('id, name, title, skills, experience_years, is_active, availability')
          .order('created_at', { ascending: false }).limit(50);
        if (error) throw new Error(`List failed: ${error.message}`);
        return { profiles: data || [] };
      }

      if (action === 'create') {
        const { name, title, skills = [], bio, experience_years, experience_json, education, certifications, languages, email, phone, hourly_rate_cents, currency, summary } = profileData;
        if (!name) throw new Error('name is required');
        const { data, error } = await supabase.from('consultant_profiles').insert({
          name, title, skills, bio, experience_years, experience_json, education, certifications, languages, email, phone, hourly_rate_cents, currency, summary, is_active: true,
        }).select('id, name, title').single();
        if (error) throw new Error(`Create failed: ${error.message}`);
        return { profile_id: data.id, name: data.name, status: 'created' };
      }

      if (action === 'update' && profile_id) {
        delete profileData.action;
        const { data, error } = await supabase.from('consultant_profiles')
          .update(profileData).eq('id', profile_id).select('id, name').single();
        if (error) throw new Error(`Update failed: ${error.message}`);
        return { profile_id: data.id, status: 'updated' };
      }

      if (action === 'delete' && profile_id) {
        const { error } = await supabase.from('consultant_profiles')
          .delete().eq('id', profile_id);
        if (error) throw new Error(`Delete failed: ${error.message}`);
        return { profile_id, status: 'deleted' };
      }

      if (action === 'find_duplicates') {
        const { data: all, error } = await supabase.from('consultant_profiles')
          .select('id, name, email, title, skills')
          .order('created_at', { ascending: true });
        if (error) throw new Error(`List failed: ${error.message}`);
        const profiles = all || [];
        const duplicates: Array<{ ids: string[]; name: string; reason: string }> = [];
        const seen = new Map<string, any>();
        for (const p of profiles) {
          const key = p.name?.toLowerCase().trim();
          if (key && seen.has(key)) {
            duplicates.push({ ids: [seen.get(key).id, p.id], name: p.name, reason: 'Same name' });
          } else if (key) {
            seen.set(key, p);
          }
          if (p.email) {
            const emailKey = p.email.toLowerCase();
            if (seen.has(`email:${emailKey}`)) {
              duplicates.push({ ids: [seen.get(`email:${emailKey}`).id, p.id], name: p.name, reason: 'Same email' });
            } else {
              seen.set(`email:${emailKey}`, p);
            }
          }
        }
        return { total_profiles: profiles.length, duplicates, duplicate_count: duplicates.length };
      }

      return { error: `Unknown consultant action: ${action}` };
    }

    case 'match_consultant': {
      const { job_description, max_results = 3 } = args as any;
      if (!job_description) throw new Error('job_description is required');
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const response = await fetch(`${supabaseUrl}/functions/v1/consultant-match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ job_description, max_results }),
      });
      return await response.json();
    }

    case 'consultant_checkin_update': {
      // A consultant updates their own profile during a check-in interview.
      const { profile_id } = args as any;
      if (!profile_id) throw new Error('profile_id is required');
      const patch: Record<string, unknown> = {};
      for (const f of ['bio', 'summary', 'skills', 'availability', 'experience_years', 'experience_json'] as const) {
        if ((args as any)[f] !== undefined) patch[f] = (args as any)[f];
      }
      if (Object.keys(patch).length === 0) {
        throw new Error('nothing to update — provide at least one of: bio, summary, skills, availability, experience_years, experience_json');
      }
      const { data, error } = await supabase.from('consultant_profiles')
        .update(patch).eq('id', profile_id).select('id, name').maybeSingle();
      if (error) throw new Error(`Check-in update failed: ${error.message}`);
      if (!data) return { error: `No consultant profile found for id ${profile_id}`, status: 'failed' };
      return { profile_id: data.id, name: data.name, status: 'updated', updated_fields: Object.keys(patch) };
    }

    default:
      return { error: `Unknown consultant skill: ${skillName}` };
  }
}

// =============================================================================
// Approvals module — generic approval workflow engine over approval_requests
// + approval_rules. Handler for manage_approvals (module:approvals).
// =============================================================================

async function executeApprovalsAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const a = args as any;
  const action = String(a.action || 'list_pending');

  if (action === 'evaluate_rule') {
    if (!a.entity_type) throw new Error('entity_type is required');
    const amt = Number(a.amount_cents ?? 0);
    const { data: rules, error } = await supabase.from('approval_rules')
      .select('*').eq('entity_type', a.entity_type).eq('is_active', true)
      .order('priority', { ascending: false });
    if (error) throw new Error(`evaluate_rule failed: ${error.message}`);
    const match = (rules || []).find((r: any) => r.amount_threshold_cents == null || amt >= Number(r.amount_threshold_cents));
    return match
      ? { needs_approval: true, rule_id: match.id, rule_name: match.name, required_role: match.required_role, threshold_cents: match.amount_threshold_cents }
      : { needs_approval: false };
  }

  if (action === 'request') {
    const { entity_type, entity_id, amount_cents, currency = 'SEK', reason, required_role = 'admin', context, rule_id } = a;
    if (!entity_type || !entity_id) throw new Error('entity_type and entity_id are required');
    // Who asked is half the approval record. It was never written, which is
    // also why self-approval could not be detected downstream.
    const requestedBy = typeof a._caller_user_id === 'string' ? a._caller_user_id : null;
    const { data, error } = await supabase.from('approval_requests').insert({
      entity_type, entity_id,
      amount_cents: amount_cents != null ? Number(amount_cents) : null,
      currency, reason: reason ?? null, required_role, context: context ?? {}, rule_id: rule_id ?? null,
      requested_by: requestedBy,
      status: 'pending',
    }).select('id, entity_type, entity_id, status, required_role, requested_by').single();
    if (error) throw new Error(`request failed: ${error.message}`);
    return { request_id: data.id, status: data.status, required_role: data.required_role, requested_by: data.requested_by };
  }

  if (action === 'list_pending') {
    const { data, error } = await supabase.from('approval_requests')
      .select('id, entity_type, entity_id, amount_cents, currency, reason, required_role, created_at')
      .eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
    if (error) throw new Error(`list_pending failed: ${error.message}`);
    return { pending: data || [] };
  }

  if (action === 'list_for_entity') {
    if (!a.entity_type || !a.entity_id) throw new Error('entity_type and entity_id are required');
    const { data, error } = await supabase.from('approval_requests')
      .select('*').eq('entity_type', a.entity_type).eq('entity_id', a.entity_id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(`list_for_entity failed: ${error.message}`);
    return { requests: data || [] };
  }

  if (action === 'approve' || action === 'reject' || action === 'cancel') {
    if (!a.request_id) throw new Error('request_id is required');
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled';
    const callerUserId = typeof a._caller_user_id === 'string' ? a._caller_user_id : null;

    // The row carries the whole policy: which role may decide, and who asked.
    // Both were written to the table and then never read — the gate rendered in
    // /admin/approvals was decoration over an update anyone could issue.
    const { data: reqRow, error: reqErr } = await supabase.from('approval_requests')
      .select('id, status, required_role, requested_by, entity_type, entity_id')
      .eq('id', a.request_id).maybeSingle();
    if (reqErr) throw new Error(`${action} failed: ${reqErr.message}`);
    if (!reqRow) return { error: `Request ${a.request_id} not found`, status: 'failed' };
    if (reqRow.status !== 'pending') {
      return { error: `Request ${a.request_id} is no longer pending (status ${reqRow.status})`, status: 'failed' };
    }

    if (action !== 'cancel') {
      if (callerUserId) {
        // Nobody signs off their own request. This is the whole point of an
        // approval step; without it the workflow is a two-click self-serve.
        if (reqRow.requested_by && reqRow.requested_by === callerUserId) {
          return {
            error: 'self-approval is not allowed — another approver must review this request',
            request_id: reqRow.id,
            required_role: reqRow.required_role,
            status: 'failed',
          };
        }

        const { data: roleRows, error: roleErr } = await supabase.from('user_roles')
          .select('role').eq('user_id', callerUserId);
        if (roleErr) throw new Error(`${action} failed: could not read caller roles: ${roleErr.message}`);
        const callerRoles = (roleRows ?? []).map((r: any) => String(r.role));
        // Admin is the platform's superuser role and may decide anything;
        // otherwise the caller must hold exactly the role the request demands.
        if (!callerRoles.includes(reqRow.required_role) && !callerRoles.includes('admin')) {
          return {
            error: `This request requires the '${reqRow.required_role}' role to ${action}. Caller holds: ${callerRoles.length ? callerRoles.join(', ') : 'no roles'}.`,
            request_id: reqRow.id,
            required_role: reqRow.required_role,
            status: 'failed',
          };
        }
      } else {
        // Service-key call with no caller identity (FlowPilot autonomy, gateway
        // peers). Deliberately still allowed — an autonomous operator has no
        // user_roles row to hold — but it is recorded rather than invisible.
        console.log(`[agent-execute] approvals ${action} without caller identity: request=${reqRow.id} entity=${reqRow.entity_type}:${reqRow.entity_id} required_role=${reqRow.required_role} (service-role decision, resolved_by null)`);
      }
    }

    const { data, error } = await supabase.from('approval_requests')
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: callerUserId })
      .eq('id', a.request_id).eq('status', 'pending')
      .select('id, status, resolved_by').maybeSingle();
    if (error) throw new Error(`${action} failed: ${error.message}`);
    if (!data) return { error: `Request ${a.request_id} not found or no longer pending`, status: 'failed' };
    return { request_id: data.id, status: data.status, resolved_by: data.resolved_by };
  }

  if (action === 'create_rule') {
    const { name, description, entity_type, amount_threshold_cents, currency = 'SEK', required_role = 'admin', priority = 0 } = a;
    if (!name || !entity_type) throw new Error('name and entity_type are required');
    const { data, error } = await supabase.from('approval_rules').insert({
      name, description: description ?? null, entity_type,
      amount_threshold_cents: amount_threshold_cents != null ? Number(amount_threshold_cents) : null,
      currency, required_role, priority: Number(priority) || 0, is_active: true,
    }).select('id, name').single();
    if (error) throw new Error(`create_rule failed: ${error.message}`);
    return { rule_id: data.id, name: data.name, status: 'created' };
  }

  if (action === 'list_rules') {
    const { data, error } = await supabase.from('approval_rules')
      .select('*').eq('is_active', true).order('priority', { ascending: false });
    if (error) throw new Error(`list_rules failed: ${error.message}`);
    return { rules: data || [] };
  }

  return { error: `Unknown approvals action: ${action}` };
}

// =============================================================================
// Pages module — full page lifecycle + block manipulation
// =============================================================================

async function executePagesAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const resolvePageId = async (rawPageId: string): Promise<string> => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawPageId)) {
      return rawPageId;
    }

    // Agents (and humans) say "/blocks" — the URL path — while slugs are stored
    // bare. Both FlowPilot and FlowWork failed live on the leading slash
    // (2026-08-19, "Page not found: /blocks"); normalize instead of educating.
    const slug = rawPageId.trim().replace(/^\/+/, '');

    const { data: pageBySlug, error } = await supabase
      .from('pages')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Resolve page failed: ${error.message}`);
    if (!pageBySlug?.id) throw new Error(`Page not found: ${slug}. Use manage_page list to see available slugs.`);
    return pageBySlug.id;
  };

  switch (skillName) {
    case 'manage_page':
    case 'manage_pages': {
      const { action = 'list', slug, title, status, blocks } = args as any;
      let { page_id } = args as any;

      // `get` returns the columns as content_json / meta_json, so those are the
      // names a caller naturally sends back — and this skill's own instructions
      // told the model to use them. Both are honoured here AND declared in the
      // tool schema; a name the handler reads but the schema hides gets bounced
      // by the preflight before it ever arrives, which is the platform
      // disagreeing with itself (the model did as it was told and was refused).
      const effectiveBlocks = blocks !== undefined ? blocks : (args as any).content_json;
      const meta = (args as any).meta !== undefined ? (args as any).meta : (args as any).meta_json;

      const blocksShapeErr = blocksShapeError(effectiveBlocks);
      if (blocksShapeErr) throw new Error(`${blocksShapeErr} Nothing was written.`);

      // Accept a slug wherever an id is wanted, same contract as manage_wiki_page
      // and manage_page_blocks (which already routes through resolvePageId).
      // The tool schema says slug is "for get or create", so an agent that has
      // just listed pages holds slugs — and update used to answer only
      // "page_id is required", failing four straight calls whose caller had a
      // perfectly good identifier in hand. Create is deliberately excluded:
      // there the slug names the NEW page and must not be treated as a lookup.
      if (['update', 'publish', 'archive', 'delete', 'rollback'].includes(action)) {
        if (page_id) page_id = await resolvePageId(String(page_id));
        else if (slug) page_id = await resolvePageId(String(slug));
      }

      if (action === 'list') {
        let query = supabase.from('pages')
          .select('id, title, slug, status, menu_order, created_at, updated_at')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(50);
        if (status) query = query.eq('status', status);
        const { data, error } = await query;
        if (error) throw new Error(`List pages failed: ${error.message}`);
        return { pages: data || [] };
      }

      if (action === 'get') {
        let query = supabase.from('pages')
          .select('id, title, slug, status, content_json, meta_json, menu_order, created_at, updated_at');
        if (page_id) query = query.eq('id', page_id);
        else if (slug) query = query.eq('slug', slug);
        else throw new Error('page_id or slug required');
        // Use .limit(1) + manual pick to avoid "Cannot coerce to single JSON" when slug matches multiple rows
        const { data: rows, error } = await query.is('deleted_at', null).order('created_at', { ascending: true }).limit(1);
        if (error) throw new Error(`Get page failed: ${error.message}`);
        if (!rows || rows.length === 0) throw new Error(`Page not found: ${page_id || slug}`);
        const data = rows[0];
        if (error) throw new Error(`Get page failed: ${error.message}`);
        const blockSummary = (data.content_json as any[] || []).map((b: any, i: number) => ({
          index: i, id: b.id, type: b.type, hidden: b.hidden || false,
        }));
        return { ...data, block_count: blockSummary.length, block_summary: blockSummary };
      }

      if (action === 'create') {
        if (!title) throw new Error('title is required');
        const baseSlug = (slug || title.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, ''));
        // Ensure unique slug by appending timestamp suffix if slug already exists
        const { count: slugExists } = await supabase
          .from('pages').select('id', { count: 'exact', head: true }).eq('slug', baseSlug);
        const pageSlug = (slugExists ?? 0) > 0 ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

        // Check if this is the first page — auto-set as homepage
        const { count: existingPages } = await supabase
          .from('pages').select('id', { count: 'exact', head: true }).is('deleted_at', null);

        // create used to read `blocks` ONLY, while update folded content_json.
        // A create carrying content_json — the exact form the instructions ask
        // for — therefore produced an EMPTY page and answered "created": the
        // silent-noop class, on the very first call of a page build.
        const pageBlocks = effectiveBlocks || [];
        // Same refusal contract as the update branch below: a create that
        // quietly loses blocks answers "created" for a page thinner than what
        // the caller sent — the silent-drop class the guardrail test bans.
        const droppedOnCreate = normalizeBlocks(pageBlocks);
        if (droppedOnCreate.length > 0) {
          throw new Error(
            `Block validation dropped ${droppedOnCreate.length} block(s): ${droppedOnCreate.join('; ')}. ` +
            `Fix the named fields and retry — nothing was written.`,
          );
        }
        const { data, error } = await supabase.from('pages').insert({
          title,
          slug: pageSlug,
          status: 'draft',
          content_json: pageBlocks,
          meta_json: meta || {},
        }).select('id, title, slug, status').single();
        if (error) throw new Error(`Create page failed: ${error.message}`);

        // If this is the first page, set it as homepage
        let setAsHomepage = false;
        if ((existingPages ?? 0) <= 1) {
          await supabase.from('site_settings').upsert(
            { key: 'general', value: { homepageSlug: pageSlug } },
            { onConflict: 'key' }
          );
          setAsHomepage = true;
        }

        return { page_id: data.id, slug: data.slug, title: data.title, status: 'draft', set_as_homepage: setAsHomepage };
      }

      if (action === 'update' && page_id) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (slug !== undefined) updates.slug = slug;
        if (meta !== undefined) updates.meta_json = meta;
        // content_json is an alias for blocks (#99-klassen, live miss
        // 2026-08-17): `get` returns the column as content_json, so that is
        // the name a caller naturally sends back. The old code dropped the
        // unknown arg SILENTLY and answered success while writing nothing —
        // the exact silent-noop class the read-back rule exists for. Resolved
        // once at the top of the case so create and update cannot drift apart
        // again (they had: only update folded it).
        if (effectiveBlocks !== undefined) {
          const dropped = normalizeBlocks(effectiveBlocks as unknown[]);
          if (dropped.length > 0) {
            // A page update that quietly loses blocks is worse than one that
            // fails: say WHICH block and WHAT it needs, Tiptap-error style.
            throw new Error(
              `Block validation dropped ${dropped.length} block(s): ${dropped.join('; ')}. ` +
              `Fix the named fields and retry — nothing was written.`,
            );
          }
          updates.content_json = effectiveBlocks;
        }
        const { data, error } = await supabase.from('pages')
          .update(updates).eq('id', page_id).select('id, title, slug, status').single();
        if (error) throw new Error(`Update page failed: ${error.message}`);
        return { page_id: data.id, status: 'updated' };
      }

      if (action === 'publish' && page_id) {
        // Save version before publishing
        const { data: current } = await supabase.from('pages')
          .select('title, content_json, meta_json').eq('id', page_id).single();
        if (current) {
          await supabase.from('page_versions').insert({
            page_id, title: current.title,
            content_json: current.content_json, meta_json: current.meta_json,
          });
        }
        const { data, error } = await supabase.from('pages')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', page_id).select('id, title, slug, status').single();
        if (error) throw new Error(`Publish failed: ${error.message}`);
        return { page_id: data.id, slug: data.slug, status: 'published' };
      }

      if (action === 'archive' && page_id) {
        const { data, error } = await supabase.from('pages')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', page_id).select('id, title, status').single();
        if (error) throw new Error(`Archive failed: ${error.message}`);
        return { page_id: data.id, status: 'archived' };
      }

      if (action === 'delete' && page_id) {
        const { error } = await supabase.from('pages')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', page_id);
        if (error) throw new Error(`Delete failed: ${error.message}`);
        return { page_id, status: 'deleted' };
      }

      if (action === 'rollback' && page_id) {
        const { version_id } = args as any;
        let query = supabase.from('page_versions')
          .select('id, title, content_json, meta_json, created_at')
          .eq('page_id', page_id)
          .order('created_at', { ascending: false });
        if (version_id) query = query.eq('id', version_id);
        const { data: version } = await query.limit(1).single();
        if (!version) throw new Error('No version found to rollback to');
        // Save current state as new version before rollback
        const { data: current } = await supabase.from('pages')
          .select('title, content_json, meta_json').eq('id', page_id).single();
        if (current) {
          await supabase.from('page_versions').insert({
            page_id, title: current.title,
            content_json: current.content_json, meta_json: current.meta_json,
          });
        }
        await supabase.from('pages').update({
          title: version.title, content_json: version.content_json,
          meta_json: version.meta_json, updated_at: new Date().toISOString(),
        }).eq('id', page_id);
        return { page_id, rolled_back_to: version.id, version_date: version.created_at };
      }

      // Better error messages for missing arguments
      if (['update', 'publish', 'archive', 'delete', 'rollback'].includes(action) && !page_id) {
        return { error: `page_id is required for action: ${action}` };
      }
      return { error: `Unknown page action: ${action}. Valid actions: list, get, create, update, publish, archive, delete, rollback` };
    }

    case 'manage_page_blocks': {
      // slug is as good as an id here (#99): manage_page resolves either, so an
      // agent that just created or listed a page holds a slug and had no reason
      // to expect this surface to refuse it.
      const { action = 'list', page_id, slug } = args as any;
      const identifier = page_id ?? slug;
      if (!identifier) throw new Error('page_id or slug is required (both are accepted and resolved).');
      const resolvedPageId = await resolvePageId(String(identifier));

      // Fetch current page blocks and hydrate missing IDs
      const { data: page, error: fetchErr } = await supabase.from('pages')
        .select('id, content_json').eq('id', resolvedPageId).is('deleted_at', null).single();
      if (fetchErr || !page) throw new Error(`Page not found: ${page_id}`);

      const blocks = (page.content_json as any[]) || [];
      // Hydrate blocks without IDs (from old migrations)
      let hydrated = false;
      for (let i = 0; i < blocks.length; i++) {
        if (!blocks[i].id) {
          blocks[i].id = crypto.randomUUID();
          hydrated = true;
        }
      }
      if (hydrated) {
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
      }

      if (action === 'list') {
        return {
          page_id: resolvedPageId,
          block_count: blocks.length,
          blocks: blocks.map((b: any, i: number) => ({
            index: i, id: b.id, type: b.type, hidden: b.hidden || false,
            has_data: !!b.data && Object.keys(b.data).length > 0,
          })),
        };
      }

      if (action === 'add') {
        const { block_type, block_data = {}, position } = args as any;
        if (!block_type) throw new Error('block_type is required');

        // NORMALIZE FIRST, then validate — the order matters. Validation used to
        // run on the raw payload, so the forgiveness normalizeBlockData offers
        // (raw string → Tiptap, heading → title, hero buttonText → primaryButton)
        // never got the chance to apply: the call was already refused. Build the
        // candidate block, normalize it, validate the normalized shape, save that.
        const newBlock = {
          id: crypto.randomUUID(),
          type: block_type,
          data: block_data,
          spacing: {},
          animation: { type: 'fade-up' },
        };
        normalizeBlockData(newBlock);

        const validation = validateBlockData(block_type, newBlock.data as Record<string, unknown>);
        if (!validation.valid) {
          return {
            error: `Block validation failed for "${block_type}": ${validation.errors.join('; ')}`,
            validation_errors: validation.errors,
            hint: validation.hint,
            example: validation.example,
            status: 'validation_failed',
          };
        }

        const pos = position !== undefined ? Math.min(position, blocks.length) : blocks.length;
        blocks.splice(pos, 0, newBlock);
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, block_id: newBlock.id, type: block_type, position: pos, total_blocks: blocks.length };
      }

      if (action === 'update') {
        const { block_id, block_data } = args as any;
        if (!block_id || !block_data) throw new Error('block_id and block_data required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);

        // Merge first, then validate the merged result.
        // block_data accepts BOTH shapes: a bare data-fields object, or a full
        // block {id, type, data} — the instructions called it a "Block object",
        // callers sent exactly that, and the old spread nested it under data.*
        // while the rendered fields stayed stale (silent corruption, found on
        // optic 2026-08-17). Unwrap, and scrub the block-shaped junk keys that
        // shape of corruption left behind.
        const _isFullBlock = block_data && typeof block_data === 'object'
          && 'data' in (block_data as any) && typeof (block_data as any).data === 'object';
        const _incoming = _isFullBlock ? (block_data as any).data : block_data;
        const blockType = String(blocks[idx].type);

        // Normalize the INCOMING fields on their own first, so aliases are
        // mapped to the renderer's names (heading→title, buttonText→
        // primaryButton) BEFORE they are merged and before the gate judges
        // them — and so the unknown-field check below sees the corrected keys.
        const _incomingBlock = { id: block_id, type: blockType, data: { ...(_incoming as Record<string, unknown>) } };
        normalizeBlockData(_incomingBlock);
        const _normalizedIncoming = _incomingBlock.data as Record<string, unknown>;

        const mergedData = { ...blocks[idx].data as Record<string, unknown>, ..._normalizedIncoming };
        for (const junk of ['id', 'type', 'data'] as const) {
          const v = (mergedData as any)[junk];
          if (v !== undefined && (junk === 'data' ? typeof v === 'object' : typeof v === 'string')
              && !(_normalizedIncoming && typeof _normalizedIncoming === 'object' && junk in _normalizedIncoming)) {
            delete (mergedData as any)[junk];
          }
        }

        // Normalize the merged result too (an existing raw-string field is
        // fixed here), then validate what will actually be written.
        const _mergedBlock = { ...blocks[idx], data: mergedData };
        normalizeBlockData(_mergedBlock);

        // Unknown-field check is scoped to what the CALLER sent: pre-existing
        // stored fields may predate this gate, and refusing them would make the
        // block permanently un-editable by an agent.
        const validation = validateBlockData(blockType, _mergedBlock.data as Record<string, unknown>, {
          unknownFieldScope: _normalizedIncoming,
        });
        if (!validation.valid) {
          return {
            error: `Block validation failed for "${blockType}": ${validation.errors.join('; ')}`,
            validation_errors: validation.errors,
            hint: validation.hint,
            example: validation.example,
            current_data: blocks[idx].data,
            status: 'validation_failed',
          };
        }

        blocks[idx] = _mergedBlock;
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, block_id, type: blocks[idx].type, status: 'updated' };
      }

      if (action === 'get_block') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const block = blocks.find((b: any) => b.id === block_id);
        if (!block) throw new Error(`Block not found: ${block_id}`);
        return { page_id: resolvedPageId, block_id, type: block.type, data: block.data };
      }

      if (action === 'remove') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        const removed = blocks.splice(idx, 1)[0];
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, removed_block_id: removed.id, removed_type: removed.type, remaining_blocks: blocks.length };
      }

      if (action === 'reorder') {
        let { block_ids } = args as any;
        const { block_id: moveId, position: movePos } = args as any;
        // Move-one ergonomics: an agent that wants "put the hero first" holds a
        // block_id and a position, not the page's full id order — and had to
        // list the page just to restate an order it did not want to change.
        // Derive the full order here instead of refusing.
        if (!Array.isArray(block_ids) && moveId && movePos !== undefined && movePos !== null) {
          const from = blocks.findIndex((b: any) => b.id === moveId);
          if (from === -1) throw new Error(`Block not found: ${moveId}`);
          const order = blocks.map((b: any) => b.id);
          order.splice(from, 1);
          const to = Math.max(0, Math.min(Number(movePos), order.length));
          order.splice(to, 0, moveId);
          block_ids = order;
        }
        if (!Array.isArray(block_ids)) {
          throw new Error('block_ids (ALL ids in desired order) required — or pass block_id + position to move one block.');
        }
        const reordered: any[] = [];
        for (const bid of block_ids) {
          const block = blocks.find((b: any) => b.id === bid);
          if (block) reordered.push(block);
        }
        // Append any blocks not in the reorder list at the end
        for (const b of blocks) {
          if (!block_ids.includes(b.id)) reordered.push(b);
        }
        await supabase.from('pages')
          .update({ content_json: reordered, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, new_order: reordered.map((b: any) => b.id), total_blocks: reordered.length };
      }

      if (action === 'toggle_visibility') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        blocks[idx].hidden = !blocks[idx].hidden;
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, block_id, hidden: blocks[idx].hidden };
      }

      if (action === 'duplicate') {
        const { block_id } = args as any;
        if (!block_id) throw new Error('block_id is required');
        const idx = blocks.findIndex((b: any) => b.id === block_id);
        if (idx === -1) throw new Error(`Block not found: ${block_id}`);
        const clone = JSON.parse(JSON.stringify(blocks[idx]));
        clone.id = crypto.randomUUID();
        blocks.splice(idx + 1, 0, clone);
        await supabase.from('pages')
          .update({ content_json: blocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);
        return { page_id: resolvedPageId, original_block_id: block_id, new_block_id: clone.id, position: idx + 1 };
      }

      return { error: `Unknown block action: ${action}` };
    }

    case 'create_page_block': {
      // Supports single block OR batch: { blocks: [{ type, data }] }
      const { page_id: rawPageId, slug: pageSlug, block_type, block_data = {}, position, blocks: batchBlocks } = args as any;
      // Same parity as manage_page_blocks (#99) — slug is a valid identifier.
      const page_id = rawPageId ?? pageSlug;
      if (!page_id) {
        return {
          error: 'page_id or slug is required (both are accepted and resolved). Create the page first with manage_page { action: "create", title, slug? }, then call create_page_block with the returned page_id — or with the slug you chose.',
          next_step: 'manage_page.create',
        };
      }

      // ── Batch mode: add multiple blocks in one call ──
      if (Array.isArray(batchBlocks) && batchBlocks.length > 0) {
        const resolvedPageId = await resolvePageId(page_id);
        const { data: page, error: fetchErr } = await supabase.from('pages')
          .select('id, content_json').eq('id', resolvedPageId).is('deleted_at', null).single();
        if (fetchErr || !page) throw new Error(`Page not found: ${page_id}`);

        const existingBlocks = (page.content_json as any[]) || [];
        const addedIds: string[] = [];
        const errors: string[] = [];

        for (const b of batchBlocks) {
          if (!b.type) { errors.push('Block missing type'); continue; }
          const bData = b.data || {};
          // Same order as the single-block path: normalize the candidate first,
          // then validate the normalized shape (see the comment there).
          const newBlock = {
            id: crypto.randomUUID(),
            type: b.type,
            data: bData,
            spacing: {},
            animation: { type: 'fade-up' },
          };
          normalizeBlockData(newBlock);

          const validation = validateBlockData(b.type, newBlock.data as Record<string, unknown>);
          if (!validation.valid) {
            errors.push(`${b.type}: ${validation.errors.join('; ')}${validation.hint ? ` — ${validation.hint}` : ''}`);
            continue;
          }
          existingBlocks.push(newBlock);
          addedIds.push(newBlock.id);
        }

        await supabase.from('pages')
          .update({ content_json: existingBlocks, updated_at: new Date().toISOString() })
          .eq('id', resolvedPageId);

        return {
          page_id: resolvedPageId,
          blocks_added: addedIds.length,
          block_ids: addedIds,
          total_blocks: existingBlocks.length,
          errors: errors.length > 0 ? errors : undefined,
        };
      }

      // ── Single block mode (backward compatible) ──
      if (!block_type) return { error: 'block_type is required (or use blocks[] array for batch)' };
      return executePagesAction(supabase, 'manage_page_blocks', {
        action: 'add',
        page_id,
        block_type,
        block_data,
        position,
      });
    }

    case 'generate_meta_description': {
      return await executeGenerateMetaDescription(supabase, args);
    }

    case 'generate_alt_text': {
      return await executeGenerateAltText(supabase, args);
    }

    default:
      return { error: `Unknown pages skill: ${skillName}` };
  }
}

// =============================================================================
// SEO Maintenance helpers — generate_meta_description, generate_alt_text
// =============================================================================

/**
 * Shared text-generation helper. Tries Gemini first, then OpenAI.
 * Returns trimmed text or null on failure.
 */
async function generateShortText(prompt: string, maxTokens = 256): Promise<string | null> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
        }),
      });
      const data = await resp.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return String(text).trim();
    } catch (e) {
      console.error('[generateShortText] Gemini failed:', e);
    }
  }

  if (openaiKey) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: maxTokens,
          temperature: 0.4,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return String(text).trim();
    } catch (e) {
      console.error('[generateShortText] OpenAI failed:', e);
    }
  }

  return null;
}

/**
 * Extract plain text from a page's content_json blocks for context.
 * Pulls headings/text/paragraphs from common block types, capped to ~2000 chars.
 */
function extractPageText(blocks: any[]): string {
  if (!Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    const d = b.data || {};
    const candidates = [d.title, d.subtitle, d.heading, d.subheading, d.text, d.body, d.content, d.description];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) parts.push(c.trim());
    }
    // List/feature items
    const items = d.items || d.features || d.cards;
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it?.title) parts.push(String(it.title));
        if (it?.description) parts.push(String(it.description));
      }
    }
  }
  return parts.join(' ').slice(0, 2000);
}

async function executeGenerateMetaDescription(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { page_id, slug, scan_all = false, limit = 10, dry_run = false } = args as any;

  // Targeted single-page mode
  if (page_id || slug) {
    let query = supabase.from('pages').select('id, title, slug, content_json, meta_json').is('deleted_at', null);
    if (page_id) query = query.eq('id', page_id);
    else query = query.eq('slug', slug);
    const { data: rows, error } = await query.limit(1);
    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!rows?.length) throw new Error(`Page not found: ${page_id || slug}`);
    const result = await processOnePageMeta(supabase, rows[0], dry_run);
    return { mode: 'single', ...result };
  }

  // Scan mode — find published pages without meta_description
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const { data: pages, error } = await supabase
    .from('pages')
    .select('id, title, slug, content_json, meta_json, status')
    .is('deleted_at', null)
    .eq('status', 'published')
    .limit(200);

  if (error) throw new Error(`Scan failed: ${error.message}`);

  const missing = (pages || []).filter((p: any) => {
    const desc = p.meta_json?.description || p.meta_json?.meta_description;
    return !desc || String(desc).trim().length < 20;
  }).slice(0, cap);

  if (!scan_all && missing.length === 0) {
    return { mode: 'scan', scanned: pages?.length || 0, missing: 0, message: 'No pages need meta descriptions.' };
  }

  const results: any[] = [];
  for (const p of missing) {
    try {
      const r = await processOnePageMeta(supabase, p, dry_run);
      results.push(r);
    } catch (e) {
      results.push({ page_id: p.id, slug: p.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    mode: 'scan',
    scanned: pages?.length || 0,
    missing: missing.length,
    processed: results.length,
    updated: results.filter((r) => r.updated).length,
    dry_run,
    results,
  };
}

async function processOnePageMeta(supabase: SupabaseClient, page: any, dryRun: boolean) {
  const context = extractPageText(page.content_json || []);
  const prompt = `Write an SEO meta description for this page.
Title: "${page.title}"
Page content excerpt: ${context || '(no body content available — write based on title)'}

Requirements:
- 140-160 characters
- Compelling, includes the main topic
- No quotes, no trailing period unless natural
- Plain text only, no markdown
- Match the language of the title/content

Output ONLY the meta description, nothing else.`;

  const description = await generateShortText(prompt, 200);
  if (!description) {
    return { page_id: page.id, slug: page.slug, title: page.title, updated: false, error: 'AI generation failed (no key configured or API error)' };
  }

  const cleaned = description.replace(/^["']|["']$/g, '').trim().slice(0, 160);

  if (dryRun) {
    return { page_id: page.id, slug: page.slug, title: page.title, generated: cleaned, updated: false, dry_run: true };
  }

  const newMeta = { ...(page.meta_json || {}), description: cleaned };
  const { error } = await supabase
    .from('pages')
    .update({ meta_json: newMeta, updated_at: new Date().toISOString() })
    .eq('id', page.id);

  if (error) {
    return { page_id: page.id, slug: page.slug, updated: false, error: error.message };
  }
  return { page_id: page.id, slug: page.slug, title: page.title, generated: cleaned, updated: true };
}

async function executeGenerateAltText(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { page_id, slug, limit = 20, dry_run = false } = args as any;

  // Single-page mode
  if (page_id || slug) {
    let query = supabase.from('pages').select('id, title, slug, content_json').is('deleted_at', null);
    if (page_id) query = query.eq('id', page_id);
    else query = query.eq('slug', slug);
    const { data: rows, error } = await query.limit(1);
    if (error) throw new Error(`Lookup failed: ${error.message}`);
    if (!rows?.length) throw new Error(`Page not found: ${page_id || slug}`);
    const r = await processOnePageAlt(supabase, rows[0], dry_run);
    return { mode: 'single', ...r };
  }

  // Scan mode — published pages, find images missing alt
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const { data: pages, error } = await supabase
    .from('pages')
    .select('id, title, slug, content_json')
    .is('deleted_at', null)
    .eq('status', 'published')
    .limit(100);

  if (error) throw new Error(`Scan failed: ${error.message}`);

  const results: any[] = [];
  let totalFixed = 0;
  for (const p of pages || []) {
    try {
      const r = await processOnePageAlt(supabase, p, dry_run, cap - totalFixed);
      if (r.images_fixed > 0) {
        results.push(r);
        totalFixed += r.images_fixed;
      }
      if (totalFixed >= cap) break;
    } catch (e) {
      results.push({ page_id: p.id, slug: p.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    mode: 'scan',
    scanned: pages?.length || 0,
    pages_updated: results.filter((r) => r.updated).length,
    images_fixed: totalFixed,
    dry_run,
    results,
  };
}

/**
 * Walk a page's blocks, find images without alt-text, generate alt for each, save.
 * Looks for: block.data.image, block.data.imageUrl, block.data.images[].url, block.data.src
 * Saves alt at block.data.imageAlt, block.data.alt, or block.data.images[].alt accordingly.
 */
async function processOnePageAlt(
  supabase: SupabaseClient,
  page: any,
  dryRun: boolean,
  remainingBudget = 100,
) {
  const blocks = Array.isArray(page.content_json) ? JSON.parse(JSON.stringify(page.content_json)) : [];
  const pageContext = `Page title: "${page.title}". ${extractPageText(blocks).slice(0, 500)}`;
  let fixed = 0;
  const fixes: any[] = [];

  for (const b of blocks) {
    if (!b || typeof b !== 'object' || !b.data) continue;
    const d = b.data;

    // Pattern 1: single image with imageAlt/alt sibling
    const singleImageUrl = d.image || d.imageUrl || d.src || d.backgroundImage;
    const singleAltKey = d.imageAlt !== undefined ? 'imageAlt' : (d.alt !== undefined ? 'alt' : 'imageAlt');
    if (singleImageUrl && (!d[singleAltKey] || String(d[singleAltKey]).trim() === '')) {
      if (fixed >= remainingBudget) break;
      const alt = await generateAltForImage(singleImageUrl, pageContext);
      if (alt) {
        d[singleAltKey] = alt;
        fixed++;
        fixes.push({ block_type: b.type, image: singleImageUrl, alt });
      }
    }

    // Pattern 2: images[] array
    if (Array.isArray(d.images)) {
      for (const img of d.images) {
        if (fixed >= remainingBudget) break;
        if (img && typeof img === 'object') {
          const url = img.url || img.src;
          if (url && (!img.alt || String(img.alt).trim() === '')) {
            const alt = await generateAltForImage(url, pageContext);
            if (alt) {
              img.alt = alt;
              fixed++;
              fixes.push({ block_type: b.type, image: url, alt });
            }
          }
        }
      }
    }
  }

  if (fixed === 0) {
    return { page_id: page.id, slug: page.slug, title: page.title, images_fixed: 0, updated: false };
  }

  if (dryRun) {
    return { page_id: page.id, slug: page.slug, title: page.title, images_fixed: fixed, updated: false, dry_run: true, fixes };
  }

  const { error } = await supabase
    .from('pages')
    .update({ content_json: blocks, updated_at: new Date().toISOString() })
    .eq('id', page.id);

  if (error) {
    return { page_id: page.id, slug: page.slug, updated: false, error: error.message };
  }
  return { page_id: page.id, slug: page.slug, title: page.title, images_fixed: fixed, updated: true, fixes };
}

async function generateAltForImage(imageUrl: string, pageContext: string): Promise<string | null> {
  // Extract filename hint from URL
  let filenameHint = '';
  try {
    const u = new URL(imageUrl);
    const last = u.pathname.split('/').pop() || '';
    filenameHint = decodeURIComponent(last.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')).trim();
  } catch (_) {
    // Ignore — relative URLs etc.
  }

  const prompt = `Write a concise alt-text description for an image used on a webpage.
${pageContext}
Image filename hint: "${filenameHint || '(unknown)'}"
Image URL: ${imageUrl}

Requirements:
- 5-15 words, descriptive and specific
- No "image of" / "picture of" prefix
- Plain text, no quotes, no period at end
- Match the language of the page

Output ONLY the alt text, nothing else.`;

  const alt = await generateShortText(prompt, 80);
  if (!alt) return null;
  return alt.replace(/^["']|["']$/g, '').replace(/\.$/, '').trim().slice(0, 125);
}

// =============================================================================
// Knowledge Base module handlers
// =============================================================================

/**
 * Normalize an `answer` value into both plain text (for search/chat context)
 * and a minimal Tiptap doc (for the public renderer which reads answer_json).
 *
 * Accepts:
 *   - string (plain text or markdown — split on blank lines into paragraphs)
 *   - Tiptap doc ({ type: 'doc', content: [...] }) — passed through
 *   - anything else → coerced to string
 */
function normalizeKbAnswer(answer: unknown): { answer_text: string; answer_json: unknown } {
  if (answer && typeof answer === 'object' && (answer as any).type === 'doc' && Array.isArray((answer as any).content)) {
    // Extract plain text from Tiptap doc
    const extractText = (node: any): string => {
      if (!node) return '';
      if (node.type === 'text') return String(node.text || '');
      if (Array.isArray(node.content)) return node.content.map(extractText).join('');
      return '';
    };
    const text = (answer as any).content.map(extractText).join('\n\n').trim();
    return { answer_text: text, answer_json: answer };
  }
  // Agents write Markdown — it is the natural output of a language model and
  // the format every other content skill accepts. This split on blank lines
  // was not a converter: "- **Förbjuden AI**: …" became ONE paragraph whose
  // literal text contained the dash and the asterisks, so the public article
  // rendered the punctuation and lost the list. markdownToTiptap already
  // exists for exactly this, is imported at the top of this file, and has
  // backed write_blog_post all along — KB simply never called it.
  const raw = String(answer ?? '').trim();
  const doc = markdownToTiptap(raw);
  // answer_text feeds search and the chat's retrieval context, so it must be
  // PLAIN — asterisks and dashes are noise to a model reading for meaning.
  // Deriving it from the doc keeps both branches of this function consistent.
  const extractText = (node: any): string => {
    if (!node) return '';
    if (node.type === 'text') return String(node.text || '');
    if (Array.isArray(node.content)) return node.content.map(extractText).join('');
    return '';
  };
  const text = (doc.content || []).map(extractText).filter(Boolean).join('\n\n').trim();
  return { answer_text: text || raw, answer_json: doc };
}

async function executeKbAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  // BCP-47 tag as stored on the row: lowercased, trimmed, '' = not given.
  const normLocale = (v: unknown): string | null => {
    const s = String(v ?? '').trim().toLowerCase();
    return s || null;
  };
  const sameLanguage = (a: unknown, b: string) =>
    String(a ?? '').toLowerCase().split('-')[0] === b.split('-')[0];

  if (action === 'list') {
    const { category, is_published } = args as any;
    const wantedLocale = normLocale((args as any).locale);
    let categoryId: string | null = null;
    if (category) {
      // Resolve category name → id
      const { data: cat } = await supabase.from('kb_categories').select('id').ilike('name', category).maybeSingle();
      if (cat) categoryId = cat.id;
    }
    const baseCols = 'id, title, slug, question, category_id, is_published, is_featured, views_count, helpful_count, not_helpful_count, created_at, updated_at';
    const buildQuery = (cols: string) => {
      let query = supabase.from('kb_articles')
        .select(cols)
        .order('updated_at', { ascending: false }).limit(50);
      if (categoryId) query = query.eq('category_id', categoryId);
      if (is_published !== undefined) query = query.eq('is_published', is_published);
      return query;
    };
    // Ask for the language columns first, fall back to the pre-rail shape —
    // the fleet runs several schema versions at once (Law 4: degrade, never gate).
    let res = await buildQuery(`${baseCols}, locale, translation_group_id`);
    if (res.error) res = await buildQuery(baseCols);
    if (res.error) throw new Error(`List KB articles failed: ${res.error.message}`);
    let rows = (res.data || []) as any[];
    if (wantedLocale) {
      // Rows without a locale predate the rail and are never hidden by it.
      rows = rows.filter((r) => !r.locale || sameLanguage(r.locale, wantedLocale));
    }
    return { articles: rows };
  }

  if (action === 'search') {
    // Full KB search over title/question/answer (the fields the public
    // KnowledgeBasePage filters on client-side) — gives agents the same
    // reach as the visitor search box, server-side.
    const { query: q, search, include_unpublished, limit = 20 } = args as any;
    const term = sanitizeOrTerm(String(q ?? search ?? '').trim());
    if (!term) throw new Error('query is required for search');
    const buildQuery = (cols: string) => {
      let query = supabase.from('kb_articles')
        .select(cols)
        .or(`title.ilike.%${term}%,question.ilike.%${term}%,answer_text.ilike.%${term}%`)
        .order('is_featured', { ascending: false })
        .order('views_count', { ascending: false })
        .limit(limit);
      if (!include_unpublished) query = query.eq('is_published', true);
      return query;
    };
    // Results carry each row's locale so a caller answering a visitor can see
    // which language an article speaks — same strict/fallback as list.
    const baseCols = 'id, title, slug, question, answer_text, category_id, is_published, is_featured, views_count, helpful_count, updated_at';
    let res = await buildQuery(`${baseCols}, locale, translation_group_id`);
    if (res.error) res = await buildQuery(baseCols);
    if (res.error) throw new Error(`KB search failed: ${res.error.message}`);
    return { results: res.data || [], count: (res.data || []).length, query: term };
  }

  if (action === 'get') {
    const { article_id, slug, title } = args as any;
    let query = supabase.from('kb_articles')
      .select('*');
    if (article_id) query = query.eq('id', article_id);
    else if (slug) query = query.eq('slug', slug);
    else if (title) {
      // Resolve by title like manage_wiki_page does: exact (case-insensitive)
      // first, then unique prefix match — never guess between ambiguous hits.
      const { data: matches, error: mErr } = await supabase.from('kb_articles')
        .select('id, title').ilike('title', title).limit(2);
      if (mErr) throw new Error(`Get KB article failed: ${mErr.message}`);
      let hit = matches?.length === 1 ? matches[0] : null;
      if (!hit) {
        const { data: pref } = await supabase.from('kb_articles')
          .select('id, title').ilike('title', `${title}%`).limit(2);
        if (pref?.length === 1) hit = pref[0];
        else if ((matches?.length ?? 0) + (pref?.length ?? 0) > 1) {
          throw new Error(`Multiple KB articles match title "${title}" — use slug or article_id (try list/search first)`);
        }
      }
      if (!hit) throw new Error(`No KB article with title "${title}" — use list or search_kb to find the slug`);
      query = query.eq('id', hit.id);
    }
    else throw new Error('article_id, slug or title required');
    const { data, error } = await query.single();
    if (error) throw new Error(`Get KB article failed: ${error.message}`);
    // Language versions ride along so a translator never edits blind: the key
    // is (translation_group_id, locale), one row per language per group.
    if ((data as any)?.translation_group_id) {
      const { data: versions, error: vErr } = await supabase.from('kb_articles')
        .select('id, slug, locale, is_published')
        .eq('translation_group_id', (data as any).translation_group_id)
        .neq('id', (data as any).id);
      if (vErr) throw new Error(`Get KB article failed listing language versions: ${vErr.message}`);
      if (versions?.length) return { ...(data as any), language_versions: versions };
    }
    return data;
  }

  if (action === 'create') {
    const { title, category = 'general', include_in_chat = true, is_featured = false, visibility = 'public', publish = false } = args as any;
    // Accept content/body as aliases for answer; auto-generate question from title if omitted
    const answer = (args as any).answer ?? (args as any).content ?? (args as any).body;
    const question = (args as any).question || (title ? `What is ${title}?` : '');
    if (!title || !question) throw new Error('title is required');
    if (!answer || (typeof answer === 'string' && !answer.trim())) {
      throw new Error('answer (or content) is required and must contain the full article body (plain text, markdown, or a Tiptap doc). Empty answers render as blank articles.');
    }

    // Language rail (same key as pages/email templates): `locale` is the
    // language the row is written in, `translation_of` names an existing
    // article this one translates — the pair joins a translation group, one
    // row per language per group. Omitting locale lets the DB trigger stamp
    // the site's default language.
    const locale = normLocale((args as any).locale);
    const translationOf = (args as any).translation_of;
    let translationGroupId: string | null = null;
    let sourceArticle: any = null;
    if (translationOf) {
      if (!locale) {
        throw new Error('translation_of requires locale — say which language the new version is written in (e.g. "en", "sv", "de").');
      }
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(String(translationOf));
      const sourceId = await resolveArticleId({
        article_id: looksLikeUuid ? String(translationOf) : undefined,
        slug: String(translationOf),
        title: String(translationOf),
      });
      if (!sourceId) throw new Error(`translation_of: no KB article matches "${translationOf}" — pass its slug or article_id.`);
      const { data: src, error: srcErr } = await supabase.from('kb_articles').select('*').eq('id', sourceId).single();
      if (srcErr) throw new Error(`translation_of: could not read the source article: ${srcErr.message}`);
      sourceArticle = src;
      if (src.locale === undefined) {
        throw new Error('This instance has no language columns on kb_articles yet — apply the language migration before creating translations.');
      }
      if (sameLanguage(src.locale, locale)) {
        throw new Error(`Source article is already written in ${src.locale} — a translation must be another language.`);
      }
      translationGroupId = src.translation_group_id ?? crypto.randomUUID();
      const { data: dupe, error: dupeErr } = await supabase.from('kb_articles')
        .select('slug, locale').eq('translation_group_id', translationGroupId).limit(20);
      if (dupeErr) throw new Error(`translation_of: could not read the translation group: ${dupeErr.message}`);
      const existing = (dupe || []).find((d: any) => sameLanguage(d.locale, locale));
      if (existing) {
        throw new Error(`A ${existing.locale} version already exists in this group (slug "${existing.slug}") — update that article instead of creating a duplicate.`);
      }
      if (!src.translation_group_id) {
        const { error: linkErr } = await supabase.from('kb_articles')
          .update({ translation_group_id: translationGroupId }).eq('id', src.id);
        if (linkErr) throw new Error(`translation_of: could not link the source article: ${linkErr.message}`);
      }
    }

    let articleSlug = title.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/(^-|-$)/g, '');
    // Each language keeps its own address, and /kb/:slug resolves by slug
    // alone — a colliding slug would make the article unreachable. Suffix with
    // the locale (the pages convention), then a random tail as last resort.
    const slugTaken = async (s: string) => {
      const { data: hit, error: hitErr } = await supabase.from('kb_articles').select('id').eq('slug', s).limit(1);
      if (hitErr) throw new Error(`Create KB article failed checking slug "${s}": ${hitErr.message}`);
      return (hit?.length ?? 0) > 0;
    };
    if (await slugTaken(articleSlug)) {
      const suffixed = locale ? `${articleSlug}-${locale}` : articleSlug;
      articleSlug = (suffixed !== articleSlug && !(await slugTaken(suffixed)))
        ? suffixed
        : `${articleSlug}-${crypto.randomUUID().slice(0, 4)}`;
    }

    // Resolve category string → category_id UUID. A translation inherits the
    // source's category unless the caller names one — the group is ONE article
    // to the visitor, and its versions belong together.
    let categoryId: string | null =
      translationOf && (args as any).category === undefined && sourceArticle?.category_id
        ? sourceArticle.category_id
        : null;
    if (!categoryId) {
      const { data: cats } = await supabase.from('kb_categories').select('id, slug, name').eq('is_active', true).limit(20);
      if (cats && cats.length > 0) {
        const match = cats.find(c =>
          c.slug === category.toLowerCase().replace(/\s+/g, '-') ||
          c.name?.toLowerCase() === category.toLowerCase()
        );
        // No match means the caller named a category that does not exist yet, and
        // the answer is to CREATE it (the branch below), not to file the article
        // under whichever category happens to sort first. The old `?? cats[0].id`
        // fallback silently mis-categorised: an agent creating articles across six
        // categories got one category with everything in it, and every API
        // response still said success. A wrongly filed article is worse than a
        // failed call, because nobody is told to look.
        categoryId = match?.id ?? null;
      }
    }
    if (!categoryId) {
      // Auto-create a default "General" category
      const catSlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
      const { data: newCat, error: catErr } = await supabase.from('kb_categories').insert({
        name: category || 'General',
        slug: catSlug,
        description: 'Auto-created category',
        icon: 'HelpCircle',
        is_active: true,
      }).select('id').single();
      if (catErr) throw new Error(`Failed to auto-create KB category: ${catErr.message}`);
      categoryId = newCat.id;
    }

    const { answer_text, answer_json } = normalizeKbAnswer(answer);
    // Draft-by-default is a safe default, but it was also an INVISIBLE one: the
    // create response said nothing about publication state, so agents reported
    // "article published" while the row sat unpublished — and the retrieval
    // indexer (_shared/retrieval/indexer.ts) skips unpublished articles, so the
    // core promise (ask the chat, get the answer) silently did not hold.
    // Fixed two ways: an explicit `publish` flag, and a response that always
    // states is_published plus a note the agent can repeat verbatim.
    const shouldPublish = publish === true || publish === 'true';
    const { data, error } = await supabase.from('kb_articles').insert({
      title, question,
      answer_text,
      answer_json,
      slug: articleSlug,
      category_id: categoryId,
      include_in_chat, is_featured,
      // Audience. The update path passes fields through generically, but create
      // whitelists — so without this line an agent could only ever author
      // public articles, and the internal tier would exist for humans only.
      visibility: visibility === 'internal' ? 'internal' : 'public',
      // NB: kb_articles has NO published_at column (see src/integrations/supabase/types.ts)
      // — is_published is the only publication state there is.
      is_published: shouldPublish,
      // Only sent when actually used, so an un-migrated instance (no language
      // columns yet) can still create articles in its one language.
      ...(locale ? { locale } : {}),
      ...(translationGroupId ? { translation_group_id: translationGroupId } : {}),
    }).select('*').single();
    if (error) throw new Error(`Create KB article failed: ${error.message}`);
    return {
      article_id: data.id,
      slug: data.slug,
      title: data.title,
      // The trigger stamps the site's default language when none was given —
      // report what the row actually got, not what the caller sent.
      locale: data.locale ?? locale ?? null,
      translation_group_id: data.translation_group_id ?? translationGroupId ?? null,
      status: data.is_published ? 'published' : 'draft',
      is_published: data.is_published === true,
      visibility: data.visibility,
      ...(data.is_published
        ? {}
        : { note: 'Saved as DRAFT — not indexed, invisible to visitors and chat. Re-run with publish:true or ask an admin to publish.' }),
    };
  }

  // Resolve article_id from slug OR title if missing — common when an agent
  // chains create→publish, or holds a title from a list/search.
  //
  // Title was accepted by `get` but NOT by update/publish/unpublish (#99): the
  // read path resolved it, the write path answered "article_id or slug is
  // required" and the agent had to go find an id it should never have needed.
  // Read and write must accept the same identifiers — a write surface that is
  // pickier than the read surface it follows is a trap, not a safeguard.
  async function resolveArticleId(args: any): Promise<string | null> {
    if (args?.article_id) return args.article_id;
    if (args?.slug) {
      const { data } = await supabase.from('kb_articles').select('id').eq('slug', args.slug).maybeSingle();
      if (data?.id) return data.id;
    }
    if (args?.title) {
      // Exact (case-insensitive) first, then a unique prefix — same ladder the
      // `get` action uses. Ambiguity must NOT silently pick one on a write.
      const { data: exact } = await supabase.from('kb_articles')
        .select('id').ilike('title', String(args.title)).limit(2);
      if (exact?.length === 1) return exact[0].id;
      if ((exact?.length ?? 0) > 1) {
        throw new Error(`Title "${args.title}" matches ${exact!.length} articles — pass article_id or slug to disambiguate.`);
      }
      const { data: prefix } = await supabase.from('kb_articles')
        .select('id, title').ilike('title', `${String(args.title)}%`).limit(2);
      if (prefix?.length === 1) return prefix[0].id;
      if ((prefix?.length ?? 0) > 1) {
        throw new Error(`Title "${args.title}" is a prefix of ${prefix!.length} articles — pass article_id or slug.`);
      }
    }
    return null;
  }

  if (action === 'update') {
    const { article_id: _aid, slug: _slug, answer, ...rest } = args as any;
    const article_id = await resolveArticleId(args);
    if (!article_id) throw new Error('article_id, slug or title is required (all three are accepted and resolved).');
    // Strip agent-internal underscore-prefixed fields (_caller_user_id,
    // _caller_api_key_id, etc.) and the routing 'action' field — they are
    // not real kb_articles columns and PostgREST rejects them.
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'action') continue;
      if (k.startsWith('_')) continue;
      updateData[k] = v;
    }
    if ('translation_of' in updateData) {
      // Not a column — and silently dropping it would leave the agent believing
      // it linked a translation. Point at the path that actually does that.
      throw new Error('translation_of only works with action=create (it creates a NEW language version). To re-declare THIS article\'s language, pass locale on update.');
    }
    if (updateData.locale !== undefined) {
      const l = normLocale(updateData.locale);
      if (l) updateData.locale = l;
      else delete updateData.locale;
    }
    if (answer !== undefined) {
      if (!answer || (typeof answer === 'string' && !answer.trim())) {
        throw new Error('answer must contain the full article body — empty values are rejected to prevent blank articles.');
      }
      const { answer_text, answer_json } = normalizeKbAnswer(answer);
      updateData.answer_text = answer_text;
      updateData.answer_json = answer_json;
    }
    const { data, error } = await supabase.from('kb_articles')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', article_id).select('id, title, is_published').single();
    if (error) throw new Error(`Update KB article failed: ${error.message}`);
    return {
      article_id: data.id,
      title: data.title,
      status: 'updated',
      is_published: data.is_published === true,
      ...(data.is_published
        ? {}
        : { note: 'Article is still a DRAFT — not indexed, invisible to visitors and chat. Run action=publish or ask an admin to publish.' }),
    };
  }

  if (action === 'publish') {
    const article_id = await resolveArticleId(args);
    if (!article_id) throw new Error('article_id, slug or title is required (all three are accepted and resolved).');
    const { data, error } = await supabase.from('kb_articles')
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq('id', article_id).select('id, title, slug').single();
    if (error) throw new Error(`Publish failed: ${error.message}`);
    return { article_id: data.id, slug: data.slug, status: 'published' };
  }

  if (action === 'unpublish') {
    const article_id = await resolveArticleId(args);
    if (!article_id) throw new Error('article_id, slug or title is required (all three are accepted and resolved).');
    const { data, error } = await supabase.from('kb_articles')
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq('id', article_id).select('id, title').single();
    if (error) throw new Error(`Unpublish failed: ${error.message}`);
    return { article_id: data.id, status: 'unpublished' };
  }

  return { error: `Unknown KB action: ${action}` };
}

// =============================================================================
// Wiki module handlers
// =============================================================================

function toWikiSlug(input: string): string {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')
    .slice(0, 80);
}

async function executeWikiAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'search_wiki') {
    const query = String((args as any).query || '').trim();
    const limit = Math.min(Math.max(Number((args as any).limit) || 10, 1), 50);
    if (!query) return { matches: [] };

    // Word-by-word, not phrase-by-phrase (#99). The old ilike ran the WHOLE
    // query as one substring, so "informationslagren arbetsmodell" found
    // nothing while either word alone found the page — an agent that describes
    // what it wants in its own words got silence and concluded the page did not
    // exist. Terms are ANDed (all must appear somewhere in title or body) and
    // then ranked: title hits over body hits, more matched terms over fewer.
    const terms = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 8);
    if (terms.length === 0) return { matches: [] };

    const runQuery = async (queryTerms: string[]) => {
      let q = supabase.from('wiki_pages').select('slug, title, updated_at, content_md');
      for (const t of queryTerms) {
        const safe = sanitizeOrTerm(t);
        q = q.or(`title.ilike.%${safe}%,content_md.ilike.%${safe}%`);
      }
      // Over-fetch: ranking happens here, so the DB limit must not decide winners.
      return q.limit(Math.max(limit * 5, 50));
    };

    let { data, error } = await runQuery(terms);
    if (error) throw new Error(`search_wiki failed: ${error.message}`);

    // Swedish-compound fallback: "granskningschecklista" is ONE term but the
    // page says "Granskning … checklista" — no substring match anywhere, and a
    // perfectly good query got silence. On zero hits, retry once with each
    // long term shortened to a prefix (compounds share their head word), so
    // the lexical net widens without any intent routing (Law 1: still pure
    // string matching, ranked below by the same scorer).
    // Prefix capped at 8 chars: Swedish head words are short ("granskning"),
    // and a 50% prefix of a long compound overshoots straight past them.
    let effectiveTerms = terms;
    if ((data || []).length === 0 && terms.some((t) => t.length >= 6)) {
      const prefixTerms = terms.map((t) =>
        t.length >= 6 ? t.slice(0, Math.min(8, Math.max(4, Math.ceil(t.length * 0.5)))) : t);
      const retry = await runQuery(prefixTerms);
      if (!retry.error && (retry.data || []).length > 0) {
        data = retry.data;
        // Score with the terms that actually hit, or the strict AND filter
        // below would silently discard every fallback row again.
        effectiveTerms = prefixTerms;
      }
    }

    const lowerTerms = effectiveTerms.map((t) => t.toLowerCase());
    const scored = (data || []).map((p: any) => {
      const title = String(p.title || '').toLowerCase();
      const body = String(p.content_md || '').toLowerCase();
      let score = 0;
      let matched = 0;
      for (const t of lowerTerms) {
        const inTitle = title.includes(t);
        const inBody = body.includes(t);
        if (inTitle || inBody) matched++;
        if (inTitle) score += 10;
        if (inBody) score += 1;
      }
      // Every term must appear somewhere — an OR chain alone would return
      // pages matching a single common word.
      return { p, score, matched };
    })
      .filter((r) => r.matched === lowerTerms.length)
      .sort((a, b) => b.score - a.score);

    // Nothing matched ALL terms → fall back to best partial rather than
    // answering "no such page" when a page is plainly relevant.
    const rows = (scored.length ? scored : (data || [])
      .map((p: any) => {
        const hay = `${String(p.title || '')} ${String(p.content_md || '')}`.toLowerCase();
        const matched = lowerTerms.filter((t) => hay.includes(t)).length;
        return { p, score: matched, matched };
      })
      .filter((r) => r.matched > 0)
      .sort((a, b) => b.score - a.score)).slice(0, limit);

    return {
      matches: rows.map(({ p }) => ({
        slug: p.slug,
        title: p.title,
        updated_at: p.updated_at,
        excerpt: String(p.content_md || '').slice(0, 240),
        url: `/admin/wiki/${p.slug}`,
      })),
    };
  }

  const action = String((args as any).action || 'list');

  // Title → slug resolution, shared by get and update. It used to live inline in
  // `update` only, which meant the read surface was PICKIER than the write
  // surface that follows it: `get` with a title (or a near-miss slug) answered
  // {found:false} and nothing else, while `update` happily resolved the same
  // title. One ladder, both paths.
  const resolveWikiSlug = async (rawSlug: unknown, rawTitle: unknown): Promise<string> => {
    const slug = String(rawSlug || '').trim();
    if (slug) {
      const { data: bySlug } = await supabase
        .from('wiki_pages').select('slug').eq('slug', slug).maybeSingle();
      if (bySlug?.slug) return bySlug.slug;
    }
    // Fall through to title (or the slug read AS a title — agents routinely
    // pass the human name in the slug field).
    const title = String(rawTitle || slug || '').trim();
    if (title) {
      const { data: byTitle } = await supabase
        .from('wiki_pages').select('slug').ilike('title', title).maybeSingle();
      if (byTitle?.slug) return byTitle.slug;
      // Last try: the PascalCase slug the create path would have derived.
      const derived = toWikiSlug(title);
      if (derived) {
        const { data: byDerived } = await supabase
          .from('wiki_pages').select('slug').eq('slug', derived).maybeSingle();
        if (byDerived?.slug) return byDerived.slug;
      }
    }
    return '';
  };

  if (action === 'list') {
    const limit = Math.min(Math.max(Number((args as any).limit) || 50, 1), 200);
    const { data, error } = await supabase
      .from('wiki_pages')
      .select('slug, title, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`list wiki failed: ${error.message}`);
    return { pages: data || [] };
  }

  if (action === 'get') {
    const rawSlug = String((args as any).slug || '');
    const rawTitle = String((args as any).title || '');
    if (!rawSlug && !rawTitle) throw new Error('slug (or title) is required');
    const slug = await resolveWikiSlug(rawSlug, rawTitle);
    if (!slug) {
      // A bare {found:false} with status success is the worst of both worlds:
      // it is not an error the agent must handle, and it carries no next step.
      return {
        found: false,
        slug: rawSlug || undefined,
        title: rawTitle || undefined,
        error: `No wiki page matches ${rawSlug ? `slug "${rawSlug}"` : `title "${rawTitle}"`}.`,
        hint: 'No page with that slug or title. Use action=list or search_wiki to find the right slug.',
      };
    }
    const { data, error } = await supabase
      .from('wiki_pages').select('*').eq('slug', slug).maybeSingle();
    if (error) throw new Error(`get wiki failed: ${error.message}`);
    if (!data) {
      return {
        found: false,
        slug,
        error: `No wiki page with slug "${slug}".`,
        hint: 'No page with that slug or title. Use action=list or search_wiki to find the right slug.',
      };
    }
    return { found: true, ...data };
  }

  if (action === 'create') {
    const title = String((args as any).title || '').trim();
    if (!title) throw new Error('title is required');
    const slug = String((args as any).slug || '').trim() || toWikiSlug(title);
    if (!slug) throw new Error('could not derive slug');
    const content_md = String((args as any).content_md || '').trim();
    if (!content_md) {
      throw new Error('content_md is required and must contain the full markdown body. Empty pages are rejected — pass the actual content, not just a title placeholder.');
    }
    const { data, error } = await supabase
      .from('wiki_pages')
      .insert({
        slug, title, content_md,
        // Provenance: WHO wrote this — human (via the staged-approve rail the
        // caller id travels with the re-invoke) and/or agent surface.
        created_by: (args as any)._caller_user_id ?? null,
        updated_by: (args as any)._caller_user_id ?? null,
        created_by_agent: (args as any)._effective_agent ?? null,
        updated_by_agent: (args as any)._effective_agent ?? null,
      })
      .select('slug, title, updated_at')
      .single();
    if (error) {
      // Slug is the primary key. An agent asked to "write the pitch" reaches
      // for create even when the page exists (FlowWork, PitchPrivatAIForRedeye
      // 2026-08-21) and got raw Postgres 23505. Refuse with the next step —
      // never silently convert to update: overwriting an existing page via
      // 'create' would be the silent-replacement class.
      if ((error as { code?: string }).code === '23505') {
        throw new Error(
          `Wiki page "${slug}" already exists. To change it, use action=update ` +
          `(content_md REPLACES the whole body; append_md ADDS a section) — ` +
          `or choose a new slug for a separate page.`,
        );
      }
      throw new Error(`create wiki failed: ${error.message}`);
    }
    return { ...data, url: `/admin/wiki/${data.slug}`, status: 'created' };
  }

  if (action === 'update') {
    const rawSlug = String((args as any).slug || '');
    const slug = await resolveWikiSlug(rawSlug, (args as any).title);
    if (!slug) {
      throw new Error(
        rawSlug
          ? `No wiki page matches slug "${rawSlug}" (title fallback tried too). Use action=list or search_wiki to find the right slug.`
          : 'slug is required — pass the wiki page slug, or a title that matches an existing page exactly.',
      );
    }
    const patch: Record<string, unknown> = {};
    if (typeof (args as any).title === 'string') patch.title = (args as any).title;
    const appendMd = typeof (args as any).append_md === 'string' ? (args as any).append_md.trim() : '';
    const hasContentMd = typeof (args as any).content_md === 'string';
    if (hasContentMd) {
      const md = (args as any).content_md.trim();
      if (!md) throw new Error('content_md cannot be empty — pass the full markdown body or omit the field to keep existing content.');
      patch.content_md = (args as any).content_md;
    }
    // Additive edits used to be impossible: update is whole-body replacement, so
    // "keep everything and add a section" meant the model regenerated the page
    // from memory — and quietly dropped two sections it had not seen. append_md
    // reads the stored body and concatenates, so nothing existing can be lost.
    // The wiki_page_revisions row is written by the trg_wiki_pages_revision
    // BEFORE UPDATE trigger (20260708070000_wiki-parity-r7.sql), so an append
    // is captured in history exactly like any other update — no extra write.
    let appended = false;
    if (appendMd && !hasContentMd) {
      const { data: existing, error: readErr } = await supabase
        .from('wiki_pages').select('content_md').eq('slug', slug).maybeSingle();
      if (readErr) throw new Error(`update wiki failed: ${readErr.message}`);
      if (!existing) throw new Error(`No wiki page with slug "${slug}" — use action=list or search_wiki to find the right slug.`);
      const base = String(existing.content_md || '').replace(/\s+$/, '');
      patch.content_md = base ? `${base}\n\n${appendMd}` : appendMd;
      appended = true;
    }
    if (Object.keys(patch).length === 0) throw new Error('nothing to update');
    patch.updated_by = (args as any)._caller_user_id ?? null;
    patch.updated_by_agent = (args as any)._effective_agent ?? null;
    const { data, error } = await supabase
      .from('wiki_pages').update(patch).eq('slug', slug)
      .select('slug, title, updated_at').single();
    if (error) throw new Error(`update wiki failed: ${error.message}`);
    return {
      ...data,
      url: `/admin/wiki/${data.slug}`,
      status: 'updated',
      mode: appended ? 'append' : (hasContentMd ? 'replace' : 'metadata'),
      ...(appended ? { note: 'Appended to the end of the existing body — nothing existing was replaced.' } : {}),
      ...(hasContentMd && appendMd ? { note: 'content_md was sent, so the WHOLE body was replaced; append_md was ignored.' } : {}),
    };
  }

  if (action === 'delete') {
    const slug = String((args as any).slug || '');
    if (!slug) throw new Error('slug is required');
    const { error } = await supabase.from('wiki_pages').delete().eq('slug', slug);
    if (error) throw new Error(`delete wiki failed: ${error.message}`);
    return { slug, status: 'deleted' };
  }

  return { error: `Unknown wiki action: ${action}` };
}

// ─────────────────────────────────────────────────────────────
// River — internal social feed
// ─────────────────────────────────────────────────────────────
async function executeRiverAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'search_river') {
    const query = String((args as any).query || '').trim();
    const limit = Math.min(Math.max(Number((args as any).limit) || 10, 1), 50);
    if (!query) return { matches: [] };
    const { data, error } = await supabase
      .from('river_posts')
      .select('id, body, author_id, created_at, parent_id, reaction_count, reply_count')
      .ilike('body', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`search_river failed: ${error.message}`);
    return {
      matches: (data || []).map((p: any) => ({
        id: p.id,
        author_id: p.author_id,
        created_at: p.created_at,
        parent_id: p.parent_id,
        excerpt: String(p.body || '').slice(0, 240),
        reactions: p.reaction_count,
        replies: p.reply_count,
      })),
    };
  }

  const action = String((args as any).action || 'list');

  if (action === 'list') {
    const limit = Math.min(Math.max(Number((args as any).limit) || 20, 1), 100);
    const { data, error } = await supabase
      .from('river_posts')
      .select('id, body, author_id, created_at, parent_id, pinned, reaction_count, reply_count, media_urls')
      .is('parent_id', null)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`list river failed: ${error.message}`);
    return { posts: data || [] };
  }

  if (action === 'create' || action === 'reply') {
    const body = String((args as any).body || '').trim();
    if (!body) throw new Error('body is required');
    const parent_id = action === 'reply' ? String((args as any).parent_id || '') : null;
    if (action === 'reply' && !parent_id) throw new Error('parent_id is required for reply');
    const mediaInput = (args as any).media_urls;
    const media_urls = Array.isArray(mediaInput)
      ? mediaInput.filter((u: unknown) => typeof u === 'string')
      : [];

    // System-post dedup (River incident 2026-08-23→28: four near-identical ⚠️
    // posts in five days, same alert with fresher numbers each time). This
    // handler is the agent path — human posts hit river_posts directly via the
    // UI/RLS — so every top-level create here is a system post: if its
    // fingerprint (normalized body, digits ignored) matches a post from the
    // last DEDUP_WINDOW_DAYS days, UPDATE that post instead of creating a new
    // one. Replies are conversation, never deduped.
    if (action === 'create') {
      const windowStart = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentPosts } = await supabase
        .from('river_posts')
        .select('id, body, created_at')
        .is('parent_id', null)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: false })
        .limit(50);
      const duplicate = (recentPosts || []).find((p: any) => isSameRiverPost(p.body, body));
      if (duplicate) {
        const patch: Record<string, unknown> = { body };
        if (media_urls.length > 0) patch.media_urls = media_urls;
        const { data: updated, error: updErr } = await supabase
          .from('river_posts')
          .update(patch)
          .eq('id', duplicate.id)
          .select('id, body, author_id, parent_id, created_at')
          .single();
        if (updErr) throw new Error(`update deduped river post failed: ${updErr.message}`);
        return {
          ...updated,
          status: 'updated_existing',
          deduped: true,
          note: `An equivalent post from ${duplicate.created_at} already existed (same fingerprint within ${DEDUP_WINDOW_DAYS} days) — it was updated in place instead of creating a duplicate.`,
        };
      }
    }

    const insert: Record<string, unknown> = { body, media_urls };
    if (parent_id) insert.parent_id = parent_id;

    // river_posts.author_id is `DEFAULT auth.uid() NOT NULL`, so service-role
    // (autonomous MCP) writes — which have no auth.uid() — hit the NOT NULL
    // constraint. Resolve an author explicitly: the forwarded caller user, else
    // the owner of the calling API key, else a site admin as a last resort. This
    // mirrors how other MCP-originated writes set author_id from _caller_user_id.
    let authorId = (args as any)._caller_user_id as string | undefined;
    if (!authorId && (args as any)._caller_api_key_id) {
      const { data: key } = await supabase
        .from('api_keys').select('created_by').eq('id', (args as any)._caller_api_key_id).maybeSingle();
      authorId = (key as any)?.created_by ?? undefined;
    }
    if (!authorId) {
      const { data: admin } = await supabase
        .from('user_roles').select('user_id').eq('role', 'admin').limit(1).maybeSingle();
      authorId = (admin as any)?.user_id ?? undefined;
    }
    if (authorId) insert.author_id = authorId;

    const { data, error } = await supabase
      .from('river_posts')
      .insert(insert)
      .select('id, body, author_id, parent_id, created_at')
      .single();
    if (error) throw new Error(`create river post failed: ${error.message}`);
    return { ...data, status: 'created' };
  }

  if (action === 'pin' || action === 'unpin') {
    const id = String((args as any).id || '');
    if (!id) throw new Error('id is required');
    const { data, error } = await supabase
      .from('river_posts')
      .update({ pinned: action === 'pin' })
      .eq('id', id)
      .select('id, pinned')
      .single();
    if (error) throw new Error(`${action} failed: ${error.message}`);
    return { ...data, status: action === 'pin' ? 'pinned' : 'unpinned' };
  }

  if (action === 'delete') {
    const id = String((args as any).id || '');
    if (!id) throw new Error('id is required');
    const { error } = await supabase.from('river_posts').delete().eq('id', id);
    if (error) throw new Error(`delete failed: ${error.message}`);
    return { id, status: 'deleted' };
  }

  return { error: `Unknown river action: ${action}` };
}

// =============================================================================
// Global Blocks module handlers
// =============================================================================

async function executeGlobalBlocksAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', slot, block_data, category } = args as any;

  if (action === 'list') {
    let query = supabase.from('global_blocks')
      .select('id, slot, type, data, category, is_active, updated_at');
    if (typeof category === 'string' && category.trim()) {
      query = query.eq('category', category.trim());
    }
    const { data, error } = await query;
    if (error) throw new Error(`List global blocks failed: ${error.message}`);
    return { global_blocks: data || [] };
  }

  if (action === 'get' && slot) {
    const { data, error } = await supabase.from('global_blocks')
      .select('*').eq('slot', slot).maybeSingle();
    if (error) throw new Error(`Get global block failed: ${error.message}`);
    return data || { slot, exists: false };
  }

  if (action === 'update' && slot) {
    const hasCategory = typeof category === 'string';
    if (!block_data && !hasCategory) throw new Error('block_data or category is required');
    const { data: existing } = await supabase.from('global_blocks')
      .select('id, data').eq('slot', slot).maybeSingle();

    if (existing) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (block_data) updates.data = { ...existing.data, ...block_data };
      if (hasCategory) updates.category = category.trim() || null;
      const { data, error } = await supabase.from('global_blocks')
        .update(updates)
        .eq('id', existing.id).select('id, slot, type').single();
      if (error) throw new Error(`Update global block failed: ${error.message}`);
      return { id: data.id, slot: data.slot, status: 'updated' };
    } else {
      const { block_type = slot === 'header' ? 'header' : 'footer' } = args as any;
      const { data, error } = await supabase.from('global_blocks').insert({
        slot, type: block_type, data: block_data || {}, is_active: true,
        category: hasCategory ? (category.trim() || null) : null,
      }).select('id, slot, type').single();
      if (error) throw new Error(`Create global block failed: ${error.message}`);
      return { id: data.id, slot: data.slot, status: 'created' };
    }
  }

  if (action === 'toggle' && slot) {
    const { data: existing } = await supabase.from('global_blocks')
      .select('id, is_active').eq('slot', slot).single();
    if (!existing) throw new Error(`No global block in slot: ${slot}`);
    const { data, error } = await supabase.from('global_blocks')
      .update({ is_active: !existing.is_active, updated_at: new Date().toISOString() })
      .eq('id', existing.id).select('id, slot, is_active').single();
    if (error) throw new Error(`Toggle failed: ${error.message}`);
    return { id: data.id, slot: data.slot, is_active: data.is_active };
  }

  return { error: `Unknown global blocks action: ${action}` };
}

// =============================================================================
// Deals module handlers
// =============================================================================

async function executeDealsAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // ── deal_stale_check skill (MCP-exposed, agent-independent) ──
  if (skillName === 'deal_stale_check') {
    const { days_threshold = 14 } = args as any;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days_threshold));

    const { data, error } = await supabase
      .from('deals')
      .select('id, stage, value_cents, currency, lead_id, expected_close, updated_at, notes, product:products(name), lead:leads(id, name, email, company:companies(id, name))')
      .not('stage', 'in', '(closed_won,closed_lost)')
      .lt('updated_at', cutoff.toISOString())
      .order('updated_at', { ascending: true })
      .limit(50);

    if (error) throw new Error(`Stale deals query failed: ${error.message}`);

    const now = Date.now();
    const stale = (data || []).map((d: any) => {
      const daysIdle = Math.floor((now - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24));
      return {
        deal_id: d.id,
        stage: d.stage,
        value_cents: d.value_cents,
        currency: d.currency,
        lead_id: d.lead_id,
        contact_name: d.lead?.name || d.lead?.email || null,
        company_name: d.lead?.company?.name || null,
        product_name: d.product?.name || null,
        expected_close: d.expected_close,
        days_idle: daysIdle,
        recommendation: daysIdle > 30
          ? 'Consider closing as lost or escalating'
          : daysIdle > 21
            ? 'Send a check-in email or schedule a call'
            : 'Add a follow-up activity',
      };
    });

    const total_value = stale.reduce((sum, d) => sum + d.value_cents, 0);
    return {
      threshold_days: days_threshold,
      stale_count: stale.length,
      total_value_at_risk_cents: total_value,
      deals: stale,
    };
  }

  // Argument-name tolerance (Agent Contract Integrity layer 1): MCP peers commonly send
  // `id`, `deal_stage`, or `pipeline_stage` — map them to the canonical names so the
  // handler doesn't silently ignore them.
  const a = args as any;
  if (a.id !== undefined && a.deal_id === undefined) a.deal_id = a.id;
  if (a.deal_stage !== undefined && a.stage === undefined) a.stage = a.deal_stage;
  if (a.pipeline_stage !== undefined && a.stage === undefined) a.stage = a.pipeline_stage;

  const { action = 'list' } = args as any;

  // Normalize friendly stage aliases to canonical deal_stage enum values.
  // External agents commonly send "won"/"lost"/"new"/"open" — map them so we don't
  // explode at the DB enum check.
  const DEAL_STAGE_ALIASES: Record<string, string> = {
    won: 'closed_won', closed: 'closed_won', closedwon: 'closed_won', 'closed-won': 'closed_won',
    lost: 'closed_lost', closedlost: 'closed_lost', 'closed-lost': 'closed_lost',
    new: 'lead', open: 'lead', cold: 'lead',
    warm: 'prospecting', discovery: 'prospecting',
    qualifying: 'qualified', sql: 'qualified',
    quote: 'proposal', quoted: 'proposal', proposed: 'proposal',
    negotiating: 'negotiation',
  };
  const normalizeDealStage = (v: unknown): string | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const key = String(v).trim().toLowerCase().replace(/\s+/g, '_');
    return DEAL_STAGE_ALIASES[key] ?? key;
  };
  // Re-normalize stage in args once so create/update/move_stage all benefit.
  if ((args as any).stage !== undefined) {
    const norm = normalizeDealStage((args as any).stage);
    if (norm) (args as any).stage = norm;
  }
  // Hard guard against unknown enum values reaching Postgres.
  const VALID_DEAL_STAGES = new Set([
    'lead', 'prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost',
  ]);
  if ((args as any).stage !== undefined && !VALID_DEAL_STAGES.has((args as any).stage)) {
    throw new Error(
      `Invalid deal stage: "${(args as any).stage}". Valid stages: ${[...VALID_DEAL_STAGES].join(', ')}. ` +
      `Friendly aliases (won/lost/new/open/etc.) are auto-normalized — see DEAL_STAGE_ALIASES.`
    );
  }

  if (action === 'list') {
    const { stage, lead_id } = args as any;
    let query = supabase.from('deals')
      .select('id, value_cents, currency, stage, lead_id, product_id, expected_close, notes, closed_at, lost_reason, lost_note, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(50);
    if (stage) query = query.eq('stage', stage);
    if (lead_id) query = query.eq('lead_id', lead_id);
    const { data, error } = await query;
    if (error) throw new Error(`List deals failed: ${error.message}`);
    return { deals: data || [] };
  }

  if (action === 'get') {
    const { deal_id } = args as any;
    if (!deal_id) throw new Error('deal_id is required for get');
    const { data, error } = await supabase.from('deals')
      .select('*').eq('id', deal_id).maybeSingle();
    if (error) throw new Error(`Get deal failed: ${error.message}`);
    if (!data) {
      return { found: false, error: `Deal ${deal_id} not found` };
    }
    return data;
  }

  if (action === 'create') {
    const { value_cents = 0, currency = 'SEK', stage = 'proposal', product_id, expected_close, notes, company_id, company_name, lead_name, lead_email } = args as any;
    let { lead_id } = args as any;
    let auto_created_lead = false;

    // Auto-resolve a lead when no lead_id supplied. Strategy:
    //  1. If company_id/company_name → reuse latest lead for that company, else create one.
    //  2. If lead_email → reuse the existing lead with that email (case-insensitive),
    //     else create a real lead carrying that email. Never a duplicate.
    //  3. If only lead_name → placeholder lead with a synthetic email (a deliberate
    //     contactless opportunity, e.g. ingested from news before a contact exists).
    //  4. Nothing at all → self-correcting error. Fabricating a phantom contact on
    //     bad args teaches the calling agent nothing and fills the CRM with
    //     @auto.flowwink.local ghosts (found live via process-QA 2026-08-11).
    if (!lead_id) {
      let resolvedCompanyId: string | null = company_id || null;
      let resolvedCompanyName: string | null = company_name || null;
      if (!resolvedCompanyId && company_name) {
        const { data: comp } = await supabase
          .from('companies').select('id, name').ilike('name', `%${company_name}%`).limit(1).maybeSingle();
        if (comp) { resolvedCompanyId = comp.id; resolvedCompanyName = comp.name; }
      }
      if (resolvedCompanyId) {
        const { data: existing } = await supabase
          .from('leads').select('id').eq('company_id', resolvedCompanyId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (existing) lead_id = existing.id;
      }
      if (!lead_id && lead_email) {
        // ilike with no wildcards = case-insensitive exact match.
        const { data: byEmail } = await supabase
          .from('leads').select('id').ilike('email', lead_email)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (byEmail) lead_id = byEmail.id;
      }
      if (!lead_id) {
        if (!resolvedCompanyId && !lead_email && !lead_name) {
          throw new Error(
            'manage_deal create needs a contact anchor: pass lead_id (existing lead UUID), ' +
            'company_id/company_name (deal anchored to a company), or lead_email/lead_name ' +
            '(existing lead reused by email, otherwise created). ' +
            'Refusing to fabricate a placeholder contact.'
          );
        }
        const baseName = lead_name || resolvedCompanyName || 'Auto-generated lead';
        const safeSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lead';
        const fallbackEmail = lead_email || `deal-${safeSlug}-${Date.now()}@auto.flowwink.local`;
        const { data: newLead, error: leadErr } = await supabase
          .from('leads').insert({
            name: baseName,
            email: fallbackEmail,
            company_id: resolvedCompanyId,
            source: 'agent_deal',
            status: 'opportunity',
          }).select('id').single();
        if (leadErr) throw new Error(`Auto-lead creation failed: ${leadErr.message}`);
        lead_id = newLead.id;
        auto_created_lead = true;
      }
    }

    const { data, error } = await supabase.from('deals').insert({
      value_cents, currency, stage, lead_id, product_id, expected_close, notes,
    }).select('id, stage, value_cents, lead_id').single();
    if (error) throw new Error(`Create deal failed: ${error.message}`);
    return { deal_id: data.id, stage: data.stage, value_cents: data.value_cents, lead_id: data.lead_id, auto_created_lead };
  }

  // Lost discipline (Odoo pattern): when a deal transitions to closed_lost,
  // lost_reason/lost_note are stored; any transition to a non-lost stage
  // clears them (re-open). Shared by update + move_stage below.
  const applyLostDiscipline = (updateData: Record<string, unknown>, stage: unknown, rest: any) => {
    if (stage === undefined) return;
    if (stage === 'closed_lost') {
      if (rest.lost_reason !== undefined) updateData.lost_reason = rest.lost_reason;
      if (rest.lost_note !== undefined) updateData.lost_note = rest.lost_note;
    } else {
      updateData.lost_reason = null;
      updateData.lost_note = null;
    }
  };

  if (action === 'update') {
    const { deal_id, ...rest } = args as any;
    if (!deal_id) throw new Error('deal_id is required');
    // Strip injected/system fields and unknown keys — only allow real columns
    const allowed = ['value_cents', 'currency', 'stage', 'product_id', 'expected_close', 'notes', 'closed_at', 'lost_reason', 'lost_note'];
    const updateData: Record<string, unknown> = {};
    for (const k of allowed) {
      if (rest[k] !== undefined) updateData[k] = rest[k];
    }
    if (Object.keys(updateData).length === 0) {
      throw new Error('No updatable fields provided');
    }
    if (rest.stage !== undefined && rest.closed_at === undefined) {
      // Keep closed_at consistent with the stage transition (mirrors the admin UI).
      updateData.closed_at = ['closed_won', 'closed_lost'].includes(rest.stage)
        ? new Date().toISOString() : null;
    }
    applyLostDiscipline(updateData, rest.stage, rest);
    updateData.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('deals')
      .update(updateData)
      .eq('id', deal_id).select('id, stage, lost_reason').single();
    if (error) throw new Error(`Update deal failed: ${error.message}`);
    return { deal_id: data.id, stage: data.stage, status: 'updated', ...(data.lost_reason ? { lost_reason: data.lost_reason } : {}) };
  }

  if (action === 'move_stage') {
    const { deal_id, stage, ...rest } = args as any;
    if (!deal_id || !stage) throw new Error('deal_id and stage required');
    const closed_at = ['closed_won', 'closed_lost'].includes(stage) ? new Date().toISOString() : null;
    const updateData: Record<string, unknown> = { stage, closed_at, updated_at: new Date().toISOString() };
    applyLostDiscipline(updateData, stage, rest);
    const { data, error } = await supabase.from('deals')
      .update(updateData)
      .eq('id', deal_id).select('id, stage, lost_reason').single();
    if (error) throw new Error(`Move stage failed: ${error.message}`);
    return { deal_id: data.id, new_stage: data.stage, ...(data.lost_reason ? { lost_reason: data.lost_reason } : {}) };
  }

  if (action === 'delete') {
    return {
      error: `Deals are never deleted (audit trail). Use action='move_stage' with stage='closed_lost' to drop the opportunity, or action='update' to amend it.`,
    };
  }

  return { error: `Unknown deals action: ${action}. Supported: list, create, update, move_stage. To "delete" a deal use move_stage → closed_lost (audit-preserving).` };
}

// =============================================================================
// Products module handlers
// =============================================================================

async function executeProductsAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // browse_products — visitor-facing
  if (skillName === 'browse_products') {
    const { search, type } = args as any;
    let query = supabase.from('products')
      .select('id, name, description, price_cents, currency, type, image_url, stock_quantity, track_inventory')
      .eq('is_active', true)
      .order('created_at', { ascending: false }).limit(20);
    if (type) query = query.eq('type', type);
    if (search) query = query.ilike('name', `%${search}%`);
    const { data, error } = await query;
    if (error) throw new Error(`Browse products failed: ${error.message}`);
    return { products: (data || []).map((p: any) => ({
      ...p,
      in_stock: !p.track_inventory || (p.stock_quantity !== null && p.stock_quantity > 0),
    })) };
  }

  // manage_inventory
  if (skillName === 'manage_inventory') {
    const { product_id, quantity, threshold, reason } = args as any;
    // The tool_definition used to advertise `low_stock`, which no branch here
    // answers to — the skill's own contract sent every caller that trusted it
    // into "Unknown inventory action". The enum now names the real branches;
    // the alias keeps the old contract working for anything that cached it.
    const rawAction = String((args as any).action ?? 'list_stock');
    const action = rawAction === 'low_stock' ? 'low_stock_alerts' : rawAction;

    if (action === 'list_stock') {
      const { data, error } = await supabase.from('products')
        .select('id, name, stock_quantity, track_inventory, low_stock_threshold, allow_backorder, is_active')
        .eq('track_inventory', true)
        .order('stock_quantity', { ascending: true });
      if (error) throw new Error(`List stock failed: ${error.message}`);
      return { products: data || [] };
    }

    if (action === 'update_stock' && product_id) {
      // update_stock sets an ABSOLUTE quantity. Doing that with a bare UPDATE
      // left no trace at all: the balance jumped and nothing said who moved it,
      // when, or why — a stock ledger with a hole in it. Read the old value,
      // write the new one, and record the difference as an adjustment move.
      const { data: before, error: beforeErr } = await supabase.from('products')
        .select('id, name, stock_quantity').eq('id', product_id).maybeSingle();
      if (beforeErr) throw new Error(`Update stock failed: ${beforeErr.message}`);
      if (!before) throw new Error(`Product ${product_id} not found`);

      const updateData: any = { updated_at: new Date().toISOString() };
      if (quantity !== undefined) updateData.stock_quantity = quantity;
      if (threshold !== undefined) updateData.low_stock_threshold = threshold;
      const { data, error } = await supabase.from('products')
        .update(updateData).eq('id', product_id)
        .select('id, name, stock_quantity, low_stock_threshold').single();
      if (error) throw new Error(`Update stock failed: ${error.message}`);

      let adjustment: number | null = null;
      if (quantity !== undefined) {
        adjustment = Number(quantity) - Number(before.stock_quantity ?? 0);
        if (adjustment !== 0) {
          const { error: moveErr } = await supabase.from('stock_moves').insert({
            product_id,
            quantity: adjustment,
            move_type: 'adjustment',
            reference_type: 'manual_adjustment',
            reference_id: product_id,
            notes: (typeof reason === 'string' && reason.trim())
              ? reason.trim()
              : 'manual adjustment via agent',
          });
          // The adjustment is the audit trail — a balance that moved without one
          // is the bug this fixes, so say so instead of swallowing it.
          if (moveErr) throw new Error(`Stock adjusted but the audit move failed: ${moveErr.message}`);
        }
      }

      return {
        product_id: data.id,
        name: data.name,
        stock_quantity: data.stock_quantity,
        previous_stock_quantity: before.stock_quantity,
        adjustment,
        status: 'updated',
      };
    }

    if (action === 'low_stock_alerts') {
      const { data, error } = await supabase.from('products')
        .select('id, name, stock_quantity, low_stock_threshold')
        .eq('track_inventory', true)
        .eq('is_active', true);
      if (error) throw new Error(`Low stock query failed: ${error.message}`);
      const lowStock = (data || []).filter((p: any) =>
        p.stock_quantity !== null && p.stock_quantity <= (p.low_stock_threshold || 5)
      );
      return { low_stock_products: lowStock, count: lowStock.length };
    }

    if (action === 'back_in_stock_requests') {
      const { data, error } = await supabase.from('back_in_stock_requests')
        .select('id, email, product_id, created_at, notified_at')
        .is('notified_at', null)
        .order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error(`Back in stock query failed: ${error.message}`);
      return { requests: data || [] };
    }

    // Name what IS valid. "Unknown action: X" tells a caller it was wrong
    // without telling it what right looks like — a whole extra round to learn
    // something we already know.
    return {
      error: `Unknown inventory action: ${rawAction}`,
      valid_actions: ['list_stock', 'update_stock', 'low_stock_alerts', 'back_in_stock_requests'],
      hint: action === 'update_stock'
        ? 'update_stock also requires product_id.'
        : 'Pass one of valid_actions as "action". ("low_stock" is accepted as an alias for "low_stock_alerts".)',
    };
  }

  // manage_product — original CRUD
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { is_active } = args as any;
    let query = supabase.from('products')
      .select('id, name, description, price_cents, currency, type, is_active, stock_quantity, track_inventory, image_url, weight_grams, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (is_active !== undefined) query = query.eq('is_active', is_active);
    const { data, error } = await query;
    if (error) throw new Error(`List products failed: ${error.message}`);
    return { products: data || [] };
  }

  if (action === 'create') {
    const {
      name, description, price_cents, currency = 'SEK', type = 'one_time',
      image_url, stripe_price_id, weight_grams,
      // Inventory fields. Omitting these from the create allowlist meant a
      // product could never be BORN stocked: an agent had to create it, then
      // find it again, then update it — and until it did, the product looked
      // untracked to the storefront, the low-stock alert and the reorder loop.
      track_inventory, low_stock_threshold, allow_backorder, stock_quantity,
      barcode, cost_cents, category_id,
    } = args as any;
    if (!name || price_cents === undefined) throw new Error('name and price_cents required');
    const insertData: Record<string, unknown> = {
      name, description, price_cents, currency, type,
      image_url, stripe_price_id, is_active: true,
      // null/undefined = non-shippable service/digital product
      weight_grams: weight_grams ?? null,
    };
    // Only send what the caller actually set — the columns carry their own
    // defaults (track_inventory false, low_stock_threshold 5, allow_backorder
    // false) and an explicit undefined would fight them.
    if (track_inventory !== undefined) insertData.track_inventory = track_inventory;
    if (low_stock_threshold !== undefined) insertData.low_stock_threshold = low_stock_threshold;
    if (allow_backorder !== undefined) insertData.allow_backorder = allow_backorder;
    if (stock_quantity !== undefined) insertData.stock_quantity = stock_quantity;
    if (barcode !== undefined) insertData.barcode = barcode;
    if (cost_cents !== undefined) insertData.cost_cents = cost_cents;
    if (category_id !== undefined) insertData.category_id = category_id;

    const { data, error } = await supabase.from('products').insert(insertData)
      .select('id, name, price_cents, stock_quantity, track_inventory').single();
    if (error) throw new Error(`Create product failed: ${error.message}`);
    return {
      product_id: data.id,
      name: data.name,
      price_cents: data.price_cents,
      stock_quantity: data.stock_quantity,
      track_inventory: data.track_inventory,
    };
  }

  if (action === 'update') {
    let { product_id, ...rest } = args as any;
    // Write/read identifier parity (#99): the caller may hold a NAME from a
    // list/browse call — resolve it instead of demanding the id back.
    if (!product_id && typeof rest.name === 'string' && rest.name.trim()) {
      const { data: byName } = await supabase
        .from('products').select('id').eq('name', rest.name.trim()).limit(2);
      if (byName && byName.length === 1) {
        product_id = byName[0].id;
        // Only consume the name as an identifier — if the caller ALSO meant to
        // rename, they pass product_id + name, which skips this branch.
        delete rest.name;
      } else if (byName && byName.length > 1) {
        throw new Error(`Product name "${rest.name}" is ambiguous — pass product_id`);
      }
    }
    if (!product_id) throw new Error('product_id (or a unique name) is required');
    // Strip agent-internal fields (_caller_api_key_id, _caller_user_id, …) and
    // the routing `action` so they never reach the products update — otherwise
    // PostgREST rejects with "Could not find the '_caller_api_key_id' column".
    const updateData = stripInternalFields(rest);
    delete updateData.action;
    const { data, error } = await supabase.from('products')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', product_id).select('id, name, is_active').single();
    if (error) throw new Error(`Update product failed: ${error.message}`);
    return { product_id: data.id, name: data.name, status: 'updated' };
  }

  return { error: `Unknown products action: ${action}` };
}

// =============================================================================
// Companies module handlers
// =============================================================================

async function executeCompaniesAction(
  supabase: SupabaseClient,
  _skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list') {
    const { data, error } = await supabase.from('companies')
      .select('id, name, domain, industry, size, address, phone, website, notes, org_number, vat_number, parent_company_id, employee_count, annual_revenue_cents, credit_limit_cents, tags, lifecycle_stage, created_at')
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(`List companies failed: ${error.message}`);
    return { companies: data || [] };
  }

  if (action === 'create') {
    const { name, domain, industry, size, address, phone, website, notes,
      org_number, vat_number, parent_company_id, employee_count,
      annual_revenue_cents, credit_limit_cents, account_owner, tags } = args as any;
    if (!name) throw new Error('name is required');
    const { data, error } = await supabase.from('companies').insert({
      name, domain, industry, size, address, phone, website, notes,
      org_number, vat_number, parent_company_id, employee_count,
      annual_revenue_cents, credit_limit_cents, account_owner, tags,
    }).select('id, name, domain').single();
    if (error) throw new Error(`Create company failed: ${error.message}`);
    return { company_id: data.id, name: data.name, domain: data.domain };
  }

  if (action === 'update') {
    const { company_id, ...updateData } = args as any;
    if (!company_id) throw new Error('company_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('companies')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', company_id).select('id, name').single();
    if (error) throw new Error(`Update company failed: ${error.message}`);
    return { company_id: data.id, name: data.name, status: 'updated' };
  }

  if (action === 'delete') {
    const { company_id } = args as any;
    if (!company_id) throw new Error('company_id is required');
    const { error } = await supabase.from('companies').delete().eq('id', company_id);
    if (error) throw new Error(`Delete company failed: ${error.message}`);
    return { company_id, status: 'deleted' };
  }

  return { error: `Unknown companies action: ${action}` };
}

// =============================================================================
// Forms module handlers
// =============================================================================

async function executeFormsAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  // manage_form — forms are FormBlocks inside pages.content_json (there is no forms
  // table), so read the definitions from there. Gives agents form context: fields,
  // which page, submission counts, and submission→lead conversion.
  if (skillName === 'manage_form') {
    const { data: pages, error: pErr } = await supabase
      .from('pages')
      .select('id, slug, title, status, content_json');
    if (pErr) throw new Error(`Load pages failed: ${pErr.message}`);

    type FormInfo = {
      block_id: string; title: string; page_id: string; page_slug: string;
      page_title: string; status: string;
      fields: { label: string; type: string; required: boolean }[];
    };
    const forms: FormInfo[] = [];
    for (const pg of pages || []) {
      const blocks = Array.isArray((pg as any).content_json) ? (pg as any).content_json : [];
      for (const b of blocks as any[]) {
        if (b?.type === 'form' && b?.id) {
          forms.push({
            block_id: b.id,
            title: b.data?.title || 'Untitled form',
            page_id: (pg as any).id,
            page_slug: (pg as any).slug,
            page_title: (pg as any).title,
            status: (pg as any).status,
            fields: (b.data?.fields || []).map((f: any) => ({
              label: f.label, type: f.type, required: !!f.required,
            })),
          });
        }
      }
    }

    // Submission counts per block_id (single query, counted in memory).
    const { data: subs } = await supabase.from('form_submissions').select('block_id');
    const subCount: Record<string, number> = {};
    for (const s of subs || []) subCount[(s as any).block_id] = (subCount[(s as any).block_id] || 0) + 1;

    if (action === 'get') {
      const { block_id } = args as any;
      if (!block_id) throw new Error('block_id is required for get (use action:list to find it)');
      const form = forms.find((f) => f.block_id === block_id);
      if (!form) return { error: `No form block found with id ${block_id}` };
      const { count: leadCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'form')
        .eq('source_id', block_id);
      const submissions = subCount[block_id] || 0;
      return {
        form: { ...form, field_count: form.fields.length, url: `/${form.page_slug}` },
        submissions,
        leads_converted: leadCount || 0,
        conversion_rate_pct: submissions ? Math.round(((leadCount || 0) / submissions) * 100) : 0,
      };
    }

    // default: list every form across pages with submission counts
    return {
      forms: forms.map((f) => ({
        block_id: f.block_id, title: f.title, page: f.page_slug,
        page_title: f.page_title, status: f.status,
        field_count: f.fields.length, submissions: subCount[f.block_id] || 0,
      })),
      count: forms.length,
    };
  }

  if (action === 'list') {
    const { form_name, limit = 50 } = args as any;
    let query = supabase.from('form_submissions')
      .select('id, form_name, block_id, data, metadata, page_id, created_at')
      .order('created_at', { ascending: false }).limit(limit);
    if (form_name) query = query.eq('form_name', form_name);
    const { data, error } = await query;
    if (error) throw new Error(`List submissions failed: ${error.message}`);
    return { submissions: data || [] };
  }

  if (action === 'get') {
    const { submission_id } = args as any;
    if (!submission_id) throw new Error('submission_id is required');
    const { data, error } = await supabase.from('form_submissions')
      .select('*').eq('id', submission_id).maybeSingle();
    if (error) throw new Error(`Get submission failed: ${error.message}`);
    if (!data) return { found: false, error: `Submission ${submission_id} not found` };
    return data;
  }

  if (action === 'delete') {
    const { submission_id } = args as any;
    if (!submission_id) throw new Error('submission_id is required');
    const { error } = await supabase.from('form_submissions').delete().eq('id', submission_id);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    return { submission_id, status: 'deleted' };
  }

  if (action === 'stats') {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await supabase.from('form_submissions')
      .select('form_name, created_at')
      .gte('created_at', since.toISOString());
    if (error) throw new Error(`Form stats failed: ${error.message}`);
    const submissions = data || [];
    const byForm: Record<string, number> = {};
    for (const s of submissions) {
      byForm[s.form_name || 'unknown'] = (byForm[s.form_name || 'unknown'] || 0) + 1;
    }
    return { period_days: 30, total: submissions.length, by_form: byForm };
  }

  return { error: `Unknown forms action: ${action}` };
}

// =============================================================================
// Webinars module handlers
// =============================================================================

async function executeWebinarsAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list' } = args as any;

  if (action === 'list' || action === 'list_upcoming') {
    // The webinars table's datetime column is `date` (not scheduled_at).
    let query = supabase.from('webinars')
      .select('id, title, description, date, platform, meeting_url, status, max_attendees, created_at')
      .order('date', { ascending: false }).limit(50);
    if (action === 'list_upcoming') {
      // "Upcoming" = future date, not yet completed/cancelled (valid statuses
      // are draft/published/live/completed/cancelled — there is no 'upcoming').
      query = query.gte('date', new Date().toISOString())
        .not('status', 'in', '("completed","cancelled")')
        .order('date', { ascending: true });
    }
    const { data, error } = await query;
    if (error) throw new Error(`List webinars failed: ${error.message}`);
    return { webinars: data || [] };
  }

  if (action === 'register') {
    const { webinar_id, name, email, phone } = args as any;
    if (!webinar_id || !name || !email) throw new Error('webinar_id, name, and email required');
    const { data, error } = await supabase.from('webinar_registrations').insert({
      webinar_id, name, email, phone: phone || null,
    }).select('id, name, email').single();
    if (error) throw new Error(`Registration failed: ${error.message}`);
    return { registration_id: data.id, name: data.name, email: data.email, status: 'registered' };
  }

  if (action === 'create') {
    const { title, description, platform = 'google_meet', meeting_url, max_attendees } = args as any;
    // Accept `date` or the legacy `scheduled_at` arg name; the column is `date`.
    const date = (args as any).date ?? (args as any).scheduled_at;
    if (!title || !date) throw new Error('title and date required');
    const { data, error } = await supabase.from('webinars').insert({
      title, description, date, platform, meeting_url,
      max_attendees, status: 'published',
    }).select('id, title, date, status').single();
    if (error) throw new Error(`Create webinar failed: ${error.message}`);
    return { webinar_id: data.id, title: data.title, date: data.date };
  }

  if (action === 'update') {
    const { webinar_id, ...updateData } = args as any;
    if (!webinar_id) throw new Error('webinar_id is required');
    delete updateData.action;
    const { data, error } = await supabase.from('webinars')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', webinar_id).select('id, title, status').single();
    if (error) throw new Error(`Update webinar failed: ${error.message}`);
    return { webinar_id: data.id, title: data.title, status: 'updated' };
  }

  if (action === 'registrations') {
    // Declared in the skill schema since day one but never implemented —
    // operators could register attendees yet not review them (found live
    // 2026-07-05 while verifying the reminder markers).
    const { webinar_id, limit = 100 } = args as any;
    if (!webinar_id) throw new Error('webinar_id is required for registrations');
    const { data, error } = await supabase.from('webinar_registrations')
      .select('id, webinar_id, name, email, phone, lead_id, registered_at, attended, follow_up_sent, reminder_confirm_sent_at, reminder_t24_sent_at, reminder_t1_sent_at, reminder_post_sent_at')
      .eq('webinar_id', webinar_id)
      .order('registered_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`List registrations failed: ${error.message}`);
    return { registrations: data || [], count: (data || []).length };
  }

  return { error: `Unknown webinars action: ${action}` };
}

// =============================================================================
// Blog module — full handler with browse, categories, write
// =============================================================================

async function executeBlogAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // browse_blog — list published posts for visitors
  if (skillName === 'browse_blog') {
    const { search, limit = 5 } = args as any;
    let query = supabase.from('blog_posts')
      .select('id, title, slug, excerpt, featured_image, published_at, reading_time_minutes')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(limit);
    if (search) query = query.ilike('title', `%${search}%`);
    const { data, error } = await query;
    if (error) throw new Error(`Browse blog failed: ${error.message}`);
    return { posts: data || [] };
  }

  // manage_blog_categories
  if (skillName === 'manage_blog_categories') {
    const { action = 'list_categories' } = args as any;

    if (action === 'list_categories') {
      const { data, error } = await supabase.from('blog_categories')
        .select('id, name, slug, description, sort_order').order('sort_order');
      if (error) throw new Error(`List categories failed: ${error.message}`);
      return { categories: data || [] };
    }
    if (action === 'create_category') {
      const { name, slug, description } = args as any;
      if (!name) throw new Error('name is required');
      const catSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await supabase.from('blog_categories').insert({ name, slug: catSlug, description }).select('id, name, slug').single();
      if (error) throw new Error(`Create category failed: ${error.message}`);
      return { category_id: data.id, name: data.name, slug: data.slug };
    }
    if (action === 'list_tags') {
      const { data, error } = await supabase.from('blog_tags').select('id, name, slug').order('name');
      if (error) throw new Error(`List tags failed: ${error.message}`);
      return { tags: data || [] };
    }
    if (action === 'create_tag') {
      const { name, slug } = args as any;
      if (!name) throw new Error('name is required');
      const tagSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const { data, error } = await supabase.from('blog_tags').insert({ name, slug: tagSlug }).select('id, name, slug').single();
      if (error) throw new Error(`Create tag failed: ${error.message}`);
      return { tag_id: data.id, name: data.name, slug: data.slug };
    }
    return { error: `Unknown blog categories action: ${action}` };
  }

  // content_calendar_view — editorial calendar: drafts + scheduled + recently published.
  // Read-only. Previously fell through to write_blog_post and failed with "title required".
  if (skillName === 'content_calendar_view') {
    const { limit = 50 } = args as any;
    const { data, error } = await supabase.from('blog_posts')
      .select('id, title, slug, status, published_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(Math.min(Number(limit) || 50, 200));
    if (error) throw new Error(`Content calendar view failed: ${error.message}`);
    const posts = data || [];
    const by_status: Record<string, any[]> = {};
    for (const p of posts as any[]) (by_status[p.status] ??= []).push(p);
    const counts = Object.fromEntries(Object.entries(by_status).map(([k, v]) => [k, v.length]));
    return { calendar: posts, by_status, counts };
  }

  // write_blog_post — PURE SENSOR
  // Reasoning (topic→title/content) belongs in FlowPilot or the external agent (ClawThree),
  // not inside this skill. See docs/pilot/sensors-vs-reasoning.md (Law 3).
  // Required: title + content. Optional: excerpt, featured_image, status, tone, language metadata.
  const {
    title: rawTitle,
    content,
    excerpt: rawExcerpt,
    featured_image: providedImage,
    featured_image_alt: providedImageAlt,
    status: requestedStatus,
    tone,
    language = 'en',
    topic,
    _caller_user_id,
  } = args as any;

  if (!rawTitle || typeof rawTitle !== 'string' || !rawTitle.trim()) {
    return { error: "title is required (string). write_blog_post is a pure sensor — generate title and content via your own reasoning (or via FlowPilot's chat/reason flow) before calling." };
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return { error: "content is required (markdown or plain text string). write_blog_post no longer generates content from a topic — call your reasoning loop first to produce the content, then pass it here." };
  }

  const resolvedTitle = rawTitle.trim();
  const baseSlug = resolvedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `post-${Date.now()}`;
  // blog_posts.slug is UNIQUE — a retried or same-titled post must get a
  // suffix, not a constraint violation (live failure on autoversio 2026-07-22).
  let slug = baseSlug;
  {
    const { data: taken } = await supabase
      .from('blog_posts')
      .select('slug')
      .like('slug', `${baseSlug}%`);
    const existing = new Set((taken ?? []).map((r: { slug: string }) => r.slug));
    for (let n = 2; existing.has(slug); n++) slug = `${baseSlug}-${n}`;
  }

  // Convert markdown content → Tiptap doc
  const tiptapDoc = markdownToTiptap(content);

  // Derive excerpt if not provided
  let excerpt = rawExcerpt;
  if (!excerpt) {
    const plainText = content.replace(/[#*_\[\]()>`-]/g, '').replace(/\n+/g, ' ').trim();
    excerpt = plainText.substring(0, 160) + (plainText.length > 160 ? '…' : '');
  }

  // --- Optional auto-fetch featured image (sensor: just looks up an image, no reasoning) ---
  // 'auto' is treated the same as not provided — explicit opt-in to auto-fetch.
  let featuredImage: string | null = providedImage && providedImage !== 'auto' ? providedImage : null;
  let featuredImageAlt: string | null = providedImageAlt || null;
  let imageStatus: 'provided' | 'unsplash' | 'none' | 'no_key' | 'error' = featuredImage ? 'provided' : 'none';

  if (!featuredImage) {
    const photo = await findUnsplashPhoto(topic || resolvedTitle, content);
    if (photo === 'no_key') {
      imageStatus = 'no_key';
    } else if (!photo) {
      imageStatus = 'none';
    } else {
      featuredImage = photo.url;
      featuredImageAlt = featuredImageAlt || photo.alt;
      imageStatus = 'unsplash';
      console.log(`[write_blog_post] Unsplash image found via "${photo.matchedQuery}": ${featuredImage}`);
    }
  }

  // Determine status (default draft; allow 'published' if explicitly requested)
  const status = requestedStatus === 'published' ? 'published' : 'draft';

  const insertData: Record<string, unknown> = {
    title: resolvedTitle,
    slug,
    status,
    excerpt,
    content_json: tiptapDoc,
    meta_json: { tone, language, generated_by: 'external_agent', topic },
  };
  if (status === 'published') {
    insertData.published_at = new Date().toISOString();
  }
  if (featuredImage) {
    insertData.featured_image = featuredImage;
    insertData.featured_image_alt = featuredImageAlt;
  }
  // Ownership — set from caller (MCP api_key owner) so admin UI shows the post
  if (_caller_user_id) {
    insertData.created_by = _caller_user_id;
    insertData.updated_by = _caller_user_id;
    insertData.author_id = _caller_user_id;
  }

  const { data, error } = await supabase.from('blog_posts').insert(insertData).select().single();
  if (error) throw new Error(`Blog insert failed: ${error.message}`);
  return {
    blog_post_id: data.id,
    slug: data.slug,
    title: data.title,
    status: data.status,
    url: `/blog/${data.slug}`,
    has_featured_image: !!featuredImage,
    image_status: imageStatus,
  };
}

// --- Unsplash helper: multi-pass keyword search with Swedish/English fallback ---
// Returns: photo object, null (network error), or 'no_key' (env var missing).
async function findUnsplashPhoto(
  primary: string,
  bodyContent?: string,
): Promise<{ url: string; alt: string; matchedQuery: string } | null | 'no_key'> {
  const unsplashKey = Deno.env.get('UNSPLASH_ACCESS_KEY');
  if (!unsplashKey) return 'no_key';

  // Build a ranked list of query candidates. Unsplash is English-heavy, so we
  // strip diacritics + Swedish stop-words and fall back to shorter phrases.
  const stop = new Set([
    'och','att','det','den','en','ett','är','som','på','av','för','med','till','i','vi','de','du','om','så','men','har','kan','jag','inte','eller','när','vad','hur','varför','där','här','sig','sin','sitt','min','dig','mig',
    'the','and','of','to','in','for','on','with','a','an','is','are','be','this','that','it','from','by','as','at','or','how','what','why','when','your','our','their','his','her',
  ]);
  const clean = (s: string) =>
    s.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter(w => w.length > 2 && !stop.has(w));

  const primaryWords = clean(primary || '');
  const bodyWords = clean((bodyContent || '').slice(0, 500));
  const candidates: string[] = [];
  if (primary?.trim()) candidates.push(primary.trim());
  if (primaryWords.length) candidates.push(primaryWords.slice(0, 4).join(' '));
  if (primaryWords.length > 2) candidates.push(primaryWords.slice(0, 2).join(' '));
  if (primaryWords[0]) candidates.push(primaryWords[0]);
  if (bodyWords.length) candidates.push(bodyWords.slice(0, 3).join(' '));
  if (bodyWords[0]) candidates.push(bodyWords[0]);

  const seen = new Set<string>();
  for (const q of candidates) {
    const key = q.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const url = new URL('https://api.unsplash.com/search/photos');
      url.searchParams.set('query', q);
      url.searchParams.set('per_page', '1');
      url.searchParams.set('orientation', 'landscape');
      url.searchParams.set('content_filter', 'high');
      const resp = await fetch(url.toString(), {
        headers: { 'Authorization': `Client-ID ${unsplashKey}`, 'Accept-Version': 'v1' },
      });
      if (!resp.ok) {
        console.warn(`[unsplash] HTTP ${resp.status} for query "${q}"`);
        continue;
      }
      const data = await resp.json();
      const photo = data.results?.[0];
      if (photo?.urls?.regular) {
        return {
          url: photo.urls.regular,
          alt: photo.alt_description || photo.description || `Photo by ${photo.user?.name || 'Unsplash'}`,
          matchedQuery: q,
        };
      }
    } catch (e) {
      console.error(`[unsplash] fetch failed for "${q}":`, e);
      return null;
    }
  }
  console.log(`[unsplash] no match across ${seen.size} queries (tried: ${[...seen].join(' | ')})`);
  return null;
}

// =============================================================================
// Booking module — full handler with availability checking
// =============================================================================

async function executeBookingAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // check_availability — check available slots
  if (skillName === 'check_availability') {
    const { date, service_id } = args as any;
    if (!date) throw new Error('date is required');

    const dayOfWeek = new Date(date).getDay();
    // NB: availability rows with service_id NULL apply to ALL services — a
    // plain .eq(service_id) filter silently excluded them, so any caller that
    // passed a service_id got "no windows" (the voice receptionist's
    // "couldn't find times" bug).
    let availQuery = supabase.from('booking_availability')
      .select('start_time, end_time, service_id')
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true);
    if (service_id) availQuery = availQuery.or(`service_id.eq.${sanitizeOrTerm(service_id)},service_id.is.null`);
    const { data: availability } = await availQuery;

    // Check blocked dates
    const { data: blocked } = await supabase.from('booking_blocked_dates')
      .select('id, reason, is_all_day, start_time, end_time')
      .eq('date', date);

    // Check existing bookings
    const dayStart = `${date}T00:00:00`;
    const dayEnd = `${date}T23:59:59`;
    const { data: bookings } = await supabase.from('bookings')
      .select('start_time, end_time, service_id')
      .gte('start_time', dayStart).lte('start_time', dayEnd)
      .neq('status', 'cancelled');

    const isFullyBlocked = blocked?.some((b: any) => b.is_all_day);

    // Slot duration: the service's duration when known, else 30 min grid.
    let slotMinutes = 30;
    if (service_id) {
      const { data: svc } = await supabase.from('booking_services')
        .select('duration_minutes').eq('id', service_id).maybeSingle();
      if (svc?.duration_minutes) slotMinutes = svc.duration_minutes;
    }

    // Compute DISCRETE free slots the agent can read straight to the caller —
    // windows minus existing bookings minus partial-day blocks, aligned to the
    // slot grid, excluding past times when the date is today.
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const pad = (n: number) => String(n).padStart(2, '0');
    const busy: Array<[number, number]> = (bookings || []).map((b: any) => {
      const s = new Date(b.start_time); const e = new Date(b.end_time);
      return [s.getUTCHours() * 60 + s.getUTCMinutes(), e.getUTCHours() * 60 + e.getUTCMinutes()];
    });
    for (const bl of blocked || []) {
      if (!bl.is_all_day && bl.start_time && bl.end_time) busy.push([toMin(bl.start_time), toMin(bl.end_time)]);
    }
    const now = new Date();
    const isToday = date === now.toISOString().slice(0, 10);
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();

    const freeSlots: string[] = [];
    if (!isFullyBlocked) {
      for (const w of availability || []) {
        const wStart = toMin(w.start_time); const wEnd = toMin(w.end_time);
        for (let t = wStart; t + slotMinutes <= wEnd && freeSlots.length < 24; t += slotMinutes) {
          if (isToday && t <= nowMin) continue;
          const overlaps = busy.some(([bs, be]) => t < be && t + slotMinutes > bs);
          if (!overlaps) freeSlots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
        }
      }
    }

    return {
      date,
      day_of_week: dayOfWeek,
      is_blocked: isFullyBlocked || false,
      blocked_reasons: blocked?.map((b: any) => b.reason).filter(Boolean) || [],
      available_windows: isFullyBlocked ? [] : (availability || []).map((a: any) => ({
        start: a.start_time, end: a.end_time, service_id: a.service_id,
      })),
      // Ready-to-offer start times (slot grid = service duration, default 30 min).
      free_slots: freeSlots,
      slot_minutes: slotMinutes,
      existing_bookings: (bookings || []).length,
      booked_ranges: (bookings || []).map((b: any) => ({ start: b.start_time, end: b.end_time })),
    };
  }

  // browse_services — list services
  if (skillName === 'browse_services') {
    const { data, error } = await supabase.from('booking_services')
      .select('id, name, description, duration_minutes, price_cents, currency, color')
      .eq('is_active', true).order('sort_order');
    if (error) throw new Error(`List services failed: ${error.message}`);
    return { services: data || [] };
  }

  // manage_booking_availability
  if (skillName === 'manage_booking_availability') {
    const { action = 'list_hours' } = args as any;
    if (action === 'list_hours') {
      const { data } = await supabase.from('booking_availability')
        .select('id, day_of_week, start_time, end_time, is_active, service_id')
        .order('day_of_week').order('start_time');
      return { hours: data || [] };
    }
    if (action === 'set_hours') {
      const { day_of_week, start_time, end_time } = args as any;
      if (day_of_week === undefined || !start_time || !end_time) throw new Error('day_of_week, start_time, end_time required');
      const { data, error } = await supabase.from('booking_availability').insert({
        day_of_week, start_time, end_time, is_active: true,
      }).select('id').single();
      if (error) throw new Error(`Set hours failed: ${error.message}`);
      return { availability_id: data.id, status: 'created' };
    }
    if (action === 'block_date') {
      const { date, reason } = args as any;
      if (!date) throw new Error('date is required');
      const { data, error } = await supabase.from('booking_blocked_dates').insert({
        date, reason: reason || null, is_all_day: true,
      }).select('id').single();
      if (error) throw new Error(`Block date failed: ${error.message}`);
      return { blocked_date_id: data.id, status: 'blocked' };
    }
    if (action === 'unblock_date') {
      const { date } = args as any;
      if (!date) throw new Error('date is required');
      const { error } = await supabase.from('booking_blocked_dates').delete().eq('date', date);
      if (error) throw new Error(`Unblock failed: ${error.message}`);
      return { date, status: 'unblocked' };
    }
    if (action === 'list_blocked') {
      const { data } = await supabase.from('booking_blocked_dates')
        .select('id, date, reason, is_all_day').order('date');
      return { blocked_dates: data || [] };
    }
    return { error: `Unknown availability action: ${action}` };
  }

  // book_appointment — original handler
  // Voice/agent callers may pass `starts_at` (ISO) instead of date+time, and a
  // phone caller has no email — bookings.customer_email is NOT NULL, so derive
  // a phone-based placeholder rather than failing the whole booking (Law 4).
  const { service_id, customer_name, customer_email, customer_phone, notes, date, time, starts_at } = args as any;
  let svcId = service_id;
  if (!svcId) {
    const { data: services } = await supabase
      .from('booking_services').select('id, duration_minutes')
      .eq('is_active', true).order('sort_order').limit(1);
    if (services?.length) svcId = services[0].id;
  }
  const startTime = starts_at ? new Date(String(starts_at)) : new Date(`${date}T${time}:00`);
  if (isNaN(startTime.getTime())) {
    return { error: 'book_appointment needs starts_at (ISO timestamp) or date (YYYY-MM-DD) + time (HH:MM)' };
  }
  const { data: svc } = await supabase.from('booking_services')
    .select('duration_minutes').eq('id', svcId).single();
  const duration = svc?.duration_minutes || 60;
  const endTime = new Date(startTime.getTime() + duration * 60000);

  const phoneDigits = String(customer_phone ?? '').replace(/[^\d+]/g, '');
  const emailFinal = customer_email
    || (phoneDigits ? `${phoneDigits.replace(/^\+/, '')}@voice.caller` : null);
  if (!emailFinal) {
    return { error: 'book_appointment needs customer_email (or customer_phone for phone bookings)' };
  }

  const { data, error } = await supabase.from('bookings').insert({
    service_id: svcId,
    customer_name: customer_name || (phoneDigits ? `Caller ${phoneDigits}` : 'Unknown caller'),
    customer_email: emailFinal,
    ...(phoneDigits ? { customer_phone: phoneDigits } : {}),
    ...(notes ? { notes } : {}),
    start_time: startTime.toISOString(), end_time: endTime.toISOString(),
    status: 'pending',
  }).select().single();
  if (error) throw new Error(`Booking failed: ${error.message}`);
  return { booking_id: data.id, start_time: data.start_time, status: 'pending' };
}

// =============================================================================
// Newsletter module — with subscriber management
// =============================================================================

async function executeNewsletterAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'manage_newsletter_subscribers') {
    const { action = 'list', search, status, email, limit = 50 } = args as any;
    if (action === 'list' || action === 'search') {
      let query = supabase.from('newsletter_subscribers')
        .select('id, email, name, status, created_at, confirmed_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (status) query = query.eq('status', status);
      if (search) query = query.or(`email.ilike.%${sanitizeOrTerm(search)}%,name.ilike.%${sanitizeOrTerm(search)}%`);
      const { data, error } = await query;
      if (error) throw new Error(`List subscribers failed: ${error.message}`);
      return { subscribers: data || [] };
    }
    if (action === 'count') {
      const { count, error } = await supabase.from('newsletter_subscribers')
        .select('*', { count: 'exact', head: true }).eq('status', 'active');
      if (error) throw new Error(`Count failed: ${error.message}`);
      return { active_subscribers: count || 0 };
    }
    if (action === 'remove' && email) {
      const { error } = await supabase.from('newsletter_subscribers')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('email', email);
      if (error) throw new Error(`Remove failed: ${error.message}`);
      return { email, status: 'unsubscribed' };
    }
    return { error: `Unknown subscriber action: ${action}` };
  }

  // manage_newsletters — full CRUD on newsletters table
  if (skillName === 'manage_newsletters') {
    const { action = 'list', newsletter_id, subject, content_html, status, schedule_at, limit = 20 } = args as any;

    if (action === 'list') {
      let query = supabase.from('newsletters')
        .select('id, subject, status, sent_count, open_count, click_count, scheduled_at, sent_at, created_at')
        .order('created_at', { ascending: false }).limit(limit);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw new Error(`List newsletters failed: ${error.message}`);
      return { newsletters: data || [] };
    }

    if (action === 'get') {
      const id = newsletter_id;
      if (!id) throw new Error('newsletter_id required for get');
      const { data, error } = await supabase.from('newsletters')
        .select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(`Get newsletter failed: ${error.message}`);
      if (!data) return { found: false, error: `Newsletter ${id} not found` };
      return data;
    }

    if (action === 'create') {
      if (!subject) throw new Error('subject required for create');
      let finalHtml = content_html as string | undefined;
      const { topic, tone = 'professional', language = 'en', blog_content } = args as any;

      // AI-generate newsletter content if topic provided but no content_html
      if (!finalHtml && (topic || blog_content)) {
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        const sourceContext = blog_content
          ? `Base the newsletter on this blog post content:\n\n${blog_content}\n\nAdapt it for email format — shorter, more direct, with a clear CTA.`
          : `Topic: "${topic}"`;

        const genPrompt = `Write a professional newsletter email about: ${sourceContext}
Subject line: "${subject}"
Tone: ${tone}
Language: ${language}

Write 300-600 words. Output clean HTML suitable for email (use <h2>, <p>, <ul>, <li>, <strong>, <em>, <a>).
Include:
- An engaging opening paragraph
- 3-5 key points or tips
- A clear call-to-action at the end
Do NOT include <html>, <head>, <body> tags — just the inner content HTML.
Do NOT include the subject line as a heading.
Output ONLY the HTML content, no preamble or explanation.`;

        if (geminiKey) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
            const genResp = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: genPrompt }] }],
                generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
              }),
            });
            const genData = await genResp.json();
            const raw = genData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            finalHtml = raw.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
            console.log(`[manage_newsletters] AI content generated via Gemini (${finalHtml.length} chars)`);
          } catch (e) {
            console.error('[manage_newsletters] Gemini generation failed:', e);
          }
        } else if (openaiKey) {
          try {
            const genResp = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
              body: JSON.stringify({
                model: 'gpt-4o-mini', max_tokens: 4096,
                messages: [
                  { role: 'system', content: `You are a newsletter copywriter. Tone: ${tone}. Language: ${language}.` },
                  { role: 'user', content: genPrompt }
                ],
              }),
            });
            const genData = await genResp.json();
            const raw = genData.choices?.[0]?.message?.content || '';
            finalHtml = raw.replace(/^```html\s*/i, '').replace(/```\s*$/, '').trim();
            console.log(`[manage_newsletters] AI content generated via OpenAI (${finalHtml.length} chars)`);
          } catch (e) {
            console.error('[manage_newsletters] OpenAI generation failed:', e);
          }
        }
      }

      const { data, error } = await supabase.from('newsletters').insert({
        subject,
        content_html: finalHtml || '',
        status: schedule_at ? 'scheduled' : 'draft',
        scheduled_at: schedule_at || null,
      }).select().single();
      if (error) throw new Error(`Create newsletter failed: ${error.message}`);
      return { newsletter_id: data.id, subject: data.subject, status: data.status, ai_generated: !!(finalHtml && !content_html) };
    }

    if (action === 'update') {
      if (!newsletter_id) throw new Error('newsletter_id required for update');
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (subject !== undefined) updates.subject = subject;
      if (content_html !== undefined) updates.content_html = content_html;
      if (status !== undefined) updates.status = status;
      if (schedule_at !== undefined) updates.scheduled_at = schedule_at;
      const { data, error } = await supabase.from('newsletters')
        .update(updates).eq('id', newsletter_id).select('id, subject, status').single();
      if (error) throw new Error(`Update newsletter failed: ${error.message}`);
      return { newsletter_id: data.id, subject: data.subject, status: data.status };
    }

    if (action === 'delete') {
      if (!newsletter_id) throw new Error('newsletter_id required for delete');
      const { error } = await supabase.from('newsletters').delete().eq('id', newsletter_id);
      if (error) throw new Error(`Delete newsletter failed: ${error.message}`);
      return { newsletter_id, status: 'deleted' };
    }

    return { error: `Unknown newsletters action: ${action}` };
  }

  // lead_nurture_sequence — AI-generated nurture email for a lead
  if (skillName === 'lead_nurture_sequence') {
    const { lead_id, sequence_type = 'welcome', tone = 'professional', language = 'en' } = args as any;
    if (!lead_id) throw new Error('lead_id is required');

    // Fetch lead info
    const { data: lead, error: leadErr } = await supabase.from('leads')
      .select('id, email, name, status, source, score')
      .eq('id', lead_id).single();
    if (leadErr || !lead) throw new Error('Lead not found');

    // Generate nurture email via AI
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const prompt = `Create a ${sequence_type} nurture email for a lead named "${lead.name || 'there'}" (source: ${lead.source || 'website'}).
Tone: ${tone}. Language: ${language}.
Return ONLY a JSON object with "subject" and "body_html" keys. The body_html should be a complete email in HTML format with inline styles.`;

    let subject = `${sequence_type.charAt(0).toUpperCase() + sequence_type.slice(1)} — ${lead.name || lead.email}`;
    let bodyHtml = `<p>Hi ${lead.name || 'there'},</p><p>Thank you for your interest!</p>`;

    try {
      let aiResponse: any;
      if (geminiKey) {
        const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json' } }),
        });
        const data = await resp.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        aiResponse = JSON.parse(raw);
      } else if (openaiKey) {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
        });
        const data = await resp.json();
        aiResponse = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      }
      if (aiResponse?.subject) subject = aiResponse.subject;
      if (aiResponse?.body_html) bodyHtml = aiResponse.body_html;
    } catch (e) {
      console.error('[lead_nurture_sequence] AI generation failed, using fallback:', e);
    }

    // Create newsletter draft
    const { data: nl, error: nlErr } = await supabase.from('newsletters').insert({
      subject,
      content_html: bodyHtml,
      status: 'draft',
    }).select('id, subject, status').single();
    if (nlErr) throw new Error(`Newsletter creation failed: ${nlErr.message}`);

    return { newsletter_id: nl.id, subject: nl.subject, status: nl.status, lead_email: lead.email, sequence_type };
  }

  // send_newsletter — legacy handler (create draft)
  const { subject, content, schedule_at } = args as any;
  if (!subject) throw new Error('subject is required');
  const { data, error } = await supabase.from('newsletters').insert({
    subject, content_html: content,
    status: schedule_at ? 'scheduled' : 'draft',
    scheduled_at: schedule_at || null,
  }).select().single();
  if (error) throw new Error(`Newsletter failed: ${error.message}`);
  return { newsletter_id: data.id, subject: data.subject, status: data.status };
}

// =============================================================================
// Orders module — with management and stats
// =============================================================================

/**
 * Shared place_order implementation used by both the switch-case dispatcher and
 * the orders module handler. Accepts snake_case and camelCase inputs, resolves
 * products server-side, computes cart weight, and wires shipping (rate-band
 * validation OR auto-cheapest via list_shipping_options RPC). Weightless carts
 * skip shipping entirely (unchanged behavior).
 */
async function placeOrderShared(
  supabase: SupabaseClient,
  a: any,
  source: string,
): Promise<any> {
  const customer_email = a.customer_email ?? a.customerEmail;
  const customer_name = a.customer_name ?? a.customerName;
  const items = a.items;
  const currency = a.currency ?? 'SEK';
  const notes = a.notes;
  const shipping_address = a.shipping_address ?? a.shippingAddress ?? null;
  const shipping_rate_id = a.shipping_rate_id ?? a.shippingRateId ?? null;

  if (!customer_email || !items?.length) {
    return { error: 'customer_email and items[] (each with product_id or product_name, quantity) are required' };
  }

  let itemsCents = 0;
  let totalWeightGrams = 0;
  const resolvedItems: any[] = [];
  for (const item of items) {
    const qty = item.quantity ?? item.qty ?? 1;
    const productId = item.product_id ?? item.productId;
    const productName = item.product_name ?? item.productName ?? item.name;
    let product: any = null;
    if (productId) {
      const { data } = await supabase.from('products').select('id, name, price_cents, weight_grams').eq('id', productId).single();
      product = data;
    } else if (productName) {
      const { data } = await supabase.from('products').select('id, name, price_cents, weight_grams').ilike('name', `%${productName}%`).limit(1).single();
      product = data;
    }
    if (!product) return { error: `Product not found: ${productId || productName}` };
    itemsCents += (product.price_cents || 0) * qty;
    if (product.weight_grams != null) {
      totalWeightGrams += product.weight_grams * qty;
    }
    resolvedItems.push({ product_id: product.id, product_name: product.name, price_cents: product.price_cents, quantity: qty });
  }

  // Resolve shipping (only for carts with weighted products)
  let shippingCents = 0;
  let shippingMethod: string | null = null;
  if (totalWeightGrams > 0) {
    if (shipping_rate_id) {
      const { data: rate } = await supabase
        .from('shipping_rates')
        .select('id, name, price_cents, currency, min_weight_grams, max_weight_grams, is_active, carrier_id')
        .eq('id', shipping_rate_id)
        .maybeSingle();
      if (!rate || !rate.is_active) {
        return { error: `Shipping rate ${shipping_rate_id} not found or inactive` };
      }
      if (totalWeightGrams < (rate.min_weight_grams ?? 0) ||
          (rate.max_weight_grams != null && totalWeightGrams > rate.max_weight_grams)) {
        return { error: `Shipping rate ${rate.name} does not cover weight ${totalWeightGrams}g (band ${rate.min_weight_grams}–${rate.max_weight_grams ?? '∞'}g)` };
      }
      const { data: carrier } = await supabase.from('carriers').select('name').eq('id', rate.carrier_id).maybeSingle();
      shippingCents = rate.price_cents;
      shippingMethod = `${carrier?.name ?? 'Carrier'} — ${rate.name}`;
    } else {
      const { data: opts } = await supabase.rpc('list_shipping_options', {
        p_weight_grams: totalWeightGrams,
        p_currency: currency,
        p_country: shipping_address?.country ?? null,
      });
      const options = (opts as any)?.options ?? [];
      if (options.length > 0) {
        const cheapest = options[0];
        shippingCents = cheapest.price_cents;
        shippingMethod = `${cheapest.carrier_name} — ${cheapest.rate_name}`;
      }
      // No options → graceful degrade, no shipping written
    }
  }

  const totalCents = itemsCents + shippingCents;

  const insertRow: any = {
    customer_email,
    customer_name: customer_name || customer_email,
    total_cents: totalCents,
    currency,
    status: 'pending',
    metadata: { source, notes },
  };
  if (shippingMethod) {
    insertRow.shipping_method = shippingMethod;
    insertRow.shipping_cost_cents = shippingCents;
  }
  if (shipping_address) {
    if (shipping_address.name) insertRow.shipping_name = shipping_address.name;
    if (shipping_address.line1) insertRow.shipping_address_line1 = shipping_address.line1;
    if (shipping_address.line2) insertRow.shipping_address_line2 = shipping_address.line2;
    if (shipping_address.postal_code) insertRow.shipping_postal_code = shipping_address.postal_code;
    if (shipping_address.city) insertRow.shipping_city = shipping_address.city;
    if (shipping_address.country) insertRow.shipping_country = shipping_address.country;
    if (shipping_address.phone) insertRow.shipping_phone = shipping_address.phone;
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert(insertRow)
    .select('id, status, total_cents, currency, shipping_method, shipping_cost_cents')
    .single();
  if (orderErr) throw new Error(`Order creation failed: ${orderErr.message}`);

  for (const ri of resolvedItems) {
    await supabase.from('order_items').insert({ order_id: order.id, ...ri });
  }

  return {
    success: true,
    order_id: order.id,
    status: order.status,
    total_cents: order.total_cents,
    currency: order.currency,
    items_count: resolvedItems.length,
    total_weight_grams: totalWeightGrams,
    shipping_method: order.shipping_method ?? null,
    shipping_cost_cents: order.shipping_cost_cents ?? null,
    message: `Order ${order.id} created with ${resolvedItems.length} item(s) totaling ${(totalCents / 100).toFixed(2)} ${currency}${shippingMethod ? ` (incl. shipping ${(shippingCents / 100).toFixed(2)} via ${shippingMethod})` : ''}`,
  };
}



async function executeOrdersAction(
  supabase: SupabaseClient,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'place_order') {
    // External agent places an order as a customer. Delegates to shared helper
    // that accepts snake_case AND camelCase, resolves products/shipping server-side.
    return await placeOrderShared(supabase, args as any, 'mcp_place_order');
  }


  if (skillName === 'manage_orders') {
    let { action = 'list', order_id, status, period = 'month', limit = 20 } = args as any;

    // ── An order has TWO status axes, and they are not interchangeable ───────
    //
    // orders.status answers "where is the money" (pending → paid → refunded).
    // orders.fulfillment_status answers "where are the goods" (unfulfilled →
    // picked → packed → shipped → delivered), with picked_at/packed_at/
    // shipped_at/delivered_at as its timeline.
    //
    // This handler used to write EVERY value to orders.status: `deliver` on a
    // paid order overwrote status='paid' with 'delivered', and the money axis
    // lost the only fact it carried — the order silently stopped counting as
    // revenue in stats (which filters on status paid|delivered) and read as
    // unpaid everywhere else. fulfillment_status, the tracking number and the
    // four timestamps were never written at all, so the fulfillment timeline
    // was empty for every agent-driven order (QA 2026-08-20).
    //
    // Now the VALUE decides the axis. Nothing writes across.
    const FULFILLMENT_AXIS: Record<string, { at?: string }> = {
      unfulfilled: {},
      picked: { at: 'picked_at' },
      packed: { at: 'packed_at' },
      shipped: { at: 'shipped_at' },
      delivered: { at: 'delivered_at' },
    };
    // The money/lifecycle axis, matching the admin UI's own vocabulary
    // (OrdersPage STATUS_LABELS) so agent-set values render with real labels.
    const PAYMENT_AXIS = new Set(['pending', 'processing', 'paid', 'completed', 'cancelled', 'refunded', 'failed']);
    // "Fulfilled" is not a stored value anywhere in FlowWink — the UI's
    // fulfillment vocabulary stops at shipped/delivered. Normalise rather than
    // write a value that would render as "Unfulfilled" in the badge.
    const VALUE_SYNONYMS: Record<string, string> = {
      fulfilled: 'shipped',
      complete: 'completed',
      canceled: 'cancelled',
      paid_in_full: 'paid',
    };

    // ACTION_ALIASES — tolerate natural verbs from MCP clients (Agent Contract Integrity layer 3).
    // Verbs like ship/fulfill/deliver/cancel/refund/pay map to update_status with implied target.
    const ACTION_ALIASES: Record<string, { action: string; status?: string }> = {
      update: { action: 'update_status' },
      set_status: { action: 'update_status' },
      change_status: { action: 'update_status' },
      ship: { action: 'update_status', status: 'shipped' },
      mark_shipped: { action: 'update_status', status: 'shipped' },
      fulfill: { action: 'update_status', status: 'shipped' },
      mark_fulfilled: { action: 'update_status', status: 'shipped' },
      deliver: { action: 'update_status', status: 'delivered' },
      mark_delivered: { action: 'update_status', status: 'delivered' },
      pay: { action: 'update_status', status: 'paid' },
      mark_paid: { action: 'update_status', status: 'paid' },
      cancel: { action: 'update_status', status: 'cancelled' },
      refund: { action: 'update_status', status: 'refunded' },
    };
    const alias = ACTION_ALIASES[String(action).toLowerCase()];
    if (alias) {
      action = alias.action;
      if (alias.status && !status) status = alias.status;
    }
    // A caller may also name the axis explicitly — fulfillment_status wins over
    // a generic `status` for the goods axis.
    const explicitFulfillment = (args as any).fulfillment_status;
    if (action === 'update_status' && explicitFulfillment && !alias) status = explicitFulfillment;

    if (action === 'list') {
      let query = supabase.from('orders')
        .select('id, status, fulfillment_status, total_cents, currency, customer_email, customer_name, created_at')
        .order('created_at', { ascending: false }).limit(limit);
      // Filter on the axis the value belongs to — asking for 'shipped' orders
      // must not silently return nothing just because shipping lives on the
      // other column.
      if (status) {
        const v = VALUE_SYNONYMS[String(status).toLowerCase().trim()] ?? String(status).toLowerCase().trim();
        query = Object.prototype.hasOwnProperty.call(FULFILLMENT_AXIS, v) && !PAYMENT_AXIS.has(v)
          ? query.eq('fulfillment_status', v)
          : query.eq('status', v);
      }
      const { data, error } = await query;
      if (error) throw new Error(`List orders failed: ${error.message}`);
      return { orders: data || [] };
    }

    if (action === 'get' && order_id) {
      const { data: order, error } = await supabase.from('orders')
        .select('*').eq('id', order_id).maybeSingle();
      if (error) throw new Error(`Get order failed: ${error.message}`);
      if (!order) return { found: false, error: `Order ${order_id} not found` };
      const { data: items } = await supabase.from('order_items')
        .select('id, product_name, quantity, price_cents').eq('order_id', order_id);
      return { ...order, items: items || [] };
    }

    if (action === 'update_status' && order_id && status) {
      const raw = String(status).toLowerCase().trim();
      const value = VALUE_SYNONYMS[raw] ?? raw;
      const isFulfillment = Object.prototype.hasOwnProperty.call(FULFILLMENT_AXIS, value);
      const isPayment = PAYMENT_AXIS.has(value);
      if (!isFulfillment && !isPayment) {
        // Say which axis takes what, so the operator self-corrects next turn
        // instead of guessing a value onto the wrong column.
        throw new Error(
          `Unknown order status '${status}'. Payment/lifecycle axis (orders.status): ${[...PAYMENT_AXIS].join(', ')}. ` +
          `Fulfillment axis (orders.fulfillment_status): ${Object.keys(FULFILLMENT_AXIS).join(', ')}.`,
        );
      }

      // Capture BOTH axes for the audit timeline — a fulfillment step must be
      // readable next to the payment state it did not touch.
      const { data: prev } = await supabase.from('orders')
        .select('status, fulfillment_status').eq('id', order_id).single();

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (isFulfillment) {
        updates.fulfillment_status = value;
        const stamp = FULFILLMENT_AXIS[value].at;
        if (stamp) updates[stamp] = new Date().toISOString();
      } else {
        updates.status = value;
      }
      // Fulfillment side-facts, whichever axis moved: these were accepted by the
      // schema and dropped on the floor by this handler until now.
      const a = args as any;
      const tracking = a.tracking_number ?? a.trackingNumber;
      if (tracking) updates.tracking_number = String(tracking);
      if (a.tracking_url) updates.tracking_url = String(a.tracking_url);
      if (a.fulfillment_notes) updates.fulfillment_notes = String(a.fulfillment_notes);

      const { data, error } = await supabase.from('orders')
        .update(updates).eq('id', order_id)
        .select('id, status, fulfillment_status, tracking_number, shipped_at, delivered_at').single();
      if (error) throw new Error(`Update order failed: ${error.message}`);

      // Mirror admin-UI audit trail so OrderEventHistory shows agent actions too.
      const auditAction = isFulfillment ? `order.fulfillment.${value}` : `order.status.${value}`;
      await supabase.from('audit_logs').insert({
        entity_type: 'order',
        entity_id: order_id,
        action: auditAction,
        metadata: {
          axis: isFulfillment ? 'fulfillment' : 'payment',
          from: isFulfillment ? (prev?.fulfillment_status ?? null) : (prev?.status ?? null),
          to: value,
          ...(value !== raw ? { requested: raw } : {}),
          ...(tracking ? { tracking_number: String(tracking) } : {}),
          source: 'agent',
          skill: 'manage_orders',
        },
      });

      return {
        order_id: data.id,
        axis: isFulfillment ? 'fulfillment' : 'payment',
        status: data.status,
        fulfillment_status: data.fulfillment_status,
        tracking_number: data.tracking_number,
        shipped_at: data.shipped_at,
        delivered_at: data.delivered_at,
        ...(value !== raw ? { normalized_from: raw } : {}),
        note: isFulfillment
          ? `Fulfillment moved to '${value}'. The payment axis (orders.status='${data.status}') was deliberately left alone — shipping an order does not change whether it is paid.`
          : `Payment/lifecycle status set to '${value}'. Fulfillment (orders.fulfillment_status='${data.fulfillment_status}') was left alone.`,
      };
    }

    if (action === 'timeline' && order_id) {
      const { data: order } = await supabase.from('orders')
        .select('id, status, created_at, picked_at, packed_at, shipped_at, delivered_at, tracking_number, tracking_url')
        .eq('id', order_id).single();
      const { data: logs, error } = await supabase.from('audit_logs')
        .select('action, metadata, created_at, user_id')
        .eq('entity_type', 'order').eq('entity_id', order_id)
        .order('created_at', { ascending: true });
      if (error) throw new Error(`Timeline failed: ${error.message}`);
      return { order, events: logs || [] };
    }

    if (action === 'stats') {
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'month') since.setMonth(since.getMonth() - 1);
      else if (period === 'quarter') since.setMonth(since.getMonth() - 3);
      else since.setHours(0, 0, 0, 0);

      const { data } = await supabase.from('orders')
        .select('id, total_cents, currency, status, fulfillment_status, created_at')
        .gte('created_at', since.toISOString());
      const orders = data || [];
      // Revenue is a MONEY-axis question. The old filter included 'delivered',
      // a fulfillment value that only ever reached orders.status through the
      // axis bug this handler now prevents — so a correctly-shipped order used
      // to count as revenue while a correctly-paid one dropped out.
      const totalRevenue = orders.filter((o: any) => o.status === 'paid' || o.status === 'completed')
        .reduce((sum: number, o: any) => sum + o.total_cents, 0);
      return {
        period,
        total_orders: orders.length,
        total_revenue_cents: totalRevenue,
        revenue_basis: "orders.status in ('paid','completed')",
        by_status: groupBy(orders, 'status'),
        by_fulfillment_status: groupBy(orders, 'fulfillment_status'),
      };
    }

    return { error: `Unknown orders action: ${action}` };
  }

  // check_order / lookup_order — customer self-service order status.
  //
  // Two bugs fixed 2026-07-22 after a signed-in customer asked FlowChat about
  // an order and got "there was an issue looking up your order":
  //
  //   1. The prefix branch did `.ilike('id::text', …)`. PostgREST does not read
  //      `id::text` as a cast — it sends `id ~~* …` against a uuid column, and
  //      "operator does not exist: uuid ~~* unknown" crashed EVERY prefix
  //      lookup. The account UI shows customers an 8-char prefix (#ce8d1746),
  //      so this was the ONLY id form a real customer would ever paste. Prefix
  //      matching now happens in JS over the caller's own rows, exactly like
  //      request_return.
  //
  //   2. No identity scoping. It queried all orders and trusted a model-
  //      supplied `email`. A signed-in customer must reach only their OWN
  //      orders, by the JWT-verified _caller_email — never by what the chat
  //      claims. Same rule as request_return / get_customer_360.
  //
  // scope:'both' — two callers, two rules:
  //   • public chat (a website visitor): may only see their OWN orders, by the
  //     JWT-verified _caller_email. No email = ask them to sign in. Never a
  //     global lookup, never trusting an email typed into chat.
  //   • internal (FlowPilot, admin UI, MCP operator): may look up ANY order by
  //     id or email — that is the whole point of an operator tool.
  const { order_id, email } = args as any;
  const callerEmail =
    typeof (args as any)._caller_email === 'string' ? (args as any)._caller_email.toLowerCase().trim() : '';
  const isPublicChat = (args as any)._public_chat === true;

  if (isPublicChat && !callerEmail) {
    return {
      orders: [],
      error: 'Please sign in to your account to see your orders — I look them up from your verified session, not from an email typed in chat.',
    };
  }

  // The email an internal caller may search by; a public-chat caller is pinned
  // to their verified own email regardless of what the model passed.
  const scopeEmail = callerEmail || (!isPublicChat && typeof email === 'string' ? email.toLowerCase().trim() : '');

  let query = supabase
    .from('orders')
    .select('id, status, total_cents, currency, created_at, customer_email')
    .order('created_at', { ascending: false })
    .limit(scopeEmail ? 50 : 5);
  if (scopeEmail) query = query.eq('customer_email', scopeEmail);
  const { data, error } = await query;
  if (error) throw new Error(`Order lookup failed: ${error.message}`);

  let orders = data ?? [];
  let matched_by: 'uuid' | 'prefix' | 'email' | 'all' = scopeEmail ? 'email' : 'all';
  if (order_id) {
    // Match a full id or the short prefix customers see (#ce8d1746), in JS —
    // avoids the uuid-ILIKE crash and, when scoped, reveals nothing cross-account.
    const ref = String(order_id).trim().replace(/^#/, '').toLowerCase();
    orders = orders.filter((o: any) => o.id.toLowerCase() === ref || o.id.toLowerCase().startsWith(ref));
    matched_by = ref.length === 36 ? 'uuid' : 'prefix';
    if (orders.length === 0) {
      return { orders: [], matched_by, note: `No order matching "${order_id}" was found${scopeEmail ? ' on your account' : ''}.` };
    }
  }
  return { orders: orders.slice(0, 5), matched_by };
}

function groupBy(items: any[], key: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    result[val] = (result[val] || 0) + 1;
  }
  return result;
}

// =============================================================================
// Lead pipeline review — read-only summary for proactive heartbeat use
// =============================================================================

async function executeLeadPipelineReview(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { status_filter = 'all', limit = 25, stale_days = 14 } = args as any;
  const cap = Math.min(Math.max(Number(limit) || 25, 1), 100);

  let query = supabase
    .from('leads')
    .select('id, email, name, status, score, source, created_at, updated_at')
    .order('score', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(200);

  if (status_filter && status_filter !== 'all') {
    query = query.eq('status', status_filter);
  }

  const { data: leads, error } = await query;
  if (error) {
    return { error: `lead_pipeline_review failed: ${error.message}` };
  }

  const all = leads || [];
  const now = Date.now();
  const staleMs = Number(stale_days) * 24 * 60 * 60 * 1000;

  const byStatus = groupBy(all, 'status');
  const stale = all.filter((l: any) =>
    l.updated_at && (now - new Date(l.updated_at).getTime()) > staleMs
  );
  const highScore = all
    .filter((l: any) => (l.score ?? 0) >= 50)
    .slice(0, cap);
  const neglected = stale
    .filter((l: any) => l.status === 'lead' || l.status === 'contacted')
    .slice(0, cap);

  const suggestions: string[] = [];
  if (highScore.length > 0) {
    suggestions.push(`${highScore.length} high-scoring lead(s) ready for direct outreach.`);
  }
  if (neglected.length > 0) {
    suggestions.push(`${neglected.length} lead(s) inactive >${stale_days}d — send nurture or task a follow-up.`);
  }
  if (suggestions.length === 0) {
    suggestions.push('Pipeline is healthy — no urgent action required.');
  }

  // Weighted deal forecast (EPIC-03 S4): Σ(value × stage probability) over the
  // shared stage engine. Lost stages excluded; won counted at 100% and also
  // reported separately so callers can split forecast vs booked.
  let forecast: Record<string, unknown> | null = null;
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('value_cents, stage_id, pipeline_stages(key, probability, is_won, is_lost)')
    .not('stage_id', 'is', null);
  if (!dealsError && deals) {
    let weighted = 0;
    let openTotal = 0;
    let wonTotal = 0;
    const byStage: Record<string, { count: number; total_cents: number; weighted_cents: number; probability: number | null }> = {};
    for (const d of deals as any[]) {
      const s = d.pipeline_stages;
      if (!s || s.is_lost) continue;
      const value = Number(d.value_cents) || 0;
      const prob = s.probability == null ? null : Number(s.probability);
      const w = prob == null ? value : Math.round(value * prob / 100);
      weighted += w;
      if (s.is_won) wonTotal += value; else openTotal += value;
      const key = s.key ?? 'unknown';
      byStage[key] ??= { count: 0, total_cents: 0, weighted_cents: 0, probability: prob };
      byStage[key].count += 1;
      byStage[key].total_cents += value;
      byStage[key].weighted_cents += w;
    }
    forecast = {
      weighted_pipeline_cents: weighted,
      open_pipeline_cents: openTotal,
      won_cents: wonTotal,
      by_stage: byStage,
    };
    if (openTotal > 0) {
      suggestions.push(`Weighted deal forecast: ${(weighted / 100).toFixed(0)} (open pipeline ${(openTotal / 100).toFixed(0)}).`);
    }
  }

  // Win/lost discipline rollup (Odoo "group by Lost Reason" report, SMB-sized):
  // closed-deal win rate + lost-reason distribution across leads and deals.
  let win_loss: Record<string, unknown> | null = null;
  const { data: closed } = await supabase
    .from('deals')
    .select('stage, lost_reason')
    .in('stage', ['closed_won', 'closed_lost'])
    .limit(1000);
  const { data: lostLeads } = await supabase
    .from('leads')
    .select('lost_reason')
    .eq('status', 'lost')
    .limit(1000);
  if (closed) {
    const won = closed.filter((d: any) => d.stage === 'closed_won').length;
    const lost = closed.length - won;
    const reasons: Record<string, number> = {};
    for (const d of closed as any[]) {
      if (d.stage !== 'closed_lost') continue;
      const r = d.lost_reason || 'unspecified';
      reasons[r] = (reasons[r] || 0) + 1;
    }
    const leadReasons: Record<string, number> = {};
    for (const l of (lostLeads || []) as any[]) {
      const r = l.lost_reason || 'unspecified';
      leadReasons[r] = (leadReasons[r] || 0) + 1;
    }
    win_loss = {
      deals_won: won,
      deals_lost: lost,
      win_rate: (won + lost) > 0 ? Math.round((won / (won + lost)) * 100) / 100 : null,
      lost_reasons_deals: reasons,
      lost_reasons_leads: leadReasons,
    };
  }

  return {
    total: all.length,
    by_status: byStatus,
    stale_count: stale.length,
    high_score_leads: highScore.slice(0, 10),
    neglected_leads: neglected.slice(0, 10),
    forecast,
    win_loss,
    suggestions,
  };
}

// =============================================================================
// Leads management handler
// =============================================================================

/**
 * Lead status alias map — translates common agent values into the canonical
 * lead_status enum (lead | opportunity | customer | lost). Returns:
 *   - canonical enum string when input maps to one
 *   - null when the input means "no filter" (all/any/* / undefined)
 *   - the raw input (lowercased) otherwise, so DB still rejects truly unknown values
 *
 * Keep in sync with the enum in public.lead_status and the tool_definition
 * schema for skill `manage_leads`.
 */
const LEAD_STATUS_ALIASES: Record<string, string> = {
  // canonical
  lead: 'lead',
  opportunity: 'opportunity',
  customer: 'customer',
  lost: 'lost',
  // common agent aliases
  new: 'lead',
  unqualified: 'lead',
  contacted: 'lead',
  qualified: 'opportunity',
  open: 'opportunity',
  active: 'opportunity',
  negotiation: 'opportunity',
  proposal: 'opportunity',
  won: 'customer',
  closed_won: 'customer',
  'closed-won': 'customer',
  client: 'customer',
  disqualified: 'lost',
  closed_lost: 'lost',
  'closed-lost': 'lost',
  rejected: 'lost',
};

function normalizeLeadStatus(input: unknown): string | null {
  if (input === undefined || input === null || input === '') return null;
  const key = String(input).trim().toLowerCase();
  if (key === 'all' || key === 'any' || key === '*') return null;
  return LEAD_STATUS_ALIASES[key] ?? key;
}

async function executeLeadsAction(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', lead_id, status, score, search, limit = 50, lost_reason, lost_note } = args as any;
  const normalizedStatus = normalizeLeadStatus(status);

  if (action === 'list') {
    let query = supabase.from('leads')
      .select('id, email, name, phone, status, score, source, ai_summary, created_at, updated_at')
      .order('updated_at', { ascending: false }).limit(limit);
    if (normalizedStatus) query = query.eq('status', normalizedStatus);
    if (search) query = query.or(`email.ilike.%${sanitizeOrTerm(search)}%,name.ilike.%${sanitizeOrTerm(search)}%`);
    const { data, error } = await query;
    if (error) throw new Error(`List leads failed: ${error.message}`);
    return { leads: data || [], status_filter: normalizedStatus };
  }

  if (action === 'get' && lead_id) {
    // maybeSingle: a missing lead (e.g. deleted or merged away) must return a
    // clean not-found, not a "Cannot coerce the result to a single JSON object"
    // crash — operators hit this right after merge_leads deletes the duplicate.
    const { data, error } = await supabase.from('leads')
      .select('*').eq('id', lead_id).maybeSingle();
    if (error) throw new Error(`Get lead failed: ${error.message}`);
    if (!data) {
      return { found: false, error: `Lead ${lead_id} not found (it may have been deleted or merged into another lead — use action=list with a search to locate the surviving record)` };
    }
    // Get activities
    const { data: activities } = await supabase.from('lead_activities')
      .select('id, type, metadata, points, created_at')
      .eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(20);
    return { ...data, activities: activities || [] };
  }

  if (action === 'update' && lead_id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let statusNote: string | undefined;
    if (status !== undefined) {
      if (!normalizedStatus) {
        return { error: `Invalid status "${status}". Allowed: lead, opportunity, customer, lost.` };
      }
      updates.status = normalizedStatus;
      // Don't silently swallow a non-canonical status. The pipeline only has
      // lead|opportunity|customer|lost, and aliases (e.g. "contacted"→"lead")
      // collapse to those. Surface the mapping so the caller isn't misled into
      // thinking a distinct stage was set.
      const requested = String(status).trim().toLowerCase();
      if (requested !== normalizedStatus) {
        statusNote = `Requested status "${status}" was mapped to canonical "${normalizedStatus}" (pipeline stages: lead, opportunity, customer, lost).`;
      }
    }
    if (score !== undefined) updates.score = score;
    // Lost discipline (Odoo pattern): store reason+note on the lost transition,
    // clear them on any transition to a non-lost status (re-open).
    if (normalizedStatus === 'lost') {
      if (lost_reason !== undefined) updates.lost_reason = lost_reason;
      if (lost_note !== undefined) updates.lost_note = lost_note;
    } else if (normalizedStatus) {
      updates.lost_reason = null;
      updates.lost_note = null;
    } else if (lost_reason !== undefined || lost_note !== undefined) {
      // Annotating an already-lost lead without changing status.
      if (lost_reason !== undefined) updates.lost_reason = lost_reason;
      if (lost_note !== undefined) updates.lost_note = lost_note;
    }
    const { data, error } = await supabase.from('leads')
      .update(updates).eq('id', lead_id).select('id, email, status, score, lost_reason').single();
    if (error) throw new Error(`Update lead failed: ${error.message}`);
    return {
      lead_id: data.id,
      status: data.status,
      score: data.score,
      ...(data.lost_reason ? { lost_reason: data.lost_reason } : {}),
      ...(statusNote ? { requested_status: status, note: statusNote } : {}),
    };
  }

  if (action === 'delete' && lead_id) {
    const { error } = await supabase.from('leads').delete().eq('id', lead_id);
    if (error) throw new Error(`Delete lead failed: ${error.message}`);
    return { lead_id, status: 'deleted' };
  }

  return { error: `Unknown leads action: ${action}` };
}

// =============================================================================
// send_email_to_lead — Send a transactional outreach email to a single lead
// =============================================================================
// Uses AI (Gemini → OpenAI) to draft subject + body when not provided.
// Sends via Resend. Logs result to lead_activities for audit + future
// suppression checks. Supports dry_run for safe previews.

/**
 * Robust JSON parser for AI-generated email drafts.
 * Handles: code-fence wrappers, leading/trailing prose, unterminated strings
 * (extracts subject/body via regex fallback when JSON.parse fails).
 */
function parseAiEmailJson(raw: string): { subject?: string; body_html?: string } {
  if (!raw) return {};
  let txt = raw.trim();
  // Strip ```json ... ``` fences
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Try direct parse first
  try {
    return JSON.parse(txt);
  } catch { /* fall through */ }
  // Try extracting first {...} block
  const match = txt.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }
  // Last resort: regex-extract subject + body_html fields
  const subjectMatch = txt.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const bodyMatch = txt.match(/"body_html"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const out: { subject?: string; body_html?: string } = {};
  if (subjectMatch) out.subject = subjectMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  if (bodyMatch) out.body_html = bodyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  return out;
}

// Resolve the Resend "From" line from the integration config saved in
// /admin/integrations (site_settings.integrations.resend.config.emailConfig).
// Falls back to a safe default only if nothing is configured. This is what
// makes the Resend side panel actually take effect for agent-sent emails.
async function resolveResendFrom(supabase: any): Promise<string> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'integrations')
      .maybeSingle();
    const cfg = (data?.value as any)?.resend?.config?.emailConfig ?? {};
    const name = (cfg.fromName || '').toString().trim();
    const email = (cfg.fromEmail || '').toString().trim();
    if (email) return name ? `${name} <${email}>` : email;
  } catch (_) { /* fall through */ }
  return 'FlowPilot <flowpilot@flowwink.com>';
}

// Log an outbound email to the gateway log so it appears in /admin/communications.
// Fire-and-forget — never let a logging error fail the email send itself.
async function logOutboundEmail(
  supabase: any,
  row: {
    status: 'sent' | 'failed' | 'simulated' | 'blocked';
    recipient: string | string[];
    subject: string | null;
    body_html?: string | null;
    body_text?: string | null;
    from?: string | null;
    provider_message_id?: string | null;
    error_message?: string | null;
    source?: string | null;
    related_entity_type?: string | null;
    related_entity_id?: string | null;
    extra_metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const recipient = Array.isArray(row.recipient) ? row.recipient.join(', ') : row.recipient;
    await supabase.from('outbound_communications').insert({
      channel: 'email',
      status: row.status,
      provider: 'resend',
      simulated: row.status === 'simulated',
      recipient,
      subject: row.subject,
      body_html: row.body_html ?? null,
      body_text: row.body_text ?? null,
      source: row.source ?? 'agent-execute',
      related_entity_type: row.related_entity_type ?? null,
      related_entity_id: row.related_entity_id ?? null,
      error_message: row.error_message ?? null,
      metadata: {
        from: row.from ?? null,
        provider_message_id: row.provider_message_id ?? null,
        ...(row.extra_metadata ?? {}),
      },
      sent_at: row.status === 'sent' ? new Date().toISOString() : null,
    });
  } catch (e) {
    console.error('[agent-execute] failed to log outbound_communications:', e);
  }
}


async function executeSendEmailToLead(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    lead_id,
    subject: providedSubject,
    body_html: providedBody,
    purpose = 'outreach', // outreach | follow_up | nurture | reply
    tone = 'professional',
    language = 'en',
    custom_instructions,
    dry_run = false,
  } = args as any;

  if (!lead_id) throw new Error('lead_id is required');

  // 1. Fetch lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, email, name, status, source, score, ai_summary')
    .eq('id', lead_id)
    .maybeSingle();
  if (leadErr) throw new Error(`Lead lookup failed: ${leadErr.message}`);
  if (!lead) throw new Error(`Lead ${lead_id} not found`);
  if (!lead.email) throw new Error(`Lead ${lead_id} has no email address`);

  // 2. Suppression check — has this lead unsubscribed previously?
  const { data: suppressionActivity } = await supabase
    .from('lead_activities')
    .select('id, type')
    .eq('lead_id', lead_id)
    .in('type', ['unsubscribed', 'bounced', 'complained'])
    .limit(1)
    .maybeSingle();
  if (suppressionActivity) {
    return {
      sent: false,
      suppressed: true,
      reason: `Lead has prior ${suppressionActivity.type} event — not sending`,
      lead_email: lead.email,
    };
  }

  // 3. Generate subject + body via AI if not provided
  let subject = providedSubject as string | undefined;
  let bodyHtml = providedBody as string | undefined;

  if (!subject || !bodyHtml) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const prompt = `Write a ${purpose} email to a lead.
Lead: ${lead.name || 'unknown'} <${lead.email}>
Source: ${lead.source || 'website'}
Status: ${lead.status}
${lead.ai_summary ? `Context: ${lead.ai_summary}` : ''}
${custom_instructions ? `Special instructions: ${custom_instructions}` : ''}

Tone: ${tone}. Language: ${language}.
Keep it short (under 150 words), personal, and end with one clear call to action.
Return ONLY a JSON object: {"subject": "...", "body_html": "<p>...</p>"}.
The body_html should be clean HTML with inline styles, no <html>/<body> wrapper.`;

    try {
      let aiResp: any;
      if (geminiKey) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
              },
            }),
          },
        );
        const data = await r.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        aiResp = parseAiEmailJson(raw);
      } else if (openaiKey) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-mini',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
          }),
        });
        const data = await r.json();
        aiResp = parseAiEmailJson(data.choices?.[0]?.message?.content || '{}');
      } else {
        console.warn('[send_email_to_lead] No AI provider configured — using fallback template');
      }
      subject = subject || aiResp?.subject;
      bodyHtml = bodyHtml || aiResp?.body_html;
    } catch (e) {
      // Don't hard-fail — let the fallback template below take over so the
      // agent can still send a sensible email instead of getting stuck.
      console.error('[send_email_to_lead] AI generation failed, falling back to template:', (e as Error).message);
    }
  }

  // Fallback — if AI returned nothing usable, build a minimal but valid draft
  // so the agent never gets stuck. Better a plain template than a hard fail.
  if (!subject) {
    const purposeLabels: Record<string, string> = {
      outreach: 'Hello from us',
      follow_up: 'Following up',
      nurture: 'A quick check-in',
      reactivation: 'We miss you',
    };
    subject = purposeLabels[purpose as string] || 'Hello';
    if (lead.name) subject = `${subject}, ${lead.name.split(' ')[0]}`;
  }
  if (!bodyHtml) {
    const greeting = lead.name ? `Hi ${lead.name.split(' ')[0]},` : 'Hi there,';
    const ctx = custom_instructions ? `<p>${String(custom_instructions).slice(0, 300)}</p>` : '';
    bodyHtml = `<p>${greeting}</p>${ctx}<p>I wanted to reach out personally — would you be open to a short conversation this week?</p><p>Best regards</p>`;
    console.warn('[send_email_to_lead] Using fallback template (AI returned no usable content)');
  }

  // 4. Dry-run — return draft without sending
  if (dry_run) {
    return {
      sent: false,
      dry_run: true,
      lead_email: lead.email,
      lead_name: lead.name,
      subject,
      body_html: bodyHtml,
      preview: bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 200),
    };
  }

  // 5. Send via the email router. Prefer Composio/Gmail for lead outreach so the
  //    reply lands in the agent's personal inbox and threads naturally — falls
  //    back to Resend if Composio is not connected.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const routerRes = await fetch(`${supabaseUrl}/functions/v1/email-send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      to: lead.email,
      subject,
      html: bodyHtml,
      provider: 'composio', // preferred channel for replies-expected mail
      expects_reply: true,  // fallback order: Composio → SMTP → Resend

      source: 'send_email_to_lead',
      related_entity_type: 'lead',
      related_entity_id: lead_id,
      extra_metadata: { purpose },
    }),
  });

  const routerData = await routerRes.json().catch(() => ({}));
  if (!routerRes.ok || routerData?.success === false) {
    await supabase.from('lead_activities').insert({
      lead_id,
      type: 'email_failed',
      metadata: { subject, error: routerData?.error || routerRes.statusText, purpose },
      points: 0,
    });
    throw new Error(`email-send failed: ${routerData?.error || routerRes.statusText}`);
  }

  // 6. Log success activity (router already wrote outbound_communications)
  await supabase.from('lead_activities').insert({
    lead_id,
    type: 'email_sent',
    metadata: {
      subject,
      purpose,
      provider: routerData?.provider ?? 'unknown',
      simulated: routerData?.simulated === true,
    },
    points: 5,
  });



  return {
    sent: true,
    lead_email: lead.email,
    lead_name: lead.name,
    subject,
    message_id: routerData?.message_id ?? routerData?.id ?? null,
    provider: routerData?.provider ?? 'unknown',
    simulated: routerData?.simulated === true,
    purpose,
  };
}

// =============================================================================
// send_invoice_for_order — Quote-to-cash: convert an order into a sent invoice
// =============================================================================
// Creates an invoice from an order's line items, marks it as sent, and emails
// the customer a link via Resend. Idempotent: if an invoice already exists for
// the order (matched on metadata.order_id), it is reused instead of duplicated.
// Supports dry_run for safe preview.

async function executeSendInvoiceForOrder(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    order_id,
    due_days = 14,
    tax_rate,
    notes,
    payment_terms,
    dry_run = false,
  } = args as any;

  if (!order_id) throw new Error('order_id is required');

  // 1. Fetch order + items
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, customer_email, customer_name, currency, total_cents, status, metadata, user_id')
    .eq('id', order_id)
    .maybeSingle();
  if (orderErr) throw new Error(`Order lookup failed: ${orderErr.message}`);
  if (!order) throw new Error(`Order ${order_id} not found`);
  if (!order.customer_email) throw new Error(`Order ${order_id} has no customer_email`);

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('product_name, quantity, price_cents')
    .eq('order_id', order_id);
  if (itemsErr) throw new Error(`Order items lookup failed: ${itemsErr.message}`);
  if (!items || items.length === 0) throw new Error(`Order ${order_id} has no line items`);

  // 2. Build invoice line items
  const lineItems = items.map((it: any) => ({
    description: it.product_name,
    qty: it.quantity,
    unit_price_cents: it.price_cents,
  }));
  const subtotal = lineItems.reduce((s: number, i: any) => s + i.qty * i.unit_price_cents, 0);
  // The caller's rate wins; otherwise the ORDER's own rate — an order converted
  // from a quote carries the rate the customer actually accepted, so the invoice
  // lands on the quote's total instead of on a 25 % assumption.
  const orderTaxRate = Number((order.metadata as any)?.tax_rate);
  const effectiveTaxRate = typeof tax_rate === 'number'
    ? tax_rate
    : (Number.isFinite(orderTaxRate) && orderTaxRate >= 0 ? orderTaxRate : 0.25);
  const taxCents = Math.round(subtotal * effectiveTaxRate);
  const totalCents = subtotal + taxCents;

  // 3. Idempotency — keyed on the invoices.order_id COLUMN.
  //
  // This used to key on invoices.notes containing `order:<uuid>`. Notes are an
  // ordinary editable field: an operator (or an agent) who rewrote the note
  // severed the only link between order and invoice, and the very next call to
  // this skill issued a SECOND live, already-sent invoice for the same order —
  // a phantom 18 687,50 kr receivable against a customer who had paid in full
  // (order-to-cash QA 2026-08-20). An idempotency key must live somewhere the
  // business cannot edit by accident; that is a foreign key, not prose.
  //
  // The notes scan survives as a READ-ONLY fallback for invoices created before
  // the column existed — and when it hits, the row is repaired so the next call
  // uses the column.
  let orderIdColumn = true;
  let existingInvoice: any = null;
  {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_cents')
      .eq('order_id', order_id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    // Fail forward: an edge deploy can land before its migration. Fall back to
    // the legacy scan rather than refusing to invoice.
    if (error && /order_id/i.test(error.message || '')) orderIdColumn = false;
    else existingInvoice = data ?? null;
  }

  if (!existingInvoice) {
    const { data: byNotes } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total_cents')
      .eq('customer_email', order.customer_email)
      .ilike('notes', `%order:${order_id}%`)
      .limit(1)
      .maybeSingle();
    if (byNotes) {
      existingInvoice = byNotes;
      // Heal the link so this invoice is never found by prose again.
      if (orderIdColumn && !dry_run) {
        await supabase.from('invoices').update({ order_id }).eq('id', byNotes.id);
      }
    }
  }

  // 4. Dry-run preview
  if (dry_run) {
    return {
      sent: false,
      dry_run: true,
      order_id,
      customer_email: order.customer_email,
      reuse_existing: !!existingInvoice,
      existing_invoice: existingInvoice || null,
      preview: {
        line_items: lineItems,
        subtotal_cents: subtotal,
        tax_rate: effectiveTaxRate,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency: order.currency || 'SEK',
      },
    };
  }

  // 5. Create or reuse invoice
  let invoice = existingInvoice;
  const reusedExisting = !!existingInvoice;
  if (!invoice) {
    // Use the canonical INV-YYYY-NNNNN series (same as manage_invoice create and
    // quote convert_to_invoice). The old `INV-${count+1}` scheme was doubly wrong:
    // a divergent format AND counting ALL invoice rows (incl. SUB-/CN-/POS-/CTR-
    // document series), so it collided with and diverged from the real customer
    // series — a sequential-numbering hazard (SE fortlöpande fakturanummer).
    // Found by order-to-delivery QA 2026-07-09 (INV-0032 vs INV-2026-000NN).
    const yr = new Date().getFullYear();
    const { data: lastInv } = await supabase.from('invoices')
      .select('invoice_number').ilike('invoice_number', `INV-${yr}-%`)
      .order('invoice_number', { ascending: false }).limit(1).maybeSingle();
    let nextNum = 1;
    const lm = String(lastInv?.invoice_number || '').match(/INV-\d{4}-(\d+)/);
    if (lm) nextNum = parseInt(lm[1], 10) + 1;
    const invoiceNumber = `INV-${yr}-${String(nextNum).padStart(5, '0')}`;
    const dueDate = new Date(Date.now() + due_days * 86400000).toISOString().slice(0, 10);

    const { data: created, error: createErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        customer_email: order.customer_email,
        customer_name: order.customer_name || '',
        line_items: lineItems as any,
        subtotal_cents: subtotal,
        tax_rate: effectiveTaxRate,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency: order.currency || 'SEK',
        due_date: dueDate,
        payment_terms: payment_terms || `Net ${due_days}`,
        // The note stays for human readability; it is no longer load-bearing.
        notes: `${notes ? notes + '\n' : ''}order:${order_id}`,
        ...(orderIdColumn ? { order_id } : {}),
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('id, invoice_number, total_cents, currency, due_date')
      .single();
    if (createErr) throw new Error(`Invoice create failed: ${createErr.message}`);
    invoice = created;
  } else if (invoice.status === 'draft') {
    await supabase
      .from('invoices')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', invoice.id);
  }

  // 6. Email customer — through the platform's own router, like every other send.
  //
  // This path used to talk to Resend directly, which is why the outbound
  // allowlist had to be applied twice: guarding only email-send would have left
  // precisely the invoice mail ungated, the one send a company in a pilot phase
  // most needs held back. Guarding the bypass was the right emergency fix and
  // the wrong resting place — a rule enforced in two files is two copies that
  // drift.
  //
  // Routing it here gives the invoice everything the rest of the platform
  // already had: the allowlist at one choke point, provider fallback
  // (Composio → SMTP → Resend), the suppression list, the operator's branded
  // shell, and one logOutboundEmail instead of a second half-implementation.
  interface EmailSendReply {
    success?: boolean;
    simulated?: boolean;
    provider?: string | null;
    result?: { id?: string } | null;
  }
  interface BlockedReply {
    blocked_by_allowlist?: boolean;
    error?: string;
  }
  let emailResult: Record<string, unknown>;
  {
    let origin = Deno.env.get('PUBLIC_SITE_URL') || '';
    if (!origin) {
      const { data: gs } = await supabase.from('site_settings').select('value').eq('key', 'general').maybeSingle();
      const v: any = gs?.value || {};
      origin = v.siteUrl || v.site_url || v.public_url || v.publicUrl || '';
    }
    let publicToken = (invoice as any).public_token;
    if (!publicToken) {
      const { data: inv } = await supabase.from('invoices').select('public_token').eq('id', invoice.id).maybeSingle();
      publicToken = inv?.public_token;
    }
    const invoiceUrl = origin && publicToken ? `${origin.replace(/\/$/, '')}/invoice/${publicToken}` : '';
    const fmt = (cents: number) =>
      new Intl.NumberFormat('sv-SE', { style: 'currency', currency: order.currency || 'SEK' }).format(cents / 100);

    // A FRAGMENT, not a document — email-send wraps it in the operator's
    // branded shell, so the invoice mail finally looks like the company's other
    // mail instead of like this function's own idea of an email.
    const html = `
      <h2 style="margin:0 0 12px">Invoice ${invoice.invoice_number}</h2>
      <p>Hi ${order.customer_name || 'there'},</p>
      <p>Thank you for your order. Please find your invoice for <strong>${fmt(totalCents)}</strong>${invoiceUrl ? ' below' : ''}.</p>
      ${invoiceUrl ? `<p><a href="${invoiceUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">View invoice &amp; download PDF</a></p>` : ''}
      <p style="color:#666;font-size:13px">If you have any questions, just reply to this email.</p>`;
    const subject = `Invoice ${invoice.invoice_number}`;

    const { data: sendData, error: sendErr } = await supabase.functions.invoke('email-send', {
      body: {
        to: order.customer_email,
        subject,
        html,
        source: 'send_invoice',
        related_entity_type: 'invoice',
        related_entity_id: invoice.id,
        extra_metadata: { order_id, invoice_number: invoice.invoice_number },
        tags: { source: 'send_invoice' },
      },
    });

    // Read the reason, not just the failure. email-send answers a withheld
    // recipient with 422 and a body that explains; supabase-js flattens every
    // non-2xx into "Edge Function returned a non-2xx status code" and leaves the
    // body on .context. Blocked and broken are different facts and a caller that
    // cannot tell them apart writes "invoice sent" into a customer record.
    if (sendErr) {
      let body: unknown = null;
      const ctx = (sendErr as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try { body = await ctx.json(); } catch { /* not JSON */ }
      }
      const blocked = body as BlockedReply | null;
      emailResult = blocked?.blocked_by_allowlist
        ? (blocked as Record<string, unknown>)
        : { sent: false, error: blocked?.error ?? sendErr.message };
    } else if ((sendData as EmailSendReply | null)?.simulated) {
      // No provider configured. Logged as simulated by the router — reporting it
      // as sent would leave a customer waiting for an invoice that never was.
      emailResult = { sent: false, simulated: true,
        reason: 'No email provider is configured — the invoice was not sent. Enable Composio, SMTP or Resend under Integrations.' };
    } else {
      const reply = sendData as EmailSendReply | null;
      emailResult = { sent: true, provider: reply?.provider ?? null,
        message_id: reply?.result?.id ?? null };
    }
  }

  // 7. Audit trail
  await supabase.from('audit_logs').insert({
    action: 'invoice_sent',
    entity_type: 'invoice',
    entity_id: invoice.id,
    metadata: {
      order_id,
      invoice_number: invoice.invoice_number,
      total_cents: totalCents,
      currency: order.currency || 'SEK',
      customer_email: order.customer_email,
      email: emailResult,
    },
  });

  // `sent` is the answer to "did the customer get the invoice", and the router
  // already worked that out — emailResult.sent is false when no provider is
  // configured (simulated) or when the allowlist withheld the recipient. The
  // top-level flag used to be a hardcoded `true` regardless, so a skill that
  // knew perfectly well the mail had not left still reported that it had. The
  // invoice creation is reported separately; those are two different facts.
  const emailSent = (emailResult as { sent?: boolean })?.sent === true;
  return {
    sent: emailSent,
    invoice_created: true,
    order_id,
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    // When an invoice already existed, report ITS total — the recomputation
    // above describes what a new invoice would have said, not what the customer
    // owes on the document that exists.
    total_cents: reusedExisting ? (invoice.total_cents ?? totalCents) : totalCents,
    currency: order.currency || 'SEK',
    customer_email: order.customer_email,
    reused_existing_invoice: reusedExisting,
    ...(reusedExisting ? { note: `Order ${order_id} was already invoiced as ${invoice.invoice_number} — reused, no second invoice was created.` } : {}),
    email: emailResult,
    ...(emailSent ? {} : {
      note: 'The invoice exists and is marked sent in the ledger, but the EMAIL did not go out — see `email` for why. Do not tell the user the invoice was emailed.',
    }),
  };
}

// =============================================================================
// Blog posts management (update/publish/delete existing)
// =============================================================================

async function executeBlogPostsManagement(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', post_id, slug, status, title, excerpt, featured_image, limit = 20 } = args as any;

  if (action === 'list') {
    let query = supabase.from('blog_posts')
      .select('id, title, slug, status, excerpt, featured_image, created_at, updated_at, published_at')
      .order('updated_at', { ascending: false }).limit(limit);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(`List posts failed: ${error.message}`);
    return { posts: data || [] };
  }

  if (action === 'get') {
    let query = supabase.from('blog_posts').select('*');
    if (post_id) query = query.eq('id', post_id);
    else if (slug) query = query.eq('slug', slug);
    else throw new Error('post_id or slug required');
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(`Get post failed: ${error.message}`);
    if (!data) return { found: false, error: `Blog post not found (${post_id ? 'id ' + post_id : 'slug ' + slug})` };
    return data;
  }

  // Resolve post_id from slug if needed
  const resolvedPostId = post_id || (slug ? await (async () => {
    const { data } = await supabase.from('blog_posts').select('id').eq('slug', slug).maybeSingle();
    return data?.id;
  })() : null);

  if (action === 'update') {
    if (!resolvedPostId) throw new Error('post_id or slug required for update');
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (featured_image !== undefined) {
      if (featured_image === 'auto') {
        // Look up current post to use title/excerpt as query basis
        const { data: cur } = await supabase.from('blog_posts')
          .select('title, excerpt, meta_json').eq('id', resolvedPostId).single();
        const query = cur?.title || '';
        const body = cur?.excerpt || (cur?.meta_json as any)?.topic || '';
        const photo = await findUnsplashPhoto(query, body);
        if (photo && photo !== 'no_key') {
          updates.featured_image = photo.url;
          updates.featured_image_alt = photo.alt;
        }
      } else {
        updates.featured_image = featured_image;
      }
    }
    const { data, error } = await supabase.from('blog_posts')
      .update(updates).eq('id', resolvedPostId).select('id, title, status, featured_image').single();
    if (error) throw new Error(`Update post failed: ${error.message}`);
    return { post_id: data.id, status: 'updated', featured_image: data.featured_image };
  }

  if (action === 'publish') {
    if (!resolvedPostId) throw new Error('post_id or slug required for publish');
    const { data, error } = await supabase.from('blog_posts')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', resolvedPostId).select('id, title, slug, status').single();
    if (error) throw new Error(`Publish failed: ${error.message}`);
    return { post_id: data.id, slug: data.slug, status: 'published' };
  }

  if (action === 'unpublish') {
    if (!resolvedPostId) throw new Error('post_id or slug required for unpublish');
    const { data, error } = await supabase.from('blog_posts')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', resolvedPostId).select('id, title, status').single();
    if (error) throw new Error(`Unpublish failed: ${error.message}`);
    return { post_id: data.id, status: 'draft' };
  }

  if (action === 'delete') {
    if (!resolvedPostId) throw new Error('post_id or slug required for delete');
    const { error } = await supabase.from('blog_posts').delete().eq('id', resolvedPostId);
    if (error) throw new Error(`Delete post failed: ${error.message}`);
    return { post_id: resolvedPostId, status: 'deleted' };
  }

  throw new Error(`Unknown blog posts action: ${action}. Supported: list, get, update, publish, unpublish, delete`);
}

// =============================================================================
// Bookings management handler
// =============================================================================

async function executeBookingsManagement(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action = 'list', booking_id, status, assigned_employee_id, period = 'month', limit = 50, customer_email, customer_phone } = args as any;

  if (action === 'list') {
    const since = new Date();
    if (period === 'today') since.setHours(0, 0, 0, 0);
    else if (period === 'week') since.setDate(since.getDate() - 7);
    else since.setMonth(since.getMonth() - 1);

    let query = supabase.from('bookings')
      .select('id, customer_name, customer_email, customer_phone, start_time, end_time, status, service_id, assigned_employee_id, created_at')
      .gte('start_time', since.toISOString())
      .order('start_time', { ascending: true }).limit(limit);
    if (status) query = query.eq('status', status);
    // "When is my appointment?" — callers identify by email or phone.
    if (customer_email) query = query.ilike('customer_email', String(customer_email).trim());
    if (customer_phone) {
      const suffix = String(customer_phone).replace(/\D/g, '').slice(-7);
      if (suffix) query = query.ilike('customer_phone', `%${suffix}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`List bookings failed: ${error.message}`);
    return { bookings: data || [] };
  }

  if (action === 'get' && booking_id) {
    const { data, error } = await supabase.from('bookings')
      .select('*').eq('id', booking_id).maybeSingle();
    if (error) throw new Error(`Get booking failed: ${error.message}`);
    if (!data) return { found: false, error: `Booking ${booking_id} not found` };
    return data;
  }

  if (action === 'update_status' && booking_id && status) {
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'cancelled') updates.cancelled_at = new Date().toISOString();
    const { data, error } = await supabase.from('bookings')
      .update(updates).eq('id', booking_id).select('id, status').single();
    if (error) throw new Error(`Update booking failed: ${error.message}`);
    return { booking_id: data.id, status: data.status };
  }

  if (action === 'assign_staff' && booking_id) {
    const { data, error } = await supabase.from('bookings')
      .update({ assigned_employee_id: assigned_employee_id || null, updated_at: new Date().toISOString() })
      .eq('id', booking_id).select('id, assigned_employee_id').single();
    if (error) throw new Error(`Assign staff failed: ${error.message}`);
    return { booking_id: data.id, assigned_employee_id: data.assigned_employee_id };
  }

  if (action === 'cancel' && booking_id) {
    const { cancelled_reason } = args as any;
    const { data, error } = await supabase.from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: cancelled_reason || null,
        updated_at: new Date().toISOString(),
      }).eq('id', booking_id).select('id, status').single();
    if (error) throw new Error(`Cancel booking failed: ${error.message}`);
    return { booking_id: data.id, status: 'cancelled' };
  }

  return { error: `Unknown bookings action: ${action}` };
}

/**
 * The parameters create_purchase_order / update_purchase_order actually READ.
 *
 * Kept identical to the two skills' tool_definition properties in
 * src/lib/modules/purchasing-module.ts — the guardrail
 * purchase-price-provenance.guardrails.test.ts fails if they drift, because a
 * declared-but-unread parameter is exactly the silence this bounce exists to
 * end (currency:"EUR" accepted by the schema, dropped by the handler, and an
 * EUR order booked in SEK).
 */
const PURCHASE_ORDER_PARAMETERS: Record<string, { type: string; description?: string; enum?: string[] }> = {
  action: { type: 'string', enum: ['create', 'update', 'get', 'list'] },
  purchase_order_id: { type: 'string' },
  vendor_id: { type: 'string' },
  currency: { type: 'string', description: "ISO code the order is placed in. Omit to take the vendor's own currency." },
  exchange_rate: { type: 'number', description: 'Accounting-currency units per unit of `currency`. Omit to stamp the stored rate for the order date.' },
  order_date: { type: 'string' },
  expected_delivery: { type: 'string' },
  status: { type: 'string' },
  notes: { type: 'string' },
  lines: { type: 'array' },
  limit: { type: 'number' },
};

/** Agent-internal keys that ride along on every call and belong to no skill. */
function isTransportKey(key: string): boolean {
  return key.startsWith('_') || key === 'trace_id' || key === 'objective_context' || key === 'skill' || key === 'skill_name';
}

function bouncePurchaseOrderArgs(
  skillName: string,
  args: Record<string, unknown>,
): { error: string; did_you_mean: Record<string, string[]>; valid_parameters: string[]; hint: string } | null {
  const unknown = Object.keys(args ?? {}).filter(
    (k) => !isTransportKey(k) && !(k in PURCHASE_ORDER_PARAMETERS),
  );
  if (unknown.length === 0) return null;
  return buildUnknownParameterBounce({
    skillName, unknown, args,
    properties: PURCHASE_ORDER_PARAMETERS,
    hasInstructions: true,
  }).body;
}

async function executeDbAction(
  supabase: any,
  table: string,
  skillName: string,
  args: Record<string, unknown>,
  auditCtx?: AuditContext,
): Promise<unknown> {
  // Defensive normalize — guarantees `data:{}` is always unwrapped
  args = normalizeSkillArgs(args as Record<string, unknown>);
  switch (table) {
    case 'site_settings': {
      // Skill-specific routing for branding skills
      if (skillName === 'site_branding_get') {
        const { data, error } = await supabase.from('site_settings')
          .select('key, value').eq('key', 'branding').maybeSingle();
        if (error) throw new Error(`Get branding failed: ${error.message}`);
        return { branding: data?.value || {} };
      }

      if (skillName === 'site_branding_update') {
        const { logo_url, primary_color, accent_color, font_family, favicon_url } = args as any;
        // The branding JSON the app READS uses logo / primaryColor / accentColor /
        // headingFont+bodyFont / favicon, with colors in HSL "H S% L%". The old handler
        // wrote logo_url/primary_color/accent_color (agent-shaped, hex) as separate keys
        // the app never reads → an agent "set the logo/brand colour" was a silent no-op
        // (QA finding 2026-07-09). Map to the app's keys and convert hex → HSL.
        const hexToHsl = (input: string): string => {
          const v = String(input).trim();
          if (!v.startsWith('#')) return v; // already HSL or a named token — pass through
          let hex = v.replace('#', '');
          if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
          const r = parseInt(hex.slice(0, 2), 16) / 255;
          const g = parseInt(hex.slice(2, 4), 16) / 255;
          const b = parseInt(hex.slice(4, 6), 16) / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          let h = 0, s = 0; const l = (max + min) / 2;
          if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
          }
          return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
        };
        const { data: existing } = await supabase.from('site_settings')
          .select('value').eq('key', 'branding').maybeSingle();
        const updated: Record<string, unknown> = { ...(existing?.value || {}) };
        if (logo_url !== undefined) updated.logo = logo_url;
        if (favicon_url !== undefined) updated.favicon = favicon_url;
        if (primary_color !== undefined) updated.primaryColor = hexToHsl(primary_color);
        if (accent_color !== undefined) updated.accentColor = hexToHsl(accent_color);
        if (font_family !== undefined) { updated.headingFont = font_family; updated.bodyFont = font_family; }
        const { error } = await supabase.from('site_settings')
          .upsert({ key: 'branding', value: updated }, { onConflict: 'key' });
        if (error) throw new Error(`Branding update failed: ${error.message}`);
        return { branding: updated, updated: true };
      }

      const { action = 'update', key, value } = args as any;

      if (action === 'get_all') {
        const { data, error } = await supabase.from('site_settings').select('key, value');
        if (error) throw new Error(`Get settings failed: ${error.message}`);
        const settings: Record<string, unknown> = {};
        for (const row of (data || [])) settings[row.key] = row.value;
        return { settings };
      }

      if (action === 'get') {
        if (!key) throw new Error('key is required');
        const { data, error } = await supabase.from('site_settings')
          .select('key, value').eq('key', key).maybeSingle();
        if (error) throw new Error(`Get setting failed: ${error.message}`);
        return data || { key, value: null, exists: false };
      }

      // update (default)
      if (!key) throw new Error('key is required for update');
      const { data, error } = await supabase.from('site_settings')
        .upsert({ key, value }, { onConflict: 'key' })
        .select().single();
      if (error) throw new Error(`Settings update failed: ${error.message}`);

      // Turning a module ON changes what the skill registry must contain, and
      // NOTHING in the deploy chain notices — agent_skills is table data born
      // from TypeScript seeds. An external operator that enables `contracts`
      // over MCP and then asks for a contract skill would find nothing: the
      // module is on, its agent surface is empty, and no browser is involved
      // anywhere in that story. Reconcile here, where the requirement changed.
      if (key === 'modules') {
        const skills = await executeSyncSkillsFromCode(supabase, {}).catch(
          (err: unknown) => ({ error: err instanceof Error ? err.message : 'skill sync failed' }),
        );
        return { key: data.key, updated: true, skills_synced: skills };
      }
      return { key: data.key, updated: true };
    }

    case 'page_views': {
      const { period = 'week', focus = 'all' } = args as any;
      const now = new Date();
      const since = new Date(now);
      switch (period) {
        case 'today': since.setHours(0, 0, 0, 0); break;
        case 'week': since.setDate(now.getDate() - 7); break;
        case 'month': since.setMonth(now.getMonth() - 1); break;
        case 'quarter': since.setMonth(now.getMonth() - 3); break;
      }

      const { data, error } = await supabase.from('page_views')
        .select('page_slug, page_title, created_at, referrer, device_type')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw new Error(`Analytics query failed: ${error.message}`);

      const views = data || [];
      const totalViews = views.length;
      const uniqueSlugs = [...new Set(views.map((v: any) => v.page_slug))];
      const topPages = uniqueSlugs.map(slug => ({
        slug,
        title: views.find((v: any) => v.page_slug === slug)?.page_title || slug,
        views: views.filter((v: any) => v.page_slug === slug).length,
      })).sort((a, b) => b.views - a.views).slice(0, 10);

      return { period, total_views: totalViews, unique_pages: uniqueSlugs.length, top_pages: topPages };
    }

    case 'profiles': {
      const { action = 'list', limit = 50 } = args as any;
      if (action === 'list') {
        const { data, error } = await supabase.from('profiles')
          .select('id, email, full_name, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw new Error(`List users failed: ${error.message}`);
        const users = data || [];
        // Roles live in user_roles (multi-role). Join in a second query.
        const ids = users.map((u: any) => u.id);
        let rolesByUser: Record<string, string[]> = {};
        if (ids.length) {
          const { data: roleRows } = await supabase
            .from('user_roles')
            .select('user_id, role')
            .in('user_id', ids);
          for (const r of (roleRows ?? []) as Array<{ user_id: string; role: string }>) {
            (rolesByUser[r.user_id] ||= []).push(r.role);
          }
        }
        return {
          users: users.map((u: any) => ({
            ...u,
            roles: rolesByUser[u.id] ?? [],
            role: (rolesByUser[u.id] ?? [])[0] ?? null,
          })),
          count: users.length,
        };
      }
      return { error: `Unknown profiles action: ${action}` };
    }

    case 'crm_tasks': {
      // Route by skill name since each skill has different parameters
      if (skillName === 'crm_task_create') {
        const { title, description, due_date, priority, lead_id, deal_id } = args as any;
        if (!title) throw new Error('title is required');
        const { data, error } = await supabase.from('crm_tasks')
          .insert({ title, description, due_date, priority: priority || 'medium', lead_id, deal_id })
          .select().single();
        if (error) throw new Error(`Create task failed: ${error.message}`);
        return { task_id: data.id, title: data.title, created: true };
      }
      if (skillName === 'crm_task_list') {
        const { lead_id, deal_id, include_completed = false, limit = 50 } = args as any;
        let query = supabase.from('crm_tasks')
          .select('id, title, description, priority, due_date, completed_at, lead_id, deal_id, created_at')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(limit);
        if (!include_completed) query = query.is('completed_at', null);
        if (lead_id) query = query.eq('lead_id', lead_id);
        if (deal_id) query = query.eq('deal_id', deal_id);
        const { data, error } = await query;
        if (error) throw new Error(`List tasks failed: ${error.message}`);
        return { tasks: data || [], count: (data || []).length };
      }
      if (skillName === 'crm_task_update') {
        const { id, title, description, due_date, priority, completed_at, completion_note } = args as any;
        if (!id) throw new Error('id is required');
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (title !== undefined) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (due_date !== undefined) updates.due_date = due_date;
        if (priority !== undefined) updates.priority = priority;
        if (completed_at !== undefined) updates.completed_at = completed_at;
        if (completion_note !== undefined) updates.completion_note = completion_note;
        if (completed_at === null) updates.completion_note = null; // reopen clears feedback
        const { data: updated, error } = await supabase.from('crm_tasks')
          .update(updates).eq('id', id)
          .select('id, title, lead_id, deal_id, completed_at, completion_note')
          .single();
        if (error) throw new Error(`Update task failed: ${error.message}`);

        // Done-with-feedback (Odoo action_feedback pattern): completing a task
        // posts it (+ note) to the record's timeline as permanent history.
        let timelinePosted = false;
        if (completed_at) {
          let timelineLeadId = updated.lead_id as string | null;
          if (!timelineLeadId && updated.deal_id) {
            const { data: deal } = await supabase.from('deals')
              .select('lead_id').eq('id', updated.deal_id).maybeSingle();
            timelineLeadId = deal?.lead_id ?? null;
          }
          if (timelineLeadId) {
            const { error: actError } = await supabase.from('lead_activities').insert({
              lead_id: timelineLeadId,
              type: 'task_completed',
              metadata: {
                task_id: updated.id,
                task_title: updated.title,
                ...(updated.deal_id ? { deal_id: updated.deal_id } : {}),
                ...(updated.completion_note ? { note: updated.completion_note } : {}),
              },
              points: 0,
            });
            timelinePosted = !actError;
          }
        }
        return { task_id: id, updated: true, ...(completed_at ? { completed: true, timeline_posted: timelinePosted } : {}) };
      }
      return { error: `Unknown crm_tasks skill: ${skillName}` };
    }

    case 'chat_conversations': {
      if (skillName === 'support_list_conversations') {
        const { status = 'active', limit = 20 } = args as any;
        let query = supabase.from('chat_conversations')
          .select('id, title, customer_name, customer_email, conversation_status, priority, sentiment_score, created_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit);
        if (status !== 'all') query = query.eq('conversation_status', status);
        const { data, error } = await query;
        if (error) throw new Error(`List conversations failed: ${error.message}`);
        return { conversations: data || [], count: (data || []).length };
      }
      if (skillName === 'support_assign_conversation') {
        const { conversation_id, agent_id, priority, status: newStatus } = args as any;
        if (!conversation_id) throw new Error('conversation_id is required');
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (agent_id !== undefined) updates.assigned_agent_id = agent_id;
        if (priority !== undefined) updates.priority = priority;
        if (newStatus !== undefined) updates.conversation_status = newStatus;
        // .select() so we can verify a row actually matched. Without this the
        // update silently affects 0 rows yet still reports updated:true — e.g.
        // when the caller passes a `tickets` id (from email_to_ticket) as the
        // conversation_id, since tickets and chat_conversations are separate
        // tables. Fail honestly and point the operator at the right entity.
        const { data, error } = await supabase.from('chat_conversations')
          .update(updates).eq('id', conversation_id).select('id');
        if (error) throw new Error(`Assign conversation failed: ${error.message}`);
        if (!data || data.length === 0) {
          throw new Error(
            `No chat_conversation found with id ${conversation_id}. This skill only manages chat_conversations — tickets created via email_to_ticket live in the 'tickets' table and are not assignable here.`,
          );
        }
        return { conversation_id, updated: true };
      }
      return { error: `Unknown chat_conversations skill: ${skillName}` };
    }

    case 'chat_feedback': {
      const { period = 'week', limit = 100 } = args as any;
      const now = new Date();
      const since = new Date(now);
      switch (period) {
        case 'today': since.setHours(0, 0, 0, 0); break;
        case 'week': since.setDate(now.getDate() - 7); break;
        case 'month': since.setMonth(now.getMonth() - 1); break;
      }
      const { data, error } = await supabase.from('chat_feedback')
        .select('id, rating, user_question, ai_response, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Get feedback failed: ${error.message}`);
      const ratings = (data || []);
      const positive = ratings.filter((r: any) => r.rating === 'positive').length;
      const negative = ratings.filter((r: any) => r.rating === 'negative').length;
      return { period, total: ratings.length, positive, negative, satisfaction_rate: ratings.length > 0 ? Math.round(positive / ratings.length * 100) : null, recent: ratings.slice(0, 10) };
    }

    case 'run_bookkeeping_sweep': {
      // ─── Pipeline-collapse composite (FlowPilot 2.0 Phase 2, Hermes pattern) ─
      // The whole daily bookkeeping chain as ONE deterministic, idempotent step:
      //   rules → match → propose → auto-book (confidence ≥95 only).
      // The reason() loop (or a cron automation) invokes this as a single skill
      // instead of hand-walking 4 skills across heartbeats. Everything below
      // reuses the EXISTING atomic paths (recursive executeDbAction / rpc /
      // edge), so guards, learning and idempotency are inherited, not re-built:
      // booked events get journal_entry_id and drop out of the next run.
      // Non-auto proposals stay in the "Händelser att bokföra" review queue —
      // the autonomy dial still governs the composite skill itself.
      const sweepLimit = Math.min(Number((args as any).limit) || 50, 200);
      let autoBook = (args as any).auto_book !== false;
      const summary: Record<string, unknown> = {};

      // Dial inheritance (safe-by-construction): the composite must never be a
      // way around a stricter gate on the inner money skill. If the admin has
      // set manage_journal_entry to 'approve', the sweep queues EVERYTHING for
      // review instead of booking — and says so.
      if (autoBook) {
        const { data: journalSkill } = await supabase
          .from('agent_skills').select('trust_level').eq('name', 'manage_journal_entry').maybeSingle();
        if (journalSkill?.trust_level === 'approve') {
          autoBook = false;
          summary.auto_book_disabled = 'manage_journal_entry is trust=approve — all proposals queued for human review';
        }
      }

      // 1. Reconciliation rules — tag unmatched events (non-fatal).
      try {
        const { data: tagged, error: rulesErr } = await supabase.rpc('apply_reconciliation_rules');
        summary.rules_tagged = rulesErr ? `error: ${rulesErr.message}` : (tagged ?? 0);
      } catch (e) { summary.rules_tagged = `error: ${(e as Error).message}`; }

      // 2. Auto-match against invoices/expenses/orders. Direct internal call —
      // the `reconciliation` edge fn was removed in the edge-surface refactor
      // (B1b); the logic lives in _shared/handlers/reconciliation.ts. The old
      // fetch 404'd and swallowed it into summary.auto_matched="HTTP 404", so
      // bank transactions silently never auto-matched. (cloud review finding #1)
      try {
        const matchOut = await executeReconciliation('auto-match', {}) as any;
        summary.auto_matched = matchOut?.error ? `error: ${matchOut.error}` : (matchOut?.matched ?? matchOut?.matches ?? matchOut);
      } catch (e) { summary.auto_matched = `error: ${(e as Error).message}`; }

      // 3. Propose bookings for what remains unbooked.
      const proposals = await executeDbAction(supabase, 'propose_bookkeeping', 'propose_bookkeeping', { limit: sweepLimit }, auditCtx) as any;
      const rows: any[] = proposals?.proposals || proposals?.events || (Array.isArray(proposals) ? proposals : []);
      summary.scanned = rows.length;

      // 4. Book the sanctioned-auto tier (≥95 confidence); one bad event must
      //    never kill the sweep — per-event try/catch, failures reported.
      let booked = 0; const bookErrors: string[] = []; let queued = 0; let escalated = 0;
      for (const p of rows) {
        if (p.status === 'propose') { queued++; continue; }
        if (p.status === 'escalate') { escalated++; continue; }
        if (p.status !== 'auto' || p.already_booked) continue;
        if (!autoBook) { queued++; continue; }
        try {
          await executeDbAction(supabase, 'journal_entries', 'manage_journal_entry', {
            action: 'create',
            template_id: p.suggested_template_id,
            amount_cents: p.suggested_amount_cents,
            description: p.description || p.counterparty || 'Bank event',
            bank_transaction_id: p.bank_transaction_id,
            auto_confirm: true,
          }, auditCtx);
          booked++;
        } catch (e) {
          bookErrors.push(`${(p.bank_transaction_id || p.id || '?')}: ${(e as Error).message}`.slice(0, 120));
        }
      }
      summary.auto_booked = booked;
      summary.queued_for_review = queued;
      summary.escalated = escalated;
      if (bookErrors.length) summary.book_errors = bookErrors;

      return { sweep: 'bookkeeping', ...summary };
    }

    case 'run_month_end_invoicing': {
      // ─── Pipeline-collapse composite: month-end billing as ONE step ─────────
      // (a) every project with billable uninvoiced time in the period → one
      //     invoice draft; (b) every active subscription whose period has
      //     lapsed → renewal invoice. Idempotent: invoiced time entries and
      //     renewed periods drop out of the next run. Drafts are NOT sent —
      //     sending stays behind its own skill/approval (dial-preserving).
      const now2 = new Date();
      const defStart = new Date(now2.getFullYear(), now2.getMonth() - 1, 1);
      const defEnd = new Date(now2.getFullYear(), now2.getMonth(), 0);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const startDate = (args as any).start_date || iso(defStart);
      const endDate = (args as any).end_date || iso(defEnd);

      // Dial inheritance — a leg whose inner skill is approve-gated is skipped
      // (queued for a human-initiated run), never silently bypassed.
      const { data: innerTrust } = await supabase
        .from('agent_skills').select('name, trust_level')
        .in('name', ['bulk_invoice_from_timesheets', 'generate_subscription_invoice']);
      const trustOf = (n: string) => (innerTrust || []).find((s: any) => s.name === n)?.trust_level;
      const tsGated = trustOf('bulk_invoice_from_timesheets') === 'approve';
      const subGated = trustOf('generate_subscription_invoice') === 'approve';

      // (a) timesheets → invoice drafts, per project with uninvoiced billable time
      const { data: billable } = await supabase
        .from('time_entries')
        .select('project_id')
        .eq('is_billable', true)
        .is('invoice_id', null)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .not('project_id', 'is', null);
      const projectIds = tsGated ? [] : [...new Set((billable || []).map((t: any) => t.project_id))];
      const invoices: any[] = []; const tsErrors: string[] = [];
      for (const pid of projectIds) {
        try {
          const { data: inv, error: invErr } = await supabase.rpc('bulk_invoice_from_timesheets', {
            p_project_id: pid, p_start_date: startDate, p_end_date: endDate,
          });
          if (invErr) throw new Error(invErr.message);
          for (const row of inv || []) invoices.push({ project_id: pid, invoice_number: row.invoice_number, total_cents: row.total_cents, hours: row.hours_billed });
        } catch (e) { tsErrors.push(`${pid}: ${(e as Error).message}`.slice(0, 120)); }
      }

      // (b) subscription renewals — active subs whose paid period has lapsed
      const { data: dueSubs } = await supabase
        .from('subscriptions')
        .select('id, current_period_end')
        .eq('status', 'active')
        .lte('current_period_end', new Date().toISOString());
      const renewals: any[] = []; const subErrors: string[] = [];
      for (const s of subGated ? [] : (dueSubs || [])) {
        try {
          const { data: out, error: subErr } = await supabase.rpc('generate_subscription_invoice', { _subscription_id: s.id });
          if (subErr) throw new Error(subErr.message);
          renewals.push({ subscription_id: s.id, result: out });
        } catch (e) { subErrors.push(`${s.id}: ${(e as Error).message}`.slice(0, 120)); }
      }

      return {
        sweep: 'month_end_invoicing',
        period: { start: startDate, end: endDate },
        timesheet_invoices: invoices,
        projects_billed: invoices.length,
        projects_failed: tsErrors.length ? tsErrors : undefined,
        subscription_renewals: renewals.length,
        renewals_failed: subErrors.length ? subErrors : undefined,
        skipped_due_to_trust: (tsGated || subGated)
          ? [tsGated ? 'timesheets (bulk_invoice_from_timesheets is approve-gated)' : null,
             subGated ? 'subscriptions (generate_subscription_invoice is approve-gated)' : null].filter(Boolean)
          : undefined,
      };
    }

    case 'propose_bookkeeping': {
      // ─── Agentic bookkeeping: propose double-entry for unbooked bank events ─
      // Read-only sensor. For each unbooked bank_transaction it ranks a
      // template (same scoring as manage_journal_entry), derives the NET base
      // from the GROSS bank amount, and expands the proposed debit/credit lines
      // + a confidence. It does NOT post — the accept path calls
      // manage_journal_entry {template_id, amount_cents: suggested_amount_cents,
      // reference_number}. This is the queue behind "Händelser att bokföra".
      const { bank_transaction_ids, limit = 50 } = args as any;

      let events: any[] | null = null;
      if (Array.isArray(bank_transaction_ids) && bank_transaction_ids.length > 0) {
        const { data, error } = await supabase.from('bank_transactions')
          .select('id, transaction_date, amount_cents, currency, counterparty, reference, description, status, journal_entry_id')
          .in('id', bank_transaction_ids);
        if (error) throw new Error(`Load bank events failed: ${error.message}`);
        events = data;
      } else {
        const { data, error } = await supabase.from('bank_transactions')
          .select('id, transaction_date, amount_cents, currency, counterparty, reference, description, status, journal_entry_id')
          .is('journal_entry_id', null)
          // ONLY unclaimed events. status='matched'/'partial' means the
          // reconciliation pipeline matched this tx to an invoice/expense —
          // it will be (or was) booked by THAT pipeline; proposing it here
          // would double-book (system-sweep finding #B1, 2026-07-07).
          .eq('status', 'unmatched')
          .order('transaction_date', { ascending: false })
          .limit(Math.min(Number(limit) || 50, 200));
        if (error) throw new Error(`Load unbooked bank events failed: ${error.message}`);
        events = data;
      }

      const { data: allTemplates } = await supabase.from('accounting_templates')
        .select('id, template_name, description, keywords, template_lines, usage_count, category');

      // Vendor defaults WIN over keyword scoring (routing rule #1, same as
      // manage_journal_entry's instructions): a counterparty the books have
      // learned ("SKATTEVERKET → Insättning till skattekonto") is proposed at
      // confidence 98 regardless of how vague the bank text is.
      const { data: vendorRows } = await supabase.from('vendors')
        .select('name, last_used_template_id')
        .not('last_used_template_id', 'is', null)
        .eq('is_active', true);
      const vendorDefaults = new Map<string, string>(
        (vendorRows || []).map((v: any) => [String(v.name).toLowerCase().trim(), v.last_used_template_id]),
      );

      // Graduated counterparty confidence (Accounted-style trust ramp): a set
      // default starts at 88 (review lane), +5 per CONFIRMED booking of this
      // counterparty, capped 98 — after two confirmations it books itself.
      // Aggregated in SQL (review finding H4): the old full-table pull silently
      // truncated at PostgREST's row cap (~1000), so on a mature ledger the
      // confidence — and the auto-vs-propose routing — was computed from an
      // undercount. Falls back to the old query if the RPC isn't deployed yet.
      const confirmedByCounterparty = new Map<string, number>();
      const { data: aggCounts, error: aggErr } = await supabase.rpc('booked_counterparty_counts');
      if (!aggErr && Array.isArray(aggCounts)) {
        for (const r of aggCounts) {
          confirmedByCounterparty.set(String(r.counterparty).toLowerCase().trim(), Number(r.cnt) || 0);
        }
      } else {
        const { data: bookedCounts } = await supabase.from('bank_transactions')
          .select('counterparty')
          .not('journal_entry_id', 'is', null)
          .not('counterparty', 'is', null);
        for (const r of bookedCounts || []) {
          const k = String(r.counterparty).toLowerCase().trim();
          confirmedByCounterparty.set(k, (confirmedByCounterparty.get(k) || 0) + 1);
        }
      }

      // Direction partition is event-independent (review finding M3): compute
      // each template's bank direction ONCE instead of per event (was N×M).
      const templatesByDirection: Record<'inflow' | 'outflow', any[]> = { inflow: [], outflow: [] };
      for (const t of allTemplates || []) {
        const dir = acctTemplateBankDirection(t.template_lines);
        if (dir) templatesByDirection[dir].push(t);
      }

      const proposals = (events || []).map((ev: any) => {
        const searchTerms = `${ev.counterparty || ''} ${ev.description || ''} ${ev.reference || ''}`.trim();
        const grossCents = Math.abs(ev.amount_cents || 0);
        const base = {
          bank_transaction_id: ev.id,
          transaction_date: ev.transaction_date,
          amount_cents: ev.amount_cents,
          counterparty: ev.counterparty,
          description: ev.description,
          already_booked: !!ev.journal_entry_id,
        };
        if (!allTemplates || allTemplates.length === 0 || !searchTerms) {
          return { ...base, status: 'escalate', confidence: 0,
            reason: !searchTerms ? 'No counterparty/description to match on' : 'No accounting templates exist',
            suggested_amount_cents: grossCents, proposed_lines: [], top_candidates: [] };
        }
        // Direction filter: an outflow may only match templates that pay OUT
        // of the bank (credit 19xx); an inflow only templates that take money
        // IN. Prevents "bank fee booked as revenue" class of mismatches.
        const evDirection: 'inflow' | 'outflow' = (ev.amount_cents || 0) >= 0 ? 'inflow' : 'outflow';
        const directionCompatible = templatesByDirection[evDirection];
        if (directionCompatible.length === 0) {
          return { ...base, status: 'escalate', confidence: 0,
            reason: `No ${evDirection}-direction template exists — create one via manage_accounting_template`,
            suggested_amount_cents: grossCents, proposed_lines: [], top_candidates: [] };
        }
        const scored = acctScoreTemplates(directionCompatible, searchTerms);

        // Routing rule #1: vendor default wins (if direction-compatible).
        const vendorTplId = vendorDefaults.get(String(ev.counterparty || '').toLowerCase().trim());
        const vendorTpl = vendorTplId
          ? directionCompatible.find((t: any) => t.id === vendorTplId) ?? null
          : null;
        if (vendorTpl) {
          const isPctV = acctIsPctTemplate(vendorTpl.template_lines);
          const netBaseV = isPctV ? acctNetBaseFromGross(vendorTpl.template_lines, grossCents) : grossCents;
          const confirmed = confirmedByCounterparty.get(String(ev.counterparty || '').toLowerCase().trim()) || 0;
          const vendorConfidence = Math.min(98, 88 + 5 * confirmed);
          return {
            ...base,
            status: vendorConfidence >= 95 ? 'auto' : 'propose',
            confidence: vendorConfidence,
            suggested_template_id: vendorTpl.id,
            suggested_template_name: vendorTpl.template_name,
            suggested_amount_cents: netBaseV,
            match_details: ['vendor-default', `booked ${confirmed} time(s) before for this counterparty`],
            proposed_lines: isPctV
              ? acctExpandTemplateLines(vendorTpl.template_lines, netBaseV, grossCents)
              : vendorTpl.template_lines,
            top_candidates: [
              { template_id: vendorTpl.id, name: vendorTpl.template_name, confidence: vendorConfidence },
              ...scored.slice(0, 2).map((s) => ({ template_id: s.template.id, name: s.template.template_name, confidence: s.confidence })),
            ],
          };
        }
        const best = scored[0];
        const status = best.confidence >= 95 ? 'auto' : best.confidence >= 70 ? 'propose' : 'escalate';
        const isPct = acctIsPctTemplate(best.template.template_lines);
        const netBase = isPct ? acctNetBaseFromGross(best.template.template_lines, grossCents) : grossCents;
        const proposedLines = status === 'escalate'
          ? []
          : (isPct ? acctExpandTemplateLines(best.template.template_lines, netBase, grossCents) : best.template.template_lines);
        return {
          ...base,
          status,
          confidence: best.confidence,
          suggested_template_id: best.template.id,
          suggested_template_name: best.template.template_name,
          // amount to pass to manage_journal_entry (NET base for pct templates):
          suggested_amount_cents: netBase,
          match_details: best.matchDetails,
          proposed_lines: proposedLines,
          top_candidates: scored.slice(0, 3).map((s) => ({
            template_id: s.template.id, name: s.template.template_name, confidence: s.confidence,
          })),
        };
      });

      return {
        proposals,
        summary: {
          total: proposals.length,
          auto: proposals.filter((p: any) => p.status === 'auto').length,
          propose: proposals.filter((p: any) => p.status === 'propose').length,
          escalate: proposals.filter((p: any) => p.status === 'escalate').length,
        },
      };
    }

    case 'journal_entries': {
      // ─── Accounting: Journal Entries & Reports ─────────────────────────
      if (skillName === 'suggest_accounting_template') {
        const { min_occurrences = 3, since_date } = args as any;

        let query = supabase.from('journal_entry_lines').select(`
          account_code, account_name, debit_cents, credit_cents,
          journal_entries!inner(id, entry_date, description, status)
        `).eq('journal_entries.status', 'posted');
        if (since_date) query = query.gte('journal_entries.entry_date', since_date);
        const { data: lines, error } = await query.limit(1000);
        if (error) throw new Error(`Query failed: ${error.message}`);

        // Group lines by journal_entry_id, then find recurring account patterns
        const entryMap = new Map<string, { accounts: string[]; description: string }>();
        for (const l of (lines || []) as any[]) {
          const eid = l.journal_entries.id;
          if (!entryMap.has(eid)) entryMap.set(eid, { accounts: [], description: l.journal_entries.description });
          entryMap.get(eid)!.accounts.push(l.account_code);
        }

        // Create pattern signatures
        const patternCounts = new Map<string, { count: number; descriptions: string[]; accounts: string[] }>();
        for (const [, entry] of entryMap) {
          const sig = entry.accounts.sort().join(',');
          const existing = patternCounts.get(sig) || { count: 0, descriptions: [], accounts: entry.accounts };
          existing.count++;
          if (existing.descriptions.length < 5) existing.descriptions.push(entry.description);
          patternCounts.set(sig, existing);
        }

        // Filter by min_occurrences and check against existing templates
        const { data: existingTemplates } = await supabase.from('accounting_templates').select('template_lines');
        const existingSigs = new Set((existingTemplates || []).map((t: any) => {
          const codes = (t.template_lines || []).map((l: any) => l.account_code).sort();
          return codes.join(',');
        }));

        const suggestions = [];
        for (const [sig, pattern] of patternCounts) {
          if (pattern.count >= min_occurrences && !existingSigs.has(sig)) {
            suggestions.push({
              account_codes: pattern.accounts,
              occurrences: pattern.count,
              sample_descriptions: pattern.descriptions,
              suggested_keywords: pattern.descriptions.flatMap((d: string) => d.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).slice(0, 5),
            });
          }
        }

        return { suggestions: suggestions.sort((a, b) => b.occurrences - a.occurrences).slice(0, 10), analyzed_entries: entryMap.size };
      }

      if (skillName === 'accounting_reports') {
        // Accept the schema param `type` (and legacy `report_type`); map the
        // schema enum to the internal report logic. Previously ONLY `report_type`
        // was read, so the schema's `type` was ignored and EVERY report silently
        // returned profit_loss. The chart also uses account_type='revenue' (not
        // 'income'), and the schema offers from_date/to_date — both were dropped.
        const rargs = args as any;
        const rawType: string = rargs.type || rargs.report_type || 'profit_loss';
        const TYPE_MAP: Record<string, string> = {
          income_statement: 'profit_loss', profit_loss: 'profit_loss', pnl: 'profit_loss',
          balance_sheet: 'balance_sheet',
          general_ledger: 'ledger', ledger: 'ledger', account_balance: 'ledger',
          trial_balance: 'trial_balance', unbooked_invoices: 'unbooked_invoices',
        };
        const report_type = TYPE_MAP[rawType] || rawType;
        const { period = 'all', account_code, from_date, to_date } = rargs;

        // unbooked_invoices: issued invoices not yet posted to the ledger.
        if (report_type === 'unbooked_invoices') {
          const { data: inv } = await supabase.from('invoices')
            .select('id, invoice_number, customer_name, total_cents, currency, status, issue_date, due_date')
            .not('status', 'in', '("paid","booked","posted","cancelled","void","draft")')
            .order('issue_date', { ascending: true });
          return {
            report_type: 'unbooked_invoices', period,
            invoices: inv || [], count: (inv || []).length,
            total_cents: (inv || []).reduce((s: number, i: any) => s + Number(i.total_cents || 0), 0),
          };
        }

        // Date filter — explicit from_date/to_date take precedence over `period`.
        let sinceDate: string | null = from_date || null;
        const untilDate: string | null = to_date || null;
        if (!sinceDate && period !== 'all') {
          const now = new Date();
          const since = new Date(now);
          if (period === 'month') since.setMonth(now.getMonth() - 1);
          else if (period === 'quarter') since.setMonth(now.getMonth() - 3);
          else if (period === 'year') since.setFullYear(now.getFullYear() - 1);
          sinceDate = since.toISOString();
        }

        // Fetch posted lines with optional filters
        let linesQuery = supabase.from('journal_entry_lines').select(`
          account_code, account_name, debit_cents, credit_cents, description,
          journal_entries!inner(id, entry_date, description, status)
        `).eq('journal_entries.status', 'posted');

        if (sinceDate) linesQuery = linesQuery.gte('journal_entries.entry_date', sinceDate);
        if (untilDate) linesQuery = linesQuery.lte('journal_entries.entry_date', untilDate);
        if (account_code) linesQuery = linesQuery.eq('account_code', account_code);

        const { data: lines, error: linesErr } = await linesQuery;
        if (linesErr) throw new Error(`Accounting query failed: ${linesErr.message}`);

        // Fetch chart of accounts for classification
        const { data: chart } = await supabase.from('chart_of_accounts')
          .select('account_code, account_name, account_type, account_category, normal_balance')
          .eq('is_active', true);
        const chartMap = new Map((chart || []).map((a: any) => [a.account_code, a]));

        // Aggregate balances
        const balanceMap = new Map<string, { account_code: string; account_name: string; account_type: string; debit_total: number; credit_total: number; balance: number }>();
        for (const line of (lines || []) as any[]) {
          const existing = balanceMap.get(line.account_code) || {
            account_code: line.account_code,
            account_name: line.account_name,
            account_type: chartMap.get(line.account_code)?.account_type || 'unknown',
            debit_total: 0, credit_total: 0, balance: 0,
          };
          existing.debit_total += Number(line.debit_cents || 0);
          existing.credit_total += Number(line.credit_cents || 0);
          balanceMap.set(line.account_code, existing);
        }

        // Merge OPENING BALANCES (IB) for balance-sheet accounts. IB is a
        // STATE (opening_balances table, per fiscal_year), not a journal
        // transaction — this is the single IB mechanism (2026-07-07 decision;
        // the verifikat-IB approach was rejected: it pollutes the journal and
        // makes the IB|movement|UB three-column report impossible).
        // Fiscal year = year of the report's end date (BR is an as-of report).
        const fiscalYearForIB = new Date(untilDate || new Date().toISOString()).getFullYear();
        const { data: ibRows } = await supabase.from('opening_balances')
          .select('account_code, account_name, amount_cents, balance_type')
          .eq('fiscal_year', fiscalYearForIB);
        const ibByAccount = new Map<string, number>();
        for (const ib of (ibRows || []) as any[]) {
          // signed in the account's NORMAL direction: debit-normal accounts
          // count debit-IB as +, credit-normal count credit-IB as +.
          const normal = chartMap.get(ib.account_code)?.normal_balance
            || (ib.balance_type === 'debit' ? 'debit' : 'credit');
          const signed = ib.balance_type === normal ? Number(ib.amount_cents) : -Number(ib.amount_cents);
          ibByAccount.set(ib.account_code, (ibByAccount.get(ib.account_code) || 0) + signed);
          if (!balanceMap.has(ib.account_code)) {
            balanceMap.set(ib.account_code, {
              account_code: ib.account_code,
              account_name: ib.account_name || chartMap.get(ib.account_code)?.account_name || ib.account_code,
              account_type: chartMap.get(ib.account_code)?.account_type || 'unknown',
              debit_total: 0, credit_total: 0, balance: 0,
            });
          }
        }

        // Calculate balances based on normal_balance. Balance-sheet accounts
        // (asset/liability/equity) carry IB + movement; P&L accounts are
        // period-only (their IB is inside equity via retained earnings).
        for (const [code, bal] of balanceMap) {
          const normalBalance = chartMap.get(code)?.normal_balance || 'debit';
          const movement = normalBalance === 'debit'
            ? bal.debit_total - bal.credit_total
            : bal.credit_total - bal.debit_total;
          const acctType = bal.account_type;
          const opening = (acctType === 'asset' || acctType === 'liability' || acctType === 'equity')
            ? (ibByAccount.get(code) || 0) : 0;
          (bal as any).opening_cents = opening;
          (bal as any).movement_cents = movement;
          bal.balance = opening + movement;
        }

        const balances = Array.from(balanceMap.values()).sort((a, b) => a.account_code.localeCompare(b.account_code));

        // Which account carries the year's result, and which form the tax line,
        // are properties of THIS instance's chart — see
        // supabase/functions/_shared/accounting/income-statement.ts. Loaded once
        // here because the balance sheet needs the same answer as the P&L: the
        // result may only appear in equity once.
        const stmtClassification = await loadStatementClassification(supabase);

        if (report_type === 'ledger') {
          return { report_type: 'general_ledger', period, accounts: balances, total_accounts: balances.length };
        }

        if (report_type === 'trial_balance') {
          const totalDebit = balances.reduce((s, b) => s + b.debit_total, 0);
          const totalCredit = balances.reduce((s, b) => s + b.credit_total, 0);
          return {
            report_type: 'trial_balance', period,
            accounts: balances,
            total_debit_cents: totalDebit,
            total_credit_cents: totalCredit,
            balanced: totalDebit === totalCredit,
          };
        }

        if (report_type === 'balance_sheet') {
          const assets = balances.filter(b => b.account_type === 'asset' && b.balance !== 0);
          const liabilities = balances.filter(b => b.account_type === 'liability' && b.balance !== 0);
          const equity = balances.filter(b => b.account_type === 'equity' && b.balance !== 0);
          // Orphaned accounts: referenced by posted journal_entry_lines but
          // missing (or wrongly typed) in chart_of_accounts. Without surfacing
          // these, the report would silently drop them and appear unbalanced.
          const unclassified = balances.filter(b =>
            b.account_type !== 'asset' &&
            b.account_type !== 'liability' &&
            b.account_type !== 'equity' &&
            b.account_type !== 'revenue' &&
            b.account_type !== 'income' &&
            b.account_type !== 'expense' &&
            b.balance !== 0);
          const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
          const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
          // Current-period net result sits in equity as "current year earnings"
          // until the closing entry moves it onto an equity account — without it
          // the balance sheet won't balance mid-year, and WITH it after closing
          // the result would be counted in equity twice. So the plug is the part
          // that has NOT yet been carried across, which is zero once the closing
          // entry exists. The old sum reached the same figure by including the
          // result carrier as an ordinary expense — right by accident, and only
          // for as long as the income statement stayed wrong.
          const currentYearResult = unclosedResultCents(balances, stmtClassification);
          const closedToEquity = closedToEquityCents(balances, stmtClassification);
          const totalEquity = equity.reduce((s, a) => s + a.balance, 0) + currentYearResult;
          const unclassifiedCents = unclassified.reduce((s, a) => s + a.balance, 0);
          if (unclassified.length > 0) {
            console.warn(
              `[balance_sheet] ${unclassified.length} orphan account(s) not classified in chart_of_accounts:`,
              unclassified.map(u => `${u.account_code} (${u.balance} cents)`).join(', ')
            );
          }
          return {
            report_type: 'balance_sheet', period,
            assets, liabilities, equity,
            unclassified,
            unclassified_cents: unclassifiedCents,
            current_year_result_cents: currentYearResult,
            closed_to_equity_cents: closedToEquity,
            result_carrier_source: stmtClassification.source,
            total_assets_cents: totalAssets,
            total_liabilities_cents: totalLiabilities,
            total_equity_cents: totalEquity,
            balanced: totalAssets === totalLiabilities + totalEquity + unclassifiedCents,
          };
        }

        if (report_type === 'profit_loss') {
          // total_expenses_cents now excludes tax and the result carrier, and
          // result_before_tax_cents is a real line — the shape an årsredovisning
          // reads in: … / Resultat före skatt / Skatt på årets resultat / Årets
          // resultat.
          const statement = buildIncomeStatement(balances, stmtClassification);
          return { report_type: 'profit_loss', period, locale: stmtClassification.locale, ...statement };
        }

        return { error: `Unknown report type: ${rawType}` };
      }

      // ─── manage_journal_entry ──────────────────────────────────────────
      const { action = 'create' } = args as any;

      // Resolve `source` for journal_entries.source column from the actual
      // channel that invoked us. auditCtx.agent_type is 'flowpilot' | 'chat' | 'mcp'
      // — chat means Flowchat (visitor uploads a receipt, admin asks in chat),
      // mcp means an external agent (OpenClaw, Claude Code, Copilot).
      // Caller may override via args.source (e.g. 'manual' from admin UI).
      const _callerAgent = auditCtx?.agent_type;
      const resolvedSource: string =
        ((args as any).source && typeof (args as any).source === 'string')
          ? (args as any).source
          : (_callerAgent === 'chat' ? 'chat'
            : _callerAgent === 'mcp' ? 'mcp'
            : _callerAgent === 'flowpilot' ? 'flowpilot'
            : 'agent');



      if (action === 'list') {
        const { data, error } = await supabase.from('journal_entries')
          .select('id, entry_date, description, reference_number, status, source, created_at')
          .order('entry_date', { ascending: false })
          .limit(50);
        if (error) throw new Error(`List entries failed: ${error.message}`);
        return { entries: data, count: (data || []).length };
      }

      if (action === 'delete') {
        const { entry_id } = args as any;
        if (!entry_id) throw new Error('entry_id is required for delete action');

        const { data: existing, error: exErr } = await supabase.from('journal_entries')
          .select('id, status, description, reference_number').eq('id', entry_id).maybeSingle();
        if (exErr) throw new Error(`Lookup failed: ${exErr.message}`);
        if (!existing) return { deleted: false, entry_id, error: 'Journal entry not found (already deleted?)' };
        if (existing.status === 'posted') {
          return {
            deleted: false,
            entry_id,
            status: existing.status,
            error: 'Cannot delete a posted journal entry — use action=void to create a reversal instead.',
          };
        }

        // Delete child rows first (in case FK cascade isn't configured)
        await supabase.from('journal_entry_line_taxes')
          .delete()
          .in('journal_entry_line_id',
            (await supabase.from('journal_entry_lines').select('id').eq('journal_entry_id', entry_id)).data?.map((r: any) => r.id) || []
          );
        await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', entry_id);
        const { error: delErr } = await supabase.from('journal_entries').delete().eq('id', entry_id);
        if (delErr) throw new Error(`Delete failed: ${delErr.message}`);

        return { deleted: true, entry_id, previous_status: existing.status, description: existing.description };
      }

      if (action === 'void') {

        const { entry_id } = args as any;
        if (!entry_id) throw new Error('entry_id is required for void action');

        // Get original entry + lines
        const { data: original, error: origErr } = await supabase.from('journal_entries')
          .select('*').eq('id', entry_id).single();
        if (origErr) throw new Error(`Entry not found: ${origErr.message}`);

        // Already reversed → say so instead of writing a second reversal, which
        // would leave the books off by the entry's amount in the other direction.
        if (original.reversed_by) {
          return {
            voided: false, original_id: entry_id, reversal_id: original.reversed_by,
            error: 'This entry has already been reversed. Its reversal is reversal_id — the two net to zero. ' +
              'If the correction itself was wrong, book the fix as a new entry rather than reversing twice.',
          };
        }

        const { data: origLines } = await supabase.from('journal_entry_lines')
          .select('*').eq('journal_entry_id', entry_id);

        // The original STAYS posted. A booked verification is never unbooked —
        // it is corrected by a mirror entry, and the two cancel in every report
        // on their own. Marking it 'voided' (which is what this did until
        // 2026-08-10) dropped it out of every report that filters status=posted
        // while the reversal kept counting, so a voided sale read as a VAT
        // refund. See migration 20260810000000.
        const { data: reversal, error: revErr } = await supabase.from('journal_entries')
          .insert({
            // Today, not the original's date: you do not rewrite a period you
            // have already declared. A June entry reversed in August belongs in
            // August's return as a correction.
            entry_date: new Date().toISOString().split('T')[0],
            description: `Reversal: ${original.description}`,
            reference_number: `REV-${original.reference_number || entry_id.slice(0, 8)}`,
            status: 'posted',
            source: resolvedSource,
            reverses: entry_id,
          }).select('id').single();
        if (revErr) throw new Error(`Reversal failed: ${revErr.message}`);

        await supabase.from('journal_entries')
          .update({ reversed_by: reversal.id }).eq('id', entry_id);

        // Reverse lines (swap debit/credit)
        if (origLines && origLines.length > 0) {
          await supabase.from('journal_entry_lines').insert(
            origLines.map((l: any) => ({
              journal_entry_id: reversal.id,
              account_code: l.account_code,
              account_name: l.account_name,
              debit_cents: l.credit_cents,
              credit_cents: l.debit_cents,
              description: `Reversal: ${l.description || ''}`,
            }))
          );
        }

        // Void coherence: if the voided entry was booked from a bank event,
        // release the link so the event returns to the queue and can be
        // re-booked correctly (otherwise the idempotency guard blocks the
        // correction path — found via the GEN3/25 correction, 2026-07-07).
        const { data: linkedTx, error: linkErr } = await supabase.from('bank_transactions')
          .update({ journal_entry_id: null, status: 'unmatched' })
          .eq('journal_entry_id', entry_id)
          .select('id');
        // bank_events_released rapporteras till användaren. Ett svalt fel hade
        // sagt "0 frisläppta" om händelser som fortfarande sitter fast.
        if (linkErr) throw new Error(`releasing bank events failed: ${linkErr.message}`);

        return {
          voided: true, original_id: entry_id, reversal_id: reversal.id,
          original_status: 'posted',
          bank_events_released: (linkedTx || []).length,
          note: 'The original entry is still posted and still counts — a booked verification is never unbooked. '
            + `The reversal (${reversal.id}) mirrors it and the two net to zero in every report. `
            + 'The reversal is dated today, so a period you have already declared stays as declared and the correction lands in the current one.'
            + ((linkedTx && linkedTx.length > 0)
              ? ' Linked bank event(s) returned to the events-to-book queue — re-book with the correct template and bank_transaction_id.'
              : ''),
        };
      }

      // action === 'create'
      const { entry_date, description, reference_number, template_name, auto_confirm, template_id: explicitTemplateId, amount_cents } = args as any;
      let { lines: entryLines } = args as any;

      // Template expansion + scoring use the SHARED helpers (acctExpandTemplateLines,
      // acctIsPctTemplate, acctScoreTemplates) — the inline copies that used to live
      // here drifted (old substring scorer → wrong-account auto-book risk, review
      // finding C1) and were removed 2026-07-08.

      // Fetch the linked bank event EARLY (was after expansion): its gross amount
      // pins the 19xx leg during expansion (review finding H1), its date defaults
      // entry_date, and its journal link is the idempotency key.
      const bankTxIdForGuard = (args as any).bank_transaction_id;
      let bankTxDate: string | null = null;
      let bankTxCounterparty: string | null = null;
      let bankTxGrossCents: number | undefined;
      if (bankTxIdForGuard) {
        const { data: existingTx } = await supabase.from('bank_transactions')
          .select('journal_entry_id, transaction_date, counterparty, amount_cents').eq('id', bankTxIdForGuard).maybeSingle();
        // Stale-reference guard: booking against a bank event that no longer
        // exists means the caller is working from stale data (cached proposals
        // after a wipe/re-import). Refuse instead of creating an orphan entry.
        if (!existingTx) {
          throw new Error(`bank_transaction ${bankTxIdForGuard} not found — the event list is stale. Refresh proposals (propose_bookkeeping) and retry.`);
        }
        if (existingTx.journal_entry_id) {
          return {
            already_booked: true,
            entry_id: existingTx.journal_entry_id,
            bank_transaction_id: bankTxIdForGuard,
            message: 'This bank event is already booked (linked to a journal entry). No new entry was created.',
          };
        }
        // Default the entry to the EVENT's date — booking a 2025 bank event
        // must not land on today's date (it would fall outside the fiscal
        // year and vanish from year-filtered views).
        bankTxDate = existingTx.transaction_date as string;
        bankTxCounterparty = (existingTx.counterparty as string) || null;
        const rawAmt = Number(existingTx.amount_cents);
        if (Number.isFinite(rawAmt) && rawAmt !== 0) bankTxGrossCents = Math.abs(rawAmt);
      }

      // ─── Explicit template_id (one-call booking) ─────────────────────────
      // manage_journal_entry {action:'create', template_id, amount_cents} —
      // fetch the template and expand it; previously template_id was declared
      // in the schema but silently ignored by this handler.
      if ((!entryLines || entryLines.length === 0) && explicitTemplateId) {
        const { data: tpl, error: tplErr } = await supabase.from('accounting_templates')
          .select('id, template_name, template_lines, usage_count').eq('id', explicitTemplateId).maybeSingle();
        if (tplErr || !tpl) throw new Error(`Template ${explicitTemplateId} not found`);
        if (acctIsPctTemplate(tpl.template_lines)) {
          if (!amount_cents || amount_cents <= 0) {
            return {
              status: 'propose',
              template_id: tpl.id,
              template_name: tpl.template_name,
              template_lines: tpl.template_lines,
              message: `Template '${tpl.template_name}' uses percentage lines — call again with amount_cents (NET base amount in cents/öre) to expand, or provide populated lines.`,
            };
          }
          entryLines = acctExpandTemplateLines(tpl.template_lines, amount_cents, bankTxGrossCents);
        } else {
          entryLines = tpl.template_lines;
        }
        // Atomic increment (review finding M4): the old read-modify-write lost
        // updates under concurrency. Falls back to the racy path if the RPC
        // isn't deployed yet (fail forward, Law 4).
        const { error: incErr } = await supabase.rpc('increment_template_usage', { p_template_id: tpl.id });
        if (incErr) {
          await supabase.from('accounting_templates')
            .update({ usage_count: (tpl.usage_count || 0) + 1 }).eq('id', tpl.id);
        }
      }

      // ─── Template-First Matching (OpenClaw instrument principle) ────────
      // FlowPilot MUST use templates. If no template matches, escalate.
      if (!entryLines || entryLines.length === 0) {
        // Fetch all templates for matching
        const { data: allTemplates } = await supabase.from('accounting_templates')
          .select('id, template_name, description, keywords, template_lines, usage_count, category');

        if (!allTemplates || allTemplates.length === 0) {
          return {
            status: 'escalate',
            confidence: 0,
            message: 'No accounting templates exist. Please create journal entries manually first so FlowPilot can learn patterns.',
          };
        }

        // Score each template against the description/template_name
        const searchTerms = `${template_name || ''} ${description || ''}`.toLowerCase().trim();
        if (!searchTerms) {
          throw new Error('Either description or template_name is required to match a template.');
        }

        // Shared word-boundary scorer (review finding C1): the inline substring
        // scorer that used to live here could auto-book to the WRONG account on
        // coincidental infix matches ('el' ∈ 'webbhotell' → electricity) — the
        // exact bug already fixed in propose_bookkeeping. Both surfaces now
        // score identically, and confidence comes from the same calibration.
        const scored = acctScoreTemplates(allTemplates, searchTerms);

        const best = scored[0];
        const confidence = best.confidence;

        // ─── Confidence Zones ────────────────────────────────────────────
        if (confidence < 70) {
          // 🔴 ESCALATE — no reliable match
          return {
            status: 'escalate',
            confidence,
            message: `No template matched with sufficient confidence (${confidence}%). Please create this journal entry manually. FlowPilot will learn from it.`,
            top_candidates: scored.slice(0, 3).map((s) => ({
              name: s.template.template_name,
              confidence: s.confidence,
              match_details: s.matchDetails,
            })),
          };
        }

        if (confidence < 95 || !auto_confirm) {
          // 🟡 PROPOSE — good match but needs confirmation
          return {
            status: 'propose',
            confidence,
            template_id: best.template.id,
            template_name: best.template.template_name,
            template_lines: best.template.template_lines,
            match_details: best.matchDetails,
            message: `Template '${best.template.template_name}' matched with ${confidence}% confidence. Please confirm and provide amounts (debit_cents/credit_cents) for each line, then call again with action='create', the populated lines, and auto_confirm=true.`,
          };
        }

        // 🟢 AUTO-BOOK — very high confidence, use template lines
        // (Only reaches here if auto_confirm=true AND confidence ≥ 95%)
        if (acctIsPctTemplate(best.template.template_lines)) {
          if (!amount_cents || amount_cents <= 0) {
            // Percentage template without a base amount would book a
            // zero-amount entry — downgrade to propose instead.
            return {
              status: 'propose',
              confidence,
              template_id: best.template.id,
              template_name: best.template.template_name,
              template_lines: best.template.template_lines,
              message: `Template '${best.template.template_name}' matched (${confidence}%) but uses percentage lines — call again with amount_cents (NET base amount in cents/öre) and auto_confirm=true to book.`,
            };
          }
          entryLines = acctExpandTemplateLines(best.template.template_lines, amount_cents, bankTxGrossCents);
        } else {
          entryLines = best.template.template_lines;
        }
        // Log which template was used
        console.log(`[accounting] Auto-booking with template '${best.template.template_name}' (${confidence}% confidence)`);

        // Atomic increment (M4) with racy fallback until the RPC is deployed.
        const { error: incErr2 } = await supabase.rpc('increment_template_usage', { p_template_id: best.template.id });
        if (incErr2) {
          await supabase.from('accounting_templates')
            .update({ usage_count: (best.template.usage_count || 0) + 1 })
            .eq('id', best.template.id);
        }
      }

      if (!entryLines || entryLines.length === 0) {
        throw new Error('lines array is required for create action');
      }

      // (Idempotency guard + bank-event fetch moved ABOVE template expansion —
      // its gross now pins the 19xx leg. The atomic claim at link time below
      // closes the read-then-write race, review finding H2.)

      // Explicit period-lock check (sweep finding #B3). The DB trigger
      // guard_journal_entries_period() is the backstop; checking here gives
      // agents a clear, actionable error instead of a raw trigger exception.
      const effectiveDate = entry_date || bankTxDate || new Date().toISOString().split('T')[0];
      {
        const d = new Date(effectiveDate);
        if (!isNaN(d.getTime())) {
          const { data: per } = await supabase
            .from('accounting_periods')
            .select('status')
            .eq('fiscal_year', d.getFullYear())
            .eq('period_month', d.getMonth() + 1)
            .maybeSingle();
          if (per && per.status !== 'open') {
            throw new Error(
              `Accounting period ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} is ${per.status} — ` +
              `entries cannot be posted into a ${per.status} period. Use reopen_accounting_period (admin) or book in the current open period.`
            );
          }
        }
      }

      // Validate balance
      const totalDebit = entryLines.reduce((s: number, l: any) => s + (l.debit_cents || 0), 0);
      const totalCredit = entryLines.reduce((s: number, l: any) => s + (l.credit_cents || 0), 0);
      if (totalDebit !== totalCredit) {
        throw new Error(`Unbalanced: debit ${totalDebit} ≠ credit ${totalCredit}. Each entry must balance.`);
      }
      if (totalDebit === 0) {
        throw new Error('Zero-amount entry rejected: lines have no debit_cents/credit_cents. For percentage templates, pass amount_cents (NET base) so the lines can be expanded.');
      }

      const { data: entry, error: entryErr } = await supabase.from('journal_entries')
        .insert({
          entry_date: effectiveDate,
          description: description || 'FlowPilot transaction',
          reference_number: reference_number || null,
          status: 'posted',
          source: resolvedSource,
          // Template provenance: which template produced this entry and how it
          // was matched — the hook for registry curation (error rate per template).
          template_id: explicitTemplateId || null,
          match_source: (args as any).match_source
            || (explicitTemplateId ? 'keyword' : 'manual'),
        }).select('id').single();
      if (entryErr) throw new Error(`Create entry failed: ${entryErr.message}`);

      const { error: linesErr2 } = await supabase.from('journal_entry_lines')
        .insert(entryLines.map((l: any) => ({
          journal_entry_id: entry.id,
          account_code: l.account_code,
          account_name: l.account_name,
          debit_cents: l.debit_cents || 0,
          credit_cents: l.credit_cents || 0,
          description: l.description || null,
        })));
      if (linesErr2) throw new Error(`Create lines failed: ${linesErr2.message}`);

      // Underlying documentation, in the same call. BFL 5:7 wants a verification
      // to identify what it rests on, and an agent that has just read a receipt
      // or a bank statement is exactly who knows. Attaching after the fact works
      // too (manage_journal_entry_document), but a second call is a second
      // chance to forget.
      const attachments = Array.isArray((args as any).documents) ? (args as any).documents : [];
      let documents_attached = 0;
      for (const d of attachments) {
        const kind = d?.kind === 'document' ? 'document' : 'file';
        if (kind === 'file' && !d?.file_url) continue;
        if (kind === 'document' && !d?.document_id) continue;
        const { error: docErr } = await supabase.from('journal_entry_documents').insert({
          journal_entry_id: entry.id,
          kind,
          label: d.label ?? null,
          file_url: d.file_url ?? null,
          file_name: d.file_name ?? null,
          document_id: d.document_id ?? null,
          source: 'agent',
          sort_order: documents_attached,
        });
        if (docErr) throw new Error(`Attach document failed: ${docErr.message}`);
        documents_attached++;
      }

      // Posting to an account activates it. The chart carries the WHOLE
      // standard (1 262 BAS accounts), but is_active means "this company uses
      // it" — pickers, the balance-sheet classifier and the chart listing all
      // filter on it. Without this an account posted to would hold a balance
      // while staying invisible to every one of them, which is the orphan the
      // balance sheet already warns about.
      const touched = [...new Set(entryLines.map((l: any) => l.account_code).filter(Boolean))];
      if (touched.length) {
        await supabase.from('chart_of_accounts')
          .update({ is_active: true })
          .in('account_code', touched)
          .eq('is_active', false);
      }

      // Agentic bookkeeping: if this entry was booked from a bank event
      // (the "Händelser att bokföra" queue), link it so the event leaves the
      // queue and gains an audit trail back to its posted verification.
      const bankTxId = (args as any).bank_transaction_id;
      if (bankTxId) {
        // Atomic claim (review finding H2): the early guard is read-then-write —
        // two concurrent calls could both read journal_entry_id=NULL and both
        // insert an entry. The conditional predicate makes the LINK the atomic
        // claim; the loser compensates (deletes its entry) and returns
        // already_booked instead of leaving a duplicate in the ledger.
        const { data: linkRows, error: linkErr } = await supabase.from('bank_transactions')
          .update({ journal_entry_id: entry.id, status: 'matched' })
          .eq('id', bankTxId)
          .is('journal_entry_id', null)
          .select('id');
        if (linkErr) console.warn(`[accounting] bank_transaction link failed: ${linkErr.message}`);
        if (!linkErr && (!linkRows || linkRows.length === 0)) {
          await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', entry.id);
          await supabase.from('journal_entries').delete().eq('id', entry.id);
          const { data: winner } = await supabase.from('bank_transactions')
            .select('journal_entry_id').eq('id', bankTxId).maybeSingle();
          return {
            already_booked: true,
            entry_id: winner?.journal_entry_id ?? null,
            bank_transaction_id: bankTxId,
            message: 'Concurrent booking detected — this bank event was booked by another call. No duplicate was created.',
          };
        }

        // LEARNING LOOP (Accounted-style): every confirmed booking of a bank
        // event teaches the counterparty its template. Next proposal for this
        // counterparty rides the vendor-default trust ramp (88 + 5×confirmed).
        if (bankTxCounterparty && explicitTemplateId) {
          const { data: existingVendor } = await supabase.from('vendors')
            .select('id').ilike('name', bankTxCounterparty).maybeSingle();
          if (existingVendor) {
            await supabase.from('vendors')
              .update({ last_used_template_id: explicitTemplateId })
              .eq('id', existingVendor.id);
          } else {
            await supabase.from('vendors').insert({
              name: bankTxCounterparty,
              is_active: true,
              last_used_template_id: explicitTemplateId,
              notes: 'Auto-learned from agentic bookkeeping (counterparty → template).',
            });
          }
        }
      }

      return {
        created: true,
        documents_attached,
        entry_id: entry.id,
        bank_transaction_id: bankTxId || null,
        entry_date: effectiveDate,
        total_debit_cents: totalDebit,
        total_credit_cents: totalCredit,
        lines_count: entryLines.length,
      };
    }

    case 'opening_balances': {
      // ─── Accounting: Opening Balances CRUD ──────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { fiscal_year, locale } = args as any;
        let query = supabase.from('opening_balances')
          .select('*')
          .order('account_code');
        if (fiscal_year) query = query.eq('fiscal_year', fiscal_year);
        if (locale) query = query.eq('locale', locale);
        const { data, error } = await query.limit(500);
        if (error) throw new Error(`List opening balances failed: ${error.message}`);
        
        const totalDebit = (data || []).filter((r: any) => r.balance_type === 'debit').reduce((s: number, r: any) => s + r.amount_cents, 0);
        const totalCredit = (data || []).filter((r: any) => r.balance_type === 'credit').reduce((s: number, r: any) => s + r.amount_cents, 0);
        return { balances: data, count: (data || []).length, total_debit_cents: totalDebit, total_credit_cents: totalCredit, balanced: totalDebit === totalCredit };
      }

      if (action === 'set') {
        // account_name is NOT NULL on opening_balances and required-for-set in the
        // tool contract — it was silently dropped here, so every agent 'set' failed
        // (found live during the liteit proof week, 2026-07-14). Resolve it from the
        // chart of accounts when the caller omits it.
        const { fiscal_year, account_code, amount_cents, balance_type, locale = 'se-bas2024' } = args as any;
        let { account_name } = args as any;
        if (!fiscal_year || !account_code || amount_cents === undefined || !balance_type) {
          throw new Error('fiscal_year, account_code, amount_cents, and balance_type are required');
        }
        if (!account_name) {
          const { data: coa } = await supabase.from('chart_of_accounts')
            .select('account_name').eq('account_code', account_code).maybeSingle();
          account_name = coa?.account_name;
          if (!account_name) throw new Error(`account_name is required (account ${account_code} not found in chart_of_accounts)`);
        }

        // Upsert by fiscal_year + account_code + locale
        const { data: existing } = await supabase.from('opening_balances')
          .select('id')
          .eq('fiscal_year', fiscal_year)
          .eq('account_code', account_code)
          .eq('locale', locale)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase.from('opening_balances')
            .update({ amount_cents, balance_type, account_name })
            .eq('id', existing.id);
          if (error) throw new Error(`Update opening balance failed: ${error.message}`);
          return { updated: true, account_code, fiscal_year, amount_cents, balance_type };
        } else {
          const { error } = await supabase.from('opening_balances')
            .insert({ fiscal_year, account_code, account_name, amount_cents, balance_type, locale });
          if (error) throw new Error(`Insert opening balance failed: ${error.message}`);
          return { created: true, account_code, fiscal_year, amount_cents, balance_type };
        }
      }

      if (action === 'delete') {
        const { fiscal_year, account_code, locale = 'se-bas2024' } = args as any;
        if (!fiscal_year || !account_code) throw new Error('fiscal_year and account_code required');
        const { error } = await supabase.from('opening_balances')
          .delete()
          .eq('fiscal_year', fiscal_year)
          .eq('account_code', account_code)
          .eq('locale', locale);
        if (error) throw new Error(`Delete opening balance failed: ${error.message}`);
        return { deleted: true, account_code, fiscal_year };
      }

      throw new Error(`Unknown opening_balances action: ${action}`);
    }

    case 'chart_of_accounts': {
      // ─── Accounting: Chart of Accounts CRUD ─────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { locale, search, account_type } = args as any;
        let query = supabase.from('chart_of_accounts')
          .select('*')
          .eq('is_active', true)
          .order('account_code');
        if (locale) query = query.eq('locale', locale);
        if (account_type) query = query.eq('account_type', account_type);
        if (search) query = query.or(`account_code.ilike.%${sanitizeOrTerm(search)}%,account_name.ilike.%${sanitizeOrTerm(search)}%`);
        const { data, error } = await query.limit(500);
        if (error) throw new Error(`List accounts failed: ${error.message}`);
        return { accounts: data, count: (data || []).length };
      }

      if (action === 'add') {
        const { account_code, account_name, account_type, account_category, normal_balance, locale = 'se-bas2024' } = args as any;
        if (!account_code || !account_name || !account_type || !normal_balance) {
          throw new Error('account_code, account_name, account_type, and normal_balance are required');
        }
        const { data, error } = await supabase.from('chart_of_accounts')
          .insert({ account_code, account_name, account_type, account_category: account_category || account_type, normal_balance, locale, is_active: true })
          .select('id, account_code, account_name')
          .single();
        if (error) {
          // An occupied account code is a MEANING collision, not a retry
          // nuisance — so `add` refuses rather than quietly returning the
          // sitting row as `created`. 4010 named "Inköp material" and 4010
          // named "Försäljning" are two different books; a success envelope
          // over the wrong one lets every later posting land on an account
          // that means something else, and nothing downstream ever says so.
          // This house has already shipped a chart nobody compared once (166
          // wrong names under the label "BAS 2024"). `add` is not `ensure`.
          //
          // It fails self-correctingly, per the rule in
          // _shared/suggest-names.ts: an error that names the mistake without
          // naming the exit sends the model looking for another door. So it
          // names the occupant, says whether it is identical to what was asked
          // (an idempotent replay — safe to treat as done), and names the
          // action that changes a name.
          if (error.code === '23505') {
            const { data: occupant } = await supabase.from('chart_of_accounts')
              .select('account_code, account_name, account_type, is_active')
              .eq('locale', locale)
              .eq('account_code', account_code)
              .maybeSingle();
            const occupantName = occupant?.account_name ?? '(existing account)';
            const detail = occupant?.account_type
              ? ` (${occupant.account_type}${occupant.is_active === false ? ', inactive' : ''})`
              : '';
            const head = `Account code ${account_code} is already taken in locale "${locale}" by "${occupantName}"${detail}.`;
            const body = occupant?.account_name === account_name
              ? ` That is the same account_name you sent, so this account already exists and nothing needed adding — treat the add as done.`
              : ` That is NOT the account you described, so nothing was written.`
                + ` To rename the existing one: manage_chart_of_accounts action="update", account_code="${account_code}", locale="${locale}", account_name="${account_name}".`
                + ` To add yours alongside it, pick a free code — action="list" with search="${String(account_code).slice(0, 2)}" shows which are taken.`;
            throw new Error(head + body);
          }
          throw new Error(`Add account failed: ${error.message}`);
        }
        return { created: true, ...data };
      }

      if (action === 'update') {
        const { account_code, locale = 'se-bas2024', account_name, account_category } = args as any;
        if (!account_code) throw new Error('account_code is required');
        const updates: any = {};
        if (account_name) updates.account_name = account_name;
        if (account_category) updates.account_category = account_category;
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('chart_of_accounts')
          .update(updates)
          .eq('account_code', account_code)
          .eq('locale', locale);
        if (error) throw new Error(`Update account failed: ${error.message}`);
        return { updated: true, account_code };
      }

      if (action === 'deactivate') {
        const { account_code, locale = 'se-bas2024' } = args as any;
        if (!account_code) throw new Error('account_code is required');
        const { error } = await supabase.from('chart_of_accounts')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('account_code', account_code)
          .eq('locale', locale);
        if (error) throw new Error(`Deactivate account failed: ${error.message}`);
        return { deactivated: true, account_code };
      }

      throw new Error(`Unknown chart_of_accounts action: ${action}`);
    }

    case 'accounting_templates': {
      // ─── Accounting: Template CRUD ──────────────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { search } = args as any;
        let query = supabase.from('accounting_templates')
          .select('*')
          .order('usage_count', { ascending: false });
        if (search) {
          query = query.or(`template_name.ilike.%${sanitizeOrTerm(search)}%,description.ilike.%${sanitizeOrTerm(search)}%,category.ilike.%${sanitizeOrTerm(search)}%`);
        }
        const { data, error } = await query.limit(50);
        if (error) throw new Error(`List templates failed: ${error.message}`);
        return { templates: data, count: (data || []).length };
      }

      if (action === 'create') {
        const { template_name, description: desc, category, keywords, template_lines } = args as any;
        if (!template_name) throw new Error('template_name is required');
        if (!template_lines || template_lines.length === 0) throw new Error('template_lines with at least one debit and one credit line required');

        const hasDebit = template_lines.some((l: any) => l.type === 'debit');
        const hasCredit = template_lines.some((l: any) => l.type === 'credit');
        if (!hasDebit || !hasCredit) throw new Error('Template must have at least one debit and one credit line');

        const { data, error } = await supabase.from('accounting_templates')
          .insert({
            template_name,
            description: desc || '',
            category: category || 'other',
            keywords: keywords || [],
            template_lines,
            is_system: false,
            usage_count: 0,
          })
          .select('id, template_name')
          .single();
        if (error) throw new Error(`Create template failed: ${error.message}`);
        return { created: true, template_id: data.id, template_name: data.template_name };
      }

      if (action === 'update') {
        const { template_id, template_name, description: desc, category, keywords, template_lines } = args as any;
        if (!template_id) throw new Error('template_id is required for update');
        const updates: any = {};
        if (template_name) updates.template_name = template_name;
        if (desc) updates.description = desc;
        if (category) updates.category = category;
        if (keywords) updates.keywords = keywords;
        if (template_lines) {
          const hasDebit = template_lines.some((l: any) => l.type === 'debit');
          const hasCredit = template_lines.some((l: any) => l.type === 'credit');
          if (!hasDebit || !hasCredit) throw new Error('Template must have at least one debit and one credit line');
          updates.template_lines = template_lines;
        }
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase.from('accounting_templates')
          .update(updates).eq('id', template_id);
        if (error) throw new Error(`Update template failed: ${error.message}`);
        return { updated: true, template_id };
      }

      if (action === 'delete') {
        const { template_id } = args as any;
        if (!template_id) throw new Error('template_id is required for delete');
        const { error } = await supabase.from('accounting_templates')
          .delete().eq('id', template_id).eq('is_system', false);
        if (error) throw new Error(`Delete template failed: ${error.message}`);
        return { deleted: true, template_id, note: 'System templates cannot be deleted' };
      }

      throw new Error(`Unknown accounting_templates action: ${action}`);
    }

    case 'quotes': {
      // ─── Quotes CRUD with line-items extraction ─────────────────────────
      // The `quotes` table has no `items` column — line items live in
      // `quote_items`. Generic CRUD would reject `items: [...]` with
      // "Could not find the 'items' column". This handler extracts items[]
      // (or line_items[] passed as an array) and inserts them into
      // quote_items after the parent quote is created.
      const { action = 'list' } = args as any;

      // Fields that belong on a quote LINE, not the quotes row. The skill schema
      // advertised these top-level (description/quantity/unit_price_cents/…), so an
      // agent naturally passes them flat — but quotes has no such columns and the
      // insert threw "Could not find the 'description' column" (process-QA 2026-07-09).
      // Strip them from the quote payload; create/update fold them into an implicit line.
      const QUOTE_LINE_ONLY = new Set([
        'description', 'quantity', 'qty', 'unit', 'unit_price_cents', 'unit_price',
        'discount_pct', 'tax_rate_pct', 'product_id', 'name', 'position',
      ]);
      const stripQuoteInternal = (obj: Record<string, any>): Record<string, any> => {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (k === 'action' || k === 'items' || k === 'line_items') continue;
          if (k.startsWith('_')) continue;
          if (QUOTE_LINE_ONLY.has(k)) continue;
          out[k] = v;
        }
        return out;
      };
      // Fold flat top-level line fields into a single implicit item when the caller
      // gave no items[] array — so `create {title, description, quantity, unit_price_cents}`
      // just works instead of erroring or producing an itemless quote.
      const implicitQuoteItems = (a: Record<string, any>, explicit: unknown[] | null): unknown[] | null => {
        if (explicit && explicit.length) return explicit;
        if (a.description == null && a.unit_price_cents == null && a.unit_price == null && a.quantity == null) return explicit;
        return [{
          description: a.description, quantity: a.quantity, unit: a.unit,
          unit_price_cents: a.unit_price_cents, unit_price: a.unit_price,
          tax_rate_pct: a.tax_rate_pct, discount_pct: a.discount_pct, product_id: a.product_id,
        }];
      };

      // quotes.quote_number is NOT NULL with no default — the admin UI generates
      // QUO-NNNN client-side, so the skill path must too or create always fails.
      const generateQuoteNumber = async (): Promise<string> => {
        const { data } = await supabase.from('quotes')
          .select('quote_number').order('created_at', { ascending: false }).limit(50);
        let max = 0;
        for (const row of (data || []) as Array<{ quote_number: string | null }>) {
          const m = /(\d+)\s*$/.exec(row.quote_number || '');
          if (m) max = Math.max(max, parseInt(m[1], 10));
        }
        return `QUO-${String(max + 1).padStart(4, '0')}`;
      };

      // Build (and VALIDATE) the quote lines without touching the database.
      //
      // Two failures this closes:
      //
      //  1. No product resolution. `{product_name: "Consulting", quantity: 10}`
      //     — the shape place_order has always accepted — produced a line with
      //     an empty description at 0 kr and reported items_inserted: 1. A quote
      //     worth nothing that says it worked is worse than an error.
      //  2. Nothing was checked before the write, so the update action (which
      //     deletes the old lines first) could delete everything and then fail
      //     on the new rows. Building first means a bad line throws while the
      //     old lines are still there.
      //
      // Product resolution mirrors place_order: id first, then a name match.
      // An unknown product is an ERROR — never an empty line.
      const buildQuoteItemRows = async (quote_id: string, rawItems: unknown): Promise<Record<string, unknown>[]> => {
        if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
        const rows: Record<string, unknown>[] = [];
        for (let idx = 0; idx < rawItems.length; idx++) {
          const it = (rawItems[idx] ?? {}) as any;
          const where = `Quote line ${idx + 1}`;

          const productId = it.product_id ?? it.productId ?? null;
          const productName = it.product_name ?? it.productName ?? null;
          let product: { id: string; name: string; price_cents: number | null } | null = null;
          if (productId) {
            const { data } = await supabase.from('products')
              .select('id, name, price_cents').eq('id', productId).maybeSingle();
            if (!data) throw new Error(`${where}: product ${productId} not found. Use browse_products to find the id, or pass description + unit_price_cents for a free-text line.`);
            product = data as any;
          } else if (productName) {
            const { data } = await supabase.from('products')
              .select('id, name, price_cents').ilike('name', `%${productName}%`).limit(1).maybeSingle();
            if (!data) throw new Error(`${where}: no product matches '${productName}'. Use browse_products to find the exact name/id, or pass description + unit_price_cents for a free-text line.`);
            product = data as any;
          }

          const description = String(it.description ?? it.name ?? product?.name ?? '').trim();
          const rawPrice = it.unit_price_cents ?? it.unitPriceCents ?? it.price_cents
            ?? (it.unit_price != null ? Math.round(Number(it.unit_price) * 100) : undefined);
          const unitPriceCents = rawPrice !== undefined && rawPrice !== null
            ? Number(rawPrice)
            : (product ? Number(product.price_cents ?? NaN) : NaN);
          const quantity = Number(it.quantity ?? it.qty ?? 1);

          if (!description) {
            throw new Error(`${where}: description is required (or pass product_id / product_name so it can be taken from the product).`);
          }
          if (!Number.isFinite(unitPriceCents)) {
            throw new Error(`${where} ("${description}"): no price. Pass unit_price_cents, or reference a product that has a price.`);
          }
          if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new Error(`${where} ("${description}"): quantity must be a positive number (got ${JSON.stringify(it.quantity ?? it.qty)}).`);
          }

          rows.push({
            quote_id,
            position: typeof it.position === 'number' ? it.position : idx,
            description,
            quantity,
            unit: it.unit ?? null,
            unit_price_cents: Math.round(unitPriceCents),
            tax_rate_pct: it.tax_rate_pct ?? 25,
            discount_pct: it.discount_pct ?? 0,
            product_id: product?.id ?? null,
          });
        }
        return rows;
      };

      const insertQuoteItems = async (quote_id: string, rawItems: unknown): Promise<number> => {
        const rows = await buildQuoteItemRows(quote_id, rawItems);
        if (rows.length === 0) return 0;
        const { error } = await supabase.from('quote_items').insert(rows);
        if (error) throw new Error(`Insert quote_items failed: ${error.message}`);
        return rows.length;
      };

      if (action === 'list') {
        const { limit = 50, status, lead_id, deal_id } = args as any;
        let q = supabase.from('quotes')
          .select('id, quote_number, status, total_cents, currency, valid_until, lead_id, deal_id, created_at')
          .order('created_at', { ascending: false }).limit(limit);
        if (status) q = q.eq('status', status);
        if (lead_id) q = q.eq('lead_id', lead_id);
        if (deal_id) q = q.eq('deal_id', deal_id);
        const { data, error } = await q;
        if (error) throw new Error(`List quotes failed: ${error.message}`);
        return { quotes: data, count: (data || []).length };
      }

      if (action === 'get') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const [quoteRes, itemsRes] = await Promise.all([
          supabase.from('quotes').select('*').eq('id', qid).maybeSingle(),
          supabase.from('quote_items').select('*').eq('quote_id', qid).order('position'),
        ]);
        if (quoteRes.error) throw new Error(`Get quote failed: ${quoteRes.error.message}`);
        if (!quoteRes.data) return { error: `Quote ${qid} not found` };
        return { quote: quoteRes.data, items: itemsRes.data || [] };
      }

      if (action === 'create') {
        const a = args as any;
        const explicitItems = Array.isArray(a.items) ? a.items
                    : Array.isArray(a.line_items) ? a.line_items
                    : null;
        const items = implicitQuoteItems(a, explicitItems);
        const insertData = stripQuoteInternal(a);
        // The table stores valid_until (a date) — accept the friendlier
        // valid_days and convert, instead of crashing on an unknown column.
        if (insertData.valid_days !== undefined) {
          const days = Number(insertData.valid_days) || 30;
          delete insertData.valid_days;
          insertData.valid_until = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
        }
        if (!insertData.lead_id && !insertData.deal_id && !insertData.customer_email) {
          throw new Error('Quote needs at least one of: lead_id, deal_id, customer_email');
        }
        if (a._caller_user_id && !insertData.created_by) insertData.created_by = a._caller_user_id;
        if (!insertData.quote_number) insertData.quote_number = await generateQuoteNumber();
        const { data, error } = await supabase.from('quotes')
          .insert(insertData).select('id, quote_number').single();
        if (error) throw new Error(`Create quote failed: ${error.message}`);
        const itemsInserted = await insertQuoteItems(data.id, items);
        return { created: true, quote_id: data.id, quote_number: data.quote_number, items_inserted: itemsInserted };
      }

      if (action === 'update') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const items = Array.isArray(a.items) ? a.items
                    : Array.isArray(a.line_items) ? a.line_items
                    : null;
        const updateData = stripQuoteInternal(a);
        delete updateData.id;
        delete updateData.quote_id;
        updateData.updated_at = new Date().toISOString();
        if (Object.keys(updateData).length > 1) {
          const { error } = await supabase.from('quotes').update(updateData).eq('id', qid);
          if (error) throw new Error(`Update quote failed: ${error.message}`);
        }
        let itemsInserted = 0;
        if (items) {
          // Replace the lines SAFELY: build and validate every new row FIRST,
          // and only then delete the old ones.
          //
          // The old order was delete → insert with no validation and no
          // transaction: one bad line (a product that doesn't exist, a missing
          // price) left the quote with zero rows — and, because the totals
          // trigger refused to write on an empty quote, the OLD total still on
          // the header. QA saw a 1 868 750 kr quote with nothing in it. Building
          // first turns that into a plain error with the quote untouched.
          const rows = await buildQuoteItemRows(qid, items);
          const { error: delErr } = await supabase.from('quote_items').delete().eq('quote_id', qid);
          if (delErr) throw new Error(`Replace quote lines failed (old lines kept): ${delErr.message}`);
          if (rows.length > 0) {
            const { error: insErr } = await supabase.from('quote_items').insert(rows);
            if (insErr) throw new Error(`Insert quote_items failed: ${insErr.message}`);
          }
          itemsInserted = rows.length;
        }
        return { updated: true, quote_id: qid, items_inserted: itemsInserted };
      }

      if (action === 'add_item') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const inserted = await insertQuoteItems(qid, [{
          description: a.description, quantity: a.quantity, unit: a.unit,
          unit_price_cents: a.unit_price_cents, tax_rate_pct: a.tax_rate_pct,
          discount_pct: a.discount_pct,
          product_id: a.product_id,
        }]);
        return { added: true, quote_id: qid, items_inserted: inserted };
      }

      if (action === 'delete') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const { error } = await supabase.from('quotes').delete().eq('id', qid);
        if (error) throw new Error(`Delete quote failed: ${error.message}`);
        return { deleted: true, quote_id: qid };
      }

      // ── Lifecycle actions (the skill schema advertised these but the handler
      //    never implemented them — quote-to-cash was broken in the middle).
      //    Modeled on Odoo's quotation flow (draft → sent → accepted → invoice),
      //    kept simpler: status transitions + a direct conversion.
      if (action === 'send') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        // Law 3 symmetry: the UI's send path (useQuoteWorkflow) mints the public
        // accept_token; without it an agent-sent quote has no customer link and
        // quote-expiry-reminders skips it (found live 2026-07-04, EPIC-05).
        const { data: existing } = await supabase.from('quotes')
          .select('accept_token').eq('id', qid).maybeSingle();
        let acceptToken: string | null = existing?.accept_token ?? null;
        if (!acceptToken) {
          const arr = new Uint8Array(24);
          crypto.getRandomValues(arr);
          acceptToken = btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        const { data, error } = await supabase.from('quotes')
          .update({ status: 'sent', accept_token: acceptToken, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', qid).select('id, quote_number, status, accept_token').single();
        if (error) throw new Error(`Send quote failed: ${error.message}`);
        return { sent: true, quote_id: data.id, quote_number: data.quote_number, status: data.status, accept_token: data.accept_token, note: 'Status set to sent; public accept link token ensured. Email delivery is a separate concern (requires an email integration).' };
      }

      if (action === 'request_approval') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const { data, error } = await supabase.from('quotes')
          .update({ status: 'pending_approval', updated_at: new Date().toISOString() })
          .eq('id', qid).select('id, quote_number, status').single();
        if (error) throw new Error(`Request approval failed: ${error.message}`);
        return { requested: true, quote_id: data.id, status: data.status };
      }

      if (action === 'list_templates') {
        const { data, error } = await supabase.from('quote_templates')
          .select('id, name, description, currency, default_valid_days, is_active')
          .eq('is_active', true).order('name');
        if (error) throw new Error(`List templates failed: ${error.message}`);
        return { templates: data || [], count: (data || []).length };
      }

      if (action === 'use_template') {
        const a = args as any;
        const tid = a.template_id;
        if (!tid) throw new Error('template_id is required (see list_templates)');
        const { data: tpl, error: tplErr } = await supabase.from('quote_templates')
          .select('*').eq('id', tid).maybeSingle();
        if (tplErr || !tpl) throw new Error(`Template not found: ${tid}`);
        const insertData: Record<string, any> = {
          customer_name: a.customer_name || null,
          customer_email: a.customer_email || null,
          lead_id: a.lead_id || null,
          deal_id: a.deal_id || null,
          currency: tpl.currency || 'SEK',
          intro_text: tpl.intro_text || null,
          terms_text: tpl.terms_text || null,
          valid_until: new Date(Date.now() + (tpl.default_valid_days || 30) * 86400000).toISOString().split('T')[0],
        };
        if (!insertData.lead_id && !insertData.deal_id && !insertData.customer_email) {
          throw new Error('Quote needs at least one of: lead_id, deal_id, customer_email');
        }
        insertData.quote_number = await generateQuoteNumber();
        const { data, error } = await supabase.from('quotes')
          .insert(insertData).select('id, quote_number').single();
        if (error) throw new Error(`Create quote from template failed: ${error.message}`);
        const itemsInserted = await insertQuoteItems(data.id, Array.isArray(tpl.items) ? tpl.items : []);
        return { created: true, quote_id: data.id, quote_number: data.quote_number, from_template: tpl.name, items_inserted: itemsInserted };
      }

      if (action === 'convert_to_invoice') {
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const [quoteRes, itemsRes] = await Promise.all([
          supabase.from('quotes').select('*').eq('id', qid).maybeSingle(),
          supabase.from('quote_items').select('*').eq('quote_id', qid).order('position'),
        ]);
        if (quoteRes.error || !quoteRes.data) throw new Error(`Quote not found: ${qid}`);
        const quote = quoteRes.data;
        if (quote.invoice_id) return { converted: false, invoice_id: quote.invoice_id, note: 'Quote already has an invoice' };
        const qItems = itemsRes.data || [];
        if (qItems.length === 0) throw new Error('Quote has no line items to invoice');
        // Map quote_items → the invoices line_items jsonb shape.
        const lineItems = qItems.map((it: any) => ({
          description: it.description, qty: Number(it.quantity) || 1,
          unit_price_cents: Number(it.unit_price_cents) || 0,
        }));
        // Carry the QUOTE's stored totals onto the invoice — the quote is the accepted
        // (possibly e-signed and pay-now-charged) document, so the invoice must bill
        // exactly what the customer accepted. Recomputing doc-level here diverged from
        // the quote's per-line tax rounding by öre (5×199 @25%: quote 1245, recompute
        // 1244 — rounding QA 2026-07-10) AND ignored quote-level discount_cents.
        // Fall back to recomputation only if the stored totals are missing/zeroed.
        const recomputedSubtotal = lineItems.reduce((s: number, it: any) => s + it.qty * it.unit_price_cents, 0);
        const taxRate = Number(quote.tax_rate ?? 0.25);
        const subtotal = Number(quote.subtotal_cents) > 0 ? Number(quote.subtotal_cents) : recomputedSubtotal;
        const taxCents = Number(quote.subtotal_cents) > 0 && quote.tax_cents != null
          ? Number(quote.tax_cents)
          : Math.round(subtotal * taxRate);
        const totalCents = Number(quote.total_cents) > 0 ? Number(quote.total_cents) : subtotal + taxCents;
        // Same INV-YYYY-NNNNN series the invoices handler uses (it's scoped to
        // that case block, so regenerate here).
        const yr = new Date().getFullYear();
        const { data: lastInv } = await supabase.from('invoices')
          .select('invoice_number').ilike('invoice_number', `INV-${yr}-%`)
          .order('invoice_number', { ascending: false }).limit(1).maybeSingle();
        let nextNum = 1;
        const m = String(lastInv?.invoice_number || '').match(/INV-\d{4}-(\d+)/);
        if (m) nextNum = parseInt(m[1], 10) + 1;
        const invoiceNumber = `INV-${yr}-${String(nextNum).padStart(5, '0')}`;
        const { data: inv, error: invErr } = await supabase.from('invoices').insert({
          invoice_number: invoiceNumber,
          customer_name: quote.customer_name || '',
          customer_email: quote.customer_email || null,
          lead_id: quote.lead_id || null,
          deal_id: quote.deal_id || null,
          line_items: lineItems,
          subtotal_cents: subtotal,
          tax_rate: taxRate,
          tax_cents: taxCents,
          total_cents: totalCents,
          currency: quote.currency || 'SEK',
          issue_date: new Date().toISOString().split('T')[0],
          status: 'draft',
        }).select('id, invoice_number, total_cents').single();
        if (invErr) throw new Error(`Create invoice from quote failed: ${invErr.message}`);
        await supabase.from('quotes')
          .update({ invoice_id: inv.id, status: 'accepted', accepted_at: quote.accepted_at || new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', qid);
        return { converted: true, quote_id: qid, invoice_id: inv.id, invoice_number: inv.invoice_number, total_cents: inv.total_cents };
      }

      if (action === 'convert_to_order') {
        // ── Quote → Order: the step the chain was missing ────────────────────
        //
        // There was no conversion at all, so an agent asked to turn an accepted
        // quote into an order rebuilt it by hand from the product catalogue —
        // and dropped the tax on the way: quote 1 868 750 → order 1 495 000 →
        // invoice 1 868 750. Three documents for one sale, two different
        // amounts, and no link between any of them.
        //
        // This copies the accepted lines EXACTLY (unit price, quantity, per-line
        // tax rate) and stamps orders.quote_id, so what the customer accepted is
        // what gets fulfilled and what gets invoiced.
        const a = args as any;
        const qid = a.id || a.quote_id;
        if (!qid) throw new Error('id (or quote_id) is required');
        const [quoteRes, itemsRes] = await Promise.all([
          supabase.from('quotes').select('*').eq('id', qid).maybeSingle(),
          supabase.from('quote_items').select('*').eq('quote_id', qid).order('position'),
        ]);
        if (quoteRes.error || !quoteRes.data) throw new Error(`Quote not found: ${qid}`);
        const quote = quoteRes.data;
        const qItems = itemsRes.data || [];
        if (qItems.length === 0) throw new Error(`Quote ${quote.quote_number || qid} has no line items — nothing to order.`);
        if (['rejected', 'cancelled', 'expired'].includes(String(quote.status))) {
          throw new Error(`Quote ${quote.quote_number || qid} is ${quote.status} — it cannot become an order. Revive it (update valid_until / status) or create a new quote.`);
        }
        const customerEmail = quote.customer_email;
        if (!customerEmail) throw new Error(`Quote ${quote.quote_number || qid} has no customer_email — an order needs one.`);

        // Idempotent: one order per quote.
        const { data: existingOrder, error: existErr } = await supabase.from('orders')
          .select('id, status, total_cents, currency').eq('quote_id', qid).limit(1).maybeSingle();
        if (existErr && !/quote_id/i.test(existErr.message || '')) {
          throw new Error(`Order lookup failed: ${existErr.message}`);
        }
        if (existingOrder) {
          return {
            converted: false, quote_id: qid, order_id: existingOrder.id,
            status: existingOrder.status, total_cents: existingOrder.total_cents,
            note: 'This quote already has an order — reused, no second order was created.',
          };
        }

        const subtotal = Number(quote.subtotal_cents) || qItems.reduce(
          (s: number, it: any) => s + Number(it.line_subtotal_cents ?? 0), 0);
        const taxCents = Number(quote.tax_cents ?? 0)
          || qItems.reduce((s: number, it: any) => s + Number(it.line_tax_cents ?? 0), 0);
        const totalCents = Number(quote.total_cents) || (subtotal + taxCents);
        // The rate the invoice must use later, derived from what was accepted —
        // not the platform's 25 % assumption.
        const effectiveTaxRate = subtotal > 0 ? Number((taxCents / subtotal).toFixed(6)) : 0;

        const orderRow: Record<string, unknown> = {
          customer_email: customerEmail,
          customer_name: quote.customer_name || quote.customer_company || customerEmail,
          currency: quote.currency || undefined,
          status: 'pending',
          quote_id: qid,
          // The order carries the accepted amount INCLUDING tax — the same
          // number on the quote and, later, on the invoice. The ex-tax basis and
          // the rate travel in metadata so send_invoice_for_order can rebuild
          // the invoice without guessing 25 %.
          total_cents: totalCents,
          metadata: {
            source: 'quote_conversion',
            quote_id: qid,
            quote_number: quote.quote_number,
            subtotal_cents: subtotal,
            tax_cents: taxCents,
            tax_rate: effectiveTaxRate,
            total_includes_tax: true,
          },
        };
        if (quote.company_id) orderRow.company_id = quote.company_id;
        const { data: order, error: orderErr } = await supabase.from('orders')
          .insert(orderRow).select('id, status, total_cents, currency').single();
        if (orderErr) throw new Error(`Create order from quote failed: ${orderErr.message}`);

        const orderItems = qItems.map((it: any) => ({
          order_id: order.id,
          product_id: it.product_id ?? null,
          product_name: it.description,
          quantity: Number(it.quantity) || 1,
          price_cents: Number(it.unit_price_cents) || 0,
        }));
        const { error: oiErr } = await supabase.from('order_items').insert(orderItems);
        if (oiErr) throw new Error(`Copy quote lines to order failed: ${oiErr.message}`);

        return {
          converted: true,
          quote_id: qid,
          quote_number: quote.quote_number,
          order_id: order.id,
          status: order.status,
          items_copied: orderItems.length,
          subtotal_cents: subtotal,
          tax_cents: taxCents,
          total_cents: order.total_cents,
          currency: order.currency,
          tax_rate: effectiveTaxRate,
          note: `Order carries the accepted total ${totalCents / 100} ${order.currency} (incl. tax ${taxCents / 100}). Invoice it with send_invoice_for_order — it reads the tax rate off the order, so the invoice matches the quote to the öre.`,
        };
      }

      throw new Error(`Unknown quotes action: ${action}. Supported: list, get, create, update, add_item, delete, send, request_approval, list_templates, use_template, convert_to_invoice, convert_to_order.`);
    }

    case 'expenses': {
      // ─── Expense Reporting CRUD ─────────────────────────────────────────
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { user_id, status, period } = args as any;
        let query = supabase.from('expenses')
          .select('id, expense_date, description, amount_cents, vat_cents, currency, category, vendor, account_code, is_representation, attendees, receipt_url, receipt_analyzed, receipt_data, status, report_id, created_at')
          .order('expense_date', { ascending: false });
        if (user_id) query = query.eq('user_id', user_id);
        if (status) query = query.eq('status', status);
        if (period) {
          const [y, m] = period.split('-');
          query = query.gte('expense_date', `${y}-${m}-01`).lt('expense_date', `${y}-${String(Number(m) + 1).padStart(2, '0')}-01`);
        }
        const { data, error } = await query.limit(200);
        if (error) throw new Error(`List expenses failed: ${error.message}`);
        return { expenses: data, count: (data || []).length };
      }

      if (action === 'get') {
        const { expense_id } = args as any;
        if (!expense_id) throw new Error('expense_id is required for get action');
        const { data, error } = await supabase.from('expenses')
          .select('*')
          .eq('id', expense_id)
          .maybeSingle();
        if (error) throw new Error(`Get expense failed: ${error.message}`);
        if (!data) return { error: `Expense ${expense_id} not found` };
        return { expense: data };
      }

      if (action === 'create') {
        let { user_id, expense_date, description: desc, amount_cents, vat_cents, currency, category, vendor, account_code, is_representation, attendees, receipt_url, receipt_data } = args as any;
        // An expense is a claim for money owed to a PERSON. The old fallback
        // picked "the first admin row in user_roles" when no user_id was given,
        // so every agent-created expense was booked on — and reimbursable to —
        // whoever happened to sort first. Identity order is now: the explicit
        // argument, then the authenticated caller, then an honest failure.
        // Never a stand-in.
        if (!user_id) user_id = (args as any)._caller_user_id;
        if (!user_id) {
          throw new Error('No user identity for this expense — pass user_id (the employee the expense belongs to). There is no default user: booking an expense on the wrong person means reimbursing the wrong person.');
        }
        if (is_representation && (!attendees || attendees.length === 0)) {
          throw new Error('Representation expenses require attendees [{name, company}]');
        }
        const { data, error } = await supabase.from('expenses')
          .insert({
            user_id,
            expense_date: expense_date || new Date().toISOString().split('T')[0],
            description: desc || '',
            amount_cents: amount_cents || 0,
            vat_cents: vat_cents || 0,
            currency: currency || 'SEK',
            category: category || 'other',
            vendor: vendor || null,
            account_code: account_code || null,
            is_representation: is_representation || false,
            attendees: attendees || null,
            receipt_url: receipt_url || null,
            receipt_analyzed: !!receipt_data,
            receipt_data: receipt_data || null,
          })
          .select('id')
          .single();
        if (error) throw new Error(`Create expense failed: ${error.message}`);
        return { created: true, expense_id: data.id };
      }

      if (action === 'update') {
        const { expense_id, ...rest } = args as any;
        if (!expense_id) throw new Error('expense_id is required');
        // Strip agent-internal underscore-prefixed fields (_caller_user_id,
        // _caller_api_key_id, etc.) and the routing 'action' field — they are
        // not real expense columns and PostgREST rejects them.
        const updates: Record<string, any> = {};
        for (const [k, v] of Object.entries(rest)) {
          if (k === 'action') continue;
          if (k.startsWith('_')) continue;
          updates[k] = v;
        }
        if (updates.is_representation && (!updates.attendees || updates.attendees.length === 0)) {
          throw new Error('Representation expenses require attendees');
        }
        updates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('expenses').update(updates).eq('id', expense_id);
        if (error) throw new Error(`Update expense failed: ${error.message}`);
        return { updated: true, expense_id };
      }

      if (action === 'delete') {
        const { expense_id } = args as any;
        if (!expense_id) throw new Error('expense_id is required');
        const { error } = await supabase.from('expenses').delete().eq('id', expense_id).eq('status', 'draft');
        if (error) throw new Error(`Delete expense failed: ${error.message}`);
        return { deleted: true, expense_id };
      }

      if (action === 'submit_report') {
        // Submit a monthly expense report — group expenses and change status
        const { user_id, period } = args as any;
        if (!user_id || !period) throw new Error('user_id and period (YYYY-MM) required');

        // Find or create report
        const { data: existing } = await supabase.from('expense_reports')
          .select('id, status').eq('user_id', user_id).eq('period', period).maybeSingle();

        if (existing && existing.status !== 'draft') {
          return { error: `Report for ${period} already ${existing.status}` };
        }

        // Sum expenses for this period
        const [y, m] = period.split('-');
        const nextMonth = String(Number(m) + 1).padStart(2, '0');
        const { data: expenses } = await supabase.from('expenses')
          .select('id, amount_cents')
          .eq('user_id', user_id)
          .eq('status', 'draft')
          .gte('expense_date', `${y}-${m}-01`)
          .lt('expense_date', `${y}-${nextMonth}-01`);

        if (!expenses || expenses.length === 0) {
          return { error: `No draft expenses found for ${period}` };
        }

        const totalCents = expenses.reduce((s: number, e: any) => s + (e.amount_cents || 0), 0);
        const expenseIds = expenses.map((e: any) => e.id);

        let reportId: string;
        if (existing) {
          reportId = existing.id;
          await supabase.from('expense_reports')
            .update({ total_cents: totalCents, status: 'submitted', submitted_at: new Date().toISOString() })
            .eq('id', reportId);
        } else {
          const { data: report, error: rErr } = await supabase.from('expense_reports')
            .insert({ user_id, period, total_cents: totalCents, status: 'submitted', submitted_at: new Date().toISOString() })
            .select('id').single();
          if (rErr) throw new Error(`Create report failed: ${rErr.message}`);
          reportId = report.id;
        }

        // Link expenses to report and mark as submitted
        await supabase.from('expenses')
          .update({ report_id: reportId, status: 'submitted' })
          .in('id', expenseIds);

        return { submitted: true, report_id: reportId, period, expense_count: expenseIds.length, total_cents: totalCents };
      }

      if (action === 'approve_report') {
        const { report_id, approved_by } = args as any;
        if (!report_id) throw new Error('report_id required');
        const { error } = await supabase.from('expense_reports')
          .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: approved_by || null })
          .eq('id', report_id).eq('status', 'submitted');
        if (error) throw new Error(`Approve report failed: ${error.message}`);
        // Also approve all linked expenses
        await supabase.from('expenses').update({ status: 'approved' }).eq('report_id', report_id);
        return { approved: true, report_id };
      }

      if (action === 'book_report') {
        // FlowPilot books approved report as a journal entry
        const { report_id } = args as any;
        if (!report_id) throw new Error('report_id required');

        const { data: report, error: rErr } = await supabase.from('expense_reports')
          .select('*').eq('id', report_id).eq('status', 'approved').single();
        if (rErr || !report) throw new Error('Report not found or not approved');

        // Get all expenses in this report
        const { data: expenses } = await supabase.from('expenses')
          .select('*').eq('report_id', report_id).eq('status', 'approved');

        if (!expenses || expenses.length === 0) throw new Error('No approved expenses in report');

        // Group by account_code for journal entry lines
        const accountMap = new Map<string, { debit: number; credit: number; name: string }>();
        let totalNet = 0;
        let totalVat = 0;

        for (const exp of expenses) {
          const code = exp.account_code || '6992'; // Default: Övriga diverse kostnader
          const net = (exp.amount_cents || 0) - (exp.vat_cents || 0);
          const vat = exp.vat_cents || 0;
          totalNet += net;
          totalVat += vat;

          if (!accountMap.has(code)) accountMap.set(code, { debit: 0, credit: 0, name: exp.vendor || 'Expense' });
          accountMap.get(code)!.debit += net;
        }

        // Build journal entry lines
        const lines: any[] = [];
        for (const [code, amounts] of accountMap) {
          lines.push({
            account_code: code,
            account_name: amounts.name,
            debit_cents: amounts.debit,
            credit_cents: 0,
          });
        }
        if (totalVat > 0) {
          lines.push({ account_code: '2640', account_name: 'Ingående moms', debit_cents: totalVat, credit_cents: 0 });
        }
        // Credit: employee reimbursement account
        lines.push({ account_code: '2820', account_name: 'Kortfristiga skulder till anställda', debit_cents: 0, credit_cents: totalNet + totalVat });

        // Create journal entry
        const { data: entry, error: jeErr } = await supabase.from('journal_entries')
          .insert({
            entry_date: new Date().toISOString().split('T')[0],
            description: `Expense report ${report.period}`,
            reference_number: `EXP-${report.period}`,
            status: 'posted',
            source: auditCtx?.agent_type === 'chat' ? 'chat' : auditCtx?.agent_type === 'mcp' ? 'mcp' : 'flowpilot',
          })
          .select('id').single();
        if (jeErr) throw new Error(`Create journal entry failed: ${jeErr.message}`);

        const { error: lErr } = await supabase.from('journal_entry_lines')
          .insert(lines.map(l => ({ ...l, journal_entry_id: entry.id })));
        if (lErr) throw new Error(`Create journal lines failed: ${lErr.message}`);

        // Mark report as booked
        await supabase.from('expense_reports')
          .update({ status: 'booked', journal_entry_id: entry.id })
          .eq('id', report_id);

        return { booked: true, report_id, journal_entry_id: entry.id, total_cents: totalNet + totalVat, line_count: lines.length };
      }

      if (action === 'list_reports') {
        const { user_id, status: reportStatus } = args as any;
        let query = supabase.from('expense_reports')
          .select('id, user_id, period, status, total_cents, currency, submitted_at, approved_at, journal_entry_id, created_at')
          .order('period', { ascending: false });
        if (user_id) query = query.eq('user_id', user_id);
        if (reportStatus) query = query.eq('status', reportStatus);
        const { data, error } = await query.limit(50);
        if (error) throw new Error(`List reports failed: ${error.message}`);
        return { reports: data, count: (data || []).length };
      }

      throw new Error(`Unknown expenses action: ${action}`);
    }

    // ─── Purchasing: Vendors ─────────────────────────────────────────────
    case 'vendors': {
      const { action = 'list' } = args as any;

      // Allow `id` as alias for `vendor_id` so MCP-style { action, id, ...defaults } works
      if ((args as any).id && !(args as any).vendor_id) {
        (args as any).vendor_id = (args as any).id;
      }

      // ── GET single vendor (incl. autokontering defaults) ──
      if (action === 'get') {
        const vendor_id = (args as any).vendor_id;
        if (!vendor_id) throw new Error('id (vendor_id) is required for get');
        const { data, error } = await supabase.from('vendors')
          .select('*').eq('id', vendor_id).maybeSingle();
        if (error) throw new Error(`Get vendor failed: ${error.message}`);
        return { vendor: data };
      }

      if (action === 'list') {
        const { search, is_active, limit = 50 } = args as any;
        let query = supabase.from('vendors')
          .select('id, name, email, phone, payment_terms, currency, is_active, created_at')
          .order('name').limit(limit);
        if (is_active !== undefined) query = query.eq('is_active', is_active);
        if (search) query = query.or(`name.ilike.%${sanitizeOrTerm(search)}%,email.ilike.%${sanitizeOrTerm(search)}%`);
        const { data, error } = await query;
        if (error) throw new Error(`List vendors failed: ${error.message}`);
        return { vendors: data || [], count: (data || []).length };
      }

      if (action === 'create') {
        const { name, email, phone, payment_terms, currency, address, notes } = args as any;
        if (!name) throw new Error('name is required');
        const { data, error } = await supabase.from('vendors')
          .insert({ name, email, phone, payment_terms: payment_terms || 'net30', currency: currency || 'SEK', address, notes })
          .select('id, name').single();
        if (error) throw new Error(`Create vendor failed: ${error.message}`);
        // Fire webhook
        try { await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'vendor.created', data: { id: data.id, name: data.name, email } }) }); } catch { /* Fire-and-forget webhook. A webhook failure must not fail the business operation that triggered it. */ }
        return { vendor_id: data.id, name: data.name, created: true };
      }

      if (action === 'update') {
        const { vendor_id, ...updateData } = args as any;
        if (!vendor_id) throw new Error('vendor_id is required');
        delete updateData.action;
        const { error } = await supabase.from('vendors')
          .update({ ...updateData, updated_at: new Date().toISOString() })
          .eq('id', vendor_id);
        if (error) throw new Error(`Update vendor failed: ${error.message}`);
        return { vendor_id, updated: true };
      }

      if (action === 'deactivate') {
        const { vendor_id } = args as any;
        if (!vendor_id) throw new Error('vendor_id is required');
        const { error } = await supabase.from('vendors')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', vendor_id);
        if (error) throw new Error(`Deactivate vendor failed: ${error.message}`);
        return { vendor_id, deactivated: true };
      }

      return { error: `Unknown vendors action: ${action}` };
    }

    // ─── Purchasing: Purchase Orders (general CRUD) ─────────────────────
    case 'purchase_orders': {
      const { action = 'list' } = args as any;

      // A parameter the handler does not read must never be dropped in
      // silence. `currency: "EUR"` was sent, ignored, and the EUR order was
      // born in SEK — Milano Uno entered stock at 1 696,00 against a standard
      // cost of 19 500,00. Currency and exchange_rate are READ now; anything
      // still unknown bounces with the same self-correcting shape the page
      // writer uses, so the caller fixes the name instead of guessing again.
      const poBounce = bouncePurchaseOrderArgs(skillName, args as Record<string, unknown>);
      if (poBounce) return poBounce;

      // ── CREATE ──
      if (action === 'create' || skillName === 'create_purchase_order') {
        const { vendor_id, order_date, expected_delivery, notes, currency, exchange_rate, lines: poLines } = args as any;
        if (!vendor_id || !poLines?.length) throw new Error('vendor_id and lines are required');

        let subtotalCents = 0;
        let taxCents = 0;
        for (const line of poLines) {
          const lineSubtotal = (line.quantity || 1) * (line.unit_price_cents || 0);
          // `|| 25` read a deliberate 0 % (EU acquisition, reverse charge) as
          // "absent" and invented 1 272,00 of VAT on a line the DB stored at
          // 0.00. Zero is a value.
          const lineTax = Math.round(lineSubtotal * ((line.tax_rate ?? 25) / 100));
          subtotalCents += lineSubtotal;
          taxCents += lineTax;
        }

        const poInsert: Record<string, unknown> = {
          vendor_id,
          order_date: order_date || new Date().toISOString().split('T')[0],
          expected_delivery: expected_delivery || null,
          notes: notes || null,
          subtotal_cents: subtotalCents,
          tax_cents: taxCents,
          total_cents: subtotalCents + taxCents,
          status: 'draft',
        };
        // Omit rather than guess: with no currency given, the DB trigger takes
        // the vendor's own currency (Odoo's property_purchase_currency_id rule)
        // and stamps the rate for the order date. A client-side `|| 'SEK'` here
        // is the exact fallback class platform-fallbacks.ts forbids.
        if (currency) poInsert.currency = String(currency).toUpperCase();
        if (exchange_rate !== undefined && exchange_rate !== null) poInsert.exchange_rate = Number(exchange_rate);

        const { data: po, error: poError } = await supabase.from('purchase_orders')
          .insert(poInsert)
          .select('id, po_number, status, total_cents, currency, exchange_rate').single();
        if (poError) throw new Error(`Create PO failed: ${poError.message}`);

        // A line with no price must trigger a LOOKUP, not a zero. `|| 0` made
        // "nobody said a price" indistinguishable from "the price is nothing",
        // and a purchase order at 0,00 receives goods that enter stock at zero
        // cost — the same silent-cost class as the dropped currency, and it sits
        // three lines below a comment about omitting rather than guessing.
        // Order: the vendor's own price for this quantity (tier included), then
        // the product's cost, then REFUSE. Never zero.
        for (const l of poLines as any[]) {
          if (l.unit_price_cents !== undefined && l.unit_price_cents !== null) continue;
          if (!l.product_id) {
            throw new Error(
              `Purchase order line "${l.description ?? '(unnamed)'}" has neither unit_price_cents nor a product_id ` +
              `to look one up from. Send unit_price_cents, or a product_id that carries a vendor price or a cost price.`,
            );
          }
          const { data: vp } = await supabase.rpc('pick_vendor_price', {
            p_product_id: l.product_id, p_vendor_id: vendor_id, p_qty: l.quantity || 1,
          });
          const picked: any = Array.isArray(vp) ? vp[0] : vp;
          if (picked?.unit_price_cents != null) { l.unit_price_cents = picked.unit_price_cents; continue; }
          const { data: prod } = await supabase.from('products')
            .select('name, cost_cents').eq('id', l.product_id).maybeSingle();
          if ((prod as any)?.cost_cents != null) { l.unit_price_cents = (prod as any).cost_cents; continue; }
          throw new Error(
            `No purchase price known for ${(prod as any)?.name ?? l.product_id}: the vendor has no price for this ` +
            `product and the product has no cost price. Set one with manage_vendor_price, or send unit_price_cents ` +
            `explicitly. Booking it at 0 would let the goods enter stock at zero cost and report an infinite margin.`,
          );
        }

        const lineInserts = poLines.map((l: any, i: number) => ({
          purchase_order_id: po.id,
          product_id: l.product_id || null,
          description: l.description || `Line ${i + 1}`,
          quantity: l.quantity || 1,
          unit_price_cents: l.unit_price_cents,
          tax_rate: l.tax_rate ?? 25,
          // purchase_order_lines stores the line amount in `total_cents`
          // (not `line_total_cents` — that column belongs to quote_items /
          // pos_sale_lines). Reported by OpenClaw finding 30913d98.
          total_cents: (l.quantity || 1) * l.unit_price_cents,
        }));
        const { error: linesErr } = await supabase.from('purchase_order_lines').insert(lineInserts);
        if (linesErr) {
          // Header and lines are two round trips, so a refused line used to
          // leave an empty numbered order standing (a burnt PO number and a
          // draft that buys nothing). The order exists only if its lines do.
          await supabase.from('purchase_orders').delete().eq('id', po.id);
          throw new Error(`Insert PO lines failed: ${linesErr.message}`);
        }

        try {
          const { data: vendorInfo } = await supabase.from('vendors').select('name').eq('id', vendor_id).single();
          await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'purchase_order.created', data: { id: po.id, po_number: po.po_number, vendor_name: vendorInfo?.name, total_cents: po.total_cents, currency: po.currency } }) });
        } catch { /* Fire-and-forget webhook. A webhook failure must not fail the business operation that triggered it. */ }

        const rate = Number(po.exchange_rate ?? 1);
        return {
          purchase_order_id: po.id, po_number: po.po_number, status: po.status,
          total_cents: po.total_cents, lines_count: poLines.length,
          // The order's own money, and what it is worth in the books. The
          // second number is the one inventory will be valued at.
          currency: po.currency,
          exchange_rate: rate,
          total_accounting_cents: Math.round(Number(po.total_cents) * rate),
        };
      }

      // ── UPDATE (status, expected_delivery, notes — general purpose) ──
      if (action === 'update') {
        const { purchase_order_id, status, expected_delivery, notes: poNotes,
                currency: poCurrency, exchange_rate: poRate, order_date: poOrderDate,
                lines: updateLines } = args as any;
        if (!purchase_order_id) throw new Error('purchase_order_id is required');
        // `lines` is declared for action:"create" and read by nothing here.
        // Accepting it and rewriting no line at all is the same silence as the
        // dropped currency, so it is refused with the action that does work.
        if (updateLines !== undefined) {
          return {
            error: 'action:"update" does not rewrite purchase order lines — the lines you passed would have been ignored. '
              + 'Use action:"create" for a new order, or edit the lines in the purchase order editor.',
            valid_parameters: ['purchase_order_id', 'status', 'expected_delivery', 'notes', 'currency', 'exchange_rate', 'order_date'],
          };
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (status) updates.status = status;
        if (expected_delivery !== undefined) updates.expected_delivery = expected_delivery || null;
        if (poNotes !== undefined) updates.notes = poNotes;
        if (poOrderDate) updates.order_date = poOrderDate;
        // Re-denominating an order re-stamps its rate (the DB trigger), and
        // refuses when no rate exists for the new currency rather than leaving
        // a foreign order standing at rate 1.
        if (poCurrency) updates.currency = String(poCurrency).toUpperCase();
        if (poRate !== undefined && poRate !== null) updates.exchange_rate = Number(poRate);

        const { error: updErr } = await supabase.from('purchase_orders')
          .update(updates).eq('id', purchase_order_id);
        if (updErr) throw new Error(`Update PO failed: ${updErr.message}`);

        // If transitioning to 'sent', attempt email via Composio
        let emailSent = false;
        if (status === 'sent') {
          const { data: po } = await supabase.from('purchase_orders')
            .select('id, po_number, total_cents, currency, notes, order_date, expected_delivery, vendor_id, vendors(name, email)')
            .eq('id', purchase_order_id).single();

          const vendorEmail = (po as any)?.vendors?.email;
          const vendorName = (po as any)?.vendors?.name;

          if (vendorEmail) {
            try {
              const composioKey = Deno.env.get('COMPOSIO_API_KEY');
              if (composioKey) {
                const { data: lines } = await supabase.from('purchase_order_lines')
                  .select('description, quantity, unit_price_cents, line_total_cents')
                  .eq('purchase_order_id', purchase_order_id);

                const lineItems = (lines || []).map((l: any) =>
                  `• ${l.description}: ${l.quantity}x @ ${(l.unit_price_cents / 100).toFixed(2)} ${po.currency} = ${(l.line_total_cents / 100).toFixed(2)} ${po.currency}`
                ).join('\n');

                const emailBody = [
                  `Purchase Order: ${po.po_number}`, `Date: ${po.order_date}`,
                  po.expected_delivery ? `Expected Delivery: ${po.expected_delivery}` : '',
                  '', 'Items:', lineItems, '',
                  `Total: ${(po.total_cents / 100).toFixed(2)} ${po.currency}`,
                  po.notes ? `\nNotes: ${po.notes}` : '',
                ].filter(Boolean).join('\n');

                const emailRes = await fetch(`${supabaseUrl}/functions/v1/composio-proxy`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
                  body: JSON.stringify({ action: 'gmail_send', params: { to: vendorEmail, subject: `Purchase Order ${po.po_number}`, body: emailBody } }),
                });
                const emailData = await emailRes.json();
                emailSent = emailRes.ok && !emailData.error;
              }
            } catch (emailErr) {
              console.warn('[agent-execute] PO email send error (non-fatal):', emailErr);
            }
          }

          try {
            await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'purchase_order.sent', data: { id: purchase_order_id, po_number: po?.po_number, vendor_name: vendorName, email_sent: emailSent } }) });
          } catch { /* Fire-and-forget webhook. A webhook failure must not fail the business operation that triggered it. */ }
        }

        const { data: updated } = await supabase.from('purchase_orders')
          .select('id, po_number, status, total_cents, expected_delivery, notes').eq('id', purchase_order_id).single();

        return { ...updated, email_sent: emailSent, message: `PO ${updated?.po_number} updated successfully.` };
      }

      // ── LIST / GET ──
      if (action === 'get') {
        const { purchase_order_id } = args as any;
        if (!purchase_order_id) throw new Error('purchase_order_id required');
        const { data: po, error } = await supabase.from('purchase_orders')
          .select('*, vendors(name, email), purchase_order_lines(*)').eq('id', purchase_order_id).maybeSingle();
        if (error) throw new Error(`Get PO failed: ${error.message}`);
        if (!po) return { found: false, error: `Purchase order ${purchase_order_id} not found` };
        return po;
      }

      // Default: list
      const { status: poStatus, vendor_id, limit = 50 } = args as any;
      let query = supabase.from('purchase_orders')
        .select('id, po_number, status, total_cents, currency, order_date, expected_delivery, created_at, vendors(name)')
        .order('created_at', { ascending: false }).limit(limit);
      if (poStatus) query = query.eq('status', poStatus);
      if (vendor_id) query = query.eq('vendor_id', vendor_id);
      const { data, error } = await query;
      if (error) throw new Error(`List POs failed: ${error.message}`);
      return { purchase_orders: data || [], count: (data || []).length };
    }

    // ─── Purchasing: Goods Receipts ──────────────────────────────────────
    case 'goods_receipts': {
      const { purchase_order_id, receipt_date, notes, lines: receiptLines } = args as any;
      if (!purchase_order_id || !receiptLines?.length) throw new Error('purchase_order_id and lines required');

      // Create goods receipt
      const { data: gr, error: grErr } = await supabase.from('goods_receipts')
        .insert({
          purchase_order_id,
          // The column is received_date, not receipt_date — the old name made
          // every receipt through this path fail at the header.
          received_date: receipt_date || new Date().toISOString().split('T')[0],
          notes: notes || null,
        }).select('id').single();
      if (grErr) throw new Error(`Create goods receipt failed: ${grErr.message}`);

      // Insert receipt lines, update PO line received quantities, and sync inventory
      for (const rl of receiptLines) {
        const { error: grlErr } = await supabase.from('goods_receipt_lines').insert({
          goods_receipt_id: gr.id,
          po_line_id: rl.po_line_id,
          quantity_received: rl.quantity_received,
        });
        if (grlErr) throw new Error(`Create goods receipt line failed: ${grlErr.message}`);

        // Update received_quantity on the PO line
        const { data: poLine } = await supabase.from('purchase_order_lines')
          .select('received_quantity, product_id').eq('id', rl.po_line_id).single();
        const newReceived = (poLine?.received_quantity || 0) + rl.quantity_received;
        await supabase.from('purchase_order_lines')
          .update({ received_quantity: newReceived })
          .eq('id', rl.po_line_id);

        // Auto-sync inventory. This used to gate on a `product_stock` row and
        // write the on-hand back there — a table that is empty on every
        // instance, so the gate never opened and the receipt moved no stock.
        // apply_goods_receipt_stock books the quant AND the
        // products.stock_quantity mirror, and raises if no warehouse exists
        // rather than reporting a receipt that went nowhere.
        const productId = rl.product_id || poLine?.product_id;
        if (productId && rl.quantity_received > 0) {
          const { error: moveErr } = await supabase.from('stock_moves').insert({
            product_id: productId,
            quantity: rl.quantity_received,
            move_type: 'in',
            reference_type: 'goods_receipt',
            reference_id: gr.id,
            notes: `Goods receipt – ${rl.quantity_received} units received`,
          });
          if (moveErr) throw new Error(`Stock move failed: ${moveErr.message}`);

          const { error: stockErr } = await supabase.rpc('apply_goods_receipt_stock', {
            p_product_id: productId,
            p_quantity: rl.quantity_received,
          });
          if (stockErr) throw new Error(`Stock sync failed: ${stockErr.message}`);
        }
      }

      // Update PO status based on line fulfillment
      const { data: allLines } = await supabase.from('purchase_order_lines')
        .select('quantity, received_quantity')
        .eq('purchase_order_id', purchase_order_id);

      const allReceived = (allLines || []).every((l: any) => l.received_quantity >= l.quantity);
      const someReceived = (allLines || []).some((l: any) => l.received_quantity > 0);
      const newStatus = allReceived ? 'received' : someReceived ? 'partially_received' : undefined;
      if (newStatus) {
        await supabase.from('purchase_orders')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', purchase_order_id);
      }

      // Fire webhook
      try {
        const { data: poInfo } = await supabase.from('purchase_orders').select('po_number').eq('id', purchase_order_id).single();
        await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'goods_receipt.created', data: { id: gr.id, purchase_order_id, po_number: poInfo?.po_number, lines_received: receiptLines.length, fully_received: allReceived } }) });
        if (allReceived) {
          await fetch(`${supabaseUrl}/functions/v1/send-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` }, body: JSON.stringify({ event: 'purchase_order.received', data: { id: purchase_order_id, po_number: poInfo?.po_number, fully_received: true } }) });
        }
      } catch { /* Fire-and-forget webhook. A webhook failure must not fail the business operation that triggered it. */ }

      return {
        goods_receipt_id: gr.id,
        purchase_order_id,
        po_status: newStatus || 'confirmed',
        lines_received: receiptLines.length,
        fully_received: allReceived,
      };
    }

    // ─── Purchasing: Reorder Check + Auto-PO (via products table) ──────
    case 'products': {
      if (skillName === 'purchase_reorder_check') {
        const { threshold_override, auto_create = false } = args as any;

        // 1. Ask the ONE replenishment engine.
        //
        // This handler used to re-implement the whole calculation in TypeScript:
        // thresholds out of reorder_rules, on-hand out of
        // COALESCE(product_stock.quantity_on_hand, products.stock_quantity, 0),
        // vendor out of vendor_products.is_preferred. That made it the THIRD
        // engine answering the same question — next to procurement_run (which
        // counts virtual stock: on hand − reserved + incoming) and
        // list_reorder_candidates. On Nordbrygg, with four open purchase orders
        // covering every shortfall, procurement_run answered 0 and this lane
        // answered 22 — 306 963,75 kr of duplicate orders on top of what was
        // already coming. There is one engine now, and it lives in SQL:
        // list_reorder_candidates → stock_virtual_available.
        const { data: candidates, error: candErr } = await supabase.rpc('list_reorder_candidates', {
          p_threshold_override: (threshold_override ?? null),
        });
        if (candErr) throw new Error(`Reorder candidates failed: ${candErr.message}`);

        const lowStock: any[] = (candidates || []).map((c: any) => ({
          product_id: c.product_id,
          product_name: c.product_name,
          current_stock: Number(c.quantity_on_hand ?? 0),
          // The provenance of the answer travels with it — an agent that sees
          // "0 on hand" and "60 incoming" does not re-order.
          reserved: Number(c.reserved_qty ?? 0),
          incoming: Number(c.incoming_qty ?? 0),
          virtual_stock: Number(c.virtual_qty ?? 0),
          reorder_point: c.reorder_point,
          reorder_quantity: c.reorder_quantity,
          vendor_id: c.vendor_id,
          vendor_name: c.vendor_name,
          vendor_source: c.vendor_source,
          unit_price_cents: c.unit_price_cents,
          lead_time_days: c.lead_time_days,
          // An explicit rule IS the operator's opt-in; the engine already
          // applied product_stock.auto_reorder for the legacy lane.
          auto_reorder: true,
        }));


        if (lowStock.length === 0) {
          return { low_stock_items: [], count: 0, pos_created: 0, message: 'All stock levels are healthy.' };
        }

        // 2. Auto-create POs for items with auto_reorder enabled (or if auto_create forced)
        const itemsToOrder = lowStock.filter((i: any) => auto_create || i.auto_reorder);
        const createdPOs: any[] = [];

        if (itemsToOrder.length > 0) {
          // The vendor is already resolved by the engine
          // (reorder_preferred_vendor: the rule's preferred_vendor_id wins,
          // vendor_products.is_preferred fills in). Looking it up a second time
          // here is exactly how this lane and procurement_run used to disagree
          // about who sells the goods when only one of the two was set.
          const byVendor = new Map<string, any[]>();
          const noVendor: any[] = [];

          for (const item of itemsToOrder) {
            if (item.vendor_id) {
              const key = item.vendor_id;
              if (!byVendor.has(key)) byVendor.set(key, []);
              byVendor.get(key)!.push({ ...item });
            } else {
              noVendor.push(item);
            }
          }

          // Create one PO per vendor
          for (const [vendorId, items] of byVendor) {
            // The preferred row above picks the VENDOR; the price still has to
            // come from the tier that the ordered quantity qualifies for.
            // Reading the preferred row's price straight off is what made the
            // 60 kg break (17,50) dead data and billed 18,50 instead.
            for (const it of items) {
              const { data: tierRow } = await supabase.rpc('pick_vendor_price', {
                p_product_id: it.product_id, p_vendor_id: vendorId, p_quantity: it.reorder_quantity,
              });
              const tier = Array.isArray(tierRow) ? tierRow[0] : tierRow;
              if (tier?.unit_price_cents != null) it.unit_price_cents = tier.unit_price_cents;
            }
            const maxLead = Math.max(...items.map((i: any) => i.lead_time_days || 7));
            const expectedDelivery = new Date();
            expectedDelivery.setDate(expectedDelivery.getDate() + maxLead);

            // purchase_order_lines.tax_rate is a PERCENT (column default
            // 25.00). This wrote 0.25 — a quarter of one percent — on 25 live
            // lines while the header charged the full 25 %, so the order's own
            // rows disagreed with its total. One convention, one number.
            const PURCHASE_TAX_RATE_PCT = 25;
            const lines = items.map((i: any) => ({
              product_id: i.product_id,
              description: i.product_name,
              quantity: i.reorder_quantity,
              unit_price_cents: i.unit_price_cents,
              tax_rate: PURCHASE_TAX_RATE_PCT,
              total_cents: i.unit_price_cents * i.reorder_quantity,
            }));

            const subtotal = lines.reduce((s: number, l: any) => s + l.total_cents, 0);
            const taxCents = Math.round(subtotal * PURCHASE_TAX_RATE_PCT / 100);

            // No `currency: 'SEK'` here: the vendor's currency is the DB's to
            // decide (trg_stamp_purchase_order_fx), and a hardcoded SEK on a
            // EUR vendor is how the 1 696,00 layer was born.
            const { data: po, error: poErr } = await supabase.from('purchase_orders').insert({
              vendor_id: vendorId,
              status: 'draft',
              order_date: new Date().toISOString().split('T')[0],
              expected_delivery: expectedDelivery.toISOString().split('T')[0],
              subtotal_cents: subtotal,
              tax_cents: taxCents,
              total_cents: subtotal + taxCents,
              notes: 'Auto-generated by FlowPilot reorder check',
            }).select('id, po_number').single();

            if (poErr) {
              console.error('PO creation failed:', poErr);
              continue;
            }

            // Insert PO lines
            for (const line of lines) {
              await supabase.from('purchase_order_lines').insert({
                purchase_order_id: po.id,
                ...line,
              });
            }

            createdPOs.push({
              po_id: po.id,
              po_number: po.po_number,
              vendor_id: vendorId,
              items_count: items.length,
              total_cents: subtotal + taxCents,
            });
          }
        }

        return {
          low_stock_items: lowStock,
          count: lowStock.length,
          pos_created: createdPOs.length,
          created_purchase_orders: createdPOs,
          items_without_vendor: lowStock.filter((i: any) => 
            itemsToOrder.includes(i) && !createdPOs.some((po: any) => 
              po.vendor_id // simplified check
            )
          ).length,
          message: createdPOs.length > 0
            ? `${lowStock.length} low-stock item(s) found. ${createdPOs.length} purchase order(s) auto-created as drafts.`
            : `${lowStock.length} product(s) below reorder threshold. Set auto_reorder=true or assign preferred vendors to enable auto-PO creation.`,
        };
      }

      // Fallthrough: generic products table not handled here
      return { error: `Unknown products skill in purchasing context: ${skillName}` };
    }

    case 'contracts': {
      // ─── Contracts module: 6 skills, all routed via handler='db:contracts' ──
      const VALID_CONTRACT_STATUS = new Set(['draft', 'pending_signature', 'active', 'expired', 'terminated']);

      // send_contract_for_signature — issue accept_token + signing URL
      if (skillName === 'send_contract_for_signature') {
        const { contract_id } = args as any;
        if (!contract_id) throw new Error('contract_id is required');

        const { data: contract, error: cErr } = await supabase.from('contracts')
          .select('id, title, body_markdown, file_url, status, accept_token, version, counterparty_name, counterparty_email')
          .eq('id', contract_id).maybeSingle();
        if (cErr) throw new Error(`Fetch contract failed: ${cErr.message}`);
        if (!contract) return { error: `Contract ${contract_id} not found` };

        const hasBody = (contract.body_markdown && String(contract.body_markdown).trim().length > 0)
          || !!contract.file_url;
        if (!hasBody) {
          return { error: 'Contract has empty body_markdown and no file_url. Write the agreement (manage_contract action=update body_markdown=...) before sending for signature.' };
        }

        // Reuse existing token, otherwise mint a new one.
        let token: string = contract.accept_token;
        if (!token) {
          const bytes = new Uint8Array(24);
          crypto.getRandomValues(bytes);
          token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Snapshot current version (best-effort, idempotent on unique (contract_id, version_number))
        try {
          await supabase.from('contract_versions').insert({
            contract_id: contract.id,
            version_number: contract.version || 1,
            snapshot: {
              title: contract.title,
              counterparty_name: contract.counterparty_name,
              counterparty_email: contract.counterparty_email,
              body_markdown: contract.body_markdown,
              file_url: contract.file_url,
            },
            reason: 'sent_for_signature',
          });
        } catch (_e) { /* version may already exist — ignore */ }

        const { error: uErr } = await supabase.from('contracts')
          .update({
            accept_token: token,
            status: 'pending_signature',
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', contract.id);
        if (uErr) throw new Error(`Update contract failed: ${uErr.message}`);

        // Resolve site origin (env first, then site_settings.general)
        let origin = Deno.env.get('PUBLIC_SITE_URL') || '';
        if (!origin) {
          const { data: setting } = await supabase.from('site_settings')
            .select('value').eq('key', 'general').maybeSingle();
          const v = (setting?.value as any) || {};
          origin = v.siteUrl || v.site_url || v.public_url || v.publicUrl || '';
        }
        if (!origin) {
          throw new Error('Public Site URL is not configured. Set it in Admin → Site Settings → General (or PUBLIC_SITE_URL env).');
        }
        origin = origin.replace(/\/$/, '');


        return {
          contract_id: contract.id,
          token,
          url: `${origin}/contract/${token}`,
          status: 'pending_signature',
          version: contract.version || 1,
        };
      }

      // get_contract_content — full markdown + metadata for LLM consumption
      if (skillName === 'get_contract_content') {
        const { contract_id } = args as any;
        if (!contract_id) throw new Error('contract_id is required');
        const { data, error } = await supabase.from('contracts')
          .select('id, title, counterparty_name, counterparty_email, status, contract_type, value_cents, currency, start_date, end_date, signed_at, version, body_markdown')
          .eq('id', contract_id).maybeSingle();
        if (error) throw new Error(`Fetch contract failed: ${error.message}`);
        if (!data) return { error: `Contract ${contract_id} not found` };
        return { contract: data };
      }

      // search_contracts — fuzzy ILIKE across title/counterparty/body
      if (skillName === 'search_contracts') {
        const { query, limit = 10, status } = args as any;
        if (!query || typeof query !== 'string') throw new Error('query is required');
        const pattern = `%${sanitizeOrTerm(query)}%`;
        let q = supabase.from('contracts')
          .select('id, title, counterparty_name, counterparty_email, status, value_cents, currency, end_date, body_markdown')
          .or(`title.ilike.${pattern},counterparty_name.ilike.${pattern},body_markdown.ilike.${pattern}`)
          .order('updated_at', { ascending: false })
          .limit(Math.min(Math.max(Number(limit) || 10, 1), 50));
        if (status && VALID_CONTRACT_STATUS.has(status)) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw new Error(`Search contracts failed: ${error.message}`);
        const results = (data || []).map((c: any) => {
          const body = c.body_markdown || '';
          const idx = body.toLowerCase().indexOf(query.toLowerCase());
          const snippet = idx >= 0
            ? body.slice(Math.max(0, idx - 60), Math.min(body.length, idx + 200))
            : body.slice(0, 200);
          return {
            id: c.id, title: c.title, counterparty_name: c.counterparty_name,
            counterparty_email: c.counterparty_email, status: c.status,
            value_cents: c.value_cents, currency: c.currency, end_date: c.end_date,
            snippet,
          };
        });
        return { query, count: results.length, contracts: results };
      }

      // contract_renewal_check — find expiring contracts grouped by urgency
      if (skillName === 'contract_renewal_check') {
        const { days_ahead = 30, include_auto_renew = true } = args as any;
        const now = new Date();
        const horizon = new Date(now.getTime() + Number(days_ahead) * 24 * 60 * 60 * 1000);
        let q = supabase.from('contracts')
          .select('id, title, counterparty_name, status, end_date, renewal_type, renewal_notice_days, value_cents, currency')
          .eq('status', 'active')
          .not('end_date', 'is', null)
          .lte('end_date', horizon.toISOString().split('T')[0])
          .order('end_date', { ascending: true });
        if (!include_auto_renew) q = q.neq('renewal_type', 'auto');
        const { data, error } = await q;
        if (error) throw new Error(`Renewal check failed: ${error.message}`);
        const today = now.getTime();
        const grouped: Record<string, any[]> = { critical: [], warning: [], notice: [] };
        for (const c of (data || []) as any[]) {
          const days = Math.ceil((new Date(c.end_date).getTime() - today) / (24 * 60 * 60 * 1000));
          const bucket = days < 7 ? 'critical' : days < 30 ? 'warning' : 'notice';
          grouped[bucket].push({ ...c, days_until_expiry: days });
        }
        return {
          horizon_days: days_ahead,
          total: (data || []).length,
          critical: grouped.critical, warning: grouped.warning, notice: grouped.notice,
        };
      }

      // list_contract_documents — pull from documents archive
      if (skillName === 'list_contract_documents') {
        const { contract_id } = args as any;
        if (!contract_id) throw new Error('contract_id is required');
        const { data, error } = await supabase.from('documents')
          .select('id, title, file_name, file_url, file_type, category, created_at')
          .eq('related_entity_type', 'contract')
          .eq('related_entity_id', contract_id)
          .order('created_at', { ascending: false });
        if (error) throw new Error(`List contract documents failed: ${error.message}`);
        return { contract_id, count: (data || []).length, documents: data || [] };
      }

      // list_contract_templates — discover available templates before create
      if (skillName === 'list_contract_templates') {
        const { contract_type, language } = args as any;
        let q = supabase.from('contract_templates')
          .select('id, name, description, contract_type, language, default_currency, default_renewal_type, default_renewal_notice_days, is_default')
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('contract_type', { ascending: true })
          .order('name', { ascending: true });
        if (contract_type) q = q.eq('contract_type', contract_type);
        if (language) q = q.eq('language', language);
        const { data, error } = await q;
        if (error) throw new Error(`List contract templates failed: ${error.message}`);
        return { count: (data || []).length, templates: data || [] };
      }

      // manage_contract — CRUD (default skill on table='contracts')
      const { action = 'list' } = args as any;

      if (action === 'list') {
        const { status } = args as any;
        let q = supabase.from('contracts')
          .select('id, title, counterparty_name, counterparty_email, status, contract_type, start_date, end_date, value_cents, currency, sent_at, signed_at, version, updated_at')
          .order('updated_at', { ascending: false }).limit(100);
        if (status && VALID_CONTRACT_STATUS.has(status)) q = q.eq('status', status);
        const { data, error } = await q;
        if (error) throw new Error(`List contracts failed: ${error.message}`);
        return { contracts: data || [], count: (data || []).length };
      }

      if (action === 'create') {
        const a = args as any;
        if (!a.counterparty_name) throw new Error('counterparty_name is required (NOT NULL in DB)');

        // Preferred path: render from template via RPC (handles tokens + guard)
        if (a.template_id) {
          const overrides: Record<string, unknown> = {};
          for (const k of ['title', 'start_date', 'end_date', 'value_cents', 'currency']) {
            if (a[k] !== undefined) overrides[k] = a[k];
          }
          const { data, error } = await supabase.rpc('create_contract_from_template', {
            p_template_id: a.template_id,
            p_counterparty_name: a.counterparty_name,
            p_counterparty_email: a.counterparty_email || null,
            p_overrides: overrides,
          });
          if (error) throw new Error(`Create contract from template failed: ${error.message}`);
          const row = Array.isArray(data) ? data[0] : data;
          return { created: true, from_template: a.template_id, contract_id: row?.contract_id, title: row?.title, status: row?.status };
        }

        // Direct create path: requires either a real body_markdown (>=200 chars) or a file_url.
        // The DB trigger `guard_contracts_require_body` enforces this — we give a friendlier message up-front.
        const hasFile = a.file_url && String(a.file_url).length > 0;
        const hasBody = a.body_markdown && String(a.body_markdown).length >= 200;
        if (!hasFile && !hasBody) {
          throw new Error('Cannot create empty contract. Either pass template_id (run list_contract_templates first), attach a file_url, or write body_markdown with at least 200 characters of real agreement text.');
        }

        const insertData: Record<string, unknown> = {
          title: a.title || `Contract — ${a.counterparty_name}`,
          counterparty_name: a.counterparty_name,
          counterparty_email: a.counterparty_email || null,
          contract_type: a.contract_type || 'service',
          status: a.status && VALID_CONTRACT_STATUS.has(a.status) ? a.status : 'draft',
          start_date: a.start_date || null,
          end_date: a.end_date || null,
          renewal_type: a.renewal_type || 'none',
          renewal_notice_days: a.renewal_notice_days ?? 30,
          value_cents: a.value_cents ?? 0,
          currency: a.currency || 'SEK',
          notes: a.notes || null,
          body_markdown: a.body_markdown || null,
          file_url: a.file_url || null,
        };
        // Recurring-billing config (lets an agent enable generate_contract_invoice; the
        // billing_* columns were previously unreachable via the skill — QA 2026-07-10).
        for (const k of ['billing_enabled', 'billing_amount_cents', 'billing_interval', 'billing_interval_count', 'billing_next_date', 'billing_due_in_days', 'billing_tax_rate']) {
          if (a[k] !== undefined) insertData[k] = a[k];
        }
        const { data, error } = await supabase.from('contracts').insert(insertData)
          .select('id, title, status').single();
        if (error) throw new Error(`Create contract failed: ${error.message}`);
        return { created: true, contract_id: data.id, title: data.title, status: data.status };
      }

      if (action === 'update') {
        const { contract_id, ...rest } = args as any;
        if (!contract_id) throw new Error('contract_id is required');
        const allowed = ['title', 'counterparty_name', 'counterparty_email', 'contract_type', 'status', 'start_date', 'end_date', 'renewal_type', 'renewal_notice_days', 'value_cents', 'currency', 'notes', 'body_markdown', 'file_url', 'billing_enabled', 'billing_amount_cents', 'billing_interval', 'billing_interval_count', 'billing_next_date', 'billing_due_in_days', 'billing_tax_rate'];
        const updates: Record<string, unknown> = {};
        for (const k of allowed) if (rest[k] !== undefined) updates[k] = rest[k];
        if (updates.status && !VALID_CONTRACT_STATUS.has(updates.status as string)) {
          throw new Error(`Invalid contract status: ${updates.status}. Valid: ${[...VALID_CONTRACT_STATUS].join(', ')}`);
        }
        if (Object.keys(updates).length === 0) throw new Error('No updatable fields provided');
        updates.updated_at = new Date().toISOString();
        if (updates.body_markdown !== undefined) updates.body_updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('contracts').update(updates)
          .eq('id', contract_id).select('id, status').single();
        if (error) throw new Error(`Update contract failed: ${error.message}`);
        return { updated: true, contract_id: data.id, status: data.status };
      }

      if (action === 'search') {
        // Convenience alias for search_contracts called via manage_contract.
        const { search_query, query, limit = 10, status } = args as any;
        const q = search_query || query;
        if (!q) throw new Error('search_query is required for action=search');
        return await executeDbAction(supabase, 'contracts', 'search_contracts', { query: q, limit, status }, auditCtx);
      }

      throw new Error(`Unknown contracts action: ${action}. Supported: list, create, update, search.`);
    }

    case 'invoices': {
      // ─── Invoicing module — full lifecycle ──────────────────────────────
      const VALID_INVOICE_STATUS = new Set(['draft', 'sent', 'partially_paid', 'paid', 'cancelled', 'overdue']);
      // Argument-name tolerance: MCP peers commonly send `id` — map to `invoice_id`.
      const inv = args as any;
      if (inv.id !== undefined && inv.invoice_id === undefined) inv.invoice_id = inv.id;
      // invoice_overdue_check has its own question ("which invoices are past
      // due?") but no `action` parameter, so it fell through to `list` and
      // returned the 50 most recent invoices — drafts, paid and cancelled ones
      // included — as if they were all overdue. It reported 6 overdue invoices
      // on an instance that had 2 (QA 2026-08-20). This is handler dispatch by
      // skill name, not intent detection: the skill IS the action.
      if (skillName === 'invoice_overdue_check' && (args as any).action === undefined) {
        (args as any).action = 'overdue';
      }
      const { action = 'list' } = args as any;

      // ── helpers ──
      // Accept common field-name aliases so an autonomous operator that sends
      // `quantity`/`unit_price` (instead of the schema's `qty`/`unit_price_cents`)
      // still gets correct totals instead of a silent 0-total invoice. Law 4:
      // fail forward, don't gate. Canonical names stay qty / unit_price_cents.
      const lineQty = (it: any) => Number(it.qty ?? it.quantity ?? it.units ?? 0);
      const lineUnitCents = (it: any) =>
        Number(it.unit_price_cents ?? it.unitPriceCents ?? it.unit_price ?? it.price_cents ?? it.unit_amount_cents ?? 0);
      const computeTotals = (items: any[], taxRate: number) => {
        const subtotal = (items || []).reduce((s, it) => s + (lineQty(it) * lineUnitCents(it)), 0);
        const tax = Math.round(subtotal * Number(taxRate || 0));
        return { subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax };
      };
      const generateInvoiceNumber = async (): Promise<string> => {
        const yr = new Date().getFullYear();
        const { data } = await supabase.from('invoices')
          .select('invoice_number')
          .ilike('invoice_number', `INV-${yr}-%`)
          .order('invoice_number', { ascending: false }).limit(1).maybeSingle();
        let next = 1;
        if (data?.invoice_number) {
          const m = String(data.invoice_number).match(/INV-\d{4}-(\d+)/);
          if (m) next = parseInt(m[1], 10) + 1;
        }
        return `INV-${yr}-${String(next).padStart(5, '0')}`;
      };

      if (action === 'list') {
        const { status_filter, status, deal_id, lead_id, project_id, limit = 50 } = args as any;
        const stat = status_filter || status;
        let q = supabase.from('invoices')
          .select('id, invoice_number, customer_name, customer_email, status, subtotal_cents, tax_cents, total_cents, paid_amount_cents, currency, issue_date, due_date, sent_at, paid_at, deal_id, lead_id, project_id, created_at')
          .order('created_at', { ascending: false })
          .limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
        if (stat && VALID_INVOICE_STATUS.has(stat)) q = q.eq('status', stat);
        if (deal_id) q = q.eq('deal_id', deal_id);
        if (lead_id) q = q.eq('lead_id', lead_id);
        if (project_id) q = q.eq('project_id', project_id);
        const { data, error } = await q;
        if (error) throw new Error(`List invoices failed: ${error.message}`);
        return { invoices: data || [], count: (data || []).length };
      }

      if (action === 'get') {
        const { invoice_id } = args as any;
        if (!invoice_id) throw new Error('invoice_id is required');
        const { data, error } = await supabase.from('invoices').select('*')
          .eq('id', invoice_id).maybeSingle();
        if (error) throw new Error(`Get invoice failed: ${error.message}`);
        if (!data) return { error: `Invoice ${invoice_id} not found` };
        return { invoice: data };
      }

      if (action === 'overdue') {
        // Overdue = ISSUED, UNPAID and PAST DUE. All three conditions, or the
        // answer is just "here are some invoices".
        const { auto_flag = true, limit = 200 } = args as any;
        const today = new Date().toISOString().split('T')[0];
        const { data, error } = await supabase.from('invoices')
          .select('id, invoice_number, customer_name, customer_email, status, total_cents, paid_amount_cents, currency, due_date, sent_at')
          .in('status', ['sent', 'overdue'])
          .lt('due_date', today)
          .is('paid_at', null)
          .order('due_date', { ascending: true })
          .limit(Math.min(Math.max(Number(limit) || 200, 1), 500));
        if (error) throw new Error(`Overdue check failed: ${error.message}`);
        const rows = (data || []).map((r: any) => ({
          ...r,
          days_overdue: Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86400000),
          outstanding_cents: Number(r.total_cents || 0) - Number(r.paid_amount_cents || 0),
        }));
        let flagged = 0;
        if (auto_flag !== false) {
          const toFlag = rows.filter((r: any) => r.status === 'sent').map((r: any) => r.id);
          if (toFlag.length > 0) {
            const { error: fErr } = await supabase.from('invoices')
              .update({ status: 'overdue', updated_at: new Date().toISOString() })
              .in('id', toFlag);
            if (fErr) throw new Error(`Flagging overdue failed: ${fErr.message}`);
            flagged = toFlag.length;
          }
        }
        return {
          overdue_count: rows.length,
          total_outstanding_cents: rows.reduce((s: number, r: any) => s + r.outstanding_cents, 0),
          currency: rows[0]?.currency ?? null,
          flagged_overdue: flagged,
          criteria: "status in ('sent','overdue') AND due_date < today AND paid_at IS NULL",
          invoices: rows,
        };
      }

      if (action === 'create') {
        const a = args as any;
        const items = Array.isArray(a.line_items) ? a.line_items : [];
        if (items.length === 0) throw new Error('line_items is required (at least one row with description, qty, unit_price_cents)');
        const taxRate = a.tax_rate !== undefined ? Number(a.tax_rate) : 0.25;
        const totals = computeTotals(items, taxRate);
        const invoiceNumber = a.invoice_number || await generateInvoiceNumber();
        const insertData: Record<string, unknown> = {
          invoice_number: invoiceNumber,
          deal_id: a.deal_id || null,
          lead_id: a.lead_id || null,
          project_id: a.project_id || null,
          customer_email: a.customer_email || null,
          customer_name: a.customer_name || '',
          line_items: items,
          tax_rate: taxRate,
          ...totals,
          currency: a.currency || 'SEK',
          due_date: a.due_date || null,
          issue_date: a.issue_date || new Date().toISOString().split('T')[0],
          payment_terms: a.payment_terms || null,
          notes: a.notes || null,
          status: a.status && VALID_INVOICE_STATUS.has(a.status) ? a.status : 'draft',
        };
        const { data, error } = await supabase.from('invoices').insert(insertData)
          .select('id, invoice_number, status, total_cents, currency').single();
        if (error) throw new Error(`Create invoice failed: ${error.message}`);
        return { created: true, invoice_id: data.id, invoice_number: data.invoice_number, status: data.status, total_cents: data.total_cents, currency: data.currency };
      }

      if (action === 'update') {
        const { invoice_id, ...rest } = args as any;
        if (!invoice_id) throw new Error('invoice_id is required');
        const allowed = ['customer_name', 'customer_email', 'line_items', 'tax_rate', 'currency', 'due_date', 'payment_terms', 'notes', 'status', 'deal_id', 'lead_id', 'project_id'];
        const updates: Record<string, unknown> = {};
        for (const k of allowed) if (rest[k] !== undefined) updates[k] = rest[k];
        if (updates.status && !VALID_INVOICE_STATUS.has(updates.status as string)) {
          throw new Error(`Invalid invoice status: ${updates.status}. Valid: ${[...VALID_INVOICE_STATUS].join(', ')}`);
        }
        // Recompute totals if line_items or tax_rate changed
        if (updates.line_items !== undefined || updates.tax_rate !== undefined) {
          const { data: cur } = await supabase.from('invoices')
            .select('line_items, tax_rate').eq('id', invoice_id).maybeSingle();
          const items = (updates.line_items as any) ?? cur?.line_items ?? [];
          const rate = (updates.tax_rate as any) ?? cur?.tax_rate ?? 0.25;
          Object.assign(updates, computeTotals(items, Number(rate)));
        }
        if (Object.keys(updates).length === 0) throw new Error('No updatable fields provided');
        updates.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('invoices').update(updates)
          .eq('id', invoice_id).select('id, status, total_cents').single();
        if (error) throw new Error(`Update invoice failed: ${error.message}`);
        return { updated: true, invoice_id: data.id, status: data.status, total_cents: data.total_cents };
      }

      if (action === 'send') {
        const { invoice_id } = args as any;
        if (!invoice_id) throw new Error('invoice_id is required');
        const { data, error } = await supabase.from('invoices').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', invoice_id).select('id, invoice_number, status, public_token').single();
        if (error) throw new Error(`Send invoice failed: ${error.message}`);
        return { sent: true, invoice_id: data.id, invoice_number: data.invoice_number, status: data.status, public_token: data.public_token };
      }

      if (action === 'mark_paid') {
        const { invoice_id, paid_amount_cents, paid_at } = args as any;
        if (!invoice_id) throw new Error('invoice_id is required');
        const { data: cur, error: cErr } = await supabase.from('invoices')
          .select('id, total_cents, status').eq('id', invoice_id).maybeSingle();
        if (cErr) throw new Error(`Fetch invoice failed: ${cErr.message}`);
        if (!cur) return { error: `Invoice ${invoice_id} not found` };
        if (cur.status === 'cancelled') {
          return { error: `Invoice ${invoice_id} is cancelled — cannot mark paid` };
        }
        const amount = paid_amount_cents !== undefined ? Number(paid_amount_cents) : cur.total_cents;
        const { data, error } = await supabase.from('invoices').update({
          status: 'paid',
          paid_at: paid_at || new Date().toISOString(),
          paid_amount_cents: amount,
          updated_at: new Date().toISOString(),
        }).eq('id', invoice_id).select('id, invoice_number, status, paid_amount_cents, paid_at').single();
        if (error) throw new Error(`Mark paid failed: ${error.message}`);

        // Emit platform event so accounting / automations can react
        // (journal posting Dt 1930 / Cr 1510 is the listener's job, not this skill's)
        try {
          await supabase.rpc('emit_platform_event', {
            _event_name: 'invoice.paid',
            _payload: {
              invoice_id: data.id,
              invoice_number: data.invoice_number,
              paid_amount_cents: data.paid_amount_cents,
              paid_at: data.paid_at,
              source: 'manual_mark_paid',
            },
            _source: 'agent-execute:invoices.mark_paid',
          });
        } catch (evErr) {
          console.error('[invoices.mark_paid] emit_platform_event failed', evErr);
        }

        return {
          marked_paid: true,
          invoice_id: data.id,
          invoice_number: data.invoice_number,
          status: data.status,
          paid_amount_cents: data.paid_amount_cents,
          paid_at: data.paid_at,
          event_emitted: 'invoice.paid',
          note: 'invoice.paid emitted on event bus — accounting listener will post Dt 1930 / Cr 1510.',
        };
      }

      if (action === 'cancel') {
        const { invoice_id, reason } = args as any;
        if (!invoice_id) throw new Error('invoice_id is required');
        const updates: Record<string, unknown> = {
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        };
        if (reason) updates.notes = `[CANCELLED] ${reason}`;
        const { data, error } = await supabase.from('invoices').update(updates)
          .eq('id', invoice_id).select('id, invoice_number, status').single();
        if (error) throw new Error(`Cancel invoice failed: ${error.message}`);
        return { cancelled: true, invoice_id: data.id, invoice_number: data.invoice_number, status: data.status };
      }

      if (action === 'delete') {
        return {
          error: `Invoices are never deleted (audit/accounting trail). Use action='cancel' with a reason — it preserves the invoice number for reconciliation.`,
        };
      }

      throw new Error(`Unknown invoices action: ${action}. Supported: list, get, overdue, create, update, send, mark_paid, cancel. To "delete" an invoice use cancel (audit-preserving).`);
    }

    case 'social_posts': {
      // Same status rule as the UI hook (useSocialPosts): a post created WITH
      // a scheduled_at is 'scheduled', without one 'draft'. The generic CRUD
      // let the column default win, so skill-scheduled posts were born draft —
      // and the 15-minute sweep (correctly) never touched them: the agent said
      // "schedule for wednesday 09:00" and the post silently never left draft.
      if (skillName === 'schedule_social_post' && args.status === undefined) {
        args = { ...args, status: args.scheduled_at ? 'scheduled' : 'draft' };
      }
      return await executeGenericCrud(supabase, table, skillName, args, auditCtx);
    }

    default:
      // ─── Generic CRUD engine for any db:tablename handler ─────────────
      // Handles list, get, create, update, delete for tables that don't
      // have a dedicated handler above. This enables all modules (HR,
      // Projects, Contracts, etc.) to work via MCP/Chat/Automations
      // without writing per-table code.
      return await executeGenericCrud(supabase, table, skillName, args, auditCtx);
  }
}

// =============================================================================
// Flowtable — query + record management over user-defined JSONB tables
// =============================================================================

// Flowtable data lives in flowtable_records.values (free-form JSONB keyed by
// the table's field keys), so the generic CRUD engine can only filter on real
// columns. These handlers push eq/neq/ilike filters down to PostgREST as
// values->>key operators, evaluate numeric/emptiness ops in-handler over a
// bounded scan, and expose count_by aggregation — the difference between
// "agent pages 5 800 rows into context" and "agent asks one question".

const FLOWTABLE_SCAN_CAP = 20000;
const FLOWTABLE_PAGE = 1000;
// Field keys come from fieldKeyify() in the UI (lowercase + underscores), but
// hand-created keys could contain anything — only allow safe keys into
// PostgREST filter/order strings.
const safeFlowtableKey = (k: string): boolean => /^[a-zA-Z0-9_]+$/.test(k);

async function resolveFlowtableTable(
  supabase: any,
  args: Record<string, unknown>,
): Promise<{ table?: any; error?: string }> {
  const { table_id, table, base } = args as any;
  if (table_id) {
    const { data } = await supabase.from('flowtable_tables')
      .select('id, name, slug, base_id').eq('id', table_id).maybeSingle();
    if (!data) return { error: `Flowtable table ${table_id} not found` };
    return { table: data };
  }
  if (!table) return { error: 'table_id or table (name/slug) is required' };
  const term = sanitizeOrTerm(table);
  let query = supabase.from('flowtable_tables')
    .select('id, name, slug, base_id, flowtable_bases!inner(id, name, slug)')
    .or(`slug.eq.${term},name.ilike.${term}`);
  const { data: candidates, error } = await query.limit(10);
  if (error) return { error: `Flowtable table lookup failed: ${error.message}` };
  let matches = candidates || [];
  if (base) {
    const b = String(base).toLowerCase();
    matches = matches.filter((t: any) =>
      t.flowtable_bases?.slug === b || (t.flowtable_bases?.name || '').toLowerCase() === b);
  }
  if (matches.length === 0) {
    // Uncoached operators routinely pass the BASE name (or guess the table
    // name) — list the real tables so they can pick without a second
    // discovery round-trip. Cheap: one indexed select.
    const { data: all } = await supabase.from('flowtable_tables')
      .select('name, slug, flowtable_bases!inner(name, slug)').limit(50);
    const available = (all || []).map((t: any) =>
      `${t.flowtable_bases?.name}/${t.name}`).join(', ') || '(none)';
    return { error: `No Flowtable table matches '${table}'${base ? ` in base '${base}'` : ''}. Note: pass the TABLE name, not the base. Available tables (base/table): ${available}. Or pass table_id.` };
  }
  if (matches.length > 1) {
    return { error: `Ambiguous table '${table}': ${matches.map((t: any) => `${t.flowtable_bases?.slug}/${t.slug}`).join(', ')}. Pass base or table_id.` };
  }
  return { table: matches[0] };
}

async function executeFlowtableAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (skillName === 'query_flowtable') return await executeFlowtableQuery(supabase, args);
  if (skillName === 'manage_flowtable_record') return await executeFlowtableRecord(supabase, args);
  if (skillName === 'manage_flowtable_table') return await executeFlowtableTable(supabase, args);
  if (skillName === 'manage_flowtable_field') return await executeFlowtableField(supabase, args);
  return { error: `Unknown flowtable skill: ${skillName}` };
}

async function executeFlowtableQuery(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const {
    filters, search, order_by, ascending = true,
    limit = 50, offset = 0, count_by, resolve_links = false, resolve_computed = false,
  } = args as any;

  const resolved = await resolveFlowtableTable(supabase, args);
  if (resolved.error) return { error: resolved.error };
  const table = resolved.table;

  const { data: fieldRows } = await supabase.from('flowtable_fields')
    .select('key, name, type, options').eq('table_id', table.id).order('position');
  const rawFields = fieldRows || [];
  const fieldKeys = new Set(rawFields.map((f: any) => f.key));

  // Link fields point at another table (values[key] holds a target row id).
  // Surface the target so an agent can traverse the relation, and resolve the
  // id → display value when asked (resolve_links) — the payoff of relations
  // for an operator: one query returns human labels, not UUIDs.
  const linkFields = rawFields.filter((f: any) => f.type === 'link' && f.options?.link_table_id);
  const linkTargetNames: Record<string, string> = {};
  if (linkFields.length) {
    const targetIds = [...new Set(linkFields.map((f: any) => f.options.link_table_id))];
    const { data: targs } = await supabase.from('flowtable_tables')
      .select('id, name').in('id', targetIds);
    for (const t of (targs || [])) linkTargetNames[t.id] = t.name;
  }
  // Lookup fields pull a field from a linked row; rollup fields aggregate rows
  // in another table that link back here. Both are derived (computed on read),
  // opt-in via resolve_computed → item._computed[field].
  const lookupFields = rawFields.filter((f: any) => f.type === 'lookup' && f.options?.via_link_field && f.options?.target_field);
  const rollupFields = rawFields.filter((f: any) => f.type === 'rollup' && f.options?.source_table_id && f.options?.source_link_field);
  // User fields store a profiles.id (a real platform identity, not a name
  // string) — resolved to {display, email} alongside links so an operator can
  // read AND set assignees that the rest of FlowWink understands.
  const userFields = rawFields.filter((f: any) => f.type === 'user');

  // Public field schema — link/lookup/rollup/user fields carry their config so
  // an agent understands the relation and can traverse it.
  const fields = rawFields.map((f: any) => {
    if (f.type === 'link') return { key: f.key, name: f.name, type: f.type,
      link_table_id: f.options?.link_table_id,
      link_table_name: linkTargetNames[f.options?.link_table_id],
      link_display_field: f.options?.display_field };
    if (f.type === 'lookup') return { key: f.key, name: f.name, type: f.type,
      via_link_field: f.options?.via_link_field, target_field: f.options?.target_field };
    if (f.type === 'rollup') return { key: f.key, name: f.name, type: f.type,
      source_table_id: f.options?.source_table_id, source_link_field: f.options?.source_link_field,
      agg: f.options?.agg || 'count', agg_field: f.options?.agg_field };
    if (f.type === 'user') return { key: f.key, name: f.name, type: f.type,
      user_role_filter: f.options?.role_filter || null,
      stores: 'profiles.id' };
    return { key: f.key, name: f.name, type: f.type };
  });

  // Validate filter fields up front — a typo'd key should error with the real
  // keys listed, not silently match nothing.
  //
  // The shape itself used to fail silently: anything that wasn't an array
  // became [], so `filters: {produkt: "Privat AI"}` returned the WHOLE table
  // and called it success. An operator composing a quote would have shown the
  // customer every product's lines. Both shapes are accepted now, and a shape
  // we cannot read is an error rather than an unfiltered result.
  const normalizeFilters = (raw: unknown):
    { list: Array<{ field: string; op: string; value?: unknown }> } | { error: string } => {
    if (raw === undefined || raw === null) return { list: [] };
    if (Array.isArray(raw)) return { list: raw as any };
    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      // A single condition passed unwrapped: {field, op, value}
      if (typeof obj.field === 'string') {
        return { list: [{ field: obj.field, op: (obj.op as string) || 'eq', value: obj.value }] };
      }
      // The shorthand an agent reaches for first: {fieldKey: value}
      const entries = Object.entries(obj);
      return { list: entries.map(([field, value]) => ({ field, op: 'eq', value })) };
    }
    return {
      error: `filters must be an array of {field, op, value} (or an object of {field_key: value}); got ${typeof raw}. Passing an unreadable filter would silently return every row.`,
    };
  };
  const normalized = normalizeFilters(filters);
  if ('error' in normalized) return { error: normalized.error };
  const filterList = normalized.list;
  for (const f of filterList) {
    if (!f?.field || !safeFlowtableKey(f.field)) return { error: `Invalid filter field '${f?.field}'` };
    if (!fieldKeys.has(f.field)) {
      return { error: `Unknown field '${f.field}'. This table's fields: ${[...fieldKeys].join(', ')}` };
    }
  }
  if (count_by && (!safeFlowtableKey(count_by) || !fieldKeys.has(count_by))) {
    return { error: `Unknown count_by field '${count_by}'. Fields: ${[...fieldKeys].join(', ')}` };
  }
  if (order_by && (!safeFlowtableKey(order_by) || !fieldKeys.has(order_by))) {
    return { error: `Unknown order_by field '${order_by}'. Fields: ${[...fieldKeys].join(', ')}` };
  }

  // Resolve link-field ids → display values for a page of items (opt-in).
  // Batches one select per target table over the ids actually present, so a
  // 50-row page with 2 link columns costs at most 2 extra queries.
  const resolveLinksOnItems = async (items: any[]): Promise<void> => {
    if (!resolve_links || !items.length) return;

    // User fields → profiles: same shape as record links, plus email so the
    // operator can act on the person (notify, create a task, cross-reference).
    if (userFields.length) {
      const ids = [...new Set(items.flatMap((it) => userFields.map((uf: any) => it.values?.[uf.key])).filter(Boolean))];
      if (ids.length) {
        const { data: people } = await supabase.from('profiles')
          .select('id, full_name, email').in('id', ids);
        const byId: Record<string, any> = {};
        for (const p of (people || [])) byId[p.id] = p;
        for (const it of items) {
          for (const uf of userFields) {
            const uid = it.values?.[uf.key];
            if (!uid) continue;
            const p = byId[uid];
            it._links = it._links || {};
            it._links[uf.key] = p
              ? { id: uid, display: p.full_name || p.email, email: p.email }
              : { id: uid, display: '(unknown user)' };
          }
        }
      }
    }

    if (!linkFields.length) return;
    for (const lf of linkFields) {
      const targetId = lf.options.link_table_id;
      const disp = lf.options.display_field;
      const ids = [...new Set(items.map((it) => it.values?.[lf.key]).filter(Boolean))];
      if (!ids.length) continue;
      const { data: targetRows } = await supabase.from('flowtable_records')
        .select('id, values').in('id', ids);
      const byId: Record<string, any> = {};
      for (const r of (targetRows || [])) byId[r.id] = r.values || {};
      for (const it of items) {
        const linkId = it.values?.[lf.key];
        if (!linkId) continue;
        const tv = byId[linkId];
        const display = tv ? String((disp ? tv[disp] : undefined) ?? Object.values(tv)[0] ?? linkId) : '(missing)';
        it._links = it._links || {};
        it._links[lf.key] = { id: linkId, display };
      }
    }
  };

  // Compute lookup + rollup (derived) fields for a page of items (opt-in via
  // resolve_computed). Lookup: follow one of THIS table's link fields to the
  // referenced row and read a field. Rollup: aggregate rows in another table
  // that link back to each item's id. Batched per referenced table.
  const resolveComputedOnItems = async (items: any[]): Promise<void> => {
    if (!resolve_computed || !items.length || (!lookupFields.length && !rollupFields.length)) return;

    for (const lu of lookupFields) {
      const viaKey = lu.options.via_link_field;
      const targetField = lu.options.target_field;
      const viaLink = linkFields.find((lf: any) => lf.key === viaKey)
        ?? rawFields.find((f: any) => f.key === viaKey && f.type === 'link');
      const targetTableId = viaLink?.options?.link_table_id;
      if (!targetTableId) continue;
      const ids = [...new Set(items.map((it) => it.values?.[viaKey]).filter(Boolean))];
      if (!ids.length) continue;
      const { data: targetRows } = await supabase.from('flowtable_records')
        .select('id, values').in('id', ids);
      const byId: Record<string, any> = {};
      for (const r of (targetRows || [])) byId[r.id] = r.values || {};
      for (const it of items) {
        const linkId = it.values?.[viaKey];
        if (!linkId) continue;
        it._computed = it._computed || {};
        it._computed[lu.key] = byId[linkId]?.[targetField] ?? null;
      }
    }

    for (const ru of rollupFields) {
      const { source_table_id, source_link_field, agg = 'count', agg_field } = ru.options;
      const rowIds = [...new Set(items.map((it) => it.id))];
      // Pull source rows that link to any item in this page, then bucket by id.
      const { data: srcRows } = await supabase.from('flowtable_records')
        .select('id, values').eq('table_id', source_table_id)
        .in(`values->>${source_link_field}`, rowIds);
      const bucket: Record<string, any[]> = {};
      for (const r of (srcRows || [])) {
        const k = r.values?.[source_link_field];
        if (!k) continue;
        (bucket[k] = bucket[k] || []).push(r.values || {});
      }
      for (const it of items) {
        const rows = bucket[it.id] || [];
        let out: number | null;
        if (agg === 'count') out = rows.length;
        else {
          const nums = rows.map((v) => Number(agg_field ? v[agg_field] : NaN)).filter((n) => !Number.isNaN(n));
          if (!agg_field || !nums.length) out = agg_field ? 0 : null;
          else if (agg === 'sum') out = nums.reduce((a, b) => a + b, 0);
          else if (agg === 'avg') out = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
          else if (agg === 'min') out = Math.min(...nums);
          else if (agg === 'max') out = Math.max(...nums);
          else out = null;
        }
        it._computed = it._computed || {};
        it._computed[ru.key] = out;
      }
    }
  };

  const PUSHDOWN_OPS = new Set(['eq', 'neq', 'ilike']);
  const LOCAL_OPS = new Set(['gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty']);
  const pushdown = filterList.filter((f) => PUSHDOWN_OPS.has(f.op));
  const local = filterList.filter((f) => LOCAL_OPS.has(f.op));
  const badOps = filterList.filter((f) => !PUSHDOWN_OPS.has(f.op) && !LOCAL_OPS.has(f.op));
  if (badOps.length) {
    return { error: `Unsupported op '${badOps[0].op}'. Supported: eq, neq, ilike (server-side); gt, gte, lt, lte (numeric), is_empty, not_empty.` };
  }

  const buildBase = (opts?: { withCount?: boolean }) => {
    let q = supabase.from('flowtable_records')
      .select('id, values, created_at, updated_at', opts?.withCount ? { count: 'exact' } : undefined)
      .eq('table_id', table.id);
    for (const f of pushdown) {
      const col = `values->>${f.field}`;
      if (f.op === 'ilike') q = q.filter(col, 'ilike', `%${sanitizeOrTerm(f.value)}%`);
      else q = q.filter(col, f.op, String(f.value ?? ''));
    }
    if (search) {
      const term = sanitizeOrTerm(search);
      const keys = fields.map((f: any) => f.key).filter(safeFlowtableKey);
      if (term && keys.length) {
        q = q.or(keys.map((k: string) => `values->>${k}.ilike.%${term}%`).join(','));
      }
    }
    return q;
  };

  const needsScan = local.length > 0 || !!count_by || !!order_by;

  if (!needsScan) {
    // Fast path — everything pushed down, page directly in the DB. Ask
    // PostgREST for the exact total (count:'exact' ignores the range) so the
    // response always reports total_matched — an operator filtering with a
    // limit still learns the full match size, and the shape matches the scan
    // path (found live 2026-07-09: the fast path only returned page `count`,
    // hiding that a filter matched 1500 rows).
    const { data, error, count } = await buildBase({ withCount: true })
      .order('position', { ascending: true })
      .range(offset, offset + Math.min(limit, 500) - 1);
    if (error) return { error: `Flowtable query failed: ${error.message}` };
    const items = data || [];
    await resolveLinksOnItems(items);
    await resolveComputedOnItems(items);
    return {
      table: { id: table.id, name: table.name, slug: table.slug },
      fields,
      total_matched: count ?? items.length,
      items,
      count: items.length,
      offset,
    };
  }

  // Scan path — page through matches (pushdown applied), evaluate local ops,
  // aggregate and sort in-handler. Bounded by FLOWTABLE_SCAN_CAP.
  const matched: any[] = [];
  let scanned = 0;
  for (let page = 0; scanned < FLOWTABLE_SCAN_CAP; page++) {
    const from = page * FLOWTABLE_PAGE;
    const { data, error } = await buildBase()
      .order('position', { ascending: true })
      .range(from, from + FLOWTABLE_PAGE - 1);
    if (error) return { error: `Flowtable scan failed: ${error.message}` };
    const rows = data || [];
    scanned += rows.length;
    for (const r of rows) {
      const v = r.values || {};
      let ok = true;
      for (const f of local) {
        const raw = v[f.field];
        if (f.op === 'is_empty') { if (!(raw === undefined || raw === null || raw === '')) ok = false; }
        else if (f.op === 'not_empty') { if (raw === undefined || raw === null || raw === '') ok = false; }
        else {
          const a = Number(raw); const b = Number(f.value);
          if (Number.isNaN(a) || Number.isNaN(b)) { ok = false; }
          else if (f.op === 'gt') ok = a > b;
          else if (f.op === 'gte') ok = a >= b;
          else if (f.op === 'lt') ok = a < b;
          else if (f.op === 'lte') ok = a <= b;
        }
        if (!ok) break;
      }
      if (ok) matched.push(r);
    }
    if (rows.length < FLOWTABLE_PAGE) break;
  }

  if (order_by) {
    const dir = ascending ? 1 : -1;
    matched.sort((x, y) => {
      const a = x.values?.[order_by]; const b = y.values?.[order_by];
      const an = Number(a); const bn = Number(b);
      if (!Number.isNaN(an) && !Number.isNaN(bn)) return (an - bn) * dir;
      return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true }) * dir;
    });
  }

  const pageItems = matched.slice(offset, offset + Math.min(limit, 500));
  await resolveLinksOnItems(pageItems);
  await resolveComputedOnItems(pageItems);
  const result: Record<string, unknown> = {
    table: { id: table.id, name: table.name, slug: table.slug },
    fields,
    total_matched: matched.length,
    scanned,
    scan_capped: scanned >= FLOWTABLE_SCAN_CAP,
    items: pageItems,
    offset,
  };

  if (count_by) {
    const counts: Record<string, number> = {};
    for (const r of matched) {
      const key = String(r.values?.[count_by] ?? '(empty)');
      counts[key] = (counts[key] || 0) + 1;
    }
    // Sorted descending, capped so a high-cardinality field can't flood context
    result.counts = Object.fromEntries(
      Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 100),
    );
    result.distinct_values = Object.keys(counts).length;
  }

  return result;
}

async function executeFlowtableRecord(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action, id, values, merge = true } = args as any;
  if (!action) return { error: 'action is required: create, update, delete or get' };

  if (action === 'get' || action === 'update' || action === 'delete') {
    if (!id) return { error: `id is required for ${action}` };
  }

  if (action === 'get') {
    const { data, error } = await supabase.from('flowtable_records')
      .select('id, table_id, values, created_at, updated_at').eq('id', id).maybeSingle();
    if (error) return { error: `Get record failed: ${error.message}` };
    if (!data) return { found: false, error: `Record ${id} not found` };
    return { record: data };
  }

  if (action === 'delete') {
    const { error } = await supabase.from('flowtable_records').delete().eq('id', id);
    if (error) return { error: `Delete record failed: ${error.message}` };
    return { deleted: true, id };
  }

  if (action === 'create') {
    const resolved = await resolveFlowtableTable(supabase, args);
    if (resolved.error) return { error: resolved.error };
    const table = resolved.table;
    if (!values || typeof values !== 'object') return { error: 'values (object keyed by field keys) is required for create' };
    const { data: fieldRows } = await supabase.from('flowtable_fields')
      .select('key').eq('table_id', table.id);
    const known = new Set((fieldRows || []).map((f: any) => f.key));
    const unknown = Object.keys(values).filter((k) => !known.has(k));
    const { data, error } = await supabase.from('flowtable_records')
      .insert({ table_id: table.id, values, position: Date.now() })
      .select('id').single();
    if (error) return { error: `Create record failed: ${error.message}` };
    return {
      created: true, id: data.id, table: table.name,
      ...(unknown.length ? { warning: `Keys not among the table's fields (stored anyway, invisible in grid until a field exists): ${unknown.join(', ')}` } : {}),
    };
  }

  if (action === 'update') {
    const { data: existing, error: getErr } = await supabase.from('flowtable_records')
      .select('id, values').eq('id', id).maybeSingle();
    if (getErr) return { error: `Update lookup failed: ${getErr.message}` };
    if (!existing) return { found: false, error: `Record ${id} not found` };
    if (!values || typeof values !== 'object') return { error: 'values (object) is required for update' };
    // JSONB update REPLACES the whole document — merge by default so an agent
    // setting one field doesn't wipe the other columns of the row.
    const next = merge ? { ...(existing.values || {}), ...values } : values;
    const { error } = await supabase.from('flowtable_records')
      .update({ values: next, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return { error: `Update record failed: ${error.message}` };
    return { updated: true, id, merged: !!merge };
  }

  return { error: `Unknown action '${action}'. Supported: create, update, delete, get.` };
}

// Schema management — the skill surface that lets an operator BUILD a base
// (tables + fields), not just fill one. Mirrors the admin UI's conventions
// (fieldKeyify/slugify, width defaults) so agent-created schema is
// indistinguishable from human-created schema in the grid.

const FLOWTABLE_FIELD_TYPES = new Set([
  'text', 'longtext', 'number', 'checkbox', 'select', 'multiselect', 'date',
  'url', 'email', 'phone', 'link', 'lookup', 'rollup', 'user', 'currency', 'rating',
]);
const FLOWTABLE_ROLLUP_AGGS = new Set(['count', 'sum', 'avg', 'min', 'max']);

const flowtableFieldKeyify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

const flowtableSlugify = (s: string): string =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);

async function resolveFlowtableBase(
  supabase: any,
  args: Record<string, unknown>,
): Promise<{ base?: any; error?: string }> {
  const { base_id, base } = args as any;
  if (base_id) {
    const { data } = await supabase.from('flowtable_bases')
      .select('id, name, slug').eq('id', base_id).maybeSingle();
    if (!data) return { error: `Flowtable base ${base_id} not found` };
    return { base: data };
  }
  if (!base) return { error: 'base_id or base (name/slug) is required' };
  const { data: all, error } = await supabase.from('flowtable_bases')
    .select('id, name, slug').limit(100);
  if (error) return { error: `Base lookup failed: ${error.message}` };
  const b = String(base).toLowerCase();
  const matches = (all || []).filter((x: any) =>
    x.slug === b || (x.name || '').toLowerCase() === b);
  if (!matches.length) {
    const available = (all || []).map((x: any) => x.slug).join(', ') || '(none)';
    return { error: `No Flowtable base matches '${base}'. Available bases: ${available}` };
  }
  if (matches.length > 1) {
    return { error: `Ambiguous base '${base}'. Pass base_id.` };
  }
  return { base: matches[0] };
}

// Validate + normalize the options object for a field type. Returns the
// cleaned options or an error string. Link/rollup targets may be given by
// table name — resolved here so the stored config always holds ids.
async function normalizeFlowtableFieldOptions(
  supabase: any,
  tableId: string,
  type: string,
  raw: Record<string, any>,
): Promise<{ options?: Record<string, unknown>; error?: string }> {
  const opts = raw && typeof raw === 'object' ? { ...raw } : {};

  const resolveTarget = async (idKey: string, nameKey: string): Promise<string | { error: string }> => {
    if (opts[idKey]) return String(opts[idKey]);
    if (!opts[nameKey]) return { error: `options.${idKey} (or options.${nameKey} by name/slug) is required for type '${type}'` };
    const r = await resolveFlowtableTable(supabase, { table: opts[nameKey] });
    if (r.error) return { error: r.error };
    return r.table.id;
  };

  if (type === 'link') {
    const t = await resolveTarget('link_table_id', 'link_table');
    if (typeof t !== 'string') return t;
    const out: Record<string, unknown> = { link_table_id: t };
    if (opts.display_field) out.display_field = String(opts.display_field);
    return { options: out };
  }
  if (type === 'lookup') {
    if (!opts.via_link_field || !opts.target_field) {
      return { error: "lookup needs options.via_link_field (a link field key in THIS table) + options.target_field (field key in the linked table)" };
    }
    const { data: via } = await supabase.from('flowtable_fields')
      .select('key, type').eq('table_id', tableId).eq('key', String(opts.via_link_field)).maybeSingle();
    if (!via || via.type !== 'link') {
      return { error: `options.via_link_field '${opts.via_link_field}' is not a link field on this table` };
    }
    return { options: { via_link_field: String(opts.via_link_field), target_field: String(opts.target_field) } };
  }
  if (type === 'rollup') {
    const t = await resolveTarget('source_table_id', 'source_table');
    if (typeof t !== 'string') return t;
    if (!opts.source_link_field) {
      return { error: 'rollup needs options.source_link_field — the link field key in the SOURCE table that points back at this table' };
    }
    const agg = String(opts.agg || 'count');
    if (!FLOWTABLE_ROLLUP_AGGS.has(agg)) {
      return { error: `Invalid agg '${agg}'. Supported: ${[...FLOWTABLE_ROLLUP_AGGS].join(', ')}` };
    }
    if (agg !== 'count' && !opts.agg_field) {
      return { error: `agg '${agg}' needs options.agg_field (the numeric field in the source table to aggregate)` };
    }
    const out: Record<string, unknown> = { source_table_id: t, source_link_field: String(opts.source_link_field), agg };
    if (opts.agg_field) out.agg_field = String(opts.agg_field);
    return { options: out };
  }
  if (type === 'select' || type === 'multiselect') {
    const out: Record<string, unknown> = {};
    if (Array.isArray(opts.choices)) out.choices = opts.choices.map((c: any) => String(c));
    return { options: out };
  }
  if (type === 'user') {
    const out: Record<string, unknown> = {};
    if (opts.role_filter) out.role_filter = String(opts.role_filter);
    return { options: out };
  }
  if (type === 'currency') {
    const out: Record<string, unknown> = {};
    if (opts.currency_code) out.currency_code = String(opts.currency_code).toUpperCase().slice(0, 3);
    return { options: out };
  }
  // Plain types keep nothing type-specific; drop unknown keys silently.
  return { options: {} };
}

async function executeFlowtableTable(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action, name, fields, confirm = false } = args as any;
  if (!action) return { error: 'action is required: create, rename or delete' };

  if (action === 'create') {
    const rb = await resolveFlowtableBase(supabase, args);
    if (rb.error) return { error: rb.error };
    if (!name) return { error: 'name is required for create' };
    const slug = flowtableSlugify(String(name));
    const { data: dup } = await supabase.from('flowtable_tables')
      .select('id').eq('base_id', rb.base.id).eq('slug', slug).maybeSingle();
    if (dup) return { error: `A table with slug '${slug}' already exists in base '${rb.base.name}'` };
    const { data: created, error } = await supabase.from('flowtable_tables')
      .insert({ base_id: rb.base.id, name: String(name), slug, view_mode: 'grid' })
      .select('id, name, slug').single();
    if (error) return { error: `Create table failed: ${error.message}` };

    const createdFields: any[] = [];
    const fieldErrors: string[] = [];
    if (Array.isArray(fields) && fields.length) {
      let pos = 0;
      for (const f of fields) {
        const fname = f?.name;
        const ftype = String(f?.type || 'text');
        if (!fname) { fieldErrors.push('field without name skipped'); continue; }
        if (!FLOWTABLE_FIELD_TYPES.has(ftype)) {
          fieldErrors.push(`'${fname}': unknown type '${ftype}'`); continue;
        }
        const norm = await normalizeFlowtableFieldOptions(supabase, created.id, ftype, f?.options || {});
        if (norm.error) { fieldErrors.push(`'${fname}': ${norm.error}`); continue; }
        const key = f?.key && safeFlowtableKey(String(f.key))
          ? String(f.key) : flowtableFieldKeyify(String(fname));
        if (!key) { fieldErrors.push(`'${fname}': empty key`); continue; }
        if (createdFields.some((c) => c.key === key)) { fieldErrors.push(`'${fname}': duplicate key '${key}'`); continue; }
        const { error: fe } = await supabase.from('flowtable_fields').insert({
          table_id: created.id, name: String(fname), key, type: ftype,
          position: pos++, width: ftype === 'longtext' ? 320 : 180, options: norm.options,
        });
        if (fe) { fieldErrors.push(`'${fname}': ${fe.message}`); continue; }
        createdFields.push({ key, name: String(fname), type: ftype });
      }
    }
    return {
      created: true, table_id: created.id, name: created.name, slug: created.slug,
      base: rb.base.name, fields: createdFields,
      ...(fieldErrors.length ? { field_errors: fieldErrors } : {}),
      ...(!createdFields.length ? { hint: 'Table has no fields yet — add them with manage_flowtable_field or pass fields[] on create.' } : {}),
    };
  }

  const resolved = await resolveFlowtableTable(supabase, args);
  if (resolved.error) return { error: resolved.error };
  const table = resolved.table;

  if (action === 'rename') {
    if (!name) return { error: 'name is required for rename' };
    // Slug stays stable — it may be referenced by operators and Flowwork citations.
    const { error } = await supabase.from('flowtable_tables')
      .update({ name: String(name) }).eq('id', table.id);
    if (error) return { error: `Rename failed: ${error.message}` };
    return { renamed: true, table_id: table.id, name: String(name), slug: table.slug };
  }

  if (action === 'delete') {
    const { count } = await supabase.from('flowtable_records')
      .select('id', { count: 'exact', head: true }).eq('table_id', table.id);
    if ((count || 0) > 0 && !confirm) {
      return { error: `Table '${table.name}' has ${count} records. Pass confirm=true to delete the table AND all its records/fields.` };
    }
    const { error } = await supabase.from('flowtable_tables').delete().eq('id', table.id);
    if (error) return { error: `Delete table failed: ${error.message}` };
    return { deleted: true, table_id: table.id, name: table.name, records_deleted: count || 0 };
  }

  return { error: `Unknown action '${action}'. Supported: create, rename, delete.` };
}

async function executeFlowtableField(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { action, name, key, type, options } = args as any;
  if (!action) return { error: 'action is required: create, update or delete' };

  const resolved = await resolveFlowtableTable(supabase, args);
  if (resolved.error) return { error: resolved.error };
  const table = resolved.table;

  const { data: fieldRows } = await supabase.from('flowtable_fields')
    .select('id, key, name, type, position, options').eq('table_id', table.id).order('position');
  const existing = fieldRows || [];
  const keyList = existing.map((f: any) => f.key).join(', ') || '(none)';

  if (action === 'create') {
    if (!name) return { error: 'name is required for create' };
    const ftype = String(type || 'text');
    if (!FLOWTABLE_FIELD_TYPES.has(ftype)) {
      return { error: `Unknown type '${ftype}'. Supported: ${[...FLOWTABLE_FIELD_TYPES].join(', ')}` };
    }
    const fkey = key && safeFlowtableKey(String(key)) ? String(key) : flowtableFieldKeyify(String(name));
    if (!fkey) return { error: `Could not derive a valid key from '${name}' — pass key explicitly (a-z, 0-9, _)` };
    if (existing.some((f: any) => f.key === fkey)) {
      return { error: `Field key '${fkey}' already exists on '${table.name}'. Existing keys: ${keyList}` };
    }
    const norm = await normalizeFlowtableFieldOptions(supabase, table.id, ftype, options || {});
    if (norm.error) return { error: norm.error };
    const position = existing.length ? Math.max(...existing.map((f: any) => f.position || 0)) + 1 : 0;
    const { error } = await supabase.from('flowtable_fields').insert({
      table_id: table.id, name: String(name), key: fkey, type: ftype,
      position, width: ftype === 'longtext' ? 320 : 180, options: norm.options,
    });
    if (error) return { error: `Create field failed: ${error.message}` };
    return { created: true, table: table.name, field: { key: fkey, name: String(name), type: ftype, options: norm.options } };
  }

  // update/delete address the field by key.
  if (!key) return { error: `key is required for ${action}. This table's fields: ${keyList}` };
  const field = existing.find((f: any) => f.key === String(key));
  if (!field) return { error: `No field with key '${key}' on '${table.name}'. Fields: ${keyList}` };

  if (action === 'update') {
    const patch: Record<string, unknown> = {};
    if (name) patch.name = String(name);
    const nextType = type ? String(type) : field.type;
    if (type) {
      if (!FLOWTABLE_FIELD_TYPES.has(nextType)) {
        return { error: `Unknown type '${nextType}'. Supported: ${[...FLOWTABLE_FIELD_TYPES].join(', ')}` };
      }
      patch.type = nextType;
    }
    if (options || type) {
      // Options are merged over the existing config, then re-validated for the
      // (possibly new) type — so setting one option never wipes the others.
      const merged = { ...(field.options || {}), ...(options || {}) };
      const norm = await normalizeFlowtableFieldOptions(supabase, table.id, nextType, merged);
      if (norm.error) return { error: norm.error };
      patch.options = norm.options;
    }
    if (!Object.keys(patch).length) return { error: 'Nothing to update — pass name, type and/or options' };
    const { error } = await supabase.from('flowtable_fields').update(patch).eq('id', field.id);
    if (error) return { error: `Update field failed: ${error.message}` };
    return { updated: true, table: table.name, field: { key: field.key, name: patch.name || field.name, type: nextType, ...(patch.options ? { options: patch.options } : {}) } };
  }

  if (action === 'delete') {
    const { error } = await supabase.from('flowtable_fields').delete().eq('id', field.id);
    if (error) return { error: `Delete field failed: ${error.message}` };
    // Record values keep the orphaned key (harmless; invisible in the grid) —
    // recreating a field with the same key resurfaces the data.
    return { deleted: true, table: table.name, key: field.key };
  }

  return { error: `Unknown action '${action}'. Supported: create, update, delete.` };
}

// =============================================================================
// Generic CRUD engine — universal handler for any db:tablename skill
// =============================================================================

// AuditContext, ACCOUNTING_AUDIT_TABLES, sha256Hex, diffSnapshots, writeAuditTrail
// imported from ../_shared/agent-audit.ts (top of file)

// Column masks for tables whose rows carry secrets. The generic engine selects
// '*' by default, which leaked support_agents.voice_sip_password to operators
// (found live 2026-07-05) — any whitelisted table with credential/secret
// columns MUST get an explicit safe column list here.
const TABLE_SELECT_MASKS: Record<string, string> = {
  support_agents:
    'id, user_id, status, current_conversations, max_conversations, last_seen_at, supported_channels, voice_enabled, voice_routing_mode, created_at, updated_at',
};

const GENERIC_CRUD_TABLES = new Set([
  'employees', 'leave_requests', 'projects', 'project_tasks',
  'time_entries', 'contracts', 'contract_documents',
  'expenses', 'expense_reports', 'expense_attachments', 'expense_payments',
  'documents', 'invoices', 'invoice_lines',
  'vendors', 'purchase_orders', 'purchase_order_lines',
  'consultant_profiles', 'ad_campaigns', 'ad_creatives',
  'chart_of_accounts', 'journal_entries', 'journal_entry_lines',
  'accounting_templates', 'opening_balances',
  // Accounting periods + analytic accounting (cost centers / project tagging)
  'accounting_periods', 'analytic_accounts', 'analytic_lines',
  // Purchasing extensions
  'goods_receipts', 'goods_receipt_lines', 'vendor_invoices', 'vendor_products',
  'rfqs', 'rfq_lines', 'rfq_bids',
  'tickets', 'canned_responses', 'webinars', 'webinar_registrations',
  'booking_services', 'booking_availability', 'bookings',
  'content_proposals', 'content_research',
  'agent_memory', 'agent_activity',
  // Recruitment / ATS module
  'job_postings', 'candidates', 'applications', 'application_stages', 'interviews',
  // Smart-bookkeeping learning loop
  'accounting_corrections',
  // HR onboarding (templates + per-employee checklists)
  'onboarding_templates', 'onboarding_checklists',
  // Sales quotes (CPQ)
  'quotes',
  // Pricelists (Odoo-style versioned pricing)
  'pricelists', 'pricelist_items',
  // Units of measure (per-category, factor-to-reference; conversion via convert_uom RPC)
  'uoms', 'uom_categories',
  // P2P tolerance policies
  'tolerance_policies',
  // O2D — carriers, shipments, returns/RMA
  'carriers', 'shipments', 'returns', 'return_items',
  // Quick-wins: polymorphic activities + multi-address contacts + universal tags + followers + saved views
  'activities', 'addresses', 'tags', 'entity_tags', 'entity_followers', 'saved_views',
  // CRM tasks (next-action tracking on leads/deals)
  'crm_tasks',
  // Reconciliation / bank feeds
  'bank_transactions',
  // Chat (conversations + feedback used by support skills; messages for get_chat_transcript)
  'chat_conversations', 'chat_feedback', 'chat_messages',
  // Blog comments (moderation via list_blog_comments)
  'blog_comments',
  // Social posts (paidGrowth: schedule_social_post / list_social_posts)
  'social_posts',
  // Support agents (availability/presence read for transfer decisions)
  'support_agents',
  // Manufacturing
  'manufacturing_orders',
  // Analytics
  'page_views',
  // SLA monitoring (policies + violations — read/list skills, writes guarded by RLS)
  'sla_policies', 'sla_violations',
  // Surveys & NPS (campaigns + responses — read/list skills)
  'survey_campaigns', 'survey_responses', 'survey_templates',
  // Point of Sale (registers/sessions/sales — read/list skills)
  'pos_registers', 'pos_sessions', 'pos_sales', 'pos_sale_lines',
  // Subscriptions — win-back campaigns (list_winback_campaigns read/list)
  'subscription_winback_campaigns',
  // Voice module — call log + callback scheduling (list/schedule/mark skills)
  'voice_calls',
  // FlowTable (user-defined tables)
  'flowtable_bases', 'flowtable_records',
  // Staged-operations approval queue (list/read; approve/reject via dedicated RPCs)
  'pending_operations',
  // Products + profiles + site_settings (read-skills; writes guarded by RLS)
  'products', 'profiles', 'site_settings',
]);

/**
 * Friendly table aliases — external agents often use shorter / natural names.
 * Map them to the real physical table before whitelist + CRUD lookup.
 * NB: the recruitment table is `applications` (not `job_applications`).
 */
const TABLE_ALIASES: Record<string, string> = {
  application: 'applications',
  job_applications: 'applications',
  candidate: 'candidates',
  job_posting: 'job_postings',
};

/**
 * Per-table column aliases. Lets external agents use natural names that don't
 * exactly match the DB schema (e.g. mime_type → file_type for documents).
 * Unknown / dropped columns: any column not in the table will throw a clear
 * error from Postgres; this map only covers the very common cases.
 */
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
  documents: {
    mime_type: 'file_type',
    content_type: 'file_type',
    size_bytes: 'file_size_bytes',
    file_size: 'file_size_bytes',
    storage_path: 'file_url',
    path: 'file_url',
    url: 'file_url',
    name: 'file_name',
    filename: 'file_name',
  },
  leave_requests: {
    employee: 'employee_id',
    type: 'leave_type',
    from: 'start_date',
    to: 'end_date',
  },
};

/**
 * Columns that should be silently dropped (with a hint) for a given table.
 * Useful when external agents send "narrative" fields that have no DB column
 * (e.g. body_markdown / content for documents — the actual content is the
 * file at file_url).
 */
const DROPPED_COLUMNS: Record<string, string[]> = {
  documents: ['body_markdown', 'content', 'body', 'markdown'],
};

function applyTableAlias(table: string): string {
  return TABLE_ALIASES[table] ?? table;
}

function applyColumnAliases(table: string, fields: Record<string, any>): { mapped: Record<string, any>; dropped: string[] } {
  const aliases = COLUMN_ALIASES[table];
  const dropList = DROPPED_COLUMNS[table] ?? [];
  const dropped: string[] = [];
  const mapped: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (dropList.includes(k)) {
      dropped.push(k);
      continue;
    }
    const target = aliases?.[k];
    if (target) {
      // Prefer existing canonical value if both supplied
      if (mapped[target] === undefined) mapped[target] = v;
    } else {
      mapped[k] = v;
    }
  }
  return { mapped, dropped };
}

/**
 * Tables with business logic that MUST go through dedicated skills.
 * Generic CRUD is blocked for these — callers get a redirect message.
 * Principle: One API, one flow. No backdoors.
 */
const DEDICATED_SKILL_TABLES: Record<string, string> = {
  orders: 'Use skill "place_order" to create orders (handles order_items + stock). Use "manage_orders" to list/get/fulfill.',
  order_items: 'Order items are created automatically by "place_order". Do not insert directly.',
  products: 'Use "manage_product" for product operations.',
  product_stock: 'Stock is managed automatically via order and purchase flows. Use "manage_inventory" to check levels.',
  stock_moves: 'Stock moves are created automatically by order and purchase triggers. Read-only via "manage_inventory".',
  leads: 'Use "manage_leads" for lead operations.',
};

/**
 * Strip internal underscore-prefixed fields (e.g. _caller_user_id, _approved,
 * _bypass_approval) before writing to the DB. These are agent-internal flags
 * that should never be persisted as columns.
 */
function stripInternalFields(data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    if (!key.startsWith('_')) out[key] = val;
  }
  return out;
}

async function executeGenericCrud(
  supabase: any,
  table: string,
  skillName: string,
  args: Record<string, unknown>,
  auditCtx?: AuditContext,
): Promise<unknown> {
  // Defensive: re-normalize in case caller bypassed the top-level normalizer
  // (e.g. nested data:{} that survived). Never let `data` reach insert().
  args = normalizeSkillArgs(args as Record<string, unknown>);

  // Friendly aliases — let agents say "applications" instead of "job_applications"
  table = applyTableAlias(table);

  // Block tables that have dedicated business-logic skills
  if (DEDICATED_SKILL_TABLES[table]) {
    return { 
      error: `Table '${table}' has dedicated business logic and cannot be accessed via generic CRUD.`,
      hint: DEDICATED_SKILL_TABLES[table],
    };
  }

  // Security gate: only whitelisted tables
  if (!GENERIC_CRUD_TABLES.has(table)) {
    return { error: `Unknown db table: ${table}. Generic CRUD is not enabled for this table.` };
  }

  let { action = 'list', id, ...fields } = args as any;

  // Infer the action from the skill-name verb when the caller passed none.
  // Skills like create_manufacturing_order use a generic db: handler but declare
  // no `action` field in their schema, so without this they fall through to the
  // default 'list' and silently return rows instead of inserting (finding
  // 8e9fbd31). Only overrides when the caller did NOT pass an explicit action.
  if ((args as any).action === undefined) {
    // Verb may be a prefix (create_campaign) or a suffix (ad_campaign_create) —
    // handle both so e.g. ad_campaign_create inserts instead of listing.
    // CREATE synonyms (process-QA finding 2026-07-09): skills like
    // register_vendor_invoice, schedule_social_post, tag_entity, follow_entity,
    // record_accounting_correction all MEAN "insert a row" but their verb wasn't
    // recognised, so they silently fell through to 'list' and returned rows
    // instead of creating (the P2P chain broke on register_vendor_invoice). These
    // verbs create from the provided fields — safe to map. NOTE status-transition
    // verbs (send_/move_/mark_/approve_) are NOT here: they need a specific target
    // state the generic handler can't infer, so they get dedicated RPC handlers.
    const verb = skillName.split('_')[0];
    const CREATE_VERBS = new Set(['create', 'register', 'record', 'schedule', 'tag', 'follow', 'log']);
    if (skillName.startsWith('create_') || skillName.endsWith('_create') || CREATE_VERBS.has(verb)) action = 'create';
    else if (skillName.startsWith('update_') || skillName.endsWith('_update')) action = 'update';
    else if (skillName.startsWith('delete_') || skillName.endsWith('_delete')) action = 'delete';
  }

  // Natural-id resolution (process-QA finding 2026-07-09): many skills key the row by
  // the entity's natural id (manage_employee→employee_id, get/update an order→order_id)
  // rather than a bare `id`, so get/update/delete failed with "id is required". When no
  // `id` was given, accept `<singular(table)>_id` and lift it out of the data fields so
  // it is used as the selector, not written as a column. Only the specific table-derived
  // key — skills whose natural key doesn't match this pattern keep their dedicated RPCs.
  if (id === undefined && action !== 'create' && action !== 'list') {
    const singular = table.replace(/ies$/, 'y').replace(/s$/, '');
    const naturalKey = `${singular}_id`;
    if (fields[naturalKey] !== undefined) {
      id = fields[naturalKey];
      delete fields[naturalKey];
    }
  }

  // Action aliases — common natural variants like "list_pending" → list + filter
  const ACTION_ALIASES: Record<string, { action: string; extraFilters?: Record<string, any> }> = {
    list_pending:  { action: 'list', extraFilters: { status: 'pending' } },
    list_active:   { action: 'list', extraFilters: { status: 'active' } },
    list_open:     { action: 'list', extraFilters: { status: 'open' } },
    list_approved: { action: 'list', extraFilters: { status: 'approved' } },
    list_draft:    { action: 'list', extraFilters: { status: 'draft' } },
    fetch:         { action: 'get' },
    read:          { action: 'get' },
    insert:        { action: 'create' },
    add:           { action: 'create' },
    edit:          { action: 'update' },
    modify:        { action: 'update' },
    remove:        { action: 'delete' },
  };
  const aliasResolved = ACTION_ALIASES[action];
  if (aliasResolved) {
    action = aliasResolved.action;
    if (aliasResolved.extraFilters) {
      fields.filters = { ...(fields.filters as Record<string, any> ?? {}), ...aliasResolved.extraFilters };
    }
  }

  // Apply per-table column aliases (e.g. mime_type → file_type for documents).
  // Only touches data fields — leaves reserved CRUD keys untouched.
  const RESERVED_FIELD_KEYS = new Set(['limit', 'offset', 'order_by', 'ascending', 'filters', 'search']);
  const reservedExtract: Record<string, any> = {};
  const dataExtract: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (RESERVED_FIELD_KEYS.has(k) || k.startsWith('_')) {
      reservedExtract[k] = v;
    } else {
      dataExtract[k] = v;
    }
  }
  const { mapped, dropped } = applyColumnAliases(table, dataExtract);
  fields = { ...reservedExtract, ...mapped };
  if (dropped.length) {
    console.log(`[agent-execute] dropped unsupported columns for ${table}: ${dropped.join(', ')}`);
  }

  // ── Post-payout immutability: refunded RMAs freeze their lines ─────────────
  // return_items ARE the arithmetic behind refund_return's ceiling (Σ qty ×
  // unit_refund_cents − restocking fee). While the RMA is open that is a
  // working document; once it is 'refunded' the money has left and the lines
  // are the receipt. manage_return_item happily rewrote and deleted them after
  // payout, which both falsifies the record and re-opens headroom under the
  // refund guard. A correction belongs on a new return, not on this one.
  if (table === 'return_items' && (action === 'update' || action === 'delete') && id) {
    const { data: lineRow } = await supabase.from('return_items')
      .select('return_id').eq('id', id).maybeSingle();
    if (lineRow?.return_id) {
      const { data: parentReturn } = await supabase.from('returns')
        .select('status, rma_number').eq('id', lineRow.return_id).maybeSingle();
      if (parentReturn?.status === 'refunded') {
        return {
          error: `Return ${parentReturn.rma_number ?? lineRow.return_id} is already refunded — its lines are the record of a payout that already happened and cannot be ${action === 'delete' ? 'deleted' : 'changed'}. Create a new return for a correction.`,
          status: 'failed',
        };
      }
    }
  }

  const auditEnabled = !!auditCtx && ACCOUNTING_AUDIT_TABLES.has(table);

  // Sanitize payload for audit (remove agent-internal _ fields)
  const auditPayload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (!k.startsWith('_')) auditPayload[k] = v;

  // Helper to capture "before" snapshot for update/delete
  const getBefore = async (): Promise<any> => {
    if (!auditEnabled || !id) return null;
    const { data } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
    return data || null;
  };

  try {
    switch (action) {
      case 'list': {
        const { limit = 50, offset = 0, order_by = 'created_at', ascending = false, filters, ...rest } = fields;
        let query = supabase.from(table).select(TABLE_SELECT_MASKS[table] ?? '*')
          .order(order_by, { ascending })
          .range(offset, offset + limit - 1);

        if (filters && typeof filters === 'object') {
          for (const [col, val] of Object.entries(filters)) {
            query = query.eq(col, val);
          }
        }

        const { data, error } = await query;
        if (error) throw new Error(`List ${table} failed: ${error.message}`);
        return { items: data || [], count: (data || []).length, table };
      }

      case 'get': {
        if (!id) return { error: 'id is required for get action' };
        const { data, error } = await supabase.from(table)
          .select(TABLE_SELECT_MASKS[table] ?? '*').eq('id', id).maybeSingle();
        if (error) throw new Error(`Get ${table} failed: ${error.message}`);
        if (!data) return { found: false, error: `${table} row ${id} not found` };
        return { item: data, table };
      }

      case 'create': {
        const { limit: _l, offset: _o, order_by: _ob, ascending: _a, filters: _f, ...insertData } = fields;
        const cleanInsert = stripInternalFields(insertData);
        if ((insertData as any)._caller_user_id && !cleanInsert.created_by) {
          cleanInsert.created_by = (insertData as any)._caller_user_id;
        }
        // Agent attribution, wiki_pages' convention (2026-08-29): when an agent
        // writes, say WHICH agent. A NULL created_by already means "no logged-in
        // human", but that conflates "FlowPilot did it" with "we don't know" —
        // and to a colleague deciding whether to trust a row, those are
        // different facts. Tables without the column fall through below.
        if (auditCtx?.agent_type && !cleanInsert.created_by_agent) {
          cleanInsert.created_by_agent = auditCtx.agent_type;
        }
        let createdItem: any;
        try {
          const { data, error } = await supabase.from(table).insert(cleanInsert).select().single();
          if (error) {
            // Optional stamp columns: strip whichever this table lacks and retry
            // once. Attribution is a bonus, never a reason a write fails.
            const missing = ['created_by_agent', 'created_by'].filter((c) => error.message?.includes(c));
            if (missing.length) {
              for (const c of missing) delete cleanInsert[c];
              const { data: d2, error: e2 } = await supabase.from(table).insert(cleanInsert).select().single();
              if (e2) throw new Error(`Create ${table} failed: ${e2.message}`);
              createdItem = d2;
            } else {
              throw new Error(`Create ${table} failed: ${error.message}`);
            }
          } else {
            createdItem = data;
          }
        } catch (e: any) {
          if (auditEnabled) {
            await writeAuditTrail(supabase, {
              ctx: auditCtx!, table, crud_action: 'create',
              request_payload: auditPayload, success: false, error_message: e.message,
            });
          }
          throw e;
        }
        if (auditEnabled) {
          await writeAuditTrail(supabase, {
            ctx: auditCtx!, table, crud_action: 'create',
            entity_id: createdItem?.id, request_payload: auditPayload,
            before: null, after: createdItem, success: true,
          });
        }
        return { created: true, item: createdItem, table };
      }

      case 'update': {
        if (!id) return { error: 'id is required for update action' };
        const before = await getBefore();
        const { limit: _l, offset: _o, order_by: _ob, ascending: _a, filters: _f, ...updateData } = fields;
        const cleanUpdate = stripInternalFields(updateData);
        cleanUpdate.updated_at = new Date().toISOString();
        // Same reasoning as create: an agent's correction says whose it was.
        if (auditCtx?.agent_type) cleanUpdate.updated_by_agent = auditCtx.agent_type;
        let updatedItem: any;
        try {
          const { data, error } = await supabase.from(table).update(cleanUpdate).eq('id', id).select().single();
          if (error) {
            const missing = ['updated_by_agent', 'updated_at'].filter((c) => error.message?.includes(c));
            if (missing.length) {
              for (const c of missing) delete cleanUpdate[c];
              const { data: d2, error: e2 } = await supabase.from(table).update(cleanUpdate).eq('id', id).select().single();
              if (e2) throw new Error(`Update ${table} failed: ${e2.message}`);
              updatedItem = d2;
            } else {
              throw new Error(`Update ${table} failed: ${error.message}`);
            }
          } else {
            updatedItem = data;
          }
        } catch (e: any) {
          if (auditEnabled) {
            await writeAuditTrail(supabase, {
              ctx: auditCtx!, table, crud_action: 'update', entity_id: id,
              request_payload: auditPayload, before, success: false, error_message: e.message,
            });
          }
          throw e;
        }
        if (auditEnabled) {
          await writeAuditTrail(supabase, {
            ctx: auditCtx!, table, crud_action: 'update', entity_id: id,
            request_payload: auditPayload, before, after: updatedItem, success: true,
          });
        }
        return { updated: true, item: updatedItem, table };
      }

      case 'delete': {
        if (!id) return { error: 'id is required for delete action' };
        const before = await getBefore();
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) {
          if (auditEnabled) {
            await writeAuditTrail(supabase, {
              ctx: auditCtx!, table, crud_action: 'delete', entity_id: id,
              request_payload: auditPayload, before, success: false, error_message: error.message,
            });
          }
          throw new Error(`Delete ${table} failed: ${error.message}`);
        }
        if (auditEnabled) {
          await writeAuditTrail(supabase, {
            ctx: auditCtx!, table, crud_action: 'delete', entity_id: id,
            request_payload: auditPayload, before, after: null, success: true,
          });
        }
        return { deleted: true, id, table };
      }

      default:
        return { error: `Unknown action '${action}' for table ${table}. Supported: list, get, create, update, delete.` };
    }
  } catch (err: any) {
    // The generic path used to stop at the driver's message. A model in a loop
    // answers a dead end by looking for another door — the same failure the
    // parameter-contract bounce exists to prevent — so the three write
    // failures that carry an actionable fix now carry it.
    const schema = await schemaColumns();
    const hint = buildCrudErrorHint({
      table,
      message: err?.message ?? String(err),
      columns: schema[table] ?? [],
      knownTables: Object.keys(schema),
      sentKeys: Object.keys(args ?? {}).filter((k) => !k.startsWith('_')),
    });
    if (hint) return hint;
    return { error: `Generic CRUD error on ${table}: ${err.message}` };
  }
}

/**
 * Every table and its real columns, read from PostgREST's own schema
 * description.
 *
 * Deliberately not a hand-kept map: a list per table is the thing nobody
 * updates when a column is added, and a stale list would make the hint lie.
 * The table NAMES matter too — they are what turns a foreign-key guess from a
 * confident assertion into a verified one. Fetched once per cold start; a
 * failure here degrades the hint rather than the write, so it returns {} and
 * the caller still answers with what it knows.
 */
let _schemaCache: Record<string, string[]> | null = null;
async function schemaColumns(): Promise<Record<string, string[]>> {
  if (_schemaCache) return _schemaCache;
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return {};
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!res.ok) return {};
    const spec = await res.json();
    const defs = (spec?.definitions ?? {}) as Record<string, { properties?: Record<string, unknown> }>;
    _schemaCache = Object.fromEntries(
      Object.entries(defs).map(([name, def]) => [name, Object.keys(def?.properties ?? {})]),
    );
    return _schemaCache;
  } catch {
    return {};
  }
}

// =============================================================================
// Analytics skill handlers (SEO audit, KB gap analysis)
// =============================================================================

async function executeAnalyticsAction(
  supabase: any,
  skillName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (skillName) {
    case 'seo_audit_page': {
      const { slug } = args as any;

      // If no slug provided, return a summary of all published pages for the agent to pick
      if (!slug) {
        const { data: pages } = await supabase.from('pages')
          .select('slug, title, status')
          .eq('status', 'published')
          .order('created_at', { ascending: false }).limit(20);
        const { data: posts } = await supabase.from('blog_posts')
          .select('slug, title, status')
          .eq('status', 'published')
          .order('created_at', { ascending: false }).limit(20);
        return {
          message: 'No slug provided. Here are published pages and posts to audit:',
          pages: (pages || []).map((p: any) => p.slug),
          posts: (posts || []).map((p: any) => p.slug),
        };
      }

      // Fetch page or blog post
      let page: any = null;
      const { data: pageData } = await supabase.from('pages')
        .select('id, title, slug, meta_json, content_json, status')
        .eq('slug', slug).maybeSingle();
      
      if (pageData) {
        page = { ...pageData, type: 'page' };
      } else {
        const { data: postData } = await supabase.from('blog_posts')
          .select('id, title, slug, meta_json, content_json, excerpt, featured_image, featured_image_alt, status')
          .eq('slug', slug).maybeSingle();
        if (postData) page = { ...postData, type: 'blog_post' };
      }

      if (!page) return { error: `No page or blog post found with slug '${slug}'` };

      const meta = (page.meta_json || {}) as Record<string, any>;
      const blocks = (page.content_json || []) as any[];
      const issues: string[] = [];
      const suggestions: string[] = [];
      let score = 100;

      // Title check
      if (!page.title || page.title.length < 10) {
        issues.push('Title is too short (< 10 chars)');
        score -= 15;
      } else if (page.title.length > 60) {
        issues.push(`Title is too long (${page.title.length} chars, recommended < 60)`);
        score -= 5;
      }

      // Meta description
      const metaDesc = meta.description || meta.metaDescription || '';
      if (!metaDesc) {
        issues.push('Missing meta description');
        score -= 20;
      } else if (metaDesc.length < 50) {
        issues.push(`Meta description too short (${metaDesc.length} chars, recommended 120-160)`);
        score -= 10;
      } else if (metaDesc.length > 160) {
        issues.push(`Meta description too long (${metaDesc.length} chars, recommended < 160)`);
        score -= 5;
      }

      // OG Image
      if (!meta.ogImage && !page.featured_image) {
        issues.push('Missing Open Graph / featured image');
        score -= 10;
      }

      // Alt text check
      if (page.type === 'blog_post' && page.featured_image && !page.featured_image_alt) {
        issues.push('Featured image missing alt text');
        score -= 5;
      }

      // Content depth — count text in CMS blocks (pages) and TipTap docs (blog posts)
      let wordCount = 0;
      let headingCount = 0;
      let imageCount = 0;
      let linkCount = 0;

      // Recursively walk any node tree (TipTap or CMS blocks)
      const walkNodes = (nodes: any[]) => {
        for (const node of nodes) {
          const nodeType = node.type || '';

          // Headings
          if (nodeType === 'heading' || node.level) headingCount++;

          // Images
          if (nodeType === 'image' || node.src) imageCount++;

          // Text leaf nodes (TipTap)
          if (nodeType === 'text' && typeof node.text === 'string') {
            wordCount += node.text.split(/\s+/).filter(Boolean).length;
            if (node.marks) {
              for (const mark of node.marks) {
                if (mark.type === 'link') linkCount++;
              }
            }
          }

          // CMS block data text fields
          const data = node.data || {};
          if (typeof data.text === 'string') {
            wordCount += data.text.split(/\s+/).filter(Boolean).length;
          }
          if (typeof data.content === 'string') {
            wordCount += data.content.split(/\s+/).filter(Boolean).length;
          }

          // Recurse into children/content arrays
          if (Array.isArray(node.content)) walkNodes(node.content);
          if (Array.isArray(node.children)) walkNodes(node.children);
        }
      };

      // content_json can be: array of CMS blocks (pages) or TipTap doc object (blog posts)
      const contentJson = page.content_json || blocks;
      if (Array.isArray(contentJson)) {
        walkNodes(contentJson);
      } else if (contentJson && typeof contentJson === 'object' && Array.isArray(contentJson.content)) {
        // TipTap doc: { type: "doc", content: [...] }
        walkNodes(contentJson.content);
      }

      if (wordCount < 300 && page.type === 'blog_post') {
        issues.push(`Content too thin (${wordCount} words, recommended 800+)`);
        score -= 15;
      } else if (wordCount < 100) {
        issues.push(`Very little content (${wordCount} words)`);
        score -= 10;
      }

      if (headingCount === 0 && wordCount > 200) {
        issues.push('No headings found — add H2/H3 structure');
        score -= 10;
      }

      if (imageCount === 0 && wordCount > 300) {
        suggestions.push('Consider adding images to improve engagement');
      }

      if (linkCount === 0 && page.type === 'blog_post') {
        suggestions.push('Add internal or external links for better SEO');
      }

      // Excerpt check (blog)
      if (page.type === 'blog_post' && !page.excerpt) {
        issues.push('Missing excerpt — important for search snippets');
        score -= 5;
      }

      // Status
      if (page.status !== 'published') {
        suggestions.push(`Page is currently '${page.status}' — publish to make it indexable`);
      }

      score = Math.max(0, Math.min(100, score));

      return {
        slug,
        type: page.type,
        title: page.title,
        seo_score: score,
        word_count: wordCount,
        heading_count: headingCount,
        image_count: imageCount,
        link_count: linkCount,
        issues,
        suggestions,
        meta_present: {
          title: !!page.title,
          description: !!metaDesc,
          og_image: !!(meta.ogImage || page.featured_image),
          alt_text: page.type === 'blog_post' ? !!page.featured_image_alt : null,
        },
      };
    }

    case 'kb_gap_analysis': {
      const { limit = 20 } = args as any;

      // 1. Get all chat messages from users (recent)
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data: messages } = await supabase.from('chat_messages')
        .select('content, conversation_id, created_at')
        .eq('role', 'user')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      // 2. Get existing KB articles
      const { data: articles } = await supabase.from('kb_articles')
        .select('id, title, question, slug, views_count, helpful_count, not_helpful_count, needs_improvement')
        .eq('is_published', true);

      // 3. Get negative feedback
      const { data: negativeFeedback } = await supabase.from('chat_feedback')
        .select('user_question, ai_response, context_kb_articles')
        .eq('rating', 'negative')
        .gte('created_at', since.toISOString())
        .limit(100);

      const articleTitles = (articles || []).map((a: any) => a.title.toLowerCase());
      const articleQuestions = (articles || []).map((a: any) => a.question.toLowerCase());

      // 4. Extract unique user questions / topics
      const userQuestions = (messages || [])
        .map((m: any) => m.content.trim())
        .filter((q: any) => q.length > 10 && q.length < 500 && q.endsWith('?'));

      // 5. Find questions NOT covered by existing KB
      const uncoveredQuestions: string[] = [];
      for (const q of userQuestions) {
        const qLower = q.toLowerCase();
        const covered = articleTitles.some((t: string) => {
          const words = t.split(/\s+/).filter((w: string) => w.length > 3);
          const matching = words.filter((w: string) => qLower.includes(w));
          return matching.length >= Math.ceil(words.length * 0.5);
        }) || articleQuestions.some((aq: string) => {
          const words = aq.split(/\s+/).filter((w: string) => w.length > 3);
          const matching = words.filter((w: string) => qLower.includes(w));
          return matching.length >= Math.ceil(words.length * 0.5);
        });

        if (!covered && !uncoveredQuestions.some(uq => uq.toLowerCase() === qLower)) {
          uncoveredQuestions.push(q);
        }
      }

      // 6. Identify underperforming articles
      const underperforming = (articles || [])
        .filter((a: any) => (a.not_helpful_count || 0) > (a.helpful_count || 0) || a.needs_improvement)
        .map((a: any) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          helpful: a.helpful_count || 0,
          not_helpful: a.not_helpful_count || 0,
          needs_improvement: a.needs_improvement,
        }));

      // 7. Negative feedback themes
      const negativeThemes = (negativeFeedback || []).map((f: any) => ({
        question: f.user_question,
        had_kb_context: (f.context_kb_articles || []).length > 0,
      }));

      return {
        period_days: 30,
        total_user_questions: userQuestions.length,
        total_kb_articles: (articles || []).length,
        uncovered_questions: uncoveredQuestions.slice(0, limit),
        uncovered_count: uncoveredQuestions.length,
        underperforming_articles: underperforming,
        negative_feedback_count: negativeThemes.length,
        negative_without_kb: negativeThemes.filter((n: any) => !n.had_kb_context).length,
        suggestions: [
          uncoveredQuestions.length > 5 ? `${uncoveredQuestions.length} user questions have no matching KB article — consider creating articles for the most common ones.` : null,
          underperforming.length > 0 ? `${underperforming.length} articles have more negative than positive feedback — review and improve them.` : null,
          negativeThemes.filter((n: any) => !n.had_kb_context).length > 0 ? `${negativeThemes.filter((n: any) => !n.had_kb_context).length} negative feedbacks had no KB context — the chat couldn't find relevant articles.` : null,
        ].filter(Boolean),
      };
    }

    case 'analyze_chat_feedback': {
      const { action = 'summary', period = 'month', limit = 50 } = args as any;
      const since = new Date();
      if (period === 'week') since.setDate(since.getDate() - 7);
      else if (period === 'month') since.setMonth(since.getMonth() - 1);
      else if (period === 'quarter') since.setMonth(since.getMonth() - 3);

      const { data: feedback } = await supabase.from('chat_feedback')
        .select('id, rating, user_question, ai_response, context_kb_articles, created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(action === 'negative_only' ? limit : 500);

      const allFeedback = feedback || [];
      const positive = allFeedback.filter((f: any) => f.rating === 'positive');
      const negative = allFeedback.filter((f: any) => f.rating === 'negative');

      if (action === 'negative_only') {
        return {
          negative_feedback: negative.slice(0, limit).map((f: any) => ({
            question: f.user_question,
            response_preview: (f.ai_response || '').substring(0, 200),
            had_kb_context: (f.context_kb_articles || []).length > 0,
            date: f.created_at,
          })),
          count: negative.length,
        };
      }

      return {
        period,
        total: allFeedback.length,
        positive: positive.length,
        negative: negative.length,
        satisfaction_rate: allFeedback.length > 0
          ? Math.round((positive.length / allFeedback.length) * 100) : null,
        negative_without_kb: negative.filter((f: any) => !(f.context_kb_articles || []).length).length,
        top_negative_questions: negative.slice(0, 10).map((f: any) => f.user_question).filter(Boolean),
      };
    }

    default:
      return { error: `Unknown analytics skill: ${skillName}` };
  }
}


async function executeWebhook(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Get active webhooks, find one matching the event
  const { data: webhooks } = await supabase.from('webhooks')
    .select('*').eq('is_active', true).limit(10);

  if (!webhooks?.length) return { error: 'No active webhooks configured' };

  // Fire to first webhook (can be refined to match by event type)
  const webhook = webhooks[0];
  const response = await fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(webhook.headers || {}),
    },
    body: JSON.stringify(args),
  });

  return {
    webhook_id: webhook.id,
    status: response.status,
    success: response.ok,
  };
}

// =============================================================================
// OpenResponses — direct LLM calls to OpenClaw via POST /v1/responses
// Uses same peer credentials (url + outbound_token) from a2a_peers.
// This is the "boss → worker" channel for structured task delegation.
// =============================================================================

async function executeOpenResponsesRequest(
  peerName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { prompt, message, system, response_format, model, timeout_ms, fire_and_forget, inject_mcp_credentials, peer_name, ...rest } = args as {
    prompt?: string; message?: string; system?: string;
    response_format?: string; model?: string; timeout_ms?: number;
    fire_and_forget?: boolean; inject_mcp_credentials?: boolean;
    peer_name?: string;
    [key: string]: unknown;
  };

  // Build the prompt from either explicit prompt, message, or remaining args
  const effectivePrompt = prompt || message || (Object.keys(rest).length > 0 ? JSON.stringify(rest) : 'status');

  // Use peer_name from args if provided (dispatch_claw_mission passes it), otherwise from handler
  const effectivePeerName = peer_name || peerName;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/openclaw-responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        peer_name: effectivePeerName,
        prompt: effectivePrompt,
        system,
        response_format,
        model,
        timeout_ms,
        fire_and_forget: fire_and_forget ?? false,
        inject_mcp_credentials: inject_mcp_credentials ?? false,
      }),
    });

    if (response.status === 503 || response.status === 502) {
      const body = await response.json().catch(() => ({}));
      return {
        status: 'peer_unavailable',
        peer: effectivePeerName,
        message: `Peer '${effectivePeerName}' is currently unreachable via OpenResponses.`,
        detail: (body as any)?.error || 'No response',
      };
    }

    return await response.json();
  } catch (err: any) {
    return {
      status: 'peer_unavailable',
      peer: effectivePeerName,
      message: `OpenResponses call to '${effectivePeerName}' failed: ${err.message}`,
    };
  }
}

// =============================================================================
// A2A Federation — outbound requests to peer agents
// =============================================================================

async function executeA2ARequest(
  _supabase: any,
  peerName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Delegate to the dedicated a2a-outbound edge function
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const { skill, message, ...skillArgs } = args as { skill?: string; message?: string; [key: string]: unknown };

  // Allow either structured skill call OR raw message for natural language delegation
  if (!skill && !message) {
    // Auto-construct a message from the remaining args if neither is provided
    const fallbackMessage = Object.keys(skillArgs).length > 0
      ? JSON.stringify(skillArgs)
      : 'ping';
    return executeA2AOutbound(supabaseUrl, serviceKey, peerName, 'message', {}, fallbackMessage);
  }

  if (skill && skill !== 'message') {
    return executeA2AOutbound(supabaseUrl, serviceKey, peerName, skill, skillArgs, undefined);
  } else {
    // Text message — always send as rawMessage so it reaches the peer as plain text
    const textContent = message || (skillArgs as any)?.message || JSON.stringify(skillArgs);
    return executeA2AOutbound(supabaseUrl, serviceKey, peerName, 'message', {}, textContent);
  }
}

async function executeA2AOutbound(
  supabaseUrl: string,
  serviceKey: string,
  peerName: string,
  skill: string,
  skillArgs: Record<string, unknown>,
  rawMessage?: string,
): Promise<unknown> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/a2a/outbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        peer_name: peerName,
        skill,
        arguments: skillArgs,
        ...(rawMessage ? { message: rawMessage } : {}),
      }),
    });

    // Distinguish between "peer is down" and actual errors
    if (response.status === 502 || response.status === 503) {
      const body = await response.json().catch(() => ({}));
      return {
        status: 'peer_unavailable',
        peer: peerName,
        message: `Peer '${peerName}' is currently unreachable. This is not a system error — the peer may be offline or restarting. Try again later.`,
        detail: (body as any)?.error || 'No response from peer',
      };
    }

    if (response.status === 404) {
      return {
        status: 'peer_not_found',
        peer: peerName,
        message: `Peer '${peerName}' not found or not active in federation registry.`,
      };
    }

    return await response.json();
  } catch (err: any) {
    // Network-level failures (DNS, timeout) = peer unavailable, not a system bug
    return {
      status: 'peer_unavailable',
      peer: peerName,
      message: `Peer '${peerName}' is currently unreachable (${err.message}). This is expected if the peer is offline.`,
    };
  }
}

// =============================================================================
// Activity logging
// =============================================================================

async function logActivity(
  supabase: any,
  activity: {
    agent: string;
    skill_id: string;
    skill_name: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    status: string;
    conversation_id?: string;
    duration_ms: number;
    error_message?: string;
    trace_id?: string;
  },
): Promise<string | null> {
  const { data, error } = await supabase.from('agent_activity').insert({
    agent: activity.agent,
    skill_id: activity.skill_id,
    skill_name: activity.skill_name,
    input: activity.input,
    output: activity.output,
    status: activity.status,
    conversation_id: activity.conversation_id || null,
    duration_ms: activity.duration_ms,
    error_message: activity.error_message || null,
    // Trace column mirrors input.trace_id so a harness run groups on an
    // indexed column, not a jsonb path. See agent-harness.md §4.
    trace_id: activity.trace_id || (activity.input?.trace_id as string | undefined) || null,
  }).select('id').single();

  if (error) console.error('Failed to log activity:', error);
  return data?.id || null;
}

// =============================================================================
// Objective progress auto-tracking
// =============================================================================

// Maps skill names to objective keywords they contribute to
const SKILL_OBJECTIVE_MAP: Record<string, string[]> = {
  // Content & Pages
  write_blog_post: ['blog', 'content', 'publish', 'article'],
  manage_blog_posts: ['blog', 'content', 'publish', 'article', 'post'],
  manage_blog_categories: ['blog', 'category', 'tag', 'content'],
  browse_blog: ['blog', 'content'],
  manage_page: ['page', 'content', 'website', 'publish', 'landing'],
  manage_page_blocks: ['page', 'block', 'content', 'website', 'design', 'layout'],
  manage_global_blocks: ['header', 'footer', 'navigation', 'branding', 'global'],
  manage_kb_article: ['knowledge', 'support', 'faq', 'article', 'kb', 'help'],
  // Communication
  send_newsletter: ['newsletter', 'email', 'subscriber', 'engagement'],
  execute_newsletter_send: ['newsletter', 'email', 'campaign', 'engagement'],
  manage_newsletter_subscribers: ['newsletter', 'subscriber', 'email', 'list'],
  manage_webinar: ['webinar', 'event', 'presentation', 'training'],
  // CRM & Sales
  add_lead: ['lead', 'crm', 'sales', 'pipeline'],
  manage_leads: ['lead', 'crm', 'sales', 'pipeline', 'score'],
  qualify_lead: ['lead', 'qualify', 'score', 'crm', 'sales'],
  enrich_company: ['company', 'enrich', 'crm', 'data'],
  manage_company: ['company', 'crm', 'account', 'client'],
  manage_deal: ['deal', 'pipeline', 'sales', 'revenue', 'negotiation'],
  prospect_research: ['prospect', 'research', 'sales', 'lead'],
  prospect_fit_analysis: ['prospect', 'fit', 'sales', 'pipeline'],
  // Commerce
  browse_products: ['product', 'commerce', 'shop', 'catalog'],
  manage_product: ['product', 'commerce', 'pricing', 'catalog', 'shop'],
  manage_inventory: ['inventory', 'stock', 'product', 'commerce'],
  manage_orders: ['order', 'commerce', 'revenue', 'fulfillment'],
  manage_form_submissions: ['form', 'submission', 'lead', 'feedback'],
  // Booking
  book_appointment: ['booking', 'appointment', 'calendar'],
  check_availability: ['booking', 'availability', 'calendar'],
  browse_services: ['booking', 'service', 'catalog'],
  manage_booking_availability: ['booking', 'availability', 'schedule'],
  manage_bookings: ['booking', 'appointment', 'calendar', 'schedule'],
  // Analytics & Research
  analyze_analytics: ['analytics', 'traffic', 'performance', 'growth'],
  analyze_chat_feedback: ['chat', 'feedback', 'satisfaction', 'support'],
  weekly_business_digest: ['digest', 'report', 'overview'],
  search_web: ['research', 'content'],
  research_content: ['content', 'research', 'blog', 'topic'],
  generate_content_proposal: ['content', 'proposal', 'blog', 'newsletter', 'social'],
  publish_scheduled_content: ['publish', 'schedule', 'content', 'page'],
  scan_gmail_inbox: ['email', 'inbox', 'signal', 'lead'],
  learn_from_data: ['learn', 'insight', 'analytics', 'performance'],
  seo_audit_page: ['seo', 'content', 'page', 'traffic', 'search', 'performance'],
  kb_gap_analysis: ['knowledge', 'support', 'chat', 'content', 'article', 'kb'],
  // Resume & Talent
  manage_consultant_profile: ['resume', 'consultant', 'profile', 'talent'],
  match_consultant: ['resume', 'consultant', 'match', 'talent', 'recruitment'],
  // Media & System
  media_browse: ['media', 'image', 'file', 'storage', 'cleanup'],
  manage_site_settings: ['settings', 'config', 'module', 'system'],
  manage_automations: ['automation', 'cron', 'trigger', 'workflow'],
  // Utilities
  extract_pdf_text: ['pdf', 'document', 'extract', 'content', 'resume', 'report', 'contract'],
  competitor_monitor: ['competitor', 'market', 'positioning', 'content', 'intelligence'],
  generate_social_post: ['social', 'linkedin', 'content', 'authority', 'engagement', 'repurpose'],
};

async function trackObjectiveProgress(
  supabase: any,
  skillName: string,
  activityId: string,
): Promise<void> {
  try {
    // Find active objectives
    const { data: objectives } = await supabase
      .from('agent_objectives')
      .select('id, goal, progress')
      .eq('status', 'active');

    if (!objectives?.length) return;

    const keywords = SKILL_OBJECTIVE_MAP[skillName] || [];
    if (!keywords.length) return;

    for (const obj of objectives) {
      const goalLower = obj.goal.toLowerCase();
      const matches = keywords.some(kw => goalLower.includes(kw));
      if (!matches) continue;

      // Link activity to objective
      await supabase.from('agent_objective_activities').insert({
        objective_id: obj.id,
        activity_id: activityId,
      }).select().maybeSingle();

      // Increment progress counter
      const progress = (obj.progress as Record<string, unknown>) || {};
      const skillCount = ((progress[skillName] as number) || 0) + 1;
      const totalActions = ((progress.total_actions as number) || 0) + 1;

      await supabase
        .from('agent_objectives')
        .update({
          progress: {
            ...progress,
            [skillName]: skillCount,
            total_actions: totalActions,
            last_skill: skillName,
            last_action_at: new Date().toISOString(),
          },
        })
        .eq('id', obj.id);

      console.log(`[objective-tracker] Linked skill '${skillName}' to objective '${obj.goal}' (actions: ${totalActions})`);
    }
  } catch (err) {
    console.error('[objective-tracker] Error:', err);
    // Non-fatal — don't break skill execution
  }
}

// ============================================================================
// upload_document — agent-uploaded files become searchable documents
// ============================================================================
// Pattern: mem://architecture/document-shadow-markdown-pattern
//          mem://federation/directional-connections-model
//
// Two input modes:
//   A) content_text  → stored directly in documents.content_md
//   B) content_base64 + mime_type + file_name → uploaded to documents bucket;
//      text/* and markdown are decoded to content_md; other types saved with
//      extraction_status='unsupported' (still archived, just not searchable).
async function executeUploadDocument(
  supabase: any,
  args: Record<string, unknown>,
  ctx: { caller_user_id?: string; caller_api_key_id?: string },
): Promise<unknown> {
  const title = String(args.title || '').trim();
  const description = args.description ? String(args.description) : null;
  const category = args.category ? String(args.category) : 'agent-upload';
  const tags = Array.isArray(args.tags) ? (args.tags as string[]).filter((t) => typeof t === 'string') : [];
  const contentText = typeof args.content_text === 'string' ? args.content_text : null;
  const contentBase64 = typeof args.content_base64 === 'string' ? args.content_base64 : null;
  const mimeType = typeof args.mime_type === 'string' ? args.mime_type : null;
  let fileName = typeof args.file_name === 'string' ? args.file_name.trim() : '';

  // ── Validation ───────────────────────────────────────────────────────────
  if (!title) return { error: 'title is required', status: 'failed' };
  if (!contentText && !contentBase64) {
    return { error: 'Provide either content_text or content_base64', status: 'failed' };
  }
  if (contentText && contentBase64) {
    return { error: 'Provide only one of content_text or content_base64, not both', status: 'failed' };
  }
  if (contentText && contentText.length > 500_000) {
    return { error: 'content_text exceeds 500 000 character limit', status: 'failed' };
  }
  if (contentBase64) {
    if (!mimeType) return { error: 'mime_type is required for binary mode', status: 'failed' };
    if (!fileName) return { error: 'file_name is required for binary mode', status: 'failed' };
    // base64 length ≈ 4/3 of raw bytes; cap at ~13.4MB base64 (≈10MB raw)
    if (contentBase64.length > 13_400_000) {
      return { error: 'content_base64 exceeds 10 MB raw size limit', status: 'failed' };
    }
  }

  // ── Identify uploader (must be a real user with role) ────────────────────
  // Strategy: prefer caller_user_id (set when MCP call). Fall back to the
  // owner of the api_key. If neither resolves, refuse.
  let uploadedBy: string | undefined = ctx.caller_user_id;
  let peerName = 'unknown';

  if (ctx.caller_api_key_id) {
    const { data: keyRow } = await supabase
      .from('api_keys')
      .select('name, created_by')
      .eq('id', ctx.caller_api_key_id)
      .maybeSingle();
    if (keyRow) {
      peerName = keyRow.name || 'unknown';
      if (!uploadedBy && keyRow.created_by) uploadedBy = keyRow.created_by;
    }
  }

  if (!uploadedBy) {
    // Fail-forward (Law 4): gateway/peer api_keys often have no created_by owner,
    // so an MCP-driven upload would 500 with no recourse. Attribute it to an admin
    // so the document is created + owned by a real user with a role.
    const { data: adminRow } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    if (adminRow?.user_id) uploadedBy = adminRow.user_id;
  }

  if (!uploadedBy) {
    return { error: 'Cannot determine uploader (no caller_user_id, api_key owner, or admin user on this site)', status: 'failed' };
  }

  // ── Auto-fill file_name for text mode ────────────────────────────────────
  if (!fileName) {
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document';
    fileName = `${safeTitle}.md`;
  }

  // ── Mode A: text → content_md directly ───────────────────────────────────
  if (contentText) {
    const { data: docId, error: rpcErr } = await supabase.rpc('create_agent_document', {
      p_uploaded_by: uploadedBy,
      p_peer_name: peerName,
      p_title: title,
      p_file_name: fileName,
      p_file_url: null,
      p_file_type: 'text/markdown',
      p_file_size_bytes: new TextEncoder().encode(contentText).length,
      p_description: description,
      p_category: category,
      p_tags: tags,
      p_content_md: contentText,
      p_extraction_status: 'success',
      p_extraction_error: null,
    });
    if (rpcErr) return { error: `Failed to create document: ${rpcErr.message}`, status: 'failed' };
    return {
      success: true,
      document_id: docId,
      source: `agent-upload:${peerName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`,
      extraction_status: 'success',
      searchable: true,
      mode: 'text',
    };
  }

  // ── Mode B: binary → upload to storage, attempt text extraction ──────────
  // Decode base64 → bytes
  let bytes: Uint8Array;
  try {
    const bin = atob(contentBase64!);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch (e: any) {
    return { error: `Invalid base64 content: ${e.message}`, status: 'failed' };
  }

  // Upload to documents bucket under agent-uploads/<peer>/<uuid>-<fileName>
  const safePeer = peerName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'unknown';
  const objectKey = `agent-uploads/${safePeer}/${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(objectKey, bytes, { contentType: mimeType!, upsert: false });
  if (uploadErr) {
    return { error: `Storage upload failed: ${uploadErr.message}`, status: 'failed' };
  }

  // Attempt to decode to markdown for text-based mime types
  let extractedMd: string | null = null;
  let extractionStatus = 'unsupported';
  let extractionError: string | null = null;
  const mt = mimeType!.toLowerCase();
  if (mt.startsWith('text/') || mt === 'application/json' || mt === 'application/xml' || mt.endsWith('+json') || mt.endsWith('+xml')) {
    try {
      extractedMd = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (extractedMd.length > 500_000) extractedMd = extractedMd.slice(0, 500_000) + '\n\n…[truncated]';
      extractionStatus = 'success';
    } catch (e: any) {
      extractionStatus = 'failed';
      extractionError = `Text decode failed: ${e.message}`;
    }
  } else {
    // PDF/DOCX/etc — server-side parsing not available in this skill yet.
    // Document is archived; an admin or future utility can re-extract.
    extractionStatus = 'unsupported';
    extractionError = `No server-side parser for mime_type=${mt}. Use content_text mode if you can extract client-side.`;
  }

  const { data: docId, error: rpcErr } = await supabase.rpc('create_agent_document', {
    p_uploaded_by: uploadedBy,
    p_peer_name: peerName,
    p_title: title,
    p_file_name: fileName,
    p_file_url: objectKey,
    p_file_type: mimeType,
    p_file_size_bytes: bytes.byteLength,
    p_description: description,
    p_category: category,
    p_tags: tags,
    p_content_md: extractedMd,
    p_extraction_status: extractionStatus,
    p_extraction_error: extractionError,
  });
  if (rpcErr) return { error: `Failed to create document: ${rpcErr.message}`, status: 'failed' };

  return {
    success: true,
    document_id: docId,
    source: `agent-upload:${safePeer}`,
    extraction_status: extractionStatus,
    extraction_error: extractionError,
    searchable: extractionStatus === 'success',
    mode: 'binary',
    storage_path: objectKey,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// update_skill_instructions — the Curator's write-path (FlowPilot 2.0 Phase 3).
// Applies a REVIEWED instruction/description improvement to one agent_skills
// row. Trust-gated 'approve' (an explicit agent_trust_policies row keeps it
// gated even in 'proving' posture): the skill-curator sweep stages a proposal
// via the normal trust machinery, a human approves it in /admin/approvals, and
// flowpilot-followthrough re-invokes this with _approved=true — same loop as
// every other gated action. The previous text is returned + logged so an
// unwanted change is one update away from undone (audit before overwrite).
// ─────────────────────────────────────────────────────────────────────────────
async function executeUpdateSkillInstructions(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const name = typeof args.skill_name === 'string' ? args.skill_name.trim() : '';
  const newInstructions = typeof args.instructions === 'string' ? args.instructions.trim() : '';
  const newDescription = typeof args.description === 'string' ? args.description.trim() : '';
  const reason = typeof args.reason === 'string' ? args.reason : '';

  if (!name) throw new Error('skill_name is required');
  if (!newInstructions && !newDescription) {
    throw new Error('Provide instructions and/or description — nothing to update');
  }

  const { data: skill, error } = await supabase
    .from('agent_skills')
    .select('id, name, description, instructions, origin')
    .eq('name', name)
    .maybeSingle();
  if (error) throw new Error(`Load skill failed: ${error.message}`);
  if (!skill) throw new Error(`Skill "${name}" not found`);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (newInstructions) patch.instructions = newInstructions;
  if (newDescription) patch.description = newDescription;

  const { error: upErr } = await supabase.from('agent_skills').update(patch).eq('id', skill.id);
  if (upErr) throw new Error(`Update failed: ${upErr.message}`);

  return {
    updated: name,
    fields: Object.keys(patch).filter((k) => k !== 'updated_at'),
    reason,
    previous: {
      instructions: skill.instructions,
      description: newDescription ? skill.description : undefined,
    },
    note: 'NB: a code-seed resync (sync:skills / Sync skills from code) restores the bundled text — promote accepted improvements into the module seed to make them permanent.',
  };
}

// internal:search_knowledge — the Retrieval Engine's gateway surface (M4,
// docs/architecture/retrieval-engine.md §5). Hybrid-ranked chunks from the
// knowledge index (pages/kb/wiki/docs/documents), with titles + URLs for
// citation. Runs on the service client: gateway skills execute as an
// admin-grade operator today (rung 4 — internal + public). When per-key
// scope enforcement lands, resolve the client from the key's rung instead.
// Structured rows (orders, Flowtable, …) are NOT here — two-lane rule.
// ─────────────────────────────────────────────────────────────────────────────
// docs_pages is deliberately ABSENT: it holds FlowWink's own product
// documentation, synced onto each customer instance so the /docs page can
// search itself (docs-chat does exactly that). An agent calling THIS skill is
// searching the CUSTOMER's knowledge — vendor docs there are noise in the
// results and embeddings the customer paid for without asking. Not a secrecy
// argument (the documentation is public on GitHub); a hygiene and cost one,
// which is why the fix narrows the source list rather than guarding the data.
const SEARCHABLE_KNOWLEDGE_SOURCES = ['pages', 'kb_articles', 'wiki_pages', 'documents'];

async function executeSearchKnowledge(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { success: false, error: 'query is required (a natural-language question or topic)' };

  const k = Math.min(Math.max(Number(args.limit) || 8, 1), 20);
  let sources: string[] | undefined;
  if (Array.isArray(args.sources) && args.sources.length) {
    sources = args.sources.map(String);
    const bad = sources.filter((s) => !SEARCHABLE_KNOWLEDGE_SOURCES.includes(s));
    if (bad.length) {
      return {
        success: false,
        error: `unknown source(s) ${bad.join(', ')} — valid: ${SEARCHABLE_KNOWLEDGE_SOURCES.join(', ')}. For structured rows use query_flowtable or the module's list_/get_ skills.`,
      };
    }
  }

  const queryEmbedding = await embedQuery(supabase, query); // null → text-only (Law 4)
  const chunks = await retrieve(supabase, { query, k, tokenBudget: 6000, sources, queryEmbedding });

  return {
    success: true,
    count: chunks.length,
    ranking: queryEmbedding ? 'hybrid (semantic + keyword)' : 'keyword-only (no embedding provider)',
    results: chunks.map((c) => ({
      source: c.sourceTable,
      entity_id: c.entityId,
      title: c.title,
      url: c.metadata?.url ?? null,
      content: c.content,
      score: c.score,
    })),
  };
}

// internal:request_return — customer self-service RMA (identity ladder rung 2,
// dial 2). Ownership is enforced BY CONSTRUCTION: the target order is resolved
// only among the caller's OWN orders (orders.customer_email = the JWT-verified
// _caller_email). A model-supplied order id that isn't the caller's simply
// doesn't resolve — no other account's data is reachable or revealable. Creates
// a 'requested' RMA only; approval + refund stay staff-gated. Never trusts an
// email/customer id from args — only the server-injected _caller_email.
// ─────────────────────────────────────────────────────────────────────────────
const RETURN_REASON_CODES = ['defective','wrong_item','not_as_described','changed_mind','damaged_in_transit','other'];

async function executeRequestReturn(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const email = typeof (args as any)._caller_email === 'string' ? (args as any)._caller_email : '';
  if (!email) {
    return { success: false, error: 'You must be signed in to request a return. Please log in to your account.' };
  }
  const ref = typeof args.order_reference === 'string' ? args.order_reference.trim() : '';
  if (!ref) return { success: false, error: 'order_reference is required (the order to return).' };

  // Resolve the order AMONG THE CALLER'S OWN ORDERS ONLY. Match by exact id or
  // by the short prefix the customer sees in their account.
  const { data: ownOrders, error: ordErr } = await supabase
    .from('orders')
    .select('id, status, total_cents, currency, created_at')
    .eq('customer_email', email)
    .order('created_at', { ascending: false })
    .limit(50);
  if (ordErr) return { success: false, error: `Could not look up your orders: ${ordErr.message}` };

  const cleanRef = ref.replace(/^#/, '').toLowerCase();
  const matches = (ownOrders ?? []).filter((o: any) =>
    o.id.toLowerCase() === cleanRef || o.id.toLowerCase().startsWith(cleanRef));
  if (matches.length === 0) {
    return { success: false, error: `No order matching "${ref}" was found on your account. I can list your orders if that helps.` };
  }
  if (matches.length > 1) {
    return { success: false, error: `"${ref}" matches more than one of your orders — please give the full order id (${matches.slice(0, 3).map((o: any) => o.id.slice(0, 12)).join(', ')}…).` };
  }
  const order = matches[0];

  // Idempotency: don't open a second open return for the same order.
  const { data: existing } = await supabase
    .from('returns')
    .select('id, rma_number, status')
    .eq('order_id', order.id)
    .not('status', 'in', '("refunded","rejected","cancelled")')
    .limit(1);
  if (existing && existing.length) {
    return { success: true, already_open: true, rma_number: existing[0].rma_number, status: existing[0].status,
      message: `You already have an open return (${existing[0].rma_number || 'pending'}) for this order — it's ${existing[0].status}.` };
  }

  const reasonCode = typeof args.reason_code === 'string' && RETURN_REASON_CODES.includes(args.reason_code)
    ? args.reason_code : 'other';
  const reason = typeof args.reason === 'string' ? args.reason.slice(0, 2000) : null;
  const callerUserId = typeof (args as any)._caller_user_id === 'string' ? (args as any)._caller_user_id : null;

  const { data: created, error: insErr } = await supabase
    .from('returns')
    .insert({ order_id: order.id, reason_code: reasonCode, reason, status: 'requested', created_by: callerUserId })
    .select('id, rma_number, status')
    .single();
  if (insErr) return { success: false, error: `Could not open the return: ${insErr.message}` };

  return {
    success: true,
    rma_number: created.rma_number,
    status: created.status,
    order_id: order.id,
    message: `Return request opened for order ${order.id.slice(0, 8)}${created.rma_number ? ` (RMA ${created.rma_number})` : ''}. Our team will review it and follow up about the refund.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// internal:list_company_orders / list_company_invoices — identity ladder rung 3
// (B2B) read skills. Return ONLY records of the caller's ACTIVE company, resolved
// from the server-injected _company_id (never a model/body claim). The exact
// company-level analog of request_return's own-record enforcement: a contact of
// company A can never list company B's orders/invoices. Read-only, trust=auto.
// ─────────────────────────────────────────────────────────────────────────────
async function executeListCompanyRecords(
  supabase: any,
  args: Record<string, unknown>,
  table: 'orders' | 'invoices',
): Promise<unknown> {
  // Uniform with every other company-scoped handler: resolve scope through the
  // shared guard (fail-closed on missing _company_id; 'viewer' is the read floor)
  // rather than an ad-hoc presence check, so the isolation contract is enforced
  // in exactly one place.
  const scope = companyScopeGuard(args, 'viewer');
  if ('error' in scope) return { success: false, error: scope.error };
  const companyId = scope.companyId;
  const limit = Math.min(Number((args as any).limit) || 20, 50);

  if (table === 'orders') {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, total_cents, currency, customer_name, customer_email, created_at')
      .eq('company_id', companyId)                       // ← the isolation predicate
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return { success: false, error: `Could not list company orders: ${error.message}` };
    return {
      success: true, company_id: companyId, count: (data ?? []).length,
      orders: (data ?? []).map((o: any) => ({
        id: o.id, short_id: o.id.slice(0, 8), status: o.status,
        total: `${((o.total_cents ?? 0) / 100).toFixed(0)} ${o.currency || 'SEK'}`,
        placed_by: o.customer_name || o.customer_email, created_at: o.created_at,
      })),
    };
  }

  // invoices — company_id populated as memberships/backfill land (rung-3 P0 column)
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_cents, currency, due_date, customer_email, created_at')
    .eq('company_id', companyId)                         // ← the isolation predicate
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { success: false, error: `Could not list company invoices: ${error.message}` };
  const rows = data ?? [];
  return {
    success: true, company_id: companyId, count: rows.length,
    invoices: rows.map((i: any) => ({
      id: i.id, invoice_number: i.invoice_number, status: i.status,
      total: `${((i.total_cents ?? 0) / 100).toFixed(0)} ${i.currency || 'SEK'}`,
      due_date: i.due_date, unpaid: !['paid', 'cancelled'].includes(i.status),
    })),
    note: rows.length === 0 ? 'No invoices linked to this company yet.' : undefined,
  };
}

// ── Company-role gate (identity ladder rung 3, P2 — write + roles) ────────────
// The verified active company + role are server-injected (_company_id /
// _company_role), never a model/body claim. Writes require a MINIMUM role. The
// offer surface in chat-completion already hides higher-privilege skills from a
// lower role, but THIS handler-side check is the authoritative gate: an external
// / MCP caller has no company context, so every company skill simply denies.
// Roles ascend viewer < buyer < approver < admin.
const COMPANY_ROLE_RANK: Record<string, number> = { viewer: 0, buyer: 1, approver: 2, admin: 3 };

function companyScopeGuard(
  args: Record<string, unknown>,
  minRole: 'viewer' | 'buyer' | 'approver' | 'admin',
): { companyId: string; role: string } | { error: string } {
  const companyId = typeof (args as any)._company_id === 'string' ? (args as any)._company_id.trim() : '';
  if (!companyId) {
    return { error: 'You must be signed in as a company contact for this. If you just signed in, your account may not be linked to a company yet — ask your account manager.' };
  }
  const role = typeof (args as any)._company_role === 'string' ? (args as any)._company_role.trim() : 'viewer';
  if ((COMPANY_ROLE_RANK[role] ?? 0) < (COMPANY_ROLE_RANK[minRole] ?? 0)) {
    return { error: `This action needs the "${minRole}" company role or higher; your role is "${role}". Ask a company admin to grant it.` };
  }
  return { companyId, role };
}

// internal:request_company_return — company-scoped RMA (rung 3 P2, buyer+). The
// order is resolved ONLY among the caller's ACTIVE company's orders (company_id) —
// the exact company analog of request_return's own-order enforcement: a contact of
// company A can never open a return against company B's order. Write, role-gated.
// ─────────────────────────────────────────────────────────────────────────────
async function executeRequestCompanyReturn(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = companyScopeGuard(args, 'buyer');
  if ('error' in scope) return { success: false, error: scope.error };
  const { companyId } = scope;

  const ref = typeof args.order_reference === 'string' ? args.order_reference.trim() : '';
  if (!ref) return { success: false, error: 'order_reference is required (which company order to return).' };

  const { data: coOrders, error: ordErr } = await supabase
    .from('orders')
    .select('id, status, total_cents, currency, created_at')
    .eq('company_id', companyId)                          // ← the isolation predicate
    .order('created_at', { ascending: false })
    .limit(100);
  if (ordErr) return { success: false, error: `Could not look up your company's orders: ${ordErr.message}` };

  const cleanRef = ref.replace(/^#/, '').toLowerCase();
  const matches = (coOrders ?? []).filter((o: any) =>
    o.id.toLowerCase() === cleanRef || o.id.toLowerCase().startsWith(cleanRef));
  if (matches.length === 0) {
    return { success: false, error: `No order matching "${ref}" was found for your company. I can list your company's orders if that helps.` };
  }
  if (matches.length > 1) {
    return { success: false, error: `"${ref}" matches more than one of your company's orders — please give the full order id (${matches.slice(0, 3).map((o: any) => o.id.slice(0, 12)).join(', ')}…).` };
  }
  const order = matches[0];

  // Idempotency: don't open a second open return for the same order.
  const { data: existing } = await supabase
    .from('returns')
    .select('id, rma_number, status')
    .eq('order_id', order.id)
    .not('status', 'in', '("refunded","rejected","cancelled")')
    .limit(1);
  if (existing && existing.length) {
    return { success: true, already_open: true, rma_number: existing[0].rma_number, status: existing[0].status,
      message: `Your company already has an open return (${existing[0].rma_number || 'pending'}) for this order — it's ${existing[0].status}.` };
  }

  const reasonCode = typeof args.reason_code === 'string' && RETURN_REASON_CODES.includes(args.reason_code)
    ? args.reason_code : 'other';
  const reason = typeof args.reason === 'string' ? args.reason.slice(0, 2000) : null;
  const callerUserId = typeof (args as any)._caller_user_id === 'string' ? (args as any)._caller_user_id : null;

  const { data: created, error: insErr } = await supabase
    .from('returns')
    .insert({ order_id: order.id, reason_code: reasonCode, reason, status: 'requested', created_by: callerUserId })
    .select('id, rma_number, status')
    .single();
  if (insErr) return { success: false, error: `Could not open the return: ${insErr.message}` };

  return {
    success: true, rma_number: created.rma_number, status: created.status, order_id: order.id,
    message: `Return request opened for company order ${order.id.slice(0, 8)}${created.rma_number ? ` (RMA ${created.rma_number})` : ''}. Our team will review it and follow up about the refund.`,
  };
}

// internal:approve_company_quote — accept a quote addressed to the caller's ACTIVE
// company (rung 3 P2, approver+). Commitment → gated above buyer. Resolved only
// among the company's own quotes; only quotes actually awaiting the customer
// (sent/viewed/pending_approval) can be accepted. Idempotent: an already-accepted
// quote returns success without a second write. Accepting is a commitment, NOT a
// payment — money stays staff/rail-gated (Decision 4).
// ─────────────────────────────────────────────────────────────────────────────
const QUOTE_ACCEPTABLE_FROM = ['sent', 'viewed', 'pending_approval'];

async function executeApproveCompanyQuote(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = companyScopeGuard(args, 'approver');
  if ('error' in scope) return { success: false, error: scope.error };
  const { companyId } = scope;

  const ref = typeof args.quote_reference === 'string' ? args.quote_reference.trim()
    : typeof args.quote_number === 'string' ? args.quote_number.trim() : '';
  if (!ref) return { success: false, error: 'quote_reference is required (the quote number or id to approve).' };

  const { data: coQuotes, error: qErr } = await supabase
    .from('quotes')
    .select('id, quote_number, status, total_cents, currency, accepted_at')
    .eq('company_id', companyId)                          // ← the isolation predicate
    .order('created_at', { ascending: false })
    .limit(200);
  if (qErr) return { success: false, error: `Could not look up your company's quotes: ${qErr.message}` };

  const rl = ref.replace(/^#/, '').toLowerCase();
  const matches = (coQuotes ?? []).filter((q: any) =>
    (q.quote_number && q.quote_number.toLowerCase() === rl) ||
    q.id.toLowerCase() === rl || q.id.toLowerCase().startsWith(rl));
  if (matches.length === 0) return { success: false, error: `No quote matching "${ref}" was found for your company.` };
  if (matches.length > 1) return { success: false, error: `"${ref}" matches more than one quote — please give the full quote number.` };
  const quote = matches[0];

  if (quote.status === 'accepted') {
    return { success: true, already_accepted: true, quote_number: quote.quote_number, status: 'accepted',
      message: `Quote ${quote.quote_number} is already accepted.` };
  }
  if (!QUOTE_ACCEPTABLE_FROM.includes(quote.status)) {
    return { success: false, error: `Quote ${quote.quote_number} can't be accepted from status "${quote.status}".` };
  }

  const { data: updated, error: upErr } = await supabase
    .from('quotes')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', quote.id)
    .eq('company_id', companyId)                          // re-assert scope on the write
    .in('status', QUOTE_ACCEPTABLE_FROM)                  // optimistic guard vs a concurrent change
    .select('id, quote_number, status')
    .single();
  if (upErr) return { success: false, error: `Could not accept the quote: ${upErr.message}` };
  return { success: true, quote_number: updated.quote_number, status: updated.status,
    message: `Quote ${updated.quote_number} accepted for your company. Our team will proceed to the order/invoice — payment stays a separate, deliberate step.` };
}

// internal:manage_company_contacts — a company ADMIN manages who else may act for
// their company (rung 3 P2, admin only). Every operation is scoped to the caller's
// ACTIVE company (_company_id) — an admin of company A can never touch company B's
// contacts. Actions: list, invite (email+role → an invited row, auto-activated on
// signup by trg_link_invited_company_contacts, or active now if the person already
// has an account), set_role, revoke. A guard prevents removing the last admin.
// Grants up to admin (mirrors staff "grant portal access"); money stays staff.
// ─────────────────────────────────────────────────────────────────────────────
const COMPANY_CONTACT_ROLES = ['viewer', 'buyer', 'approver', 'admin'];

async function executeManageCompanyContacts(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = companyScopeGuard(args, 'admin');
  if ('error' in scope) return { success: false, error: scope.error };
  const { companyId } = scope;
  const action = typeof args.action === 'string' ? args.action.trim().toLowerCase() : 'list';

  if (action === 'list') {
    const { data, error } = await supabase
      .from('company_contacts')
      .select('id, contact_email, company_role, visibility_scope, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return { success: false, error: `Could not list company contacts: ${error.message}` };
    return { success: true, company_id: companyId, count: (data ?? []).length,
      contacts: (data ?? []).map((c: any) => ({ id: c.id, email: c.contact_email, role: c.company_role, scope: c.visibility_scope, status: c.status })) };
  }

  const email = typeof args.email === 'string' ? args.email.toLowerCase().trim() : '';
  const roleProvided = typeof args.role === 'string' && COMPANY_CONTACT_ROLES.includes(args.role);
  const role = roleProvided ? (args.role as string) : 'viewer';
  const callerUserId = typeof (args as any)._caller_user_id === 'string' ? (args as any)._caller_user_id : null;

  if (action === 'invite') {
    if (!email) return { success: false, error: 'email is required to invite a contact.' };
    // Already a contact of THIS company? Idempotent — never a duplicate row.
    const { data: existing } = await supabase
      .from('company_contacts')
      .select('id, status, company_role')
      .eq('company_id', companyId)
      .ilike('contact_email', email)
      .limit(1);
    if (existing && existing.length) {
      return { success: true, already_member: true, contact_id: existing[0].id, status: existing[0].status,
        message: `${email} is already a ${existing[0].company_role} contact (${existing[0].status}).` };
    }
    // If the person already has an account, link + activate now; else invited row
    // that the profiles trigger activates on signup.
    const { data: prof } = await supabase.from('profiles').select('id').ilike('email', email).limit(1);
    const authUserId = prof && prof.length ? prof[0].id : null;
    const { data: created, error: insErr } = await supabase
      .from('company_contacts')
      .insert({
        company_id: companyId, contact_email: email, auth_user_id: authUserId,
        company_role: role, status: authUserId ? 'active' : 'invited', created_by: callerUserId,
      })
      .select('id, status, company_role')
      .single();
    if (insErr) return { success: false, error: `Could not invite the contact: ${insErr.message}` };
    return { success: true, contact_id: created.id, status: created.status, role: created.company_role,
      message: created.status === 'active'
        ? `${email} added as ${created.company_role} (they already had an account).`
        : `${email} invited as ${created.company_role}. They'll get access automatically when they sign up with this email.` };
  }

  if (action === 'set_role' || action === 'revoke') {
    if (!email) return { success: false, error: `email is required to ${action} a contact.` };
    if (action === 'set_role' && !roleProvided) {
      return { success: false, error: 'role is required for set_role (viewer, buyer, approver, or admin).' };
    }
    // Never let the company be left without an active admin.
    if (action === 'revoke' || (action === 'set_role' && role !== 'admin')) {
      const { data: admins } = await supabase
        .from('company_contacts')
        .select('contact_email')
        .eq('company_id', companyId)
        .eq('company_role', 'admin')
        .eq('status', 'active');
      const activeAdmins = admins ?? [];
      const targetIsOnlyAdmin = activeAdmins.length === 1 &&
        (activeAdmins[0].contact_email ?? '').toLowerCase() === email;
      if (targetIsOnlyAdmin) {
        return { success: false, error: `${email} is the company's only admin — promote another contact to admin before ${action === 'revoke' ? 'revoking' : 'demoting'} them.` };
      }
    }
    const patch = action === 'revoke' ? { status: 'revoked' } : { company_role: role };
    const { data: updated, error: upErr } = await supabase
      .from('company_contacts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('company_id', companyId)                        // scope on the write
      .ilike('contact_email', email)
      .select('id, contact_email, company_role, status');
    if (upErr) return { success: false, error: `Could not ${action} the contact: ${upErr.message}` };
    if (!updated || !updated.length) return { success: false, error: `No contact with email "${email}" in your company.` };
    return { success: true, updated: updated.length,
      message: action === 'revoke' ? `${email} revoked.` : `${email} is now ${role}.` };
  }

  return { success: false, error: `Unknown action "${action}". Use list, invite, set_role, or revoke.` };
}

// internal:reorder_company_order — place a repeat of one of the caller's ACTIVE
// company's earlier orders (rung 3 P2b, buyer+). The source order is resolved ONLY
// among the company's own orders; the copy is stamped with the same company_id and
// created as a 'pending' draft for staff to confirm/fulfil — no payment happens
// here. Idempotent: an open pending reorder of the same source order is returned
// instead of duplicated (metadata.reorder_of).
// ─────────────────────────────────────────────────────────────────────────────
async function executeReorderCompanyOrder(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = companyScopeGuard(args, 'buyer');
  if ('error' in scope) return { success: false, error: scope.error };
  const { companyId } = scope;

  const ref = typeof args.order_reference === 'string' ? args.order_reference.trim() : '';
  if (!ref) return { success: false, error: 'order_reference is required (which earlier company order to repeat).' };

  const { data: coOrders, error: ordErr } = await supabase
    .from('orders')
    .select('id, status, total_cents, currency, customer_name, created_at')
    .eq('company_id', companyId)                          // ← the isolation predicate
    .order('created_at', { ascending: false })
    .limit(100);
  if (ordErr) return { success: false, error: `Could not look up your company's orders: ${ordErr.message}` };

  const cleanRef = ref.replace(/^#/, '').toLowerCase();
  const matches = (coOrders ?? []).filter((o: any) =>
    o.id.toLowerCase() === cleanRef || o.id.toLowerCase().startsWith(cleanRef));
  if (matches.length === 0) {
    return { success: false, error: `No order matching "${ref}" was found for your company. I can list your company's orders if that helps.` };
  }
  if (matches.length > 1) {
    return { success: false, error: `"${ref}" matches more than one of your company's orders — please give the full order id (${matches.slice(0, 3).map((o: any) => o.id.slice(0, 12)).join(', ')}…).` };
  }
  const source = matches[0];

  // Idempotency: an open pending reorder of this source order is THE reorder.
  const { data: existing } = await supabase
    .from('orders')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('status', 'pending')
    .eq('metadata->>reorder_of', source.id)
    .limit(1);
  if (existing && existing.length) {
    return { success: true, already_open: true, order_id: existing[0].id,
      message: `A pending reorder of order ${source.id.slice(0, 8)} already exists (${existing[0].id.slice(0, 8)}).` };
  }

  const { data: items, error: itemErr } = await supabase
    .from('order_items')
    .select('product_id, product_name, quantity, price_cents, variant_id, tax_rate_pct')
    .eq('order_id', source.id);
  if (itemErr) return { success: false, error: `Could not read the order's items: ${itemErr.message}` };

  const callerEmail = typeof (args as any)._caller_email === 'string' ? (args as any)._caller_email : '';
  const { data: created, error: insErr } = await supabase
    .from('orders')
    .insert({
      customer_email: callerEmail || `company-${companyId.slice(0, 8)}@reorder.local`,
      customer_name: source.customer_name,
      company_id: companyId,                              // stamped — stays in scope
      status: 'pending',
      total_cents: source.total_cents,
      currency: source.currency || 'SEK',
      metadata: { reorder_of: source.id, placed_via: 'company_assistant' },
    })
    .select('id')
    .single();
  if (insErr) return { success: false, error: `Could not place the reorder: ${insErr.message}` };

  if (items && items.length) {
    const { error: itemsInsErr } = await supabase
      .from('order_items')
      .insert(items.map((it: any) => ({ ...it, order_id: created.id })));
    if (itemsInsErr) {
      // keep the order but be honest about the items
      return { success: true, order_id: created.id, items_copied: 0,
        message: `Reorder ${created.id.slice(0, 8)} placed, but the line items could not be copied (${itemsInsErr.message}) — our team will complete it from the original order.` };
    }
  }

  return {
    success: true, order_id: created.id, items_copied: (items ?? []).length,
    total: `${((source.total_cents ?? 0) / 100).toFixed(0)} ${source.currency || 'SEK'}`,
    message: `Reorder placed as a pending order ${created.id.slice(0, 8)} (${(items ?? []).length} line items, same as order ${source.id.slice(0, 8)}). Our team will confirm it — no payment has been taken.`,
  };
}

// internal:request_company_quote — ask for a quote on behalf of the caller's
// ACTIVE company (rung 3 P2b, buyer+). Creates a DRAFT quote stamped with the
// company_id, carrying the request in the title/notes for staff to price up —
// the customer never authors amounts (subtotal/total start at 0). Idempotent on
// an identical open draft request.
// ─────────────────────────────────────────────────────────────────────────────
async function executeRequestCompanyQuote(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = companyScopeGuard(args, 'buyer');
  if ('error' in scope) return { success: false, error: scope.error };
  const { companyId } = scope;

  const request = typeof args.request === 'string' ? args.request.trim().slice(0, 4000) : '';
  if (!request) return { success: false, error: 'request is required — describe what your company would like a quote for.' };

  const title = `Quote request — ${request.slice(0, 80)}${request.length > 80 ? '…' : ''}`;

  // Idempotency: the same open draft request isn't filed twice.
  const { data: existing } = await supabase
    .from('quotes')
    .select('id, quote_number, status')
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .eq('title', title)
    .limit(1);
  if (existing && existing.length) {
    return { success: true, already_open: true, quote_number: existing[0].quote_number,
      message: `This request is already filed as draft quote ${existing[0].quote_number} — our team is on it.` };
  }

  // quotes.quote_number is NOT NULL with no default — same QUO-NNNN scheme as
  // the manage_quote skill so the sequence stays uniform.
  const { data: recent } = await supabase.from('quotes')
    .select('quote_number').order('created_at', { ascending: false }).limit(50);
  let max = 0;
  for (const row of (recent || []) as Array<{ quote_number: string | null }>) {
    const m = /(\d+)\s*$/.exec(row.quote_number || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const quoteNumber = `QUO-${String(max + 1).padStart(4, '0')}`;

  const callerEmail = typeof (args as any)._caller_email === 'string' ? (args as any)._caller_email : '';
  const { data: created, error: insErr } = await supabase
    .from('quotes')
    .insert({
      quote_number: quoteNumber,
      company_id: companyId,                              // stamped — stays in scope
      status: 'draft',
      title,
      notes: request,
      customer_email: callerEmail || null,
      line_items: [],                                     // staff price it up — the customer never authors amounts
      subtotal_cents: 0, tax_rate: 0, tax_cents: 0, total_cents: 0,
      currency: 'SEK',
    })
    .select('id, quote_number')
    .single();
  if (insErr) return { success: false, error: `Could not file the quote request: ${insErr.message}` };

  return {
    success: true, quote_number: created.quote_number,
    message: `Quote request filed as ${created.quote_number}. Our team will price it up and send the quote to your company — you'll be able to review and approve it here.`,
  };
}

// internal:initiate_company_invoice_payment — hand the caller the payment link
// for ONE of their ACTIVE company's OWN unpaid invoices (rung 3 P2b, buyer+).
// Decision 4: the assistant never moves money — this resolves the invoice within
// company scope and routes to the real payment UI (/invoice/<public_token> →
// create-invoice-payment/Stripe), where the customer completes payment themselves.
// No state is written here.
// ─────────────────────────────────────────────────────────────────────────────
async function executeInitiateCompanyInvoicePayment(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const scope = companyScopeGuard(args, 'buyer');
  if ('error' in scope) return { success: false, error: scope.error };
  const { companyId } = scope;

  const ref = typeof args.invoice_reference === 'string' ? args.invoice_reference.trim() : '';
  if (!ref) return { success: false, error: 'invoice_reference is required (the invoice number to pay).' };

  const { data: coInvoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_cents, currency, due_date, public_token, payment_url')
    .eq('company_id', companyId)                          // ← the isolation predicate
    .order('created_at', { ascending: false })
    .limit(100);
  if (invErr) return { success: false, error: `Could not look up your company's invoices: ${invErr.message}` };

  const rl = ref.replace(/^#/, '').toLowerCase();
  const matches = (coInvoices ?? []).filter((i: any) =>
    (i.invoice_number && i.invoice_number.toLowerCase() === rl) ||
    i.id.toLowerCase() === rl || i.id.toLowerCase().startsWith(rl));
  if (matches.length === 0) return { success: false, error: `No invoice matching "${ref}" was found for your company. I can list your company's invoices if that helps.` };
  if (matches.length > 1) return { success: false, error: `"${ref}" matches more than one invoice — please give the full invoice number.` };
  const invoice = matches[0];

  if (invoice.status === 'paid') {
    return { success: true, already_paid: true, invoice_number: invoice.invoice_number,
      message: `Invoice ${invoice.invoice_number} is already paid — nothing to do.` };
  }
  if (invoice.status === 'cancelled') {
    return { success: false, error: `Invoice ${invoice.invoice_number} is cancelled and can't be paid.` };
  }
  if (!invoice.public_token) {
    return { success: false, error: `Invoice ${invoice.invoice_number} has no payment link yet — ask our team to send it.` };
  }

  return {
    success: true,
    invoice_number: invoice.invoice_number,
    amount: `${((invoice.total_cents ?? 0) / 100).toFixed(0)} ${invoice.currency || 'SEK'}`,
    due_date: invoice.due_date,
    payment_page: `/invoice/${invoice.public_token}`,
    message: `Invoice ${invoice.invoice_number} (${((invoice.total_cents ?? 0) / 100).toFixed(0)} ${invoice.currency || 'SEK'}) is open. Pay it securely here: /invoice/${invoice.public_token} — payment is completed on that page, not in this chat.`,
  };
}

// internal:lint_skill — runs the Agent Contract Integrity pre-release checklist
// (mem://architecture/agent-contract-integrity) against one or all enabled
// skills. Returns a structured findings list with severity + suggested fix per
// rule. Used by FlowPilot/peers to self-verify before releasing a new skill.
// ─────────────────────────────────────────────────────────────────────────────
async function executeLintSkill(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const targetName = typeof args.skill_name === 'string' ? args.skill_name.trim() : '';
  const includePassing = args.include_passing === true;

  // 1. Load skill(s).
  // Paginated when linting the whole register. The output of this skill is a
  // clean bill of health — "✓ N skill(s) clean of blocking issues" — and an
  // unbounded select stops at PostgREST's silent 1000-row cap, so past it the
  // verdict would cover a prefix while reading as a verdict on everything.
  // agent_skills measured 540 rows (538 enabled) on optic on 2026-08-23 and
  // grows with every module. A single-skill lint is bounded by `.eq('name', …)`
  // and needs no paging.
  const skillsRead = await readAllRows(supabase, 'agent_skills', {
    columns: 'id,name,handler,category,enabled,mcp_exposed,description,tool_definition',
    orderBy: 'name',
    filter: (q) => (targetName ? q.eq('enabled', true).eq('name', targetName) : q.eq('enabled', true)),
  });
  if (skillsRead.error) return { error: `Failed to load skills: ${skillsRead.error}` };
  const skills = skillsRead.rows;
  if (skills.length === 0) {
    return { error: targetName ? `Skill "${targetName}" not found or disabled.` : 'No enabled skills.' };
  }
  if (skillsRead.truncated) {
    return {
      error:
        'Could not read the whole skill register — a lint report over a prefix would ' +
        'certify skills it never looked at. Re-run against a single skill (skill_name) ' +
        'or raise the page ceiling.',
    };
  }

  // 2. Load RPC signatures
  const { data: rpcRows, error: rpcErr } = await supabase.rpc('lint_get_rpc_signatures');
  if (rpcErr) return { error: `RPC signature lookup failed: ${rpcErr.message}` };
  const rpcArgsByName = new Map<string, Set<string>>();
  for (const r of (rpcRows ?? []) as Array<{ proname: string; args: string[] }>) {
    rpcArgsByName.set(r.proname, new Set(r.args ?? []));
  }

  // 3. Load NOT NULL columns
  const { data: nnRows, error: nnErr } = await supabase.rpc('lint_get_not_null_columns');
  if (nnErr) return { error: `NOT NULL lookup failed: ${nnErr.message}` };
  const notNullByTable = new Map<string, Set<string>>();
  for (const r of (nnRows ?? []) as Array<{ table_name: string; column_name: string }>) {
    if (!notNullByTable.has(r.table_name)) notNullByTable.set(r.table_name, new Set());
    notNullByTable.get(r.table_name)!.add(r.column_name);
  }

  // Auto-fill exemptions are kept in the codebase fixture; agents can pass overrides.
  const autoFillOverrides = (args.auto_filled_columns as Record<string, string[]>) ?? {};

  const reports = skills.map((s: any) =>
    lintOne(s, { rpcArgsByName, notNullByTable, autoFillOverrides }),
  );
  const filtered = includePassing ? reports : reports.filter((r) => r.findings.length > 0);

  const errors = reports.reduce(
    (sum, r) => sum + r.findings.filter((f) => f.severity === 'error').length,
    0,
  );
  const warnings = reports.reduce(
    (sum, r) => sum + r.findings.filter((f) => f.severity === 'warn').length,
    0,
  );

  return {
    success: true,
    generated_at: new Date().toISOString(),
    total_skills: reports.length,
    reported: filtered.length,
    errors,
    warnings,
    blocking: errors > 0,
    summary:
      errors === 0
        ? `✓ ${reports.length} skill(s) clean of blocking issues (${warnings} warning(s)).`
        : `✗ ${errors} blocking issue(s) across ${reports.length} skill(s) — fix before release.`,
    reports: filtered,
  };
}

interface LintFinding {
  layer: 1 | 2 | 3 | 4;
  severity: 'error' | 'warn' | 'info';
  rule: string;
  message: string;
  fix?: string;
}

function lintOne(
  skill: any,
  ctx: {
    rpcArgsByName: Map<string, Set<string>>;
    notNullByTable: Map<string, Set<string>>;
    autoFillOverrides: Record<string, string[]>;
  },
): { skill_name: string; handler: string | null; category: string | null; ok: boolean; findings: LintFinding[] } {
  const findings: LintFinding[] = [];
  const handler: string = skill.handler ?? '';
  const props = skill.tool_definition?.function?.parameters?.properties ?? {};
  const propNames = Object.keys(props);
  const description: string = skill.description ?? '';

  // Layer 1 — arg mapping for rpc:*
  if (handler.startsWith('rpc:')) {
    const rpcName = handler.slice(4);
    const valid = ctx.rpcArgsByName.get(rpcName);
    if (!valid) {
      findings.push({
        layer: 1, severity: 'error', rule: 'rpc-exists',
        message: `Handler points to RPC "${rpcName}" but no such function exists.`,
        fix: `Create migration for ${rpcName}() or fix handler.`,
      });
    } else {
      const mapped = propNames
        .filter((k) => !k.startsWith('_') && k !== 'trace_id' && k !== 'objective_context')
        .map((k) => ({ original: k, arg: k.startsWith('p_') ? k : `p_${k}` }));
      for (const { original, arg } of mapped) {
        if (!valid.has(arg)) {
          findings.push({
            layer: 1, severity: 'error', rule: 'arg-mapping',
            message: `Property "${original}" maps to "${arg}" but RPC ${rpcName} has no such parameter. Available: ${[...valid].join(', ') || '∅'}`,
            fix: `Rename property to match an existing p_* arg, or add parameter to ${rpcName}().`,
          });
        }
      }
    }
  }

  // Layer 2 — NOT NULL coverage for db:*
  // Virtual handlers are composite/computed CASES in executeDbAction, not
  // relations — table checks don't apply. Keep in sync with the switch +
  // scripts/skill-linter.ts.
  const VIRTUAL_DB_HANDLERS = new Set(['propose_bookkeeping', 'run_bookkeeping_sweep', 'run_month_end_invoicing']);
  if (handler.startsWith('db:') && !VIRTUAL_DB_HANDLERS.has(handler.slice(3))) {
    const table = handler.slice(3);
    const required = ctx.notNullByTable.get(table);
    if (!required) {
      findings.push({
        layer: 2, severity: 'error', rule: 'table-exists',
        message: `Handler points to table "${table}" but it does not exist.`,
      });
    } else {
      const exempt = new Set(ctx.autoFillOverrides[skill.name] ?? []);
      const propSet = new Set(propNames);
      for (const col of required) {
        if (!propSet.has(col) && !exempt.has(col)) {
          findings.push({
            layer: 2, severity: 'error', rule: 'not-null-coverage',
            message: `Column "${col}" is NOT NULL on ${table} but missing from skill schema.`,
            fix: `Add "${col}" to properties OR pass auto_filled_columns.${skill.name}=["${col}"] if handler auto-fills it.`,
          });
        }
      }
    }
  }

  // Layer 3 — description quality (Law 2)
  if (!description || description.length < 30) {
    findings.push({
      layer: 3, severity: 'warn', rule: 'description-too-short',
      message: `Description is ${description.length} chars — needs ≥30 for reliable scoring.`,
      fix: `Expand to explain what the skill does and when to use it.`,
    });
  }
  if (description && !/use when:/i.test(description)) {
    findings.push({
      layer: 3, severity: 'warn', rule: 'missing-use-when',
      message: `Description lacks "Use when:" marker — risk of misrouting.`,
      fix: `Add "Use when: <trigger phrases>" to description.`,
    });
  }
  if (description && !/not for:/i.test(description)) {
    findings.push({
      layer: 3, severity: 'info', rule: 'missing-not-for',
      message: `Description lacks "NOT for:" marker — recommended.`,
    });
  }

  // Layer 4 — module registration / MCP exposure
  if (!skill.category) {
    findings.push({
      layer: 4, severity: 'warn', rule: 'no-category',
      message: `Skill has no category — won't be grouped correctly in skill discovery.`,
      fix: `Set category to one of the agent_skill_category enum values.`,
    });
  }
  if (skill.mcp_exposed === false) {
    findings.push({
      layer: 4, severity: 'info', rule: 'not-mcp-exposed',
      message: `Skill not mcp_exposed — only callable via FlowPilot, not external peers.`,
      fix: `Set mcp_exposed=true if external agents should call this skill.`,
    });
  }

  return {
    skill_name: skill.name,
    handler: skill.handler,
    category: skill.category ?? null,
    ok: !findings.some((f) => f.severity === 'error'),
    findings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// internal:list_communications / internal:get_communication
// Read-only access to the outbound_communications gateway log so agents can
// follow up on what was actually sent (or simulated/skipped/failed) over
// email/sms/slack/signing channels. Platform primitive — does not depend on
// any specific module being enabled.
// ─────────────────────────────────────────────────────────────────────────────
async function executeListCommunications(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const ALLOWED_CHANNELS = new Set(['email', 'sms', 'slack', 'signing']);
  const ALLOWED_STATUS = new Set(['sent', 'simulated', 'failed', 'skipped', 'pending']);

  const channel = typeof args.channel === 'string' ? args.channel.trim().toLowerCase() : '';
  const status = typeof args.status === 'string' ? args.status.trim().toLowerCase() : '';
  const recipient = typeof args.recipient === 'string' ? args.recipient.trim() : '';
  const source = typeof args.source === 'string' ? args.source.trim() : '';
  const since = typeof args.since === 'string' ? args.since.trim() : '';
  const rawLimit = Number(args.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 50;

  let q = supabase
    .from('outbound_communications')
    .select('id,channel,status,provider,simulated,recipient,subject,source,error_message,created_at,sent_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (channel) {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return { error: `Invalid channel "${channel}". Allowed: ${[...ALLOWED_CHANNELS].join(', ')}` };
    }
    q = q.eq('channel', channel);
  }
  if (status) {
    if (!ALLOWED_STATUS.has(status)) {
      return { error: `Invalid status "${status}". Allowed: ${[...ALLOWED_STATUS].join(', ')}` };
    }
    q = q.eq('status', status);
  }
  if (recipient) q = q.ilike('recipient', `%${recipient}%`);
  if (source) q = q.ilike('source', `%${source}%`);
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) {
      return { error: `Invalid "since" value — must be ISO 8601 timestamp.` };
    }
    q = q.gte('created_at', d.toISOString());
  }

  const { data, error } = await q;
  if (error) return { error: `Failed to list communications: ${error.message}` };

  return {
    success: true,
    count: data?.length ?? 0,
    limit,
    filters: { channel: channel || null, status: status || null, recipient: recipient || null, source: source || null, since: since || null },
    communications: data ?? [],
  };
}

async function executeGetCommunication(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) return { error: 'id is required' };

  const { data, error } = await supabase
    .from('outbound_communications')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return { error: `Failed to fetch communication: ${error.message}` };
  if (!data) return { error: `Communication "${id}" not found.` };

  return { success: true, communication: data };
}

// ─────────────────────────────────────────────────────────────────────────────
// internal:email_to_ticket
// Takes a normalized email payload (typically from composio-webhook via
// event-dispatcher) and either creates a new ticket or appends a comment to
// an existing one (threading by In-Reply-To / References).
// Idempotent: dedupes on (source='email', source_id=message_id).
// ─────────────────────────────────────────────────────────────────────────────
async function executeEmailToTicket(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  // Accept both flat args and nested `event` (event-dispatcher passes the full event).
  const evt = (args.event as Record<string, unknown> | undefined) || args;
  const messageId = String(evt.message_id || '').trim();
  if (!messageId) return { success: false, error: 'message_id required' };

  // Routing gate: the mailbox's route_mode + inbound classification decide whether
  // this message deserves a ticket. `force: true` bypasses it for manual replay.
  const force = args.force === true || evt.force === true;
  if (!force) {
    if (String(evt.classification ?? '') === 'noise') {
      return {
        success: true,
        skipped: 'noise',
        reason: 'Bulk/newsletter/no-reply mail is never turned into a ticket.',
      };
    }
    // Templates can arrive resolved as a real boolean or as the string "false".
    if (evt.should_create_ticket === false || evt.should_create_ticket === 'false') {
      return {
        success: true,
        skipped: 'route_mode',
        route_mode: evt.route_mode ?? null,
        reason: `Mailbox route_mode "${evt.route_mode ?? 'crm_only'}" does not create tickets for this message. Pass force: true to override.`,
      };
    }
  }


  const fromEmail = String(evt.from || '').trim();
  const subject = String(evt.subject || '(no subject)').trim();
  const bodyText = String(evt.body_text || evt.snippet || '').trim();
  const inReplyTo = evt.in_reply_to ? String(evt.in_reply_to).trim() : null;
  const references = evt.references ? String(evt.references).trim() : null;
  const threadId = evt.thread_id ? String(evt.thread_id).trim() : null;
  const messageIdHeader = evt.message_id_header ? String(evt.message_id_header).trim() : null;
  const mailbox = evt.mailbox ? String(evt.mailbox) : null;
  const connectedAccountId = evt.connected_account_id ? String(evt.connected_account_id) : null;

  // Parse "Name <email@x>" → { name, email }
  const fromMatch = fromEmail.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/) || null;
  const fromName = fromMatch ? fromMatch[1].trim() : null;
  const fromAddr = (fromMatch ? fromMatch[2] : fromEmail).trim().toLowerCase();

  // Idempotency: have we already ingested this exact gmail message?
  const { data: existingBySource } = await supabase
    .from('tickets')
    .select('id')
    .eq('source', 'email')
    .eq('source_id', messageId)
    .maybeSingle();
  if (existingBySource?.id) {
    return { success: true, ticket_id: existingBySource.id, deduped: true };
  }

  // Threading: try to find an existing ticket for this Gmail thread.
  // We persist thread_id in metadata.gmail_thread_id when we create the ticket.
  let parentTicket: any = null;
  if (threadId) {
    const { data } = await supabase
      .from('tickets')
      .select('id, status, subject, metadata')
      .contains('metadata', { gmail_thread_id: threadId })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    parentTicket = data;
  }
  // Fallback: match by In-Reply-To header → previous outgoing message_id we sent.
  if (!parentTicket && inReplyTo) {
    const { data } = await supabase
      .from('tickets')
      .select('id, status, subject, metadata')
      .contains('metadata', { last_outgoing_message_id: inReplyTo })
      .limit(1)
      .maybeSingle();
    parentTicket = data;
  }

  if (parentTicket?.id) {
    // Append as ticket comment, reopen if closed.
    const author = fromName || fromAddr || 'Email';
    const { error: commentErr } = await supabase.from('ticket_comments').insert({
      ticket_id: parentTicket.id,
      content: bodyText || subject,
      is_internal: false,
      author_type: 'customer',
      author_name: author,
    });
    if (commentErr) return { success: false, error: `comment insert failed: ${commentErr.message}` };

    // Reopen on customer reply if previously resolved/closed.
    const closedStates = new Set(['resolved', 'closed']);
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      metadata: {
        ...(parentTicket.metadata || {}),
        last_inbound_message_id: messageId,
        last_inbound_message_id_header: messageIdHeader,
        last_inbound_at: new Date().toISOString(),
      },
    };
    if (closedStates.has(String(parentTicket.status))) {
      updates.status = 'open';
      updates.resolved_at = null;
      updates.closed_at = null;
    }
    await supabase.from('tickets').update(updates).eq('id', parentTicket.id);

    return {
      success: true,
      ticket_id: parentTicket.id,
      action: 'appended_comment',
      reopened: closedStates.has(String(parentTicket.status)),
    };
  }

  // Create new ticket.
  const cleanSubject = subject.replace(/^(re:|fwd:|sv:|vs:)\s*/i, '').trim() || '(no subject)';
  const { data: ticket, error: insertErr } = await supabase
    .from('tickets')
    .insert({
      subject: cleanSubject,
      description: bodyText || '(empty body)',
      status: 'new',
      priority: 'medium',
      category: 'other',
      source: 'email',
      source_id: messageId,
      contact_email: fromAddr || null,
      contact_name: fromName,
      metadata: {
        gmail_thread_id: threadId,
        gmail_message_id: messageId,
        gmail_message_id_header: messageIdHeader,
        composio_account_id: connectedAccountId,
        mailbox,
        from_email: fromAddr,
        from_name: fromName,
        in_reply_to: inReplyTo,
        references,
        last_inbound_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  if (insertErr) return { success: false, error: `ticket insert failed: ${insertErr.message}` };
  return { success: true, ticket_id: ticket.id, action: 'created_ticket' };
}

// ─────────────────────────────────────────────────────────────────────────────
// internal:reply_to_ticket_via_email
// Sends a reply on a ticket through Gmail (via composio-proxy), preserving
// Gmail threading by setting In-Reply-To/References to the last inbound
// message-id header and passing the gmail thread_id.
// ─────────────────────────────────────────────────────────────────────────────
// social_post_batch — repurpose a published blog post into native social posts.
// The ai-task hub is pass-through (no source fetch), so this fetches the blog's
// title + excerpt, then calls the `social_post` task with them as topic/key
// points. Replaces the dead db:content_proposals wiring (returned {items:[]}).
async function executeSocialPostBatch(
  supabase: any,
  args: Record<string, unknown>,
  supabaseUrl: string,
  serviceKey: string,
): Promise<unknown> {
  const a = args as any;
  const blogPostId = String(a.blog_post_id || '').trim();
  if (!blogPostId) return { error: 'blog_post_id is required', status: 'failed' };
  const platforms = Array.isArray(a.platforms) && a.platforms.length ? a.platforms : ['linkedin', 'x'];
  const tone = a.tone || 'professional';

  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('title, excerpt, slug')
    .eq('id', blogPostId)
    .maybeSingle();
  if (error) return { error: `Lookup blog post failed: ${error.message}`, status: 'failed' };
  if (!post) return { error: `Blog post ${blogPostId} not found`, status: 'failed' };

  const keyPoints = post.excerpt ? [String(post.excerpt)] : [];
  const resp = await fetch(`${supabaseUrl}/functions/v1/ai-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ task: 'social_post', input: { platforms, tone, topic: post.title, key_points: keyPoints } }),
  });
  const taskResult = await resp.json();
  if (!resp.ok && !taskResult.error) taskResult.error = `ai-task 'social_post' returned HTTP ${resp.status}`;
  return { source: { blog_post_id: blogPostId, title: post.title, slug: post.slug }, ...taskResult };
}

// ad_creative_generate — fetch the campaign context, then generate creative via
// the ad_creative ai-task and store it. Replaces the dead db:ad_creatives wiring.
async function executeAdCreativeGenerate(
  supabase: any,
  args: Record<string, unknown>,
  supabaseUrl: string,
  serviceKey: string,
): Promise<unknown> {
  const a = args as any;
  const campaignId = String(a.campaign_id || '').trim();
  if (!campaignId) return { error: 'campaign_id is required', status: 'failed' };
  const { data: c, error } = await supabase.from('ad_campaigns')
    .select('name, platform, objective, target_audience').eq('id', campaignId).maybeSingle();
  if (error) return { error: `Lookup campaign failed: ${error.message}`, status: 'failed' };
  if (!c) return { error: `Campaign ${campaignId} not found`, status: 'failed' };

  // Campaign fields can be jsonb (e.g. target_audience stored as an object); the
  // ad_creative task expects strings, so coerce before passing (OpenClaw sweep
  // hit "Invalid input" on an object audience).
  const asText = (v: unknown) =>
    v == null ? undefined : (typeof v === 'string' ? v : JSON.stringify(v));
  const resp = await fetch(`${supabaseUrl}/functions/v1/ai-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ task: 'ad_creative', input: {
      objective: asText(c.objective), target_audience: asText(c.target_audience), platform: asText(c.platform),
      type: a.type || 'text', tone: a.tone, key_message: a.key_message, cta: a.cta,
    } }),
  });
  const taskResult = await resp.json();
  if (taskResult?.error) return { error: taskResult.error, status: 'failed' };
  const creative = taskResult?.result ?? taskResult;

  // Persist as a draft creative (best-effort)
  let creativeId: string | undefined;
  try {
    const { data: ins, error: insErr } = await supabase.from('ad_creatives').insert({
      campaign_id: campaignId, type: a.type || 'text',
      headline: creative.headline, body: creative.body, cta_text: creative.cta_text,
      status: 'draft',
    }).select('id').single();
    // Avsikten var att spara vad som gick — men PostgREST kastar inte, så
    // catchen nedan var död kod och orsaken syntes ingenstans.
    if (insErr) console.warn(`[ad_create] creative not saved: ${insErr.message}`);
    creativeId = ins?.id;
  } catch { /* table/columns may vary — return the generated copy regardless */ }

  return { campaign: { id: campaignId, name: c.name }, creative_id: creativeId, ...creative };
}

// ad_optimize — rule-based campaign optimisation recommendations. Reads metrics
// (impressions/clicks/conversions/ctr/cpc) + budget/spend, flags pause/scale/
// maintain. Read-only. Replaces the dead db:ad_campaigns wiring.
async function executeAdOptimize(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const a = args as any;
  const minCtr = a.threshold_ctr !== undefined ? Number(a.threshold_ctr) : 1.0; // percent
  const maxCpc = a.threshold_cpc_cents !== undefined ? Number(a.threshold_cpc_cents) : 500;
  let q = supabase.from('ad_campaigns')
    .select('id, name, platform, status, budget_cents, spent_cents, metrics')
    .neq('status', 'archived');
  if (a.campaign_id) q = q.eq('id', a.campaign_id);
  const { data: rows, error } = await q;
  if (error) return { error: `List campaigns failed: ${error.message}`, status: 'failed' };

  const recommendations = (rows || []).map((r: any) => {
    const m = r.metrics || {};
    const impressions = Number(m.impressions || 0);
    const clicks = Number(m.clicks || 0);
    const ctr = m.ctr !== undefined ? Number(m.ctr) : (impressions > 0 ? (clicks / impressions) * 100 : 0);
    const cpc = m.cpc !== undefined ? Number(m.cpc) : (clicks > 0 ? Number(r.spent_cents || 0) / clicks : 0);
    const conversions = Number(m.conversions || 0);
    const spendRatio = r.budget_cents ? Number(r.spent_cents || 0) / Number(r.budget_cents) : 0;
    let action = 'maintain'; let reason = 'Performing within thresholds.';
    if (impressions < 100) { action = 'monitor'; reason = 'Not enough data yet.'; }
    else if (ctr < minCtr) { action = 'pause'; reason = `CTR ${ctr.toFixed(2)}% below ${minCtr}%.`; }
    else if (cpc > maxCpc) { action = 'pause'; reason = `CPC ${Math.round(cpc)} above ${maxCpc} cents.`; }
    else if (conversions > 0 && ctr >= minCtr && spendRatio > 0.8) { action = 'scale'; reason = 'Strong CTR + converting, near budget cap.'; }
    return { campaign_id: r.id, name: r.name, platform: r.platform, status: r.status,
      ctr: Number(ctr.toFixed(2)), cpc_cents: Math.round(cpc), conversions,
      spend_ratio: Number(spendRatio.toFixed(2)), recommendation: action, reason };
  });
  return { success: true, thresholds: { min_ctr: minCtr, max_cpc_cents: maxCpc },
    campaigns_analyzed: recommendations.length, recommendations };
}

// competitor_monitor — scrape the competitor domain (web-scrape) then analyze it
// via the competitor_analysis ai-task. Replaces the dead db:agent_memory wiring.
async function executeCompetitorMonitor(
  supabase: any,
  args: Record<string, unknown>,
  supabaseUrl: string,
  serviceKey: string,
): Promise<unknown> {
  const a = args as any;
  const domain = String(a.domain || '').trim();
  const companyName = String(a.company_name || '').trim();
  if (!domain || !companyName) return { error: 'domain and company_name are required', status: 'failed' };
  const url = domain.startsWith('http') ? domain : `https://${domain}`;

  const scrapeResp = await fetch(`${supabaseUrl}/functions/v1/web-scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ url, maxLength: 12000 }),
  });
  const scraped = await scrapeResp.json().catch(() => ({}));
  const content = scraped?.content || '';
  if (!content) return { error: `Could not scrape ${url} (${scraped?.error || 'no content'})`, status: 'failed' };

  const aiResp = await fetch(`${supabaseUrl}/functions/v1/ai-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ task: 'competitor_analysis', input: {
      company_name: companyName, domain, content, focus_areas: a.focus_areas || [],
    } }),
  });
  const taskResult = await aiResp.json();
  if (taskResult?.error) return { error: taskResult.error, status: 'failed' };
  const analysis = taskResult?.result ?? taskResult;

  // Store as a 'fact' memory (best-effort)
  try {
    await supabase.from('agent_memory').insert({
      key: `competitor:${domain}`, value: { company_name: companyName, domain, analysis, scanned_at: new Date().toISOString() },
      category: 'fact', created_by: 'competitor_monitor',
    });
  } catch { /* non-fatal */ }

  return { company_name: companyName, domain, ...analysis };
}

// invoice_from_timesheets — resolve project + period, then call the
// bulk_invoice_from_timesheets RPC. Was db:invoices (dead — listed invoices
// instead of generating one). The bulk_ variant is the real engine.
async function executeInvoiceFromTimesheets(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const a = args as any;
  // Resolve project_id (accept project_name).
  let projectId = String(a.project_id || '').trim();
  if (!projectId && a.project_name) {
    const { data: p } = await supabase.from('projects')
      .select('id').ilike('name', String(a.project_name)).limit(1).maybeSingle();
    projectId = p?.id || '';
  }
  if (!projectId) return { error: 'project_id (or a matching project_name) is required', status: 'failed' };

  // Resolve the period to start/end dates.
  const iso = (dt: Date) => dt.toISOString().split('T')[0];
  let start = a.start_date, end = a.end_date;
  const period = String(a.period || (start && end ? 'custom' : 'this_month'));
  if (period !== 'custom') {
    const now = new Date();
    if (period === 'last_month') {
      start = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      end = iso(new Date(now.getFullYear(), now.getMonth(), 0));
    } else { // this_month
      start = iso(new Date(now.getFullYear(), now.getMonth(), 1));
      end = iso(now);
    }
  }
  if (!start || !end) return { error: 'start_date and end_date required for period=custom', status: 'failed' };

  const { data, error } = await supabase.rpc('bulk_invoice_from_timesheets', {
    p_project_id: projectId, p_start_date: start, p_end_date: end,
    p_group_by: a.group_by || 'entry', p_due_days: a.due_days ?? 30,
  });
  if (error) return { error: `Invoice from timesheets failed: ${error.message}`, status: 'failed' };
  const rows = data || [];
  return { project_id: projectId, period, start_date: start, end_date: end,
    invoices_created: rows.length, invoices: rows };
}

async function executeReplyToTicketViaEmail(
  supabase: any,
  args: Record<string, unknown>,
): Promise<unknown> {
  const ticketId = String(args.ticket_id || '').trim();
  const body = String(args.body || '').trim();
  if (!ticketId || !body) {
    return { success: false, error: 'ticket_id and body required' };
  }

  const { data: ticket, error: tErr } = await supabase
    .from('tickets')
    .select('id, subject, contact_email, source, metadata, status')
    .eq('id', ticketId)
    .maybeSingle();
  if (tErr || !ticket) return { success: false, error: `ticket not found: ${tErr?.message ?? 'no row'}` };
  if (ticket.source !== 'email') {
    return { success: false, error: 'ticket was not opened via email — cannot reply via Gmail' };
  }

  const to = ticket.contact_email || ticket.metadata?.from_email;
  if (!to) return { success: false, error: 'ticket has no contact_email to reply to' };

  const subject = String(ticket.subject || '').match(/^re:/i) ? ticket.subject : `Re: ${ticket.subject}`;
  const inReplyTo = ticket.metadata?.last_inbound_message_id_header || ticket.metadata?.gmail_message_id_header || null;
  const references = ticket.metadata?.references
    ? `${ticket.metadata.references} ${inReplyTo || ''}`.trim()
    : inReplyTo;
  const threadId = ticket.metadata?.gmail_thread_id || null;
  const accountId = ticket.metadata?.composio_account_id || null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${supabaseUrl}/functions/v1/composio-proxy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'gmail_send',
      params: {
        to,
        subject,
        body,
        in_reply_to: inReplyTo,
        references,
        thread_id: threadId,
        account_id: accountId,
      },
      entity_id: 'default',
    }),
  });
  const payload = await res.json();
  if (!res.ok || payload?.error) {
    return { success: false, error: payload?.error || `gmail send failed (${res.status})` };
  }

  // Persist the outgoing message_id so a future inbound In-Reply-To matches back.
  const outMessageId = payload?.result?.data?.response_data?.id || null;
  const outHeader = outMessageId ? `<${outMessageId}@mail.gmail.com>` : null;

  await supabase.from('ticket_comments').insert({
    ticket_id: ticketId,
    content: body,
    is_internal: false,
    author_type: 'agent',
  });

  await supabase
    .from('tickets')
    .update({
      status: ticket.status === 'new' ? 'open' : ticket.status,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(ticket.metadata || {}),
        last_outgoing_message_id: outHeader,
        last_outgoing_at: new Date().toISOString(),
      },
    })
    .eq('id', ticketId);

  return { success: true, ticket_id: ticketId, outgoing_message_id: outMessageId };
}

