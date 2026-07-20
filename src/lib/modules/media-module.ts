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
  {
    name: 'media_set_alt_text',
    description: 'Set or update the accessibility alt text for a media asset in the library. Use when: an image needs alt text for screen readers or SEO; auditing accessibility. NOT for: renaming files, editing image content.',
    category: 'content',
    handler: 'rpc:set_media_alt_text',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'media_set_alt_text',
        description: 'Set/update alt text on a media asset (accessibility + SEO).',
        parameters: {
          type: 'object',
          properties: {
            p_storage_path: { type: 'string', description: 'Storage path (e.g. "pages/1720000000-hero.webp")' },
            p_alt_text: { type: 'string', description: 'Human-readable description of the image' },
            p_bucket: { type: 'string', description: 'Storage bucket (default cms-images)' },
          },
          required: ['p_storage_path', 'p_alt_text'],
        },
      },
    },
    instructions: `## media_set_alt_text
Update or set the alt text for one media asset. Lazy-creates a media_assets row if one does not yet exist for the file.
Params exactly match the RPC: p_storage_path, p_alt_text, and optional p_bucket.`,
  },
  {
    name: 'media_find_usage',
    description: 'Find where a media asset is referenced across pages, blog posts, KB articles, and products. Use when: checking whether an image is safe to delete; auditing what uses a file. NOT for: full-text content search (use the content search skills).',
    category: 'content',
    handler: 'rpc:find_media_usage',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'media_find_usage',
        description: 'List pages/blog posts/KB articles/products that reference a media URL or filename.',
        parameters: {
          type: 'object',
          properties: {
            p_needle: { type: 'string', description: 'Substring to search for — typically the filename or a URL fragment.' },
          },
          required: ['p_needle'],
        },
      },
    },
    instructions: `## media_find_usage
Returns rows of {source_type, source_id, title, slug}. Empty result = not referenced. Pass a distinctive substring (the filename works well).`,
  },
  {
    name: 'media_optimize',
    description: 'Generate optimized image variants (thumbnail + web size) for a media asset. Use when: an uploaded image lacks thumbnails; preparing images for fast page loads. NOT for: cropping (use the image editor).',
    category: 'content',
    handler: 'edge:media-optimize',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'media_optimize',
        description: 'Server-side resize: generates thumbnail (256px) and web (1280px) JPEG variants and stores them under <folder>/variants/.',
        parameters: {
          type: 'object',
          properties: {
            storage_path: { type: 'string', description: 'Storage path of the original image.' },
            bucket: { type: 'string', description: 'Storage bucket (default cms-images).' },
          },
          required: ['storage_path'],
        },
      },
    },
    instructions: `## media_optimize
Downloads the original, decodes with ImageScript, uploads JPEG variants, and updates media_assets.variants. Skips the web variant if the original is smaller.`,
  },

  {
    name: 'search_unsplash',
    description: 'Search Unsplash for royalty-free stock photos. Use when: finding a hero/blog image by keyword. NOT for: fetching a known image URL (fetch_image_base64); the media library (manage_media).',
    category: 'content',
    handler: 'internal:search_unsplash',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'search_unsplash',
        parameters: {
          type: 'object',
          required: ["query"],
          properties: {
            query: { type: 'string', description: 'Search keywords' },
            page: { type: 'number', description: 'Page (default 1)' },
            perPage: { type: 'number', description: 'Results per page (default 20)' },
          },
        },
      },
    },
  },
  {
    name: 'fetch_image_base64',
    description: 'Download an image by URL and return it as base64 (used when exporting a site template so remote images are inlined). Use when: bundling external images. NOT for: searching stock photos (search_unsplash).',
    category: 'content',
    handler: 'internal:fetch_image_base64',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'fetch_image_base64',
        parameters: {
          type: 'object',
          required: ["imageUrl"],
          properties: {
            imageUrl: { type: 'string', description: 'Image URL to fetch' },
          },
        },
      },
    },
  },
];

export const mediaModule = defineModule<MediaModuleInput, MediaModuleOutput>({
  id: 'mediaLibrary',
  name: 'Media Library',
  version: '1.0.0',
  processes: ['content-to-conversion'],
  maturity: 'L2',
  description: 'Manage media assets and files',
  capabilities: ['data:read', 'data:write'],
  tier: 'core',
  inputSchema: mediaModuleInputSchema,
  outputSchema: mediaModuleOutputSchema,

  skills: [
    'media_browse',
    'media_set_alt_text',
    'media_find_usage',
    'media_optimize',
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
