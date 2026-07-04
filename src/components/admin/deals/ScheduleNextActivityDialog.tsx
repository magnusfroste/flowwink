import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateCrmTask } from '@/hooks/useCrmTasks';
import type { Deal, DealStage } from '@/hooks/useDeals';

interface Props {
  deal: Deal | null;
  closedAs: DealStage | null; // 'closed_won' | 'closed_lost'
  onOpenChange: (open: boolean) => void;
}

const PRESETS_WON = [
  { label: 'Send onboarding email', days: 1, priority: 'high' },
  { label: 'Kickoff call', days: 3, priority: 'high' },
  { label: '30-day check-in', days: 30, priority: 'medium' },
];

// Loss reason itself is captured by LostReasonDialog on the transition;
// these presets are about what happens NEXT.
const PRESETS_LOST = [
  { label: 'Re-engage in 90 days', days: 90, priority: 'low' },
  { label: 'Ask for referral', days: 7, priority: 'low' },
];

export function ScheduleNextActivityDialog({ deal, closedAs, onOpenChange }: Props) {
  const create = useCreateCrmTask();
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');

  const isOpen = !!deal && !!closedAs;
  const presets = closedAs === 'closed_won' ? PRESETS_WON : PRESETS_LOST;

  useEffect(() => {
    if (isOpen) {
      const p = presets[0];
      applyPreset(p.label, p.days, p.priority);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const applyPreset = (label: string, days: number, prio: string) => {
    setTitle(label);
    setPriority(prio);
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setDueDate(iso);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !deal) return;
    create.mutate(
      {
        title: title.trim(),
        description: notes.trim() || undefined,
        due_date: dueDate || undefined,
        priority,
        deal_id: deal.id,
        lead_id: deal.lead_id,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              Deal {closedAs === 'closed_won' ? 'won' : 'lost'} — schedule next step?
            </DialogTitle>
            <DialogDescription>
              Keep momentum on {deal?.lead?.name || deal?.lead?.email || 'this contact'}. Pick a preset or customize.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(p.label, p.days, p.priority)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="next-title">Activity</Label>
              <Input id="next-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="next-due">Due</Label>
                <Input id="next-due" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="next-prio">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="next-prio"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="next-notes">Notes</Label>
              <Textarea id="next-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Skip
            </Button>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              {create.isPending ? 'Saving…' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
