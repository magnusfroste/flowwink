import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMoveApplicationStage } from '@/hooks/useRecruitment';

const REASONS = ['Not enough experience', 'Missing a required qualification', 'Another candidate was a better fit', 'Withdrew / no response', 'Other'];

/** Reject with a reason — the reason is kept on the application and in the timeline. */
export function RejectCandidateDialog({ applicationId, name, open, onOpenChange }: { applicationId: string; name: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const move = useMoveApplicationStage();
  const [reason, setReason] = useState(REASONS[0]);
  const [comment, setComment] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {name}</DialogTitle>
          <DialogDescription>The reason stays on the application. The candidate is not mailed from here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment for the team (optional)" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={move.isPending}
            onClick={() => move.mutate(
              { id: applicationId, to_stage: 'rejected', rejected_reason: reason, comment: comment.trim() || undefined },
              { onSuccess: () => onOpenChange(false) },
            )}
          >
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
