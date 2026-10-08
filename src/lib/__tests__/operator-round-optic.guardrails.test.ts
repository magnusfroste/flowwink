import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { receiptFromCitations } from '../../../supabase/functions/_shared/retrieval/receipt';
import { slugify as edgeSlugify } from '../../../supabase/functions/_shared/slugify';
import { slugify } from '../slugify';

/**
 * Three bugs an MCP operator round on optic found (2026-10-08). Each guard
 * reads the SHAPE, not a list of files.
 */
const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const tsFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) return tsFiles(p);
    return p.endsWith('.ts') ? [p] : [];
  });

describe('1. a FlowWork answer carries the same grounding receipt as chat', () => {
  it('citations become a receipt: sources grounded, skills as live queries, nothing = none', () => {
    const r = receiptFromCitations([
      { type: 'wiki_pages', id: 'w1', title: 'Legal – avtalsarkitekturen', url: '/admin/wiki/Avtal' },
      { type: 'wiki_pages', id: 'w1', title: 'Legal – avtalsarkitekturen' },
      { type: 'kb_articles', id: 'k1', title: 'Vad är privat AI?' },
      { type: 'skill', id: 'project_portfolio_brief', title: 'project_portfolio_brief' },
    ]);
    expect(r.grounded).toBe(true);
    expect(r.mode).toBe('retrieval');
    expect(r.sources.map((s) => s.id)).toEqual(['w1', 'k1', 'project_portfolio_brief']);
    expect(r.sources[0].url).toBe('/admin/wiki/Avtal');
    expect(receiptFromCitations([{ type: 'skill', id: 'deal_stale_check' }])).toMatchObject({ grounded: true, mode: 'skill' });
    expect(receiptFromCitations([])).toMatchObject({ grounded: false, mode: 'none', chunk_count: 0 });
  });

  it('workspace-chat sends a grounding event wherever it sends citations, and the page saves it', () => {
    const fn = read('supabase/functions/workspace-chat/index.ts');
    const citations = fn.match(/event: citations\\n/g)?.length ?? 0;
    const grounding = fn.match(/event: grounding\\n/g)?.length ?? 0;
    expect(citations).toBeGreaterThan(0);
    expect(grounding).toBe(citations);
    expect(read('src/hooks/useWorkspaceChat.ts')).toMatch(/currentEvent === 'grounding'/);
    // knowledge_gap_report reads metadata.grounding — the saved row must carry it.
    expect(read('src/pages/admin/WorkspaceChatPage.tsx')).toMatch(/\{ grounding \}/);
  });
});

describe('2. one slug generator on both sides of the wire', () => {
  const words = [
    'När AI-agenten blir en del av verksamhetsstyrningen',
    'AI-agenters verktygsåtkomst: så begränsar ni blast radius',
    'Blåbærsyltetøy', 'Grüße aus Köln', 'Öppna vikter', '  --  ', '🚀', 'Ärende #42 / Q3',
  ];
  it('the edge copy answers exactly like src/lib/slugify', () => {
    for (const w of words) {
      expect(edgeSlugify(w), w).toBe(slugify(w));
      expect(edgeSlugify(w, { maxLength: 20, fallback: 'x' }), w).toBe(slugify(w, { maxLength: 20, fallback: 'x' }));
    }
    expect(edgeSlugify('När AI-agenten')).toBe('nar-ai-agenten');
  });

  it('no edge function collapses human text to ASCII without transliterating first (ratchet)', () => {
    // Lowercasing and then collapsing everything outside a-z0-9 deletes å/ä/ö: "När" → "n-r".
    // The three left are machine identifiers (a template id, peer names).
    const shape = /toLowerCase\(\)[^;\n]{0,60}replace\(\/\[\^a-z0-9[^\]]*\]\+\/g/g;
    const hits = tsFiles('supabase/functions')
      .filter((p) => !p.endsWith('_shared/slugify.ts'))
      .flatMap((p) => (read(p).match(shape) ?? []).map(() => relative(ROOT, join(ROOT, p))));
    expect(hits.length, `ASCII-only slug sites: ${hits.join(', ')} — use _shared/slugify.ts`).toBeLessThanOrEqual(3);
  });
});

describe('3. reading a trace does not write itself into it', () => {
  it('the activity trace column comes from the envelope, never from the skill arguments', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    const insert = src.slice(src.indexOf('async function logActivity('));
    const line = insert.match(/^\s*trace_id:.*$/m)?.[0] ?? '';
    expect(line).toMatch(/activity\.trace_id/);
    expect(line).not.toMatch(/input/);
  });
});
