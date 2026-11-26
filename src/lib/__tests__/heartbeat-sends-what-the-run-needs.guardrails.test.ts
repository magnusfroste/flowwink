import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * Two parts of every heartbeat step measured on 2026-11-26 (prompt_sizes):
 * a memory search answered a stored blog draft whole (liteit 24 800 chars),
 * and the narrative company profile (6-8k) went to runs that write nothing.
 */
const handlers = async () => await import('../../../supabase/functions/_shared/pilot/handlers.ts');
const identity = async () => await import('../../../supabase/functions/_shared/domains/business-identity-block.ts');

describe('memory_read answers a search lean, one key whole', async () => {
  const H = await handlers();
  it('cuts a long value to its beginning and marks it', () => {
    const hits = H.leanMemoryHits([
      { key: 'blog_draft_body', value: 'x'.repeat(20000), category: 'context' },
      { key: 'cadence_window_is_not_monday', value: 'short', category: 'context' },
    ]);
    expect(hits[0].cut).toBe(true);
    expect(String(hits[0].value).length).toBeLessThanOrEqual(H.MEMORY_VALUE_PREVIEW_CHARS + 1);
    expect(hits[1]).toEqual({ key: 'cadence_window_is_not_monday', value: 'short', category: 'context' });
  });
  it('an exact key is answered whole', async () => {
    const big = 'y'.repeat(5000);
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { key: 'k', value: big, category: 'fact' }, error: null }) }) }) }) };
    const r = await H.handleMemoryRead(db, { key: 'k' }) as { search_type: string; memories: Array<{ value: string }> };
    expect(r.search_type).toBe('exact');
    expect(r.memories[0].value).toBe(big);
  });
});

describe('the wide company profile goes to a run that can write', async () => {
  const I = await identity();
  it('narrative when an objective writes for the public, core otherwise', () => {
    expect(I.identityDepthForObjectives([{ constraints: { cadence: { max: 1, per: 'day' } } }])).toBe('core');
    expect(I.identityDepthForObjectives([])).toBe('core');
    expect(I.identityDepthForObjectives([{ constraints: { cadence: { max: 1, per: 'week', counts: 'write_blog_post' } } }])).toBe('narrative');
    expect(I.identityDepthForObjectives([{ constraints: { requires_business_identity: true } }])).toBe('narrative');
    expect(I.identityDepthForObjectives([{ constraints: null }])).toBe('core');
  });
  it('the heartbeat asks it with the objectives the cadence still allows, and fails wide', () => {
    const src = readFileSync('supabase/functions/flowpilot-heartbeat/index.ts', 'utf8');
    expect(src).toMatch(/identityDepthForRun\(supabase\)\.then\(\(depth\) => loadBusinessIdentityBlock\(supabase, depth\)\)/);
    expect(src).toMatch(/const \{ actionable \} = await partitionByCadence\(supabase, data \|\| \[\]\);\n\s+return identityDepthForObjectives\(actionable\);/);
    expect(src).toMatch(/catch \{\n\s+return 'narrative';/);
  });
});
