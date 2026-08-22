/**
 * MCP group / module routing utilities — pure functions extracted from
 * mcp-server/index.ts. The maps themselves remain co-located with the
 * MCP server (so the module-aware MCP guardrail test can keep grepping
 * the file for required aliases), but the routing *logic* now lives here
 * for separation of concerns and to enable reuse by CLI tooling.
 */

export type GroupMap = Record<string, string[]>;

/**
 * Skill category → module IDs that must be enabled for the category to be exposed.
 * Shared across MCP server and chat-completion so /chat sees the same module-gating
 * as external MCP clients. When a module is turned off, all skills in its categories
 * disappear from the LLM's tool list — same behaviour the user sees in MCP discovery.
 *
 * COMPLETENESS IS LOAD-BEARING. `isCategoryActive` opens a category when ANY
 * listed module is on — so a module that OWNS skills in a category but is
 * missing from that category's list gets its own skills hidden whenever it is
 * the only owner enabled. That happened for real: an instance with only the
 * `email` module on exposed zero e-mail skills, and an external agent could not
 * answer a customer at all.
 *
 * The truth lives in `src/lib/modules/*` (`skillSeeds[].category`). It is
 * DERIVED and enforced by `src/lib/__tests__/mcp-category-module-map.guardrails.test.ts`
 * — do not hand-maintain this map without running that test.
 *
 * Categories in ALWAYS_ON_CATEGORIES (automation / system / search) are exempt
 * from the completeness rule: gating never consults their lists, which exist
 * only for ?groups=<module> alias routing.
 */
export const SKILL_CATEGORY_MODULES: GroupMap = {
  content: [
    "pages", "blog", "knowledgeBase", "handbook", "consultants", "mediaLibrary", "siteMigration",
    "newsletter", "docs", "wiki", "webinars", "documents", "globalElements",
  ],
  crm: [
    "leads", "deals", "companies", "forms", "bookings", "hr", "recruitment", "projects",
    "salesIntelligence", "tickets", "newsletter", "ecommerce", "flowtable", "customer360",
    "surveys", "companyInsights", "calendar",
    // DELIBERATE EXCLUSION: `flowpilot` owns one crm-tagged skill (users_list),
    // but that is a categorisation slip in the seed — users_list is a system/
    // identity lookup, not CRM domain ownership. FlowPilot is enabled on nearly
    // every instance, so listing it here would make `crm` permanently ungated
    // and would kill agent-operate's "that module is off — turn it on?" nudge.
    // Fix forward by recategorising users_list, not by widening this list.
  ],
  communication: [
    "newsletter", "chat", "liveSupport", "webinars",
    "email", "voice", "webmeet", "workspaceChat", "composio", "river", "recruitment", "leads",
  ],
  automation: [],
  // browserControl stays listed for ?groups=browsercontrol alias routing,
  // but the category itself is ALWAYS_ON (see below): search_web/scrape_url/
  // search_knowledge are platform seeds, and gating the category behind the
  // browser-control toggle hid them. Browser-control's own skills are still
  // governed by their skill rows (enabled per module bootstrap).
  search: ["browserControl"],
  analytics: [
    "analytics", "sla",
    "pages", "knowledgeBase", "leads", "ecommerce", "liveSupport", "visitorIntelligence",
    "timesheets", "recruitment", "fixedAssets",
    // DELIBERATE EXCLUSION: `flowpilot` owns one analytics-tagged skill
    // (learn_from_data) — an agent-lifecycle skill, not analytics domain
    // ownership. Same reasoning as `crm` above.
  ],
  system: [],
  commerce: [
    "ecommerce", "accounting", "expenses", "contracts", "inventory", "purchasing", "invoicing", "timesheets",
    "companies", "bookings", "fieldService", "maintenance", "pos", "manufacturing", "approvals",
    "quotes", "reconciliation", "pricelists", "returns", "shipping", "multiCurrency", "fixedAssets",
    "payroll", "subscriptions",
  ],
  growth: ["paidGrowth"],
  subscriptions: ["subscriptions"],
  // `identity` and `agent` currently own no skillSeeds — kept for
  // COMPOSITE_GROUPS routing (`success` expands into `identity`) and for
  // ?groups=<module> aliases.
  identity: ["companyInsights"],
  agent: ["flowpilot"],
};

/**
 * Load enabled module ids from site_settings. Returns Set with sentinel
 * `__all__` if settings are missing — fail-open to avoid hiding tools by accident.
 */
export async function loadActiveModuleIds(supabase: any): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "modules")
    .maybeSingle();

  if (error || !data?.value) return new Set(["__all__"]);

  const modules = data.value as Record<string, { enabled?: boolean }>;
  const active = new Set<string>();
  for (const [id, config] of Object.entries(modules)) {
    if (config?.enabled) active.add(id);
  }
  return active;
}

export interface ResolvedGroups {
  /** Whole categories to include (ALL skills in these categories) */
  categories: Set<string>;
  /** Module-level narrowing inside a parent category (e.g. invoicing inside commerce) */
  modules: Set<string>;
}

export interface ResolveContext {
  /** category → required module ids */
  skillCategoryModules: GroupMap;
  /** composite token → list of category tokens */
  compositeGroups: GroupMap;
  /** composite token → list of module-level tokens */
  subCompositeGroups: GroupMap;
  /** module-id → parent category */
  moduleToCategory: Record<string, string>;
}

/**
 * Resolve a list of group/module tokens into category + module sets.
 * Composite groups expand into their children; unknown tokens are dropped.
 */
export function resolveGroupTokens(tokens: string[], ctx: ResolveContext): ResolvedGroups {
  const categories = new Set<string>();
  const modules = new Set<string>();
  for (const raw of tokens) {
    const t = raw.toLowerCase().trim();
    if (!t) continue;
    if (ctx.compositeGroups[t]) {
      for (const child of ctx.compositeGroups[t]) categories.add(child);
    } else if (ctx.subCompositeGroups[t]) {
      for (const child of ctx.subCompositeGroups[t]) modules.add(child);
    } else if (ctx.skillCategoryModules[t]) {
      categories.add(t);
    } else if (ctx.moduleToCategory[t]) {
      modules.add(t);
    }
  }
  return { categories, modules };
}

/**
 * Build the reverse module → category map from skillCategoryModules.
 */
export function buildModuleToCategory(skillCategoryModules: GroupMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [cat, mods] of Object.entries(skillCategoryModules)) {
    for (const m of mods) out[m.toLowerCase()] = cat;
  }
  return out;
}

/**
 * Categories that expose regardless of module toggles: they hold PLATFORM
 * seeds (search_web, scrape_url, search_knowledge, …). Their module lists in
 * SKILL_CATEGORY_MODULES exist only for ?groups=<module> alias routing.
 * (MCP-as-Platform: disabling a module must never hide platform primitives.)
 */
export const ALWAYS_ON_CATEGORIES = new Set(["automation", "system", "search"]);

/**
 * Is a skill category active given the current set of enabled modules?
 * `__all__` is a sentinel meaning "no filter — expose everything".
 */
export function isCategoryActive(
  category: string,
  activeModules: Set<string>,
  skillCategoryModules: GroupMap,
): boolean {
  if (activeModules.has("__all__")) return true;
  if (ALWAYS_ON_CATEGORIES.has(category)) return true;
  const required = skillCategoryModules[category];
  if (!required || required.length === 0) return true; // system / always-on
  return required.some((m) => activeModules.has(m));
}

/**
 * Classify a skill by its likely owning module — used for sub-category
 * filtering (e.g. ?groups=invoicing returns only invoicing skills out of
 * commerce's ~67). Heuristic: handler hints first, then name keywords.
 */
export function classifySkillModule(name: string, handler: string | null | undefined): string | null {
  const n = name.toLowerCase();
  const h = (handler ?? "").toLowerCase();

  if (h.startsWith("module:orders")) return "ecommerce";
  if (h.startsWith("module:products")) return n.includes("invent") ? "inventory" : "products";
  if (h.includes("reconciliation/")) return "accounting";

  if (/(^|_)(contract|signature)/.test(n)) return "contracts";
  if (/(^|_)(expense|receipt)/.test(n)) return "expenses";
  if (/(^|_)(invoice|dunning)/.test(n) && !n.includes("vendor")) return "invoicing";
  if (/(vendor|purchase_order|^send_purchase|match_po|reorder|procurement)/.test(n)) return "purchasing";
  if (/(manufactur|^mo_|_mo$|^check_mo|^start_mo|^complete_mo|^cancel_mo|^confirm_mo|bom|trigger_procurement)/.test(n)) return "inventory";
  if (/(timesheet)/.test(n)) return "timesheets";
  if (/(accounting|journal|chart_of_accounts|opening_balance|analytic|bank_|stripe_payout|fiscal_period)/.test(n)) return "accounting";
  if (/(subscription|mrr)/.test(n)) return "subscriptions";
  if (/(^manage_quote|^browse_products|^manage_product|^manage_inventory|^manage_orders|order_status|send_invoice_for_order)/.test(n)) return "ecommerce";

  return null;
}
