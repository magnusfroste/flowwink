/**
 * Edge Function Registry — single source of truth for which Supabase Edge
 * Functions a site actually needs, based on its enabled modules.
 *
 * WHY THIS EXISTS
 * ----------------
 * Supabase caps the number of edge functions per project by plan:
 *   Free 100 · Pro 500 · Team 1000 · Enterprise ∞
 * FlowWink ships 100+ functions. A site that deploys *all* of them hits the
 * Free-tier ceiling. But no site enables every module — so the provisioning
 * script should deploy only the functions the site's enabled modules require.
 *
 * FAIL-OPEN BY DESIGN
 * -------------------
 * A function NOT listed in MODULE_EDGE_FUNCTIONS is treated as CORE and is
 * ALWAYS deployed. A function owned by several modules deploys if ANY owner is
 * enabled. The only direction this can err is "deploy something we didn't
 * strictly need" (harmless) — never "skip something required" (breaking).
 *
 * KEEP IN SYNC
 * ------------
 * `ALL_EDGE_FUNCTIONS` must match the deployable function dirs on disk
 * (supabase/functions/<name>/index.ts). The guardrail test
 * `edge-function-registry.guardrails.test.ts` enforces this — if it fails,
 * a function was added/removed; update this file.
 *
 * Module ids are the keys of `ModulesSettings` (see useModules.tsx).
 */

import type { ModulesSettings } from '@/hooks/useModules';

export type ModuleId = keyof ModulesSettings;

/** Supabase per-project edge-function ceiling by plan. */
export const PLAN_FUNCTION_LIMITS = {
  free: 100,
  pro: 500,
  team: 1000,
  enterprise: Infinity,
} as const;

export type SupabasePlan = keyof typeof PLAN_FUNCTION_LIMITS;

/** Default assumption for fork sites (see docs/operators/provisioning-and-updates.md). */
export const DEFAULT_PLAN: SupabasePlan = 'free';

/**
 * Every deployable edge function (dirs with an index.ts, excluding `_shared`,
 * the `shared` helper dir, and `tests`). Guardrail-tested against the filesystem.
 */
export const ALL_EDGE_FUNCTIONS: readonly string[] = [
  'a2a', 'agent-card', 'agent-execute', 'agent-operate', 'agent-reason', 'ai-task',
  'analyze-brand', 'automation-dispatcher', 'blog-rss', 'browser-fetch',
  'chat-completion', 'chat-stt', 'check-secrets', 'company-profile', 'composio-proxy',
  'consultant-checkin', 'contact-center', 'contact-finder', 'content-api',
  'contract-sign', 'copilot-action', 'create-checkout', 'create-invoice-payment',
  'create-user', 'csat-dispatch', 'customer-360', 'customer-signup', 'demo-cycle',
  'docs-chat', 'docs-sync', 'dunning-processor', 'elevenlabs-account', 'elks46-ingest',
  'email-send', 'enrich-company', 'enrich-company-profile', 'event-dispatcher',
  'extract-pdf-text', 'extract-receipt', 'federation-invite-peer', 'fetch-fx-rates',
  'fetch-image', 'field-service-skill', 'firecrawl-account', 'flowpilot-briefing',
  'flowpilot-distill', 'flowpilot-heartbeat', 'flowpilot-learn', 'gatewayapi-ingest',
  'generate-invoice-pdf', 'get-page', 'github-content-sync', 'gmail-inbox-scan',
  'gmail-oauth-callback', 'hunter-account', 'instance-health', 'invite-employee',
  'llms-txt', 'mcp-server', 'migrate-page', 'newsletter-export', 'newsletter-gdpr',
  'newsletter-link', 'newsletter-send', 'newsletter-subscribe', 'newsletter-track',
  'openai-account', 'openclaw-responses', 'parse-resume', 'process-image',
  'process-job-application', 'prospect-fit-analysis', 'prospect-research', 'qualify-lead',
  'quote-sign', 'reconciliation', 'resume-match', 'run-autonomy-tests',
  'run-platform-tests', 'sales-profile-setup', 'send-booking-confirmation',
  'send-contact-email', 'send-invoice-email', 'send-order-confirmation', 'send-quote-email',
  'send-webhook', 'setup-database', 'signal-dispatcher', 'signal-ingest', 'sitemap',
  'sla-check', 'stripe-webhook', 'subscription-billing-cron', 'subscriptions',
  'support-router', 'survey-send', 'system-integrity-check', 'telegram-ingest',
  'test-ai-connection', 'track-auth-event', 'track-page-view', 'twilio-ingest',
  'unsplash-search', 'update-autonomy-cron', 'voice-ingest', 'web-scrape', 'web-search',
  'workspace-chat',
];

/**
 * Module → the edge functions it (and only it) needs. A function may appear
 * under several modules; it deploys if ANY of them is enabled. Functions NOT
 * listed anywhere here are CORE and always deploy.
 *
 * Derivation: skillSeed handlers (`edge:`/`function:` prefixes) + frontend
 * `invoke()` call sites, attributed to the owning module/feature.
 */
export const MODULE_EDGE_FUNCTIONS: Partial<Record<ModuleId, readonly string[]>> = {
  // ── Communication / contact center ───────────────────────────────────────
  voice: ['elks46-ingest', 'twilio-ingest', 'gatewayapi-ingest', 'voice-ingest', 'chat-stt'],
  liveSupport: ['contact-center', 'telegram-ingest', 'support-router', 'csat-dispatch'],
  email: ['gmail-inbox-scan', 'gmail-oauth-callback'],
  newsletter: [
    'newsletter-send', 'newsletter-subscribe', 'newsletter-export',
    'newsletter-gdpr', 'newsletter-link', 'newsletter-track',
  ],

  // ── CRM / sales / leads ──────────────────────────────────────────────────
  leads: ['contact-finder', 'qualify-lead', 'enrich-company'],
  companies: ['enrich-company'],
  companyInsights: ['company-profile', 'enrich-company-profile'],
  customer360: ['customer-360'],
  salesIntelligence: ['prospect-research', 'prospect-fit-analysis', 'sales-profile-setup', 'signal-ingest'],

  // ── HR / recruitment / consultants ───────────────────────────────────────
  recruitment: ['parse-resume', 'invite-employee', 'process-job-application'],
  resume: ['resume-match', 'consultant-checkin'],

  // ── Commerce / finance ───────────────────────────────────────────────────
  ecommerce: ['create-checkout', 'send-order-confirmation'],
  invoicing: ['send-invoice-email', 'generate-invoice-pdf', 'create-invoice-payment'],
  quotes: ['quote-sign', 'send-quote-email'],
  contracts: ['contract-sign'],
  bookings: ['send-booking-confirmation'],
  subscriptions: ['subscriptions', 'subscription-billing-cron', 'dunning-processor'],
  expenses: ['extract-receipt'],
  reconciliation: ['reconciliation'],
  multiCurrency: ['fetch-fx-rates'],

  // ── Field service / SLA / surveys ────────────────────────────────────────
  fieldService: ['field-service-skill'],
  sla: ['sla-check'],
  surveys: ['survey-send'],

  // ── Content / docs / knowledge ───────────────────────────────────────────
  blog: ['blog-rss'],
  docs: ['docs-chat', 'docs-sync'],
  handbook: ['github-content-sync'],
  workspaceChat: ['workspace-chat'],
  siteMigration: ['migrate-page', 'analyze-brand'],

  // ── Autonomous operator (off by default) ─────────────────────────────────
  flowpilot: [
    'flowpilot-heartbeat', 'flowpilot-briefing', 'flowpilot-learn', 'flowpilot-distill',
    'update-autonomy-cron', 'run-autonomy-tests', 'web-search', 'web-scrape',
  ],

  // ── Federation / external agents ─────────────────────────────────────────
  federation: ['a2a', 'agent-card', 'federation-invite-peer', 'openclaw-responses'],

  // ── Integrations ─────────────────────────────────────────────────────────
  composio: ['composio-proxy'],
  browserControl: ['browser-fetch'],
};

/** All functions that belong to at least one module (i.e. not core). */
function moduleOwnedFunctions(): Set<string> {
  const owned = new Set<string>();
  for (const fns of Object.values(MODULE_EDGE_FUNCTIONS)) {
    for (const fn of fns ?? []) owned.add(fn);
  }
  return owned;
}

/** Functions deployed on every site regardless of enabled modules. */
export function coreEdgeFunctions(): string[] {
  const owned = moduleOwnedFunctions();
  return ALL_EDGE_FUNCTIONS.filter((fn) => !owned.has(fn));
}

/**
 * The functions a site must deploy given its enabled modules.
 * Core functions always included; a module-owned function is included if any
 * of its owning modules is enabled. (Fail-open: unknown functions count as core.)
 */
export function requiredEdgeFunctions(enabledModuleIds: Iterable<ModuleId>): string[] {
  const enabled = new Set<ModuleId>(enabledModuleIds);
  const owned = moduleOwnedFunctions();
  return ALL_EDGE_FUNCTIONS.filter((fn) => {
    if (!owned.has(fn)) return true; // core
    // keep if any owning module is enabled
    for (const [moduleId, fns] of Object.entries(MODULE_EDGE_FUNCTIONS)) {
      if ((fns ?? []).includes(fn) && enabled.has(moduleId as ModuleId)) return true;
    }
    return false;
  });
}

export interface EdgeFunctionUsage {
  /** Functions this site deploys with its current enabled modules. */
  required: number;
  /** Functions deployed regardless of modules. */
  core: number;
  /** Footprint if every mappable module were turned on. */
  ifAllEnabled: number;
  /** Total functions that exist in the codebase. */
  total: number;
  /** Free-tier ceiling (100). */
  freeLimit: number;
  /** Per-enabled-module extra functions, for the breakdown UI. */
  perModule: Array<{ moduleId: ModuleId; functions: string[]; count: number }>;
  /** True when the current footprint is within Free tier. */
  withinFree: boolean;
  /** True when enabling everything would still fit Free tier. */
  allFitsFree: boolean;
}

/** Compute the edge-function usage summary for an enabled-module set. */
export function edgeFunctionUsage(enabledModuleIds: Iterable<ModuleId>): EdgeFunctionUsage {
  const enabled = new Set<ModuleId>(enabledModuleIds);
  const required = requiredEdgeFunctions(enabled).length;
  const core = coreEdgeFunctions().length;

  const perModule = (Object.entries(MODULE_EDGE_FUNCTIONS) as Array<[ModuleId, readonly string[]]>)
    .filter(([moduleId]) => enabled.has(moduleId))
    .map(([moduleId, fns]) => ({ moduleId, functions: [...fns], count: fns.length }))
    .sort((a, b) => b.count - a.count);

  const allModuleIds = Object.keys(MODULE_EDGE_FUNCTIONS) as ModuleId[];
  const ifAllEnabled = requiredEdgeFunctions(allModuleIds).length;

  return {
    required,
    core,
    ifAllEnabled,
    total: ALL_EDGE_FUNCTIONS.length,
    freeLimit: PLAN_FUNCTION_LIMITS.free,
    perModule,
    withinFree: required <= PLAN_FUNCTION_LIMITS.free,
    allFitsFree: ifAllEnabled <= PLAN_FUNCTION_LIMITS.free,
  };
}
