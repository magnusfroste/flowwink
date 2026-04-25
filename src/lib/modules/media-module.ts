import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  MediaModuleInput,
  MediaModuleOutput,
  mediaModuleInputSchema,
  mediaModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const MEDIA_SKILLS: SkillSeed[] = [
  {
    name: 'media_browse',
    description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, and clearing library. Use when: finding an uploaded image; managing media assets; cleaning up unused files. NOT for: uploading new files (N/A); updating site branding logo (site_branding_update).',
    category: 'content',
    handler: 'module:media',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'media_browse',
        description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, and clearing library. Use when: finding an uploaded image; managing media assets; cleaning up unused files. NOT for: uploading new files (N/A); updating site branding logo (site_branding_update).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get_url',
                'delete',
                'clear_all',
              ],
            },
            folder: {
              type: 'string',
              description: 'Folder to browse (pages, imports, templates, uploads, blog)',
            },
            search: {
              type: 'string',
              description: 'Search by filename',
            },
            file_path: {
              type: 'string',
              description: 'File path for delete/get_url',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## media_browse
### What
Browse, search, and manage files in the media library.
### When to use
- Admin asks about uploaded images or files
- Need to find a specific media file URL
- Cleanup: delete unused media
### Parameters
- **action**: Required. list, get_url, delete, clear_all.
- **folder**: Folder filter: pages, imports, templates, uploads, blog.
- **search**: Search by filename.
- **file_path**: For delete/get_url.
### Edge cases
- clear_all is DESTRUCTIVE. Requires confirmation.
- get_url returns a signed URL for temporary access.`,
  },
];

export const mediaModule = defineModule<MediaModuleInput, MediaModuleOutput>({
  id: 'mediaLibrary',
  name: 'Media Library',
  version: '1.0.0',
  description: 'Manage media assets and files',
  capabilities: ['data:read', 'data:write'],
  inputSchema: mediaModuleInputSchema,
  outputSchema: mediaModuleOutputSchema,

  skills: [
    'media_browse',
  ],
  skillSeeds: MEDIA_SKILLS,

  webhookEvents: [
    { event: 'media.uploaded', description: 'A file was uploaded' },
    { event: 'media.deleted', description: 'A file was deleted' },
  ],

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
});
