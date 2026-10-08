import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checklistProgress, toggleChecklistItem, addChecklistItem, blockedBy, commentVoice, normalizeChecklist, sortByPriority, isLate, localDay } from '../task-card';

describe('The task card — what the list reads at a glance', () => {
  it('checklist progress counts ticked items and tolerates absence', () => {
    expect(checklistProgress(null)).toEqual({ done: 0, total: 0 });
    const items = addChecklistItem(addChecklistItem([], 'Ring kunden'), 'Skicka offert');
    expect(checklistProgress(items)).toEqual({ done: 0, total: 2 });
    const ticked = toggleChecklistItem(items, items[0].id, 'u1');
    expect(checklistProgress(ticked)).toEqual({ done: 1, total: 2 });
    expect(ticked[0].done_by).toBe('u1');
    expect(toggleChecklistItem(ticked, items[0].id)[0].done_at).toBeNull();
    expect(addChecklistItem(items, '   ')).toBe(items);
  });

  it('blocked = a dependency that is not done; a ghost dependency does not freeze the board', () => {
    const status = new Map([['a', 'done'], ['b', 'in_progress'], ['c', 'todo']]);
    expect(blockedBy(['a'], status)).toEqual([]);
    expect(blockedBy(['a', 'b', 'c'], status)).toEqual(['b', 'c']);
    expect(blockedBy(['deleted-task'], status)).toEqual([]);
    expect(blockedBy(undefined, status)).toEqual([]);
  });

  it('the thread labels its voices: a person wrote, FlowPilot did, an agent asks', () => {
    expect(commentVoice({ author_type: 'person', author_name: 'Peter', kind: 'comment' })).toBe('Peter wrote');
    expect(commentVoice({ author_type: 'flowpilot', kind: 'step' })).toBe('FlowPilot did');
    expect(commentVoice({ author_type: 'agent', author_name: 'Hermes', kind: 'question' })).toBe('Hermes asks');
    expect(commentVoice({ author_type: 'person', kind: 'decision' })).toBe('You decided');
  });

  it('a checklist written as strings is still items: shown, countable and tickable', () => {
    // optic 2026-10-07: an agent wrote ["Fastställ bladstruktur", …] — 58 blank rows nobody could tick.
    const items = normalizeChecklist(['Fastställ bladstruktur', '  ', '- [x] Klar sak', null, { title: 'Utan id', checked: true }]);
    expect(items.map((i) => [i.text, i.done])).toEqual([['Fastställ bladstruktur', false], ['Klar sak', true], ['Utan id', true]]);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
    expect(checklistProgress(['a', '[x] b'])).toEqual({ done: 1, total: 2 });
    const ticked = toggleChecklistItem(items, items[0].id);
    expect(ticked[0]).toMatchObject({ text: 'Fastställ bladstruktur', done: true });
    expect(normalizeChecklist('rad ett\nrad två').map((i) => i.text)).toEqual(['rad ett', 'rad två']);
    expect(normalizeChecklist(undefined)).toEqual([]);
    const kept = [{ id: 'a', text: 'Ok', done: true, done_by: 'u1' }];
    expect(normalizeChecklist(kept)).toEqual(kept);
    expect(normalizeChecklist([{ id: 'd', text: 'x' }, { id: 'd', text: 'y' }]).map((i) => i.id)).toEqual(['d', 'd-1']);
  });

  it('the database shapes the checklist before the triggers that count ticks read it', () => {
    const sql = readFileSync(join(__dirname, '../../../supabase/migrations/20261007150000_checklistan-ar-alltid-punkter.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TRIGGER project_tasks_normalize_checklist\s+BEFORE INSERT OR UPDATE ON public\.project_tasks/);
    // Same-timing triggers run in name order: normalize must precede stamp_movement, which counts ticked items.
    expect(['project_tasks_normalize_checklist', 'project_tasks_stamp_movement', 'project_tasks_stamp_hands'].sort()[0]).toBe('project_tasks_normalize_checklist');
  });

  it('a board column reads urgent → high → medium → low, the manual order kept inside one priority', () => {
    const col = [
      { id: 'a', priority: 'medium' }, { id: 'b', priority: 'urgent' }, { id: 'c', priority: 'low' },
      { id: 'd', priority: 'high' }, { id: 'e', priority: 'urgent' }, { id: 'f', priority: null },
    ];
    expect(sortByPriority(col).map((t) => t.id)).toEqual(['b', 'e', 'd', 'a', 'f', 'c']);
    expect(col.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']); // input untouched
  });

  it('late = due date passed and still open; done, cancelled and undated are never late', () => {
    const today = '2026-10-08';
    expect(isLate({ due_date: '2026-10-07', status: 'todo' }, today)).toBe(true);
    expect(isLate({ due_date: '2026-10-07T23:00:00Z', status: 'in_progress' }, today)).toBe(true);
    expect(isLate({ due_date: '2026-10-08', status: 'todo' }, today)).toBe(false); // due today is not late
    expect(isLate({ due_date: '2026-10-01', status: 'done' }, today)).toBe(false);
    expect(isLate({ due_date: '2026-10-01', status: 'cancelled' }, today)).toBe(false);
    expect(isLate({ due_date: null, status: 'todo' }, today)).toBe(false);
    expect(localDay(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05'); // local calendar day, not UTC
  });
});
