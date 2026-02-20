/**
 * Template Module Resolver
 * 
 * Automatically derives the required modules for a template
 * by scanning its blocks against the BLOCK_TO_MODULE mapping.
 * This ensures templates always declare the correct module dependencies.
 */

import { BLOCK_TO_MODULE } from '@/hooks/useBlockModuleStatus';
import type { ModulesSettings } from '@/hooks/useModules';
import type { ContentBlock } from '@/types/cms';

/**
 * Scan template blocks and return all required module IDs.
 * Works recursively for nested blocks (e.g., two-column).
 */
export function deriveRequiredModules(
  blocks: ContentBlock[]
): (keyof ModulesSettings)[] {
  const modules = new Set<keyof ModulesSettings>();

  function scanBlock(block: ContentBlock) {
    const moduleId = BLOCK_TO_MODULE[block.type];
    if (moduleId) {
      modules.add(moduleId);
    }

    // Scan nested blocks in two-column layouts
    const data = block.data as Record<string, unknown>;
    if (data?.leftBlocks && Array.isArray(data.leftBlocks)) {
      (data.leftBlocks as ContentBlock[]).forEach(scanBlock);
    }
    if (data?.rightBlocks && Array.isArray(data.rightBlocks)) {
      (data.rightBlocks as ContentBlock[]).forEach(scanBlock);
    }
    // Tabs blocks may contain nested content
    if (data?.tabs && Array.isArray(data.tabs)) {
      for (const tab of data.tabs as Array<{ blocks?: ContentBlock[] }>) {
        if (tab.blocks) tab.blocks.forEach(scanBlock);
      }
    }
  }

  blocks.forEach(scanBlock);
  return Array.from(modules);
}

/**
 * Validate that a template's declared requiredModules covers all
 * modules needed by its blocks. Returns missing modules if any.
 */
export function validateTemplateModules(
  declaredModules: (keyof ModulesSettings)[] | undefined,
  allBlocks: ContentBlock[]
): {
  valid: boolean;
  missing: (keyof ModulesSettings)[];
  derived: (keyof ModulesSettings)[];
} {
  const derived = deriveRequiredModules(allBlocks);
  const declared = new Set(declaredModules || []);
  const missing = derived.filter(m => !declared.has(m));

  return {
    valid: missing.length === 0,
    missing,
    derived,
  };
}
