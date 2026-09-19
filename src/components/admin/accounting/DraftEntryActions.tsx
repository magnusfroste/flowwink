import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RpcAnswer { success?: boolean; error?: string; approval_request_id?: string }

/**
 * A draft journal entry is not in the books. It is posted here — and when an
 * approval rule for manual entries applies, the table refuses the post until an
 * approved request covers the amount. This panel says which of the two it is.
 */
export function DraftEntryActions({ entryId }: { entryId: string }) {
  const qc = useQueryClient();
  const requestKey = ['journal-entry-approval', entryId];

  const { data: request } = useQuery({
    queryKey: requestKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('journal_entry_approval_status' as never, { p_entry_id: entryId } as never);
      if (error) throw error;
      const answer = data as { approval_request_id: string | null; approval_status: string | null; approval_required: boolean } | null;
      return answer?.approval_request_id
        ? { id: answer.approval_request_id, status: answer.approval_status ?? 'pending', required: answer.approval_required }
        : null;
    },
  });

  const call = async (fn: string, done: string) => {
    const { data, error } = await supabase.rpc(fn as never, { p_entry_id: entryId } as never);
    const answer = data as RpcAnswer | null;
    if (error || answer?.success === false) {
      toast.error(answer?.error ?? error?.message ?? 'The action was refused');
      return;
    }
    toast.success(done);
    await Promise.all([
      qc.invalidateQueries({ queryKey: requestKey }),
      qc.invalidateQueries({ queryKey: ['journal-entries'] }),
      qc.invalidateQueries({ queryKey: ['journal-entry'] }),
      qc.invalidateQueries({ queryKey: ['account-balances'] }),
      qc.invalidateQueries({ queryKey: ['approvals'] }),
    ]);
  };

  const status = request?.status;
  return (
    <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <p className="text-muted-foreground">
        {status === 'pending'
          ? 'This draft is awaiting approval. It is not in the books until it has been approved and posted.'
          : status === 'approved'
            ? 'Approved — post it to put it in the books.'
            : status === 'rejected'
              ? 'The approval was rejected. Correct the entry, or request approval again.'
              : 'This entry is a draft and is not in the books.'}
      </p>
      <div className="mt-2 flex gap-2">
        {status !== 'pending' && status !== 'approved' && (
          <Button size="sm" variant="outline" onClick={() => call('request_journal_entry_approval', 'Approval requested')}>
            Request approval
          </Button>
        )}
        <Button size="sm" onClick={() => call('post_journal_entry', 'Entry posted')} disabled={status === 'pending'}>
          Post entry
        </Button>
      </div>
    </div>
  );
}
