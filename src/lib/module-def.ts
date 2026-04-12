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

// =============================================================================
// Unified Module Definition
// =============================================================================

export interface UnifiedModuleDef<TInput = unknown, TOutput = unknown> {
  /** Must match the key in ModulesSettings */
  id: keyof ModulesSettings;
  name: string;
  version: string;
  description?: string;
  capabilities: ModuleCapability[];

  // ── API Contract ──
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  publish: (input: TInput) => Promise<TOutput>;

  // ── FlowPilot Integration (optional) ──
  /** Skill names this module owns — enabled/disabled with the module */
  skills?: string[];
  /** Full skill definitions for INSERT-if-not-exists bootstrap */
  skillSeeds?: SkillSeed[];
  /** Automations to register when module is enabled */
  automations?: AutomationSeed[];
  /** Reference data seeding function — runs on enable */
  seedData?: () => Promise<void>;

  // ── Webhook Events (optional) ──
  webhookEvents?: WebhookEventInfo[];
}

// =============================================================================
// Registry
// =============================================================================

/** Central registry of all unified module definitions */
const unifiedModules = new Map<string, UnifiedModuleDef>();

/**
 * Define and register a module in a single call.
 * This is the ONLY way to register a module in the unified system.
 * 
 * Usage:
 * ```ts
 * export const documentsModule = defineModule({
 *   id: 'documents',
 *   name: 'Documents',
 *   version: '1.0.0',
 *   skills: ['manage_document'],
 *   skillSeeds: [{ ... }],
 *   inputSchema: ...,
 *   outputSchema: ...,
 *   publish: async (input) => { ... },
 * });
 * ```
 */
export function defineModule<TInput, TOutput>(
  def: UnifiedModuleDef<TInput, TOutput>
): UnifiedModuleDef<TInput, TOutput> {
  unifiedModules.set(def.id, def as UnifiedModuleDef);
  return def;
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
      names.add(seed.name);
    }
  }
  return Array.from(names);
}

/** Check if a module is registered in the unified system */
export function isUnifiedModule(moduleId: string): boolean {
  return unifiedModules.has(moduleId);
}
