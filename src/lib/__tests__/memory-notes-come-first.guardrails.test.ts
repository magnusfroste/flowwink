import { describe, expect, it } from 'vitest';
import { pickMemoriesForPrompt, isJournalMemory, MEMORY_NOTES_SHOWN, MEMORY_JOURNAL_SHOWN } from '../../../supabase/functions/_shared/pilot/reason.ts';

/**
 * The heartbeat's memory list shows the agent's own notes before the journal
 * the platform writes every run (2026-11-25: on liteit "staged_blog_…_READY"
 * fell off a list of 20 that the daily outcome rows filled).
 */
describe('memory: notes first, the journal in a few places', () => {
  it('knows the journal by its keys', () => {
    for (const k of ['outcome_success:heartbeat:2026-11-25', 'outcome_learning:x:2026-11-20', 'heartbeat_flush_2026-11-25', 'heartbeat_2026-11-25_13_spare_parts', 'lesson:reflect_2026-11-25']) {
      expect(isJournalMemory(k), k).toBe(true);
    }
    for (const k of ['staged_blog_A_agent_omdome_READY', 'cadence_window_is_not_monday', 'skill_lesson:comment_on_task', 'heartbeat_state']) {
      expect(isJournalMemory(k), k).toBe(false);
    }
  });
  it('an old note outranks a fresh journal row, and the journal keeps its newest few', () => {
    const journal = Array.from({ length: 30 }, (_, i) => ({ key: `outcome_success:s${i}:2026-11-25`, value: 'v', category: 'context' }));
    const rows = [...journal, { key: 'staged_blog_READY', value: 'ready', category: 'context' }];
    const picked = pickMemoriesForPrompt(rows).map((r) => r.key);
    expect(picked[0]).toBe('staged_blog_READY');
    expect(picked).toHaveLength(1 + MEMORY_JOURNAL_SHOWN);
    expect(picked.slice(1)).toEqual(journal.slice(0, MEMORY_JOURNAL_SHOWN).map((r) => r.key));
  });
  it('shows at most the notes and journal places it promises', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ key: `note_${i}`, value: 'v' }));
    expect(pickMemoriesForPrompt(rows)).toHaveLength(MEMORY_NOTES_SHOWN);
  });
});
