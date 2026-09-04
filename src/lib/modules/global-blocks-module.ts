import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
import {
  GlobalBlockModuleInput,
  GlobalBlockModuleOutput,
  globalBlockModuleInputSchema,
  globalBlockModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions ──
// Historically seeded via migration only; inlined here 2026-07-07 so the module
// owns its skill surface (matches the live row incl. the category extension
// from migration 20260704150500 — keep the two in sync).
// manage_global_blocks moved to the Pages module (PAGES_SKILLS) on 2026-09-05:
// this module is "merged into Pages — kept for backward compatibility" and
// enabled: false by default, so the skill was never bootstrapped on a fresh
// install and no agent could touch the header or footer (new liteit). The
// handler string is unchanged; only the seeding home moved.
const GLOBAL_BLOCK_SKILLS: SkillSeed[] = [];

export const globalBlocksModule = defineModule<GlobalBlockModuleInput, GlobalBlockModuleOutput>({
  id: 'globalElements',
  name: 'Global Blocks',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L3',
  description: 'Create reusable global content blocks (header, footer, etc.)',
  capabilities: ['content:receive', 'data:write'],
  tier: 'core',
  inputSchema: globalBlockModuleInputSchema,
  outputSchema: globalBlockModuleOutputSchema,

  skills: ['manage_global_blocks'],
  skillSeeds: GLOBAL_BLOCK_SKILLS,

  async publish(input: GlobalBlockModuleInput): Promise<GlobalBlockModuleOutput> {
    try {
      const validated = globalBlockModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('global_blocks')
        .insert({
          slot: validated.slot,
          type: validated.type,
          data: validated.data as Json,
          is_active: validated.is_active,
          category: validated.category ?? null,
        })
        .select('id, slot, type')
        .single();

      if (error) {
        logger.error('[GlobalBlocksModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, slot: data.slot, type: data.type };
    } catch (error) {
      logger.error('[GlobalBlocksModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
