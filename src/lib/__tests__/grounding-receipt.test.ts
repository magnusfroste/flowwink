import { describe, expect, it } from 'vitest';
import { groundingReceipt, groundingFrame, readGroundingFrame, withSkills } from '../../../supabase/functions/_shared/retrieval/receipt';

describe('grounding receipt', () => {
  it('dedupes chunks per entity, keeps the best score first, caps at 8, and links what it can', () => {
    const chunks = [
      { sourceTable: 'kb_articles', entityId: 'a', title: 'Hotell', metadata: { slug: 'hotell' }, score: 0.4 },
      { sourceTable: 'kb_articles', entityId: 'a', title: 'Hotell', metadata: { slug: 'hotell' }, score: 0.9 },
      { sourceTable: 'pages', entityId: 'p', title: 'Bo', metadata: { slug: 'bo' }, score: 0.5 },
      ...Array.from({ length: 10 }, (_, i) => ({ sourceTable: 'documents', entityId: `d${i}`, title: `Doc ${i}`, score: 0.1 })),
    ];
    const r = groundingReceipt(chunks, 'retrieval');
    expect(r.grounded).toBe(true);
    expect(r.chunk_count).toBe(13);
    expect(r.sources).toHaveLength(8);
    expect(r.sources[0]).toEqual({ table: 'kb_articles', id: 'a', title: 'Hotell', slug: 'hotell', url: '/kb/hotell' });
    expect(r.sources[1].url).toBe('/bo');
    expect(r.sources[2].url).toBeUndefined();
  });

  it('is not grounded when nothing was retrieved or the mode is none', () => {
    expect(groundingReceipt([], 'retrieval').grounded).toBe(false);
    expect(groundingReceipt([{ sourceTable: 'pages', entityId: 'x', title: 'x' }], 'none').grounded).toBe(false);
    // The legacy full-text dump DID put the whole KB in the prompt — grounded, untraceable.
    expect(groundingReceipt([], 'fulltext')).toMatchObject({ grounded: true, mode: 'fulltext', sources: [] });
  });

  it('round-trips through the SSE frame and rejects frames that are not receipts', () => {
    const r = groundingReceipt([{ sourceTable: 'kb_articles', entityId: 'a', title: 'A', metadata: { slug: 'a' }, score: 1 }], 'retrieval');
    const frame = groundingFrame(r);
    expect(frame.startsWith('data: ')).toBe(true);
    const parsed = JSON.parse(frame.slice(6));
    expect(readGroundingFrame(parsed)).toEqual(r);
    expect(readGroundingFrame({ choices: [{ delta: { content: 'hi' } }] })).toBeNull();
    expect(readGroundingFrame(null)).toBeNull();
  });
});

/**
 * Live-frågan är också en grund.
 *
 * Strukturerade tabeller indexeras med flit inte — de ändras varje timme, deras
 * värde är relationen, och deras synlighet är per ANVÄNDARE (optic: 7 av 10
 * projekt är private), inte per publiceringstillstånd. Ett projektsvar kommer
 * därför ur en skill som frågar databasen i stunden. Utan ett eget läge
 * rapporterade kvittot `none`, och kunskapslucke-rapporten räknade ett korrekt,
 * färskt svar som en lucka — måttet pekade alltså ut rätt beteende som fel.
 */
describe('svar ur en skill', () => {
  const chunk = { sourceTable: 'kb_articles', entityId: 'a1', title: 'Öppettider', score: 0.9 };

  it('utan annan grund blir svaret ett skill-svar, och räknas som grundat', () => {
    const r = withSkills(groundingReceipt([], 'none'), ['project_portfolio_brief']);
    expect(r.mode).toBe('skill');
    expect(r.grounded).toBe(true);
    expect(r.sources.map((s) => s.title)).toEqual(['project_portfolio_brief']);
  });

  it('hämtning som redan grundat svaret behåller sitt läge — skillen läggs till', () => {
    const r = withSkills(groundingReceipt([chunk], 'retrieval'), ['get_project_schedule']);
    expect(r.mode).toBe('retrieval');
    expect(r.sources.map((s) => s.title)).toContain('Öppettider');
    expect(r.sources.map((s) => s.title)).toContain('get_project_schedule');
  });

  it('inga verktyg = kvittot rörs inte', () => {
    const before = groundingReceipt([], 'none');
    expect(withSkills(before, [])).toEqual(before);
    expect(withSkills(before, ['', '  '])).toEqual(before);
  });

  it('samma skill två gånger räknas en gång', () => {
    const r = withSkills(groundingReceipt([], 'none'), ['browse_blog', 'browse_blog']);
    expect(r.sources).toHaveLength(1);
  });

  it('ett skill-svar överlever rundturen genom SSE-ramen', () => {
    const r = withSkills(groundingReceipt([], 'none'), ['timesheet_summary']);
    const frame = groundingFrame(r);
    const parsed = readGroundingFrame(JSON.parse(frame.replace(/^data: /, '').trim()));
    expect(parsed?.mode).toBe('skill');
    expect(parsed?.grounded).toBe(true);
  });
});
