import { describe, it, expect } from 'vitest';
import { attentionLabel, sortProjects, type ProjectAttention } from '../project-order';

const P = (id: string, name: string, created_at: string, sort_order: number | null) => ({ id, name, created_at, sort_order });
const projects = [
  P('legal', 'Legal / Admin', '2026-08-31T10:00:00Z', 3),
  P('ekonomi', 'Ekonomi', '2026-09-08T10:00:00Z', 1),
  P('ipo', 'Notering / IPO', '2026-09-04T10:00:00Z', 2),
  P('team', 'Team', '2026-09-08T10:00:01Z', null),
];
const attention = new Map<string, ProjectAttention>([
  ['legal', { needsAttention: true, weight: 2, reasons: [{ kind: 'blocked', count: 1 }], lastActivityAt: '2026-09-20T10:00:00Z' }],
  ['ekonomi', { needsAttention: true, weight: 4, reasons: [{ kind: 'urgent', count: 1 }], lastActivityAt: '2026-09-10T10:00:00Z' }],
  ['ipo', { needsAttention: false, weight: 0, reasons: [], lastActivityAt: '2026-09-21T10:00:00Z' }],
  ['team', { needsAttention: false, weight: 0, reasons: [], lastActivityAt: null }],
]);
const ids = (mode: Parameters<typeof sortProjects>[2]) => sortProjects(projects, attention, mode).map((p) => p.id);

describe('the project rail order', () => {
  it('team order follows sort_order; a project without one comes after', () => {
    expect(ids('team')).toEqual(['ekonomi', 'ipo', 'legal', 'team']);
  });
  it('needs attention first puts the heaviest first, and breaks ties by the team order — never a coin toss', () => {
    expect(ids('attention')).toEqual(['ekonomi', 'legal', 'ipo', 'team']);
  });
  it('recently active uses the last movement, falling back to when the project was created', () => {
    expect(ids('activity')).toEqual(['ipo', 'legal', 'ekonomi', 'team']);
  });
  it('name sorts by name, case-insensitively', () => {
    expect(ids('name')).toEqual(['ekonomi', 'legal', 'ipo', 'team']);
  });
  it('newest sorts by creation', () => {
    expect(ids('newest')).toEqual(['team', 'ekonomi', 'ipo', 'legal']);
  });
  it('sorting does not reorder the caller\'s array', () => {
    const before = projects.map((p) => p.id);
    sortProjects(projects, attention, 'name');
    expect(projects.map((p) => p.id)).toEqual(before);
  });
});

describe('the why, in words', () => {
  it('counts and kinds in the verdict\'s order', () => {
    expect(attentionLabel([{ kind: 'urgent', count: 1 }, { kind: 'blocked', count: 2 }])).toBe('1 urgent · 2 blocked');
    expect(attentionLabel([{ kind: 'deadline_passed', count: 1 }])).toBe('deadline passed');
    expect(attentionLabel([])).toBe('');
  });
});
