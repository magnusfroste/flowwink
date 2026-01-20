import { useMemo } from 'react';
import { useModules, type ModulesSettings } from './useModules';
import { ContentBlockType } from '@/types/cms';

/**
 * Maps block types to their required module.
 * Blocks not listed here are always available.
 */
export const BLOCK_TO_MODULE: Partial<Record<ContentBlockType, keyof ModulesSettings>> = {
  // Content modules
  'article-grid': 'blog',
  
  // Communication modules
  'chat': 'chat',
  'newsletter': 'newsletter',
  
  // Data modules
  'booking': 'bookings',
  'products': 'products',
  'cart': 'products',
  
  // Knowledge Base
  'kb-featured': 'knowledgeBase',
  'kb-hub': 'knowledgeBase',
  'kb-search': 'knowledgeBase',
  'kb-accordion': 'knowledgeBase',
};

interface BlockModuleStatus {
  /** Whether the block's required module is enabled (or block has no module requirement) */
  isAvailable: boolean;
  /** The required module ID, if any */
  requiredModule?: keyof ModulesSettings;
  /** Human-readable name of the required module */
  requiredModuleName?: string;
}

/**
 * Hook to check if a specific block type is available based on module status.
 */
export function useBlockModuleStatus(blockType: ContentBlockType): BlockModuleStatus {
  const { data: modules } = useModules();
  
  return useMemo(() => {
    const requiredModule = BLOCK_TO_MODULE[blockType];
    
    if (!requiredModule) {
      return { isAvailable: true };
    }
    
    const moduleConfig = modules?.[requiredModule];
    const isEnabled = moduleConfig?.enabled ?? false;
    
    return {
      isAvailable: isEnabled,
      requiredModule,
      requiredModuleName: moduleConfig?.name ?? requiredModule,
    };
  }, [blockType, modules]);
}

/**
 * Hook to get module status for all blocks at once (for BlockSelector).
 * Returns a map of block types to their availability status.
 */
export function useAllBlockModuleStatus(): Record<ContentBlockType, BlockModuleStatus> {
  const { data: modules } = useModules();
  
  return useMemo(() => {
    const result: Partial<Record<ContentBlockType, BlockModuleStatus>> = {};
    
    // Build status for blocks with module requirements
    for (const [blockType, moduleId] of Object.entries(BLOCK_TO_MODULE)) {
      const moduleConfig = modules?.[moduleId as keyof ModulesSettings];
      const isEnabled = moduleConfig?.enabled ?? false;
      
      result[blockType as ContentBlockType] = {
        isAvailable: isEnabled,
        requiredModule: moduleId as keyof ModulesSettings,
        requiredModuleName: moduleConfig?.name ?? moduleId,
      };
    }
    
    return result as Record<ContentBlockType, BlockModuleStatus>;
  }, [modules]);
}

/**
 * Get the list of all block types that depend on a specific module.
 */
export function getBlocksForModule(moduleId: keyof ModulesSettings): ContentBlockType[] {
  return Object.entries(BLOCK_TO_MODULE)
    .filter(([_, mod]) => mod === moduleId)
    .map(([block]) => block as ContentBlockType);
}
