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
const GLOBAL_BLOCK_SKILLS: SkillSeed[] = [
  {
    name: 'manage_global_blocks',
    description:
      'Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global block. NOT for: managing page-specific blocks (manage_page_blocks); updating site branding (site_branding_update).',
    category: 'content',
    handler: 'module:globalElements',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_global_blocks',
        description:
          'Manage global blocks (header, footer, etc): list, get, update, toggle active status. Use when: changing header/footer content; reviewing active global elements; toggling visibility of a global block. NOT for: managing page-specific blocks (manage_page_blocks); updating site branding (site_branding_update).',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'get', 'update', 'toggle'] },
            slot: { type: 'string', description: 'Slot name (header, footer, etc.)' },
            block_data: { type: 'object', description: 'Block data for update' },
            category: {
              type: 'string',
              description:
                'Free-text category label for organizing global blocks. With action=update: sets the block category. With action=list: filters results to this category.',
            },
          },
          required: ['action'],
        },
      },
    },
    instructions: `## manage_global_blocks
### What
Manages global blocks (header, footer, announcement bar, etc.): list, get, update, toggle.
### When to use
- Admin asks to change header, footer, or site-wide elements
- Branding updates that affect global layout
### Parameters
- **action**: Required. list, get, update, toggle.
- **slot**: Slot name: header, footer, announcement, etc.
- **block_data**: Block configuration object for update.
### Edge cases
- Toggle enables/disables a global block without deleting it.
- Changes affect ALL pages immediately.`,
  },
];

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
