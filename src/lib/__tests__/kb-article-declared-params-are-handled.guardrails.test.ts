import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every parameter manage_kb_article declares must reach something real.
 *
 * Two lies lived side by side (found building the MJP demo, 2026-09-28):
 * - the schema said `slug` "names the NEW article on create"; create ignored it
 *   and derived the slug from the title, so an agent's cross-links were dead;
 * - update passed its leftover arguments straight to PostgREST as columns, so
 *   the declared `publish` and `category` crashed with "Could not find the
 *   'publish' column".
 *
 * Two layers. The scan discovers rather than enumerates: it reads the declared
 * properties from the skill seed and requires each one to be read by name in
 * the handler or be a real kb_articles column (the update pass-through), so a
 * parameter added tomorrow that reaches nothing fails without being listed.
 * The scan is coarse — both bugs above named the parameter SOMEWHERE in the
 * handler, just not in the action that needed it — so the third test pins the
 * two fixes by shape.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const seed = read('src/lib/modules/kb-module.ts');
const tool = seed.slice(seed.indexOf("name: 'manage_kb_article'"));
const props = tool.slice(tool.indexOf('properties: {'), tool.indexOf('required: ['));
const declared = [...props.matchAll(/^ {12}(\w+): \{/gm)].map((m) => m[1]);

const fn = read('supabase/functions/agent-execute/index.ts');
const start = fn.indexOf('async function executeKbAction(');
const handler = fn.slice(start, fn.indexOf('\nasync function ', start + 10));

const types = read('src/integrations/supabase/types.ts');
const kbRow = types.slice(types.indexOf('      kb_articles: {'));
const rowBlock = kbRow.slice(kbRow.indexOf('Row: {'), kbRow.indexOf('}', kbRow.indexOf('Row: {')));
const columns = new Set([...rowBlock.matchAll(/^ {10}(\w+):/gm)].map((m) => m[1]));

const readsByName = (name: string) =>
  new RegExp(`[{,]\\s*${name}\\b[^:]|\\bargs as any\\)\\.${name}\\b|\\b${name}\\s*=`).test(handler);

describe('manage_kb_article: declared parameters are handled', () => {
  it('the scanner sees the schema, the handler and the table', () => {
    expect(declared).toEqual(expect.arrayContaining(['action', 'slug', 'publish', 'category', 'new_slug']));
    expect(columns.has('is_published')).toBe(true);
    expect(columns.has('publish')).toBe(false);
    // Negative test: a declared param that is neither read nor a column fails.
    expect(readsByName('frobnicate') || columns.has('frobnicate')).toBe(false);
  });

  it('every declared parameter is read by name or is a real column', () => {
    const unhandled = declared.filter((p) => !readsByName(p) && !columns.has(p));
    expect(unhandled, 'declared in the schema, but reaches nothing').toEqual([]);
  });

  it('create keeps a requested slug; update maps publish and category', () => {
    expect(handler).toMatch(/slug: slugArg \} = args as any;/);
    expect(handler).toMatch(/const requestedSlug = kbSlugify\(slugArg\)/);
    expect(handler).toMatch(/updateData\.is_published = publish/);
    expect(handler).toMatch(/updateData\.category_id = await resolveKbCategoryId/);
  });
});
