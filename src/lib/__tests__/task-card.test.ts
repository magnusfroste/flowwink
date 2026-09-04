import { describe, it, expect } from 'vitest';
import { checklistProgress, toggleChecklistItem, addChecklistItem, blockedBy, commentVoice } from '../task-card';

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
});
