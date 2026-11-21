import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyBodyEdits, readBodyEdits, MAX_BODY_EDITS } from '../../../supabase/functions/_shared/wiki/body-edits';
import { PLATFORM_SKILLS } from '../platform-seeds';
import { wikiModule } from '../modules/wiki-module';

/**
 * Guardrail: a phrase can be found everywhere it stands, and changed where it
 * stands.
 *
 * Optic, 2026-11-19 and 11-20. A product was renamed. The agent doing the
 * rename asked the skill search three times for a full-text search across the
 * site's content and was offered none; the blog search matched titles only and
 * its `query` was read by nobody (so it answered every post there is); eight
 * words describing a product found no wiki page while two of them found it;
 * and to change a few phrases in a 98 KB wiki page the page was written again
 * in four calls of 25 KB, three times.
 *
 * Four things, each pinned here:
 *  1. manage_wiki_page update takes `replace: [{ find, with }]`;
 *  2. search_wiki's partial match can actually run, and says it is partial;
 *  3. browse_blog reads `query` as `search`, over title and excerpt;
 *  4. find_in_content: one exhaustive, literal read across all content.
 */

const ROOT = resolve(__dirname, '../../..');
const core = readFileSync(join(ROOT, 'supabase/functions/_shared/execute/core.ts'), 'utf8');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const migration = readFileSync(
  join(MIGRATIONS, readdirSync(MIGRATIONS).find((f) => f.endsWith('_find-in-content.sql'))!),
  'utf8',
);

/** The outcome read loosely: a test asks for the side it expects and fails on the other. */
type Loose = { ok: boolean; body?: string; applied?: Array<{ find: string; replaced: number }>; error?: string; failed?: Array<{ index: number; find: string; occurrences: number; reason: string; near?: string }> };
const edit = (body: string, edits: Parameters<typeof applyBodyEdits>[1]): Loose => applyBodyEdits(body, edits) as Loose;

const PAGE = '# Colocation\n\nEdge Colocation is our product.\n\nOrder Edge Colocation today.\n\nUntouched.';

describe('changing part of a text without sending the text', () => {
  it('changes exactly what was named and nothing else', () => {
    const out = edit(PAGE, [{ find: 'Order Edge Colocation today.', with: 'Ask us about it.' }]);
    expect(out.body).toBe('# Colocation\n\nEdge Colocation is our product.\n\nAsk us about it.\n\nUntouched.');
    expect(out.applied).toEqual([{ find: 'Order Edge Colocation today.', replaced: 1 }]);
  });

  it('a phrase that stands twice is refused unless every occurrence is meant', () => {
    const once = edit(PAGE, [{ find: 'Edge Colocation', with: 'Server Colocation' }]);
    expect(once.ok).toBe(false);
    expect(once.failed).toEqual([{ index: 0, find: 'Edge Colocation', occurrences: 2, reason: 'ambiguous' }]);
    const all = edit(PAGE, [{ find: 'Edge Colocation', with: 'Server Colocation', all: true }]);
    expect(all.applied[0].replaced).toBe(2);
    expect(all.body.includes('Edge')).toBe(false);
  });

  it('text that is not there is refused, and says what is nearly there', () => {
    const cased = edit(PAGE, [{ find: 'edge colocation is our product', with: 'x' }]);
    expect(cased.failed[0]).toMatchObject({ reason: 'not_found', near: 'other_case' });
    const spaced = edit(PAGE, [{ find: 'product. Order Edge', with: 'x' }]);
    expect(spaced.failed[0]).toMatchObject({ reason: 'not_found', near: 'other_whitespace' });
    const absent = edit(PAGE, [{ find: 'Dark fibre', with: 'x' }]);
    expect(absent.failed[0].near).toBeUndefined();
  });

  it('all or nothing: one edit that cannot apply and none is', () => {
    const out = edit(PAGE, [
      { find: 'Untouched.', with: 'Touched.' },
      { find: 'Not in the page', with: 'x' },
    ]);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/^Nothing was changed/);
  });

  it('edits apply in order, each to the result of the one before', () => {
    const out = edit('a b', [{ find: 'a', with: 'c' }, { find: 'c b', with: 'done' }]);
    expect(out.body).toBe('done');
  });

  it('an empty `with` removes the text; an emptied page is refused', () => {
    const cut = edit(PAGE, [{ find: '\n\nUntouched.', with: '' }]);
    expect(cut.body.endsWith('today.')).toBe(true);
    expect(edit('only', [{ find: 'only', with: '' }]).ok).toBe(false);
  });

  it('a replacement is taken literally — no pattern in find, no $ expansion in with', () => {
    const out = edit('price: 100 (a.b)', [{ find: '(a.b)', with: '$& $1' }]);
    expect(out.body).toBe('price: 100 $& $1');
  });

  it('reads one bare edit as a list of one, and the names a model reaches for', () => {
    expect(readBodyEdits({ find: 'a', with: 'b' })).toEqual([{ find: 'a', with: 'b', all: false }]);
    expect(readBodyEdits([{ find: 'a', replace: 'b', all: true }])).toEqual([{ find: 'a', with: 'b', all: true }]);
    expect(readBodyEdits(undefined)).toBeNull();
    expect(readBodyEdits([])).toBeNull();
    const malformed = edit(PAGE, readBodyEdits([{ find: 'Untouched.' }])!);
    expect(malformed.failed[0].reason).toBe('malformed');
  });

  it('caps the edits of one call', () => {
    const many = Array.from({ length: MAX_BODY_EDITS + 1 }, () => ({ find: 'a', with: 'b' }));
    expect(edit('a', many).ok).toBe(false);
  });
});

describe('the wiki skill carries it', () => {
  const seed = wikiModule.skillSeeds!.find((s) => s.name === 'manage_wiki_page')!;
  const params = (seed.tool_definition as { function: { parameters: { properties: Record<string, { items?: { required?: string[] } }> } } }).function.parameters.properties;

  it('the schema declares replace with find and with', () => {
    expect(params.replace?.items?.required).toEqual(['find', 'with']);
  });

  it('the description and the instructions say when to use it', () => {
    expect(seed.description).toMatch(/replace \(\[\{ find, with \}\]/);
    expect(seed.instructions).toMatch(/\*\*`replace`\*\*/);
  });

  it('the handler reads the stored body, applies the edits and writes once', () => {
    expect(core).toMatch(/const edits = readBodyEdits\(\(args as any\)\.replace\);/);
    expect(core).toMatch(/const outcome = applyBodyEdits\(body, edits\);/);
    // A refused edit is the caller's text — never a fault in the skill.
    expect(core).toMatch(/code: 'INVALID_INPUT', retryable: true, hint: outcome\.hint, failed_edits: outcome\.failed/);
  });
});

describe('the searches say what they searched', () => {
  it('search_wiki asks for ANY term when no page bears them all', () => {
    // The partial ranking used to rank the AND query's rows: always none.
    expect(core).toMatch(/const any = await q\.or\(anyTerm\)/);
    expect(core).toMatch(/match: 'some_terms'/);
    expect(core).toMatch(/match: 'all_terms'/);
  });

  it('search_wiki shows the text around the hit, not the page\'s opening', () => {
    expect(core).toMatch(/excerpt: excerptAt\(String\(p\.content_md \|\| ''\)\)/);
    expect(core).not.toMatch(/excerpt: String\(p\.content_md \|\| ''\)\.slice\(0, 240\)/);
  });

  it('browse_blog reads the search aliases, over title and excerpt', () => {
    const start = core.indexOf("if (skillName === 'browse_blog')");
    const block = core.slice(start, start + 2200);
    expect(block).toMatch(/SEARCH_ALIASES\.map/);
    expect(block).toMatch(/searchOrFilter\(\['title', 'excerpt'\], search\)/);
    // The filter the title-only search used.
    expect(block).not.toMatch(/\.ilike\('title'/);
  });
});

describe('find_in_content', () => {
  const seed = PLATFORM_SKILLS.find((s) => s.name === 'find_in_content')!;
  const fn = (seed.tool_definition as { function: { parameters: { properties: Record<string, { items?: { enum?: string[] } }>; required: string[] } } }).function.parameters;

  it('is a platform skill, a read, answered by the database function', () => {
    expect(seed.handler).toBe('rpc:find_in_content');
    expect(seed.description).toMatch(/Use when:/);
    expect(seed.description).toMatch(/NOT for:/);
    expect(seed.description.length).toBeLessThan(2000);
  });

  it('the declared parameters are the function\'s, name for name', () => {
    const sig = migration.match(/CREATE OR REPLACE FUNCTION public\.find_in_content\(([\s\S]*?)\)\s*RETURNS jsonb/)![1];
    const sqlParams = [...sig.matchAll(/\b(p_[a-z_]+)\b/g)].map((m) => m[1]);
    expect(Object.keys(fn.properties).sort()).toEqual([...sqlParams].sort());
    expect(fn.required).toEqual(['p_text']);
  });

  it('the sources it offers are the sources it searches', () => {
    const all = migration.match(/v_all\s+text\[\] := ARRAY\[([^\]]+)\]/)![1].replace(/'/g, '').split(',').map((s) => s.trim());
    expect(fn.properties.p_sources.items?.enum).toEqual(all);
    for (const source of all) expect(migration).toContain(`'${source}' = ANY (v_src)`);
  });

  it('only the executor may call it', () => {
    expect(migration).toMatch(/auth\.role\(\) = 'service_role' OR public\.is_staff\(auth\.uid\(\)\)/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.find_in_content\(text, text\[\], integer\) FROM PUBLIC, anon, authenticated;/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.find_in_content\(text, text\[\], integer\) TO service_role;/);
  });

  it('counts before it cuts: the limit never decides the total', () => {
    expect(migration).toMatch(/count\(\*\) OVER \(\)\s+AS total_n/);
    expect(migration).toMatch(/FILTER \(WHERE r\.rn <= v_limit\)/);
  });

  it('a sentence with a bold word in it is one string', () => {
    // Tiptap text nodes are read joined per block, and not once more alone.
    expect(migration).toMatch(/string_agg\(coalesce\(c\.node ->> 'text', ' '\), '' ORDER BY c\.ord\)/);
    expect(migration).toMatch(/AND NOT \(kv\.key = 'text' AND o\.obj ->> 'type' = 'text'\)/);
  });

  it('the neighbours point at it', () => {
    const knowledge = PLATFORM_SKILLS.find((s) => s.name === 'search_knowledge')!;
    expect(knowledge.description).toMatch(/find_in_content/);
    const searchWiki = wikiModule.skillSeeds!.find((s) => s.name === 'search_wiki')!;
    expect(searchWiki.description).toMatch(/find_in_content/);
  });
});
