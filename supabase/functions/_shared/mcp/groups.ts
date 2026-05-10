/**
 * MCP group / module routing utilities — pure functions extracted from
 * mcp-server/index.ts. The maps themselves remain co-located with the
 * MCP server (so the module-aware MCP guardrail test can keep grepping
 * the file for required aliases), but the routing *logic* now lives here
 * for separation of concerns and to enable reuse by CLI tooling.
 */

export type GroupMap = Record<string, string[]>;

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
 * Is a skill category active given the current set of enabled modules?
 * `__all__` is a sentinel meaning "no filter — expose everything".
 */
export function isCategoryActive(
  category: string,
  activeModules: Set<string>,
  skillCategoryModules: GroupMap,
): boolean {
  if (activeModules.has("__all__")) return true;
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
