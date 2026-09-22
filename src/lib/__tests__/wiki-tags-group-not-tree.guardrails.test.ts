import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inlineTags } from '@/lib/wiki-tags';

/**
 * The wiki groups by tag (a label), not by tree (a folder). Peter asked for a
 * "hierarchy" (optic, 2026-09-22) while all 37 pages sat at the root with the
 * grouping done by hand in the titles — a title prefix no code can read. The
 * tree stays for agents; the left column, the tag skill and the search filter
 * read all_tags, and all_tags is the database's — the field plus every #tag
 * written in the body — so no writer can drift from the text.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

describe('what a page bears is computed by the database', () => {
  it('all_tags is generated from the field and the body, and every reader reads it', () => {
    expect(migrations).toMatch(/all_tags text\[\]\s+GENERATED ALWAYS AS \(public\.wiki_normalize_tags\(tags \|\| public\.wiki_inline_tags\(content_md\)\)\) STORED/);
    expect(migrations).toMatch(/unnest\(all_tags\) AS tag GROUP BY tag/); // wiki_tags()
    expect(read('src/hooks/useWiki.ts')).toMatch(/all_tags, updated_at, updated_by, created_at/);
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/q\.contains\('all_tags', \[tagFilter\]\)/);
    expect(edge).not.toMatch(/\.contains\('tags',/);
  });

  it('the field is normalised on every write, not on a chosen path', () => {
    expect(migrations).toMatch(/CREATE TRIGGER wiki_pages_normalize_tags\s+BEFORE INSERT OR UPDATE ON public\.wiki_pages/);
  });

  it('the browser and the database agree on what a #tag in the text is', () => {
    // The SQL rule, as written in the migration; the TS mirror runs on the same fixtures.
    expect(migrations).toMatch(/'\(\?:\^\|\[\[:space:\]\(\]\)#\(\[\[:alpha:\]\]\[\[:alnum:\]_-\]\*\)'/);
    expect(migrations).toMatch(/m\[1\] !~\* '\^\[0-9a-f\]\{3\}\(\[0-9a-f\]\{3\}\)\?\$'/);
    // The proof in the migration asserts these exact fixtures against the SQL:
    expect(inlineTags('# Rubriken är ingen etikett\n\nText om färgen #fff och sida.html#avsnitt.\n\n#Sälj #tisdagsmöte-v38 (#möte)'))
      .toEqual(['möte', 'sälj', 'tisdagsmöte-v38']);
    expect(migrations).toMatch(/IF v_tags <> ARRAY\['möte', 'produkt', 'sälj', 'tisdagsmöte-v38'\]/);
  });
});

describe('the left column is grouped, not a tree', () => {
  it('WikiPage renders WikiGroups; the tree component is gone', () => {
    const page = read('src/pages/admin/WikiPage.tsx');
    expect(page).toMatch(/<WikiGroups pages=\{pages\} activeSlug=\{slug\} \/>/);
    expect(page).not.toMatch(/WikiTree/);
    expect(() => read('src/components/admin/wiki/WikiTree.tsx')).toThrow();
  });

  it('groups are always open — no expander to hit', () => {
    const groups = read('src/components/admin/wiki/WikiGroups.tsx');
    expect(groups).not.toMatch(/ChevronRight|Collapse|Expand/);
    expect(groups).toMatch(/groupByTag\(pages, only\)/);
  });

  it('a #tag written in the body shows as such and is not removable through the field', () => {
    const editor = read('src/components/admin/wiki/WikiTagEditor.tsx');
    expect(editor).toMatch(/Written in the page — edit the text to remove it/);
    expect(editor).toMatch(/const bodyOnly = allTags\.filter\(\(t\) => !fieldSet\.has\(t\)\)/);
  });
});

describe('both surfaces', () => {
  it('the skills declare tags, the tag filter and wiki_tags, with names the code reads', () => {
    type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    const page = skills.find((s) => s.name === 'manage_wiki_page')!;
    for (const p of ['tags', 'add_tags', 'tag']) expect(Object.keys(page.tool_definition.function.parameters.properties), p).toContain(p);
    expect(Object.keys(skills.find((s) => s.name === 'search_wiki')!.tool_definition.function.parameters.properties)).toContain('tag');
    expect(skills.find((s) => s.name === 'wiki_tags')?.handler).toBe('rpc:wiki_tags');
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/Array\.isArray\(args\.tags\)/);
    expect(edge).toMatch(/Array\.isArray\(args\.add_tags\)/);
  });
});
