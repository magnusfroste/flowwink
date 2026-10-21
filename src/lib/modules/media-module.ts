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
    description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, clearing library, importing an image or short video from an external URL (action=import_from_url) and uploading one you were handed, base64 (action=upload) — both store a web-sized copy and return it as url. Use when: finding an uploaded image; managing media assets; cleaning up unused files; sideloading an externally hosted image so the site stops hotlinking it. NOT for: uploading local file bytes (no base64 lane); updating site branding logo (site_branding_update).',
    category: 'content',
    handler: 'module:media',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'media_browse',
        description: 'Browse, search, and manage media files in the media library. Supports listing, getting URLs, deleting files, clearing library, importing an image or short video from an external URL (action=import_from_url) and uploading one you were handed, base64 (action=upload) — both store a web-sized copy and return it as url. Use when: finding an uploaded image; managing media assets; cleaning up unused files; sideloading an externally hosted image so the site stops hotlinking it. NOT for: uploading local file bytes (no base64 lane); updating site branding logo (site_branding_update).',
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
                'import_from_url',
                'upload',
              ],
            },
            folder: {
              type: 'string',
              description: 'Folder to browse (pages, imports, templates, uploads, blog)',
            },
            limit: { type: 'number', description: 'Files per folder per page (default 100, max 1000). The response says `truncated` when a folder had more.' },
            offset: { type: 'number', description: 'Page offset per folder; page until `truncated` is false.' },
            search: {
              type: 'string',
              description: 'Search by filename',
            },
            file_path: {
              type: 'string',
              description: 'File path for delete/get_url',
            },
            url: {
              type: 'string',
              description: 'For import_from_url: http(s) URL of the image — or a short mp4/webm video (logo animation, hero loop; up to 8 MB, stored as is) — to sideload (fetched server-side). An image larger than a page needs (> 1600 px wide or > 400 KB) → a web-sized copy is made and returned as `url`; above 16 megapixels or 15 MB → refused with resize advice.',
            },
            filename: {
              type: 'string',
              description: 'For import_from_url: target filename (defaults to the URL basename, sanitized). Same name overwrites — stable URLs on re-import.',
            },
            optimize: {
              type: 'boolean',
              description: 'For import_from_url / upload: false keeps the original as `url` (default true: `url` is the web-sized copy, `original_url` the full file).',
            },
            content_base64: {
              type: 'string',
              description: 'For upload: the file itself, base64-encoded (an image, or an mp4/webm up to 8 MB). Same road as import_from_url after that: web-sized copy as `url`, refusal above 16 megapixels with resize advice.',
            },
            mime_type: {
              type: 'string',
              description: 'For upload: the file\'s MIME type (image/png, image/jpeg, image/webp, video/mp4, video/webm).',
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
- **action**: Required. list, get_url, delete, clear_all, import_from_url, upload.
- **folder**: Folder filter: pages, imports, templates, uploads, blog. For import_from_url it is the TARGET folder (default imports).
- **search**: Search by filename.
- **file_path**: For delete/get_url — the storage path a list/import/upload answer returns as "path" (folder/name, no bucket, no URL); "path" is accepted as an alias of file_path.
- **url** + optional **filename**: For import_from_url. The image is fetched server-side and stored in cms-images; the result carries the permanent public url — rewrite page blocks/branding to it so nothing keeps hotlinking the source.
- **content_base64** + **filename** + **mime_type**: For upload — the file you were HANDED (a brand texture, a logo animation) rather than a URL. Same plan as import_from_url after that. Use it when the file is not on a public URL; never paste a file into custom_scripts or a data: URL in a block.
- **optimize** (default true): the answer's \`url\` is a WEB-SIZED copy when the source is bigger than a page needs (> 1600 px wide or > 400 KB): ≤ 1600 px, PNG when the source has transparency, JPEG otherwise. \`original_url\` is the full file. Put \`url\` in blocks — that is what visitors download on every page view. \`optimize: false\` returns the original as \`url\`.
### Edge cases
- clear_all is DESTRUCTIVE. Requires confirmation.
- get_url returns a signed URL for temporary access.
- import_from_url refuses non-image content-types, files over 15 MB and images over 16 megapixels (an 8014×4500 texture is 36 Mpx — no screen is that wide; resize to ≤ 1600 px before importing). Same filename overwrites (idempotent re-import).
- A page-wide background texture is not a content image: it goes on a hero (backgroundType "image") or a section-divider, never into custom_scripts as CSS.`,
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
