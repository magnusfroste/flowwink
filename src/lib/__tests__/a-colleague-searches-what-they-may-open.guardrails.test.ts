/**
 * Guardrail: a colleague's agent may search the site's knowledge — but only
 * the sources its owner may open.
 *
 * Optic, 2026-11-26. Svante's Claude (owner: sales + marketing) wrote nine KB
 * articles and was refused `search_knowledge` ("admin-only and the person this
 * agent acts for is not an admin"). The skill runs on the service client, so
 * giving it an owner module alone would have handed every document and
 * handbook chapter to every colleague's agent: the handler judges each source
 * by its own module (knowledge-reach.ts) before it retrieves anything.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ownerModuleOf } from '../../../supabase/functions/_shared/skills/owner-module';
import { SKILL_OWNER_MODULE } from '../../../supabase/functions/_shared/skills/skill-modules';
import {
  KNOWLEDGE_SOURCE_MODULE,
  narrowKnowledgeSources,
} from '../../../supabase/functions/_shared/skills/knowledge-reach';

const ROOT = resolve(__dirname, '../../..');
const core = readFileSync(join(ROOT, 'supabase/functions/_shared/execute/core.ts'), 'utf8');
const handler = core.slice(
  core.indexOf('async function executeSearchKnowledge('),
  core.indexOf('// internal:request_return'),
);

describe('search_knowledge for a colleague', () => {
  it('is reachable by every staff agent, through wiki', () => {
    expect(SKILL_OWNER_MODULE['search_knowledge']).toBe('platform');
    expect(ownerModuleOf('search_knowledge')).toBe('wiki');
  });

  it('names a module for every source the handler searches, and only those', () => {
    const list = core.match(/const SEARCHABLE_KNOWLEDGE_SOURCES = \[([^\]]*)\]/);
    expect(list).not.toBeNull();
    const searched = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(Object.keys(KNOWLEDGE_SOURCE_MODULE).sort()).toEqual(searched);
  });

  it('judges each source by a module that owns skills of its own', () => {
    const modules = new Set(Object.values(SKILL_OWNER_MODULE));
    for (const [source, mod] of Object.entries(KNOWLEDGE_SOURCE_MODULE)) {
      expect(modules.has(mod), `${source} → ${mod}`).toBe(true);
    }
    expect(SKILL_OWNER_MODULE['manage_kb_article']).toBe(KNOWLEDGE_SOURCE_MODULE.kb_articles);
    expect(SKILL_OWNER_MODULE['manage_wiki_page']).toBe(KNOWLEDGE_SOURCE_MODULE.wiki_pages);
  });

  it('leaves out what the person may not open, and says so', () => {
    const svante = new Set(['wiki', 'knowledgeBase', 'pages']);
    const out = narrowKnowledgeSources(
      ['pages', 'kb_articles', 'wiki_pages', 'handbook_chapters', 'documents'],
      (m) => svante.has(m),
    );
    expect(out.sources).toEqual(['pages', 'kb_articles', 'wiki_pages']);
    expect(out.left_out).toEqual(['handbook_chapters', 'documents']);
  });

  it('an unknown source is left out, never searched', () => {
    expect(narrowKnowledgeSources(['docs_pages'], () => true)).toEqual({ sources: [], left_out: ['docs_pages'] });
  });

  it('the handler asks the module question for the caller before it retrieves', () => {
    expect(handler).toContain('_caller_user_id');
    const ask = handler.indexOf("rpc('can_access_module'");
    const narrow = handler.indexOf('narrowKnowledgeSources(');
    const fetch = handler.indexOf('await retrieve(');
    expect(ask).toBeGreaterThan(-1);
    expect(narrow).toBeGreaterThan(ask);
    expect(fetch).toBeGreaterThan(narrow);
    // A failed check leaves the source out — never in.
    expect(handler).toMatch(/!error && data === true/);
  });
});
