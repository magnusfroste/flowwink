/**
 * search_knowledge's enum is the list its handler accepts. The seed offered
 * docs_pages (deliberately refused — FlowWink's own docs) and left out
 * handbook_chapters (the customer's handbook, indexed), so an agent picked the
 * refused source from the list it was shown and never reached the handbook
 * (Nordbrygg, 2026-10-18).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PLATFORM_SKILLS } from '@/lib/platform-seeds';

describe('search_knowledge offers exactly the sources it searches', () => {
  it('seed enum == SEARCHABLE_KNOWLEDGE_SOURCES', () => {
    const exec = readFileSync('supabase/functions/agent-execute/index.ts', 'utf8');
    const list = exec.match(/const SEARCHABLE_KNOWLEDGE_SOURCES = \[([^\]]*)\]/);
    expect(list).not.toBeNull();
    const accepted = [...list![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    type Seed = { name: string; tool_definition?: { function?: { parameters?: { properties?: { sources?: { items?: { enum?: string[] } } } } } } };
    const seed = (PLATFORM_SKILLS as unknown as Seed[]).find((s) => s.name === 'search_knowledge');
    const offered = [...(seed?.tool_definition?.function?.parameters?.properties?.sources?.items?.enum ?? [])].sort();
    expect(offered).toEqual(accepted);
    expect(accepted).toContain('handbook_chapters');
    expect(accepted).not.toContain('docs_pages');
  });
});
