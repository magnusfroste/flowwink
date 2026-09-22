import { describe, it, expect } from 'vitest';
import { countsLabel, lastWeekday, sinceFor } from '@/lib/project-changes';

describe('since last Tuesday', () => {
  // 2026-09-22 is a Tuesday.
  const tuesday = new Date(2026, 8, 22, 14, 30);

  it('on a Tuesday, "since last Tuesday" is a week ago at midnight — not the meeting that just started', () => {
    expect(lastWeekday(2, tuesday)).toEqual(new Date(2026, 8, 15, 0, 0));
  });

  it('the most recent occurrence strictly before today', () => {
    expect(lastWeekday(1, tuesday)).toEqual(new Date(2026, 8, 21)); // yesterday, Monday
    expect(lastWeekday(5, tuesday)).toEqual(new Date(2026, 8, 18)); // last Friday
  });

  it('day presets open at local midnight', () => {
    expect(sinceFor('yesterday', tuesday)).toEqual(new Date(2026, 8, 21));
    expect(sinceFor('7d', tuesday)).toEqual(new Date(2026, 8, 15));
    expect(sinceFor('30d', tuesday)).toEqual(new Date(2026, 7, 23));
  });
});

describe('the one-line summary', () => {
  it('names what happened and skips the zeros', () => {
    expect(countsLabel({ created: 1, completed: 2, reopened: 0, moved: 1, reprioritised: 0, reassigned: 0, rescheduled: 0, renamed: 0, progressed: 0, deleted: 0, dependencies: 0, milestones: 0, comments: 3, hours: 1.5 }))
      .toBe('2 completed · 1 created · 1 moved · 3 comments · 1.5 h logged');
  });
  it('is empty for a quiet project', () => {
    expect(countsLabel({ created: 0, completed: 0, reopened: 0, moved: 0, reprioritised: 0, reassigned: 0, rescheduled: 0, renamed: 0, progressed: 0, deleted: 0, dependencies: 0, milestones: 0, comments: 0, hours: 0 })).toBe('');
  });
});
