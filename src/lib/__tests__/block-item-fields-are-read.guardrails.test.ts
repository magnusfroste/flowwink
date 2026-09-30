import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * Every card field the block registry advertises must be read by the block's
 * renderer. The registry is what describe_blocks tells an agent; the renderer
 * is what a visitor sees. article-grid advertised { link, description } while
 * ArticleGridBlock read { url, excerpt } — every grid an agent built had dead
 * cards and no teaser, and inspect_rendered_page said "all fields read" because
 * it checks the block's top-level fields only (MJP demo, 2026-09-28).
 *
 * Discovers, does not enumerate: every block with itemFields is checked.
 */

const root = join(__dirname, '../../..');
const rendererPath = (type: string) =>
  join(root, 'src/components/public/blocks', type.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('') + 'Block.tsx');
const readsField = (src: string, name: string) => new RegExp(`[.\\[\\'"]${name}\\b|\\b${name}\\s*[,}:]`).test(src);

type Field = { name: string; itemFields?: { name: string }[] };
type Entry = { type: string; fields?: Field[] };

describe('advertised card fields are read by the renderer', () => {
  const withItems = (BLOCK_REFERENCE as unknown as Entry[]).flatMap((b) =>
    (b.fields ?? []).filter((f) => f.itemFields?.length).map((f) => ({ type: b.type, field: f })));

  it('scans the registry, not a list', () => {
    expect(withItems.length).toBeGreaterThan(5);
  });

  it('every itemField name appears in the renderer', () => {
    const unread: string[] = [];
    for (const { type, field } of withItems) {
      const path = rendererPath(type);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, 'utf8');
      for (const item of field.itemFields ?? []) if (!readsField(src, item.name)) unread.push(`${type}.${field.name}[].${item.name}`);
    }
    expect(unread, 'the registry advertises card fields the renderer never reads').toEqual([]);
  });

  it('the detector fires on the shape it exists for', () => {
    expect(readsField('href={article.url}', 'link')).toBe(false);
    expect(readsField('const href = article.url ?? article.link;', 'link')).toBe(true);
  });
});
