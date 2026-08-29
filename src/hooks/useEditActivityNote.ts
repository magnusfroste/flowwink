/**
 * Correct the text of a ledger entry — never the entry itself.
 *
 * The activity log is the sales ledger: entries are immutable in position,
 * type and points, because the chronology has to be complete and the score
 * must not be rewritable after the fact. What a human wrote about another
 * human is a different matter: it can be wrong, and a person has the right to
 * have it corrected or removed. So the text is correctable, visibly — the
 * database stamps `edited_at` and keeps the superseded wording in
 * `metadata.note_history` (lead_activity_ledger_guard). Emptying the text is
 * allowed and leaves the row standing as a tombstone; that is the difference
 * between redacting a statement and deleting a record.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useEditActivityNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ activityId, note }: { activityId: string; note: string }) => {
      // Read-modify-write the metadata object: the guard needs the untouched
      // structured keys (deal_id, message_id, subject…) to survive a correction.
      const { data: row, error: readErr } = await supabase
        .from('lead_activities')
        .select('metadata')
        .eq('id', activityId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!row) throw new Error('The entry is gone — reload the timeline.');

      const metadata = { ...((row.metadata ?? {}) as Record<string, unknown>), note };
      // Read the row back: an RLS-denied update returns success with 0 rows,
      // and a toast that says "saved" about text nobody stored is the worst
      // outcome of all.
      const { data, error } = await supabase
        .from('lead_activities')
        .update({ metadata: metadata as never })
        .eq('id', activityId)
        .select('id, edited_at');
      if (error) throw error;
      if (!data?.length) {
        throw new Error('Nothing was saved — only the author or an admin may correct an entry.');
      }
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unified-timeline'] });
      qc.invalidateQueries({ queryKey: ['lead-activities'] });
      toast.success('Entry corrected');
    },
    onError: (e: Error) => toast.error(e.message || 'Could not correct the entry'),
  });
}
