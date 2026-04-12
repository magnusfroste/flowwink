/**
 * Module → Skill Name Mapping
 * 
 * All modules now declare their skills via defineModule() in their module files.
 * This file provides core skills and the lookup functions used by the bootstrap system.
 */

import type { ModulesSettings, ModuleConfig } from '@/hooks/useModules';
import { getUnifiedSkillNames, isUnifiedModule, getAllUnifiedModules } from '@/lib/module-def';

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
 * Delegates to the unified registry — all modules are now migrated.
 */
export function getModuleSkillNames(moduleId: keyof ModulesSettings): string[] {
  if (isUnifiedModule(moduleId)) {
    return getUnifiedSkillNames(moduleId);
  }
  return [];
}

/**
 * Get all skill names across all enabled modules.
 */
export function getEnabledModuleSkillNames(modules: ModulesSettings): string[] {
  const names: string[] = [];
  for (const [id, config] of Object.entries(modules)) {
    if ((config as ModuleConfig).enabled) {
      const moduleId = id as keyof ModulesSettings;
      names.push(...getModuleSkillNames(moduleId));
    }
  }
  return names;
}
