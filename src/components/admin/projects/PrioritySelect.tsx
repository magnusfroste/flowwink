import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PRIORITIES, usePriorityGuide, useSetPriorityGuide, type Priority, type PriorityGuide } from '@/hooks/usePriorityGuide';

/**
 * The priority picker, with what each level MEANS here under the option.
 *
 * No screen set a priority before this — the dialog had no field and the
 * quick-add hard-coded medium, so a team ran 66 of 70 tasks on medium and
 * asked for "a standard scale with meaning". The scale existed; the picker
 * and the words did not. The words are the team's (project_priority_guide),
 * shown at the moment of choice and read by the agent in the same text.
 */
export function PrioritySelect({ value, onChange, disabled }: { value: Priority; onChange: (p: Priority) => void; disabled?: boolean }) {
  const { data: guide } = usePriorityGuide();
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={(v) => onChange(v as Priority)} disabled={disabled}>
        <SelectTrigger aria-label="Priority"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p} value={p} textValue={p}>
              <span className="capitalize">{p}</span>
              {guide?.[p] && <span className="block max-w-[26rem] whitespace-normal text-[11px] text-muted-foreground">{guide[p]}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{guide?.[value]}</span>
        <button type="button" onClick={() => setEditing(true)} className="shrink-0 underline-offset-2 hover:underline">
          What these mean
        </button>
      </div>
      {editing && guide && <PriorityGuideDialog guide={guide} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** The four sentences, edited where they are used. An empty line goes back to the default. */
function PriorityGuideDialog({ guide, onClose }: { guide: PriorityGuide; onClose: () => void }) {
  const save = useSetPriorityGuide();
  const [draft, setDraft] = useState<PriorityGuide>(guide);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    save.mutate(draft, { onSuccess: onClose });
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>What a priority means here</DialogTitle>
            <DialogDescription>
              One sentence per level, in the team's own words. Agents read the same text when they set a priority. Urgent is what the project view flags as needing attention.
            </DialogDescription>
          </DialogHeader>
          {PRIORITIES.map((p) => (
            <div key={p}>
              <Label htmlFor={`guide-${p}`} className="capitalize">{p}</Label>
              <Input id={`guide-${p}`} value={draft[p]} maxLength={200} onChange={(e) => setDraft({ ...draft, [p]: e.target.value })} />
            </div>
          ))}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
