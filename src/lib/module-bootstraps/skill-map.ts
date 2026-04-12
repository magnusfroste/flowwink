/**
 * Module → Skill Name Mapping (Legacy)
 * 
 * All modules have been migrated to defineModule() in src/lib/modules/*.ts.
 * Skills are now declared directly in each module's definition.
 * 
 * This file remains as the fallback lookup + core skills list.
 * getModuleSkillNames() delegates to the unified registry first.
 */

import type { ModulesSettings, ModuleConfig } from '@/hooks/useModules';
import { getUnifiedSkillNames, isUnifiedModule } from '@/lib/module-def';

/**
 * Legacy skill map — only for modules NOT yet migrated to defineModule().
 * As of Phase 3 completion, all modules are migrated. This map is kept
 * empty as a safety net for any future module that hasn't migrated yet.
 */
export const MODULE_SKILL_MAP: Partial<Record<keyof ModulesSettings, string[]>> = {
  // ── All modules migrated to defineModule() ──
  // Skills are now declared in each module's definition file.
  // See src/lib/modules/*-module.ts

  // Modules that share skills with other modules (no own defineModule):
  chat: [
    // Chat uses chat-completion directly, no DB skills
  ],

  liveSupport: [
    'support_list_conversations',
    'support_assign_conversation',
  ],

  analytics: [
    'analyze_analytics',
    'seo_audit_page',
    'kb_gap_analysis',
    'analyze_chat_feedback',
    'weekly_business_digest',
    'support_get_feedback',
    'competitor_monitor',
  ],

  companyInsights: [
    // Shares salesIntelligence skills
  ],
};

/**
 * Core FlowPilot skills — always available when FlowPilot is enabled.
 * These are NOT owned by any module.
 */
export const CORE_SKILLS = [
  'create_objective',
  'manage_site_settings',
  'site_branding_get',
  'site_branding_update',
  'users_list',
  'publish_scheduled_content',
  'learn_from_data',
  'manage_automations',
  'process_signal',
  'search_web',
  'scrape_url',
  'browser_fetch',
  'extract_pdf_text',
  'scan_gmail_inbox',
];

/**
 * Get all skill names owned by a module.
 */
export function getModuleSkillNames(moduleId: keyof ModulesSettings): string[] {
  // Unified modules handle their own skills — don't double-count
  if (isUnifiedModule(moduleId)) {
    return getUnifiedSkillNames(moduleId);
  }
  return MODULE_SKILL_MAP[moduleId] ?? [];
}

/**
 * Get all skill names across all enabled modules.
 */
export function getEnabledModuleSkillNames(modules: ModulesSettings): string[] {
  const names: string[] = [];
  for (const [id, config] of Object.entries(modules)) {
    if ((config as ModuleConfig).enabled) {
      const moduleId = id as keyof ModulesSettings;
      // Prefer unified registry
      if (isUnifiedModule(moduleId)) {
        names.push(...getUnifiedSkillNames(moduleId));
      } else {
        const skills = MODULE_SKILL_MAP[moduleId];
        if (skills) names.push(...skills);
      }
    }
  }
  return names;
}
