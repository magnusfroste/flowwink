import { describe, expect, it } from 'vitest';
import { normalizeBlocks } from '../../../supabase/functions/_shared/normalize-blocks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A block that fails validation must FAIL LOUDLY with a reason — never vanish
 * from a page that then saves "successfully" (#98 litmus test, 2026-08-17: a
 * stats block sent with `items` instead of `stats` was dropped without a word,
 * and manage_page update ignored an unknown content_json arg the same way).
 */
describe('silent block drops are banned', () => {
  it('normalizeBlocks returns the reason for every dropped block', () => {
    const blocks = [
      { id: 'ok', type: 'hero', data: { title: 'T' } },
      { id: 'bad', type: 'stats', data: { items: [{ value: '1', label: 'x' }] } },
    ];
    const dropped = normalizeBlocks(blocks);
    expect(blocks.length).toBe(1);
    expect(dropped.length).toBe(1);
    // The reason names the block, the field, and the likely fix.
    expect(dropped[0]).toContain('stats');
    expect(dropped[0]).toContain('"items"');
  });

  it('a valid page returns zero reasons', () => {
    const blocks = [{ id: 'ok', type: 'stats', data: { stats: [{ value: '1', label: 'x' }] } }];
    expect(normalizeBlocks(blocks)).toEqual([]);
    expect(blocks.length).toBe(1);
  });

  it('manage_page create refuses (does not save) when blocks are dropped', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf-8');
    // "if (action === 'create')" appears in ~20 skills — anchor on the one
    // line unique to manage_page create's write path instead.
    const create = src.slice(src.indexOf('const pageBlocks = blocks || [];'), src.indexOf("if (action === 'update' && page_id)"));
    expect(create).toContain('normalizeBlocks');
    expect(create).toMatch(/dropped.*throw|throw[\s\S]{0,200}dropped/i); // loud refusal, same as update
    expect(create).toContain('nothing was written');
  });

  it('manage_page update refuses (does not save) when blocks are dropped, and takes content_json as alias', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf-8');
    const upd = src.slice(src.indexOf("if (action === 'update' && page_id)"), src.indexOf("if (action === 'publish' && page_id)"));
    expect(upd).toContain('content_json');           // alias accepted
    expect(upd).toMatch(/dropped.*throw|throw[\s\S]{0,200}dropped/i); // loud refusal
    expect(upd).toContain('nothing was written');
  });
});
