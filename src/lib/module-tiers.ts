/**
 * Module Tiers — Core / Standard / Extended / Experimental
 *
 * Inspired by Odoo's "base + community + enterprise" split and OpenClaw's
 * "rough week" lesson: without a budget on what counts as core, the platform
 * keeps absorbing every module until it can no longer be reasoned about as
 * a whole. Tiers are the contract that prevents that drift.
 *
 *  - `core`          Platform foundation. Always enabled, no opt-out.
 *                    Owns the agent_* schema, auth, settings, federation.
 *                    BUDGET: ≤ 8 modules. Adding one is an architectural decision.
 *
 *  - `standard`      Common business capabilities used by ~80% of installs.
 *                    Opt-in but installed by default in the SaaS template.
 *                    Examples: CRM, Blog, Pages, Invoicing, Calendar.
 *
 *  - `extended`      Vertical-specific capabilities used by some installs.
 *                    Opt-in, NOT installed by default.
 *                    Examples: Payroll, Manufacturing, Fixed Assets, POS.
 *
 *  - `experimental`  New / unstable / preview-quality modules.
 *                    Hidden from the default catalog, opt-in via developer flag.
 *
 * @see docs/architecture/module-tiers.md
 * @see mem://architecture/module-tiers
 */

export type ModuleTier = 'core' | 'standard' | 'extended' | 'experimental';

export const MODULE_TIERS: ReadonlyArray<ModuleTier> = [
  'core',
  'standard',
  'extended',
  'experimental',
] as const;

/** Hard budget — adding a 9th core module requires explicit architectural review. */
export const CORE_TIER_BUDGET = 8;

export interface TierMeta {
  label: string;
  description: string;
  defaultEnabled: boolean;
  shownInCatalog: boolean;
}

export const TIER_META: Record<ModuleTier, TierMeta> = {
  core: {
    label: 'Core',
    description: 'Platform foundation — always enabled, no opt-out.',
    defaultEnabled: true,
    shownInCatalog: false,
  },
  standard: {
    label: 'Standard',
    description: 'Common business capability — installed by default, opt-out per site.',
    defaultEnabled: true,
    shownInCatalog: true,
  },
  extended: {
    label: 'Extended',
    description: 'Vertical-specific capability — opt-in.',
    defaultEnabled: false,
    shownInCatalog: true,
  },
  experimental: {
    label: 'Experimental',
    description: 'Preview / unstable — opt-in via developer flag.',
    defaultEnabled: false,
    shownInCatalog: false,
  },
};

/**
 * Authoritative tier classification per module ID.
 *
 * This is the SINGLE SOURCE OF TRUTH for tiering. We keep it here (not on
 * each module file) so the budget rule and tier counts can be verified in
 * a single test without crawling 70+ files.
 *
 * Modules NOT listed here default to `'standard'` and the guardrail test
 * will warn (but not fail) so we can adopt incrementally.
 */
export const MODULE_TIER_MAP: Readonly<Record<string, ModuleTier>> = {
  // ── CORE (≤ 8) — platform foundation ──
  developer: 'core',
  federation: 'core',
  documents: 'core',
  email: 'core',

  // ── STANDARD — common business modules ──
  blog: 'standard',
  pages: 'standard',
  kb: 'standard',
  media: 'standard',
  newsletter: 'standard',
  crm: 'standard',
  deals: 'standard',
  companies: 'standard',
  forms: 'standard',
  booking: 'standard',
  products: 'standard',
  inventory: 'standard',
  chat: 'standard',
  analytics: 'standard',
  invoicing: 'standard',
  accounting: 'standard',
  expenses: 'standard',
  timesheets: 'standard',
  contracts: 'standard',
  hr: 'standard',
  projects: 'standard',
  calendar: 'standard',
  approvals: 'standard',
  quotes: 'standard',
  reconciliation: 'standard',
  flowpilot: 'standard', // operator layer — opt-in, but standard
  tickets: 'standard',
  workspaceChat: 'standard',
  subscriptions: 'standard',

  // ── EXTENDED — vertical-specific ──
  payroll: 'extended',
  manufacturing: 'extended',
  fixedAssets: 'extended',
  pos: 'extended',
  purchasing: 'extended',
  pricelists: 'extended',
  returns: 'extended',
  shipping: 'extended',
  multiCurrency: 'extended',
  fieldService: 'extended',
  webinars: 'extended',
  surveys: 'extended',
  liveSupport: 'extended',
  customer360: 'extended',
  recruitment: 'extended',
  sla: 'extended',
  handbook: 'extended',
  docs: 'extended',
  templates: 'extended',
  wiki: 'extended',
  river: 'extended',
  resume: 'extended',
  growth: 'extended',
  salesIntelligence: 'extended',
  companyInsights: 'extended',
  composio: 'extended',
  browserControl: 'extended',
  
  siteMigration: 'extended',
  globalBlocks: 'extended',
  globalElements: 'extended',

  // ── Aliases (legacy IDs that still appear in some defineModule calls) ──
  knowledgeBase: 'standard', // alias for `kb`
  mediaLibrary: 'standard',  // alias for `media`
  leads: 'standard',         // alias for `crm`
  bookings: 'standard',      // alias for `booking`
  ecommerce: 'standard',     // umbrella for products/inventory/orders
  paidGrowth: 'extended',    // alias for `growth`
};

export function getModuleTier(moduleId: string): ModuleTier {
  return MODULE_TIER_MAP[moduleId] ?? 'standard';
}

export function isCoreModule(moduleId: string): boolean {
  return getModuleTier(moduleId) === 'core';
}

export interface TierAuditResult {
  ok: boolean;
  coreCount: number;
  budgetExceeded: boolean;
  unclassified: string[];
  byTier: Record<ModuleTier, string[]>;
}

/** Audit a list of declared module IDs against the tier map + budget. */
export function auditModuleTiers(declaredModuleIds: string[]): TierAuditResult {
  const byTier: Record<ModuleTier, string[]> = {
    core: [],
    standard: [],
    extended: [],
    experimental: [],
  };
  const unclassified: string[] = [];

  for (const id of declaredModuleIds) {
    if (!(id in MODULE_TIER_MAP)) unclassified.push(id);
    byTier[getModuleTier(id)].push(id);
  }

  const coreCount = byTier.core.length;
  const budgetExceeded = coreCount > CORE_TIER_BUDGET;

  return {
    ok: !budgetExceeded,
    coreCount,
    budgetExceeded,
    unclassified,
    byTier,
  };
}
