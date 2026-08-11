import { describe, it, expect } from 'vitest';
import { buildDefaultOverwriteOptions } from '@/components/admin/templates/TemplatePreviewDialog';
import { flowwinkPlatformTemplate } from '@/data/templates/flowwink-platform';
import { BLANK_TEMPLATE } from '@/data/templates/blank';

/**
 * Reinstall must offer the content the template ships.
 *
 * Found live on www.flowwink.com (2026-08-12): reinstalling flowwink-platform
 * produced 0 blog posts and 0 KB articles even though the template carries 15
 * posts + 18 KB categories — the overwrite dialog HARDCODED blogPosts/
 * kbContent to false, a leftover of the June era that conflated branded
 * template content with per-module demo data. The first-install path (no
 * dialog) derived the flags from the template; the reinstall path silently
 * dropped them. Same template, different content, depending on which door you
 * walked through.
 *
 * The rule these tests lock: defaults DERIVE from what the template ships —
 * branded content on when present, absent rows stay off.
 */

describe('template overwrite defaults derive from template content', () => {
  it('enables blog + KB for the platform template (which ships them)', () => {
    const opts = buildDefaultOverwriteOptions(flowwinkPlatformTemplate, 0);
    expect(opts.blogPosts).toBe(true);
    expect(opts.kbContent).toBe(true);
    expect(opts.publishBlogPosts).toBe(true);
    expect(opts.publishKbArticles).toBe(true);
    expect(opts.modules).toBe(true);
  });

  it('keeps content flags off for the blank template (which ships none)', () => {
    const opts = buildDefaultOverwriteOptions(BLANK_TEMPLATE, 0);
    expect(opts.blogPosts).toBe(false);
    expect(opts.kbContent).toBe(false);
    expect(opts.products).toBe(false);
    expect(opts.consultants).toBe(false);
  });

  it('never defaults destructive extras on', () => {
    const opts = buildDefaultOverwriteOptions(flowwinkPlatformTemplate, 3);
    expect(opts.clearMedia).toBe(false);
    expect(opts.resetObjectives).toBe(false);
    expect(opts.downloadImages).toBe(true); // images exist → download them
  });
});
