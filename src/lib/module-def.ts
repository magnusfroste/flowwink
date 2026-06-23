/**
 * Unified Module Definition — Single Source of Truth
 * 
 * Inspired by Odoo's __manifest__.py and OpenClaw's SKILL.md auto-discovery.
 * Each module declares EVERYTHING in one place: API contract, skill ownership,
 * bootstrap data, webhook events, and capabilities.
 * 
 * This eliminates the need to register in 4+ separate files:
 * - module-contracts.ts (schemas)
 * - skill-map.ts (skill names)
 * - module-bootstraps/*.ts (registerBootstrap)
 * - module-registry.ts (import list)
 * - module-webhook-events.ts (events)
 * 
 * @see docs/concepts/openclaw-law.md — LAW 1: Skills as Knowledge Containers
 */

import { z } from 'zod';
import type { ModuleCapability } from '@/types/module-contracts';
import type { ModulesSettings } from '@/hooks/useModules';
import type { SkillSeed, AutomationSeed } from '@/lib/module-bootstrap';
import type { WebhookEventInfo } from '@/lib/module-webhook-events';
import type { ModuleTier } from '@/lib/module-tiers';
import type { ProcessId, MaturityLevel } from '@/lib/processes';

// =============================================================================
// Unified Module Definition
// =============================================================================

/**
 * Namespaced sub-shapes — group fields by who owns them.
 *
 *   agent: what the AI/MCP layer sees   (skills, automations, webhook events)
 *   ui:    what the human sees           (reserved — navItems, routes)
 *   data:  what the DB owns              (reserved — tables, RLS, seedData)
 *
 * Only `agent` is populated today. `ui` and `data` are forward-looking
 * placeholders — modules can start filling them in as concerns get pulled
 * out of Sidebar / migrations into the manifest.
 *
 * For backwards compatibility, all `agent.*` fields can also be declared at
 * the top level (flat). `defineModule` normalises to the namespaced shape.
 */
export interface AgentNamespace {
  /** Skill names this module owns — enabled/disabled with the module */
  skills?: string[];
  /** Full skill definitions for INSERT-if-not-exists bootstrap */
  skillSeeds?: SkillSeed[];
  /** Automations to register when module is enabled */
  automations?: AutomationSeed[];
  /**
   * Events this module **emits** to the platform event bus.
   * See docs/architecture/event-bus.md for the canonical catalog.
   */
  emits?: WebhookEventInfo[];
  /**
   * Events this module **listens to** (drives automations, triggers, fan-outs).
   * Used by /admin/event-bus to render the producer→consumer graph and by CI
   * to flag dead listeners (event no module emits) or dead events (emitted
   * but no consumer).
   */
  listens?: WebhookEventInfo[];
  /**
   * @deprecated Use `emits` (and `listens` for consumers). Kept as an alias
   * for `emits` so the 12 modules that pre-date the split keep working
   * unchanged. `normaliseModule` mirrors between the two.
   */
  webhookEvents?: WebhookEventInfo[];
}


export interface UiNamespace {
  /** Reserved — sidebar entries owned by this module */
  navItems?: unknown[];
  /** Reserved — react-router route descriptors owned by this module */
  routes?: unknown[];
}

export interface DataNamespace {
  /**
   * Tables this module owns. Used by:
   *  - Site reset (dynamic wipe instead of hardcoded list)
   *  - Orphan detection (rows for disabled modules)
   *  - Doc-drift / ownership audits
   *
   * IMPORTANT: order child tables BEFORE parents (FK-safe delete order).
   * A table may be co-owned by multiple modules — list it in each.
   */
  tables?: string[];
  /** Storage buckets this module owns (wiped at reset). */
  storageBuckets?: string[];
  /** `site_settings.key` rows owned by this module (reset at site reset). */
  settingsKeys?: string[];
  /** Reference data seeding function — runs on enable */
  seedData?: () => Promise<void>;
}

export interface UnifiedModuleDef<TInput = unknown, TOutput = unknown> {
  /** Must match the key in ModulesSettings */
  id: keyof ModulesSettings;
  name: string;
  version: string;
  description?: string;
  capabilities: ModuleCapability[];
  /**
   * Module tier — see `src/lib/module-tiers.ts` and
   * `docs/architecture/module-tiers.md`. Required from v2 onwards.
   *
   *  - `core`         always-on platform layer (no opt-out)
   *  - `standard`     common business module, opt-in
   *  - `extended`     vertical-specific, opt-in
   *  - `experimental` unstable / preview, excluded from default install
   *
   * Defaults to `'standard'` if omitted (with a console warning) so legacy
   * modules keep working until they are explicitly classified.
   */
  tier?: ModuleTier;

  /**
   * Other modules this module depends on. When this module is enabled, every
   * `requires` parent is auto-enabled. When a parent is disabled, this module
   * is auto-disabled. Drives `MODULE_DEPENDENCIES` in /admin/modules so the
   * dependency graph lives next to the module, not in a giant lookup table.
   */
  requires?: (keyof ModulesSettings)[];

  /**
   * Business processes this module participates in. Drives `/admin/process-coverage`
   * and the sales-facing process map in `docs/processes/README.md`. Empty array
   * is valid for pure platform/integration modules (e.g. `email`, `developer`).
   *
   * @see src/lib/processes.ts — canonical process list
   */
  processes?: ProcessId[];

  /**
   * Maturity level for the **module's contribution** to its processes.
   * If a module supports multiple processes at different maturities, declare
   * the lowest (most conservative) level — process-level overrides live in
   * `docs/processes/<process>.md`.
   *
   *  L1 stub · L2 manual · L3 operational · L4 agent-augmented · L5 production-grade
   */
  maturity?: MaturityLevel;

  // ── API Contract ──
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  /**
   * Optional direct-publish handler. Most modules expose their behaviour through
   * skills (executed via `agent-execute` → RPC), not through `publish()`. Keep
   * this only when there is a real UI publish button (e.g. blog, newsletter,
   * pages). Returning a stub `{ success: true }` from here is forbidden — omit
   * the field instead so the registry returns a clear "not implemented" error.
   */
  publish?: (input: TInput) => Promise<TOutput>;

  // ── Namespaced shape (preferred) ──
  agent?: AgentNamespace;
  ui?: UiNamespace;
  data?: DataNamespace;

  // ── Flat shape (legacy / shorthand — auto-merged into `agent` / `data`) ──
  /** @deprecated prefer `agent.skills` */
  skills?: string[];
  /** @deprecated prefer `agent.skillSeeds` */
  skillSeeds?: SkillSeed[];
  /** @deprecated prefer `agent.automations` */
  automations?: AutomationSeed[];
  /** @deprecated prefer `agent.webhookEvents` */
  webhookEvents?: WebhookEventInfo[];
  /** @deprecated prefer `data.seedData` */
  seedData?: () => Promise<void>;
}

// =============================================================================
// Registry
// =============================================================================

/** Central registry of all unified module definitions */
const unifiedModules = new Map<string, UnifiedModuleDef>();

/**
 * Define and register a module in a single call.
 *
 * Accepts either the **namespaced** shape (preferred) or the **flat** shape
 * (legacy). Flat fields are merged into the matching namespace so downstream
 * code can rely on either form.
 *
 * Namespaced (preferred):
 * ```ts
 * defineModule({
 *   id: 'expenses', name: 'Expenses', version: '1.0.0', capabilities: [...],
 *   inputSchema, outputSchema, publish,
 *   agent: { skills: ['manage_expense'], skillSeeds: [...], automations: [...] },
 *   data:  { seedData: async () => {...} },
 * });
 * ```
 *
 * Flat (legacy — still works):
 * ```ts
 * defineModule({
 *   id: 'expenses', ..., skills: ['manage_expense'], skillSeeds: [...],
 * });
 * ```
 */
export function defineModule<TInput, TOutput>(
  def: UnifiedModuleDef<TInput, TOutput>
): UnifiedModuleDef<TInput, TOutput> {
  const normalised = normaliseModule(def);
  unifiedModules.set(normalised.id, normalised as UnifiedModuleDef);
  return normalised;
}

function normaliseModule<TInput, TOutput>(
  def: UnifiedModuleDef<TInput, TOutput>
): UnifiedModuleDef<TInput, TOutput> {
  // emits / webhookEvents are aliases — mirror in both directions so old and
  // new readers see the same data regardless of which field was declared.
  const emits =
    def.agent?.emits ??
    def.agent?.webhookEvents ??
    def.webhookEvents;
  const listens = def.agent?.listens;

  const agent: AgentNamespace = {
    skills: def.agent?.skills ?? def.skills,
    skillSeeds: def.agent?.skillSeeds ?? def.skillSeeds,
    automations: def.agent?.automations ?? def.automations,
    emits,
    listens,
    webhookEvents: emits, // backwards-compat mirror
  };
  const data: DataNamespace = {
    tables: def.data?.tables,
    storageBuckets: def.data?.storageBuckets,
    settingsKeys: def.data?.settingsKeys,
    seedData: def.data?.seedData ?? def.seedData,
  };
  return {
    ...def,
    agent,
    ui: def.ui ?? {},
    data,
    // Mirror back to flat fields so existing readers keep working unchanged.
    skills: agent.skills,
    skillSeeds: agent.skillSeeds,
    automations: agent.automations,
    webhookEvents: emits,
    seedData: data.seedData,
  };
}


// =============================================================================
// Registry Accessors (used by module-bootstrap.ts, skill-map.ts, etc.)
// =============================================================================

/** Get a unified module definition by ID */
export function getUnifiedModule(id: string): UnifiedModuleDef | undefined {
  return unifiedModules.get(id);
}

/** Get all registered unified modules */
export function getAllUnifiedModules(): UnifiedModuleDef[] {
  return Array.from(unifiedModules.values());
}

/** Get skill names for a module from the unified registry */
export function getUnifiedSkillNames(moduleId: keyof ModulesSettings): string[] {
  const mod = unifiedModules.get(moduleId);
  if (!mod) return [];
  
  // Combine declared skill names + any skillSeed names
  const names = new Set<string>(mod.skills ?? []);
  if (mod.skillSeeds) {
    for (const seed of mod.skillSeeds) {
      if (seed?.name) names.add(seed.name);
    }
  }
  return Array.from(names);
}

/** Check if a module is registered in the unified system */
export function isUnifiedModule(moduleId: string): boolean {
  return unifiedModules.has(moduleId);
}
