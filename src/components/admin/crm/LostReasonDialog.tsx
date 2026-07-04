import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Shared lost-reason taxonomy (Odoo crm.lost.reason pattern, SMB-sized). */
export const LOST_REASONS = [
  { value: 'price', label: 'Price' },
  { value: 'timing', label: 'Timing' },
  { value: 'competitor', label: 'Competitor' },
  { value: 'no_response', label: 'No response' },
  { value: 'other', label: 'Other' },
] as const;

export function lostReasonLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return LOST_REASONS.find(r => r.value === value)?.label ?? value;
}

interface LostReasonDialogProps {
  open: boolean;
  /** 'contact' | 'deal' — used in copy only */
  entityLabel: string;
  onConfirm: (reason: string, note: string) => void;
  onCancel: () => void;
  isPending?: boolean;
}

/**
 * Prompt shown when a lead/deal moves to a lost stage: pick a reason
 * (small fixed taxonomy) + optional free-text note. Both are stored on the
 * record and cleared again on re-open, so win-rate reporting stays honest.
 */
export function LostReasonDialog({ open, entityLabel, onConfirm, onCancel, isPending }: LostReasonDialogProps) {
  const [reason, setReason] = useState('no_response');
  const [note, setNote] = useState('');

  const handleOpenChange = (o: boolean) => {
    if (!o) onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Mark {entityLabel} as lost</DialogTitle>
          <DialogDescription>
            Record why this {entityLabel} was lost. The reason feeds win-rate reporting and is cleared if you re-open.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="lost-reason">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="lost-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lost-note">Note (optional)</Label>
            <Textarea
              id="lost-note"
              rows={3}
              placeholder="What happened?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => onConfirm(reason, note.trim())}
          >
            {isPending ? 'Saving…' : 'Mark as lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
