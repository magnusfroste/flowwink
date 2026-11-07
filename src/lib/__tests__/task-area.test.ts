import { describe, it, expect } from 'vitest';
import { areaFromTitle, taskArea, groupTasksByArea, knownAreas, OTHER_AREA } from '../task-area';

describe('The task area — one level of grouping, derived, never maintained', () => {
  it('reads the title prefix before an en dash, em dash, spaced hyphen or colon', () => {
    expect(areaFromTitle('DDC 1.0 – Kyla och brandskydd')).toBe('DDC 1.0');
    expect(areaFromTitle('Stokab — Korskoppling i noden')).toBe('Stokab');
    expect(areaFromTitle('Nät - Routing och redundans')).toBe('Nät');
    expect(areaFromTitle('Legal: KYC för SBB')).toBe('Legal');
  });

  it('a title without a label prefix has no area', () => {
    expect(areaFromTitle('Revisionsberättelse')).toBeNull();
    expect(areaFromTitle('– Revisionsberättelse')).toBeNull();
    expect(areaFromTitle('')).toBeNull();
    expect(areaFromTitle(null)).toBeNull();
    // A sentence before the dash is prose, not a label.
    expect(areaFromTitle('Skriv ett utkast till styrelsen om finansieringen av etapp två – idag')).toBeNull();
    // An unspaced hyphen is a word, not a separator.
    expect(areaFromTitle('Re-engage leads')).toBeNull();
  });

  it('the field wins over the title; a blank field falls back to the title', () => {
    expect(taskArea({ area: 'Entreprenad', title: 'DDC 1.0 – Avtal' })).toBe('Entreprenad');
    expect(taskArea({ area: '   ', title: 'DDC 1.0 – Avtal' })).toBe('DDC 1.0');
    expect(taskArea({ area: null, title: 'Avtal' })).toBeNull();
  });

  it('groups top-level tasks by area in the project\'s own order, Other last, status never reorders', () => {
    const tasks = [
      { id: 'a', title: 'Entreprenad – Besiktning', status: 'todo', sort_order: 1, created_at: '2026-01-01' },
      { id: 'b', title: 'Entreprenad – Tillstånd', status: 'done', sort_order: 2, created_at: '2026-01-02' },
      { id: 'c', title: 'Revisionsberättelse', status: 'todo', sort_order: 3, created_at: '2026-01-03' },
      { id: 'd', title: 'DDC 1.0 – Larm', status: 'in_progress', sort_order: 9, created_at: '2026-01-04' },
      { id: 'e', title: 'DDC 1.0 – Kyla', status: 'todo', sort_order: 14, created_at: '2026-01-05', completed_at: '2026-02-01' },
      { id: 'f', title: 'Sträcka – Rutt', area: 'DDC 1.0', status: 'todo', sort_order: 4, created_at: '2026-01-06' },
      { id: 'sub', title: 'Delmoment', status: 'todo', parent_task_id: 'a', sort_order: 0, created_at: '2026-01-07' },
    ];
    const sections = groupTasksByArea(tasks);
    expect(sections.map((s) => s.name)).toEqual(['Entreprenad', 'DDC 1.0', OTHER_AREA]);
    expect(sections[0]).toMatchObject({ done: 1, total: 2, other: false });
    // f carries an explicit area and sits in DDC 1.0 by its sort_order, before d and e.
    expect(sections[1].tasks.map((t) => t.id)).toEqual(['f', 'd', 'e']);
    // completed_at counts as done, as on the card.
    expect(sections[1]).toMatchObject({ done: 1, total: 3 });
    expect(sections[2]).toMatchObject({ name: OTHER_AREA, other: true, total: 1 });
    // The sub-task follows its parent; it is in no section of its own.
    expect(sections.flatMap((s) => s.tasks.map((t) => t.id))).not.toContain('sub');
  });

  it('an empty project has no sections', () => {
    expect(groupTasksByArea([])).toEqual([]);
  });

  it('knownAreas is the project\'s own vocabulary, sorted, no duplicates', () => {
    expect(knownAreas([
      { title: 'Stokab – A' },
      { title: 'DDC 1.0 – B' },
      { area: 'Stokab', title: 'C' },
      { title: 'Loose' },
    ])).toEqual(['DDC 1.0', 'Stokab']);
  });
});
