import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  ModuleDefinition,
  MediaModuleInput,
  MediaModuleOutput,
  mediaModuleInputSchema,
  mediaModuleOutputSchema,
} from '@/types/module-contracts';

export const mediaModule: ModuleDefinition<MediaModuleInput, MediaModuleOutput> = {
  id: 'media',
  name: 'Media Library',
  version: '1.0.0',
  description: 'Manage media assets and files',
  capabilities: ['data:read', 'data:write'],
  inputSchema: mediaModuleInputSchema,
  outputSchema: mediaModuleOutputSchema,

  async publish(input: MediaModuleInput): Promise<MediaModuleOutput> {
    try {
      const validated = mediaModuleInputSchema.parse(input);
      const { data: urlData } = supabase.storage.from('cms-images').getPublicUrl(validated.file_path);

      return { success: true, path: validated.file_path, public_url: urlData.publicUrl };
    } catch (error) {
      logger.error('[MediaModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
