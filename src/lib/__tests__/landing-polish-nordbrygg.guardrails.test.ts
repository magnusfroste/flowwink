/**
 * Three render gaps found polishing nordbrygg's landing page (2026-10-25):
 * a fifth timeline step alone on its own row, a quote written with the
 * contract's legacy `quote` field rendering an empty frame, and a hardcoded
 * English "Read more" under every blog card on a Swedish page.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { horizontalGridClass } from '@/lib/timeline-columns';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('timeline: desktop columns follow the step count', () => {
  it.each([[3, 'lg:grid-cols-3'], [4, 'lg:grid-cols-4'], [5, 'lg:grid-cols-5'], [6, 'lg:grid-cols-3'], [9, 'lg:grid-cols-4']])(
    '%i steps → %s', (n, cls) => {
      expect(horizontalGridClass(n)).toContain(cls);
      expect(horizontalGridClass(n)).toContain('grid-cols-2');
    },
  );

  it('the horizontal variant gets a wider container than the vertical list', () => {
    expect(read('src/components/public/blocks/TimelineBlock.tsx')).toMatch(/variant === 'horizontal' \? 'max-w-6xl mx-auto' : 'max-w-4xl mx-auto'/);
  });
});

describe('quote: the legacy field the contract accepts is rendered', () => {
  it('the renderer falls back to data.quote', () => {
    expect(read('src/components/public/blocks/QuoteBlock.tsx')).toContain('{data.text || data.quote}');
  });
});

describe('latest posts: "Read more" is visitor text, not code English', () => {
  it('goes through the ui_text rail with a catalogue key', () => {
    const src = read('src/components/public/blocks/LatestPostsBlock.tsx');
    expect(src).toContain("t('blog.readMore', 'Read more')");
    expect(src).not.toMatch(/>\s*Read more\s*</);
    expect(read('src/data/ui-text-catalog.json')).toContain('"blog.readMore"');
  });
});
