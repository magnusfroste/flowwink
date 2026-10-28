// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// set_translation never calls a model; keep the AI provider chain out of the import.
vi.mock('../../../supabase/functions/_shared/i18n/translate.ts', () => ({ translateAll: vi.fn() }));

import { handleSetTranslation, SET_TRANSLATION_MAX_UNITS } from '../../../supabase/functions/_shared/handlers/page-translations';
import { collectUnits } from '../../../supabase/functions/_shared/i18n/translation-units';

/**
 * A connected agent should spend its time on the work, not on round trips.
 *
 * Found on optic, 2026-10-26, reading Svante's Claude (32 calls, all green): the
 * server answered in 0.4–2.2 s, the time went BETWEEN calls —
 *   - 3.5 min writing the whole page (6.4 KB of content_json) to change two blocks,
 *     although manage_page_blocks update merges one block's changed fields;
 *   - 14 set_translation calls in a row, one string each, ~5 s apiece;
 *   - and minutes of silence nobody could read: search_skills and read_skill were
 *     never logged, so "thinking" and "five searches" looked the same.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// ── a fake Supabase with one page and its overlay ──────────────────────────
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const page = {
  id: 'p1', slug: 'careers', title: 'Lediga jobb', status: 'published', locale: 'sv', meta_json: {},
  content_json: [
    { id: 'job-hero', type: 'hero', data: { title: 'Erfarna fibertekniker', eyebrow: 'Lediga jobb' } },
    { id: 'job-intro', type: 'text', data: { title: 'Om oss', content: doc('Vi bygger ett nytt fibernät.') } },
  ],
};

function fakeSupabase(existing: Record<string, unknown> | null = null) {
  const upserts: Array<Record<string, unknown>> = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) q[m] = chain;
    q.maybeSingle = async () => ({ data: table === 'pages' ? page : existing, error: null });
    q.upsert = (row: Record<string, unknown>) => {
      upserts.push(row);
      return { select: () => ({ maybeSingle: async () => ({ data: { status: row.status, coverage: row.coverage }, error: null }) }) };
    };
    return q;
  };
  return { client: { from } as never, upserts };
}

describe('set_translation: many strings, one call', () => {
  it('a batch writes every unit in ONE overlay write', async () => {
    const { client, upserts } = fakeSupabase();
    const r = await handleSetTranslation(client, {
      slug: 'careers', locale: 'en',
      units: [
        { unit: 'page.title', text: 'Careers' },
        { unit: 'job-hero.data.title', text: 'Experienced fiber technicians' },
        { unit: 'job-intro.data.content', doc: doc('We are building a new fiber network.') },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.set).toEqual(['page.title', 'job-hero.data.title', 'job-intro.data.content']);
    expect(upserts).toHaveLength(1);
    const strings = upserts[0].strings as Record<string, { source_hash: string }>;
    const hashes = Object.fromEntries(collectUnits(page).map((u) => [u.unit, u.hash]));
    for (const k of r.set as string[]) expect(strings[k].source_hash).toBe(hashes[k]);
  });

  it('all or nothing: one bad entry writes nothing and EVERY problem is listed', async () => {
    const { client, upserts } = fakeSupabase();
    const r = await handleSetTranslation(client, {
      slug: 'careers', locale: 'en',
      units: [
        { unit: 'page.title', text: 'Careers' },
        { unit: 'job-intro.data.content', text: 'a doc unit given as text' },
        { unit: 'job-hero.data.subtitle', text: 'no such unit' },
      ],
    });
    expect(r.success).toBe(false);
    expect(upserts).toHaveLength(0);
    expect(String(r.error)).toMatch(/2 of 3 unit\(s\) could not be set — nothing was written/);
    const failed = r.failed as Array<{ unit: string; error: string; same_block?: string[] }>;
    expect(failed.map((f) => f.unit)).toEqual(['job-intro.data.content', 'job-hero.data.subtitle']);
    expect(failed[1].same_block).toContain('job-hero.data.title');
  });

  it('refuses an empty list, a duplicate, and more than the cap — before reading anything', async () => {
    const { client } = fakeSupabase();
    expect((await handleSetTranslation(client, { slug: 'careers', locale: 'en', units: [] })).success).toBe(false);
    const twice = await handleSetTranslation(client, { slug: 'careers', locale: 'en', units: [{ unit: 'page.title', text: 'A' }, { unit: 'page.title', text: 'B' }] });
    expect(String(twice.error)).toMatch(/listed twice: page\.title/);
    const many = Array.from({ length: SET_TRANSLATION_MAX_UNITS + 1 }, (_, i) => ({ unit: `u${i}`, text: 'x' }));
    expect(String((await handleSetTranslation(client, { slug: 'careers', locale: 'en', units: many })).error)).toMatch(/translate_page/);
  });

  it('keeps what is already there and the single form answers as before', async () => {
    const { client, upserts } = fakeSupabase({ status: 'published', slug: null, strings: { 'page.title': { text: 'Careers', source_hash: 'old' } } });
    const one = await handleSetTranslation(client, { slug: 'careers', locale: 'en', unit: 'job-hero.data.title', text: 'Experienced fiber technicians' });
    expect(one).toMatchObject({ success: true, unit: 'job-hero.data.title', removed: false, source_text: 'Erfarna fibertekniker', status: 'published' });
    expect(Object.keys(upserts[0].strings as object)).toEqual(['page.title', 'job-hero.data.title']);
    const missing = await handleSetTranslation(client, { slug: 'careers', locale: 'en', unit: 'job-hero.data.subtitle', text: 'x' });
    expect(missing).toMatchObject({ success: false, units_total: collectUnits(page).length });
    expect(missing.same_block).toContain('job-hero.data.title');
  });

  it('the skill says so where an agent reads before it calls (description + schema)', () => {
    const pages = read('src/lib/modules/pages-module.ts');
    const seed = pages.slice(pages.indexOf("name: 'set_translation'"), pages.indexOf("name: 'publish_translation'"));
    expect(seed).toMatch(/Several strings → ONE call with units: \[/);
    expect(seed).toMatch(/never one call per string/);
    expect(seed).toMatch(/units: \{\s*type: 'array'/);
    expect(seed).toMatch(/required: \['locale'\],/);
  });
});

describe('changing a block is a block update, not a page rewrite', () => {
  const pages = read('src/lib/modules/pages-module.ts');
  const managePage = pages.slice(pages.indexOf("name: 'manage_page',"), pages.indexOf("parameters:", pages.indexOf("name: 'manage_page',")));
  const blocks = pages.slice(pages.indexOf("name: 'manage_page_blocks',"), pages.indexOf("instructions:", pages.indexOf("name: 'manage_page_blocks',")));

  it('manage_page sends "a few blocks" to manage_page_blocks — in the description, both copies', () => {
    const steer = 'NOT for: changing one or a few blocks on an existing page — manage_page_blocks update (block_id + only the changed fields; it merges) instead of resending the whole content_json';
    expect(managePage.split(steer).length - 1).toBe(2);
    expect(pages).toMatch(/a FULL replacement of the page body: on update every block is replaced, so to change a few blocks use manage_page_blocks update instead/);
  });

  it('manage_page_blocks says what update does: block_id + only the changed fields, merged', () => {
    expect(blocks.split('update: block_id + ONLY the fields that change — merged into the block').length - 1).toBe(2);
    // ids like "job-intro" are block ids too
    expect(blocks).toMatch(/any string id, not only UUIDs/);
  });

  it('the handler really merges (the description is not a promise the code breaks)', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toMatch(/Update MERGES into existing data field-by-field|Merge first, then validate the merged result/);
  });
});

describe('discovery is visible: the gateway logs search_skills and read_skill', () => {
  const gw = read('supabase/functions/mcp-server/index.ts');

  it('both transports, both steps — four call sites', () => {
    expect(gw).toMatch(/function logDiscovery\(/);
    expect(gw.match(/logDiscovery\("search_skills"/g)).toHaveLength(2);
    // read_skill: found and not found, on native MCP and on REST
    expect(gw.match(/logDiscovery\("read_skill"/g)).toHaveLength(4);
    expect(gw).toMatch(/_caller_api_key_id: caller\?\.callerApiKeyId/);
    // never on the answer path
    expect(gw).toMatch(/edge\?\.waitUntil\?\.\(write\)/);
  });

  it('looking is not doing: usage ranking and the briefing skip discovery rows', () => {
    const scorer = read('supabase/functions/_shared/skills/intent-scorer.ts');
    expect(scorer).toMatch(/export const DISCOVERY_STEPS = \['search_skills', 'read_skill'\] as const;/);
    const usage = scorer.slice(scorer.indexOf('export async function loadRecentUsageCounts'));
    expect(usage.slice(0, 600)).toMatch(/\.not\('skill_name', 'in', `\(\$\{DISCOVERY_STEPS\.join\(','\)\}\)`\)/);
    expect(gw).toMatch(/Recent activity \(last 10\)[^\n]*\n\s*sb\.from\("agent_activity"\)\n\s*\.select\("skill_name, status, created_at"\)\n\s*\.not\("skill_name", "in"/);
  });
});
