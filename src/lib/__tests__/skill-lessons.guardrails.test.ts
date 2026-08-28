import { describe, it, expect, vi } from 'vitest';
import { recordSkillLesson } from '../../../supabase/functions/_shared/pilot/reason.ts';

/**
 * Fel som återkommer ska bli minnen (autoversio: write_blog_post failade
 * identiskt i 5+ veckor utan att loopen lärde sig — Curator-gapet).
 * Kontraktet: 1:a felet = brus (skriv inget), ≥2:a = lärdom i agent_memory
 * som loadMemories lyfter in i nästa körnings systemprompt.
 */
function mockSupabase(failCount: number, existingLesson: boolean) {
  const writes: any[] = [];
  const chain = (table: string) => {
    const q: any = {
      select: vi.fn((_c?: any, opts?: any) => { q._count = opts?.count === 'exact'; return q; }),
      eq: vi.fn(() => q), gte: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: existingLesson ? { id: 'x' } : null })),
      update: vi.fn((v: any) => { writes.push({ table, op: 'update', v }); return q; }),
      insert: vi.fn(async (v: any) => { writes.push({ table, op: 'insert', v }); return { data: null }; }),
      then: undefined as any,
    };
    // count-frågan awaitar kedjan direkt
    q.then = (resolve: any) => resolve({ count: failCount });
    return q;
  };
  return { from: vi.fn((t: string) => chain(t)), writes };
}

describe('skill lessons', () => {
  it('första felet skriver INGEN lärdom', async () => {
    const sb = mockSupabase(0, false);
    await recordSkillLesson(sb as any, 'write_blog_post', 'content is required');
    expect(sb.writes).toEqual([]);
  });

  it('upprepat fel skriver lärdom med skillnamn, antal och felet', async () => {
    const sb = mockSupabase(11, false);
    await recordSkillLesson(sb as any, 'write_blog_post', 'content is required (markdown or plain text string)');
    const ins = sb.writes.find(w => w.op === 'insert');
    expect(ins?.table).toBe('agent_memory');
    expect(ins?.v.key).toBe('skill_lesson:write_blog_post');
    expect(ins?.v.category).toBe('skill_lessons');
    expect(ins?.v.value).toContain('12x');
    expect(ins?.v.value).toContain('content is required');
    expect(ins?.v.value).toContain('Do NOT repeat');
  });

  it('befintlig lärdom uppdateras i stället för att dubbleras', async () => {
    const sb = mockSupabase(3, true);
    await recordSkillLesson(sb as any, 'send_newsletter', 'no recipients');
    expect(sb.writes.some(w => w.op === 'update')).toBe(true);
    expect(sb.writes.some(w => w.op === 'insert')).toBe(false);
  });
});
