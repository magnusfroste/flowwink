import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ScreeningQuestion, ScreeningType } from '../../../../supabase/functions/_shared/recruitment/application-intake';

/**
 * The questions a candidate answers when applying — stored on the posting as
 * meta.screening_questions, read by the public form and enforced by
 * process-job-application (the same shape an agent writes through
 * manage_job_posting). A "flag" answer never rejects anyone; it is shown to
 * the recruiter on the candidate's card.
 */
export function ScreeningQuestionsEditor({ value, onChange }: { value: ScreeningQuestion[]; onChange: (next: ScreeningQuestion[]) => void }) {
  const set = (i: number, patch: Partial<ScreeningQuestion>) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const add = () => onChange([...value, { id: `q${Date.now().toString(36)}`, label: '', type: 'yes_no', required: true }]);

  return (
    <div className="space-y-3">
      {value.length === 0 && <p className="text-xs text-muted-foreground">No questions — candidates send their CV and contact details only.</p>}
      {value.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center gap-2">
            <Input value={q.label} placeholder="e.g. Do you hold a B driving licence?" onChange={(e) => set(i, { label: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove question" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Select value={q.type} onValueChange={(v) => set(i, { type: v as ScreeningType, knockout: undefined })}>
              <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes_no">Yes / no</SelectItem>
                <SelectItem value="choice">Choice</SelectItem>
                <SelectItem value="text">Free text</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2"><Switch checked={!!q.required} onCheckedChange={(v) => set(i, { required: v })} /> Required</label>
            {q.type === 'yes_no' && (
              <label className="flex items-center gap-2">
                Flag the answer
                <Select value={q.knockout ?? 'none'} onValueChange={(v) => set(i, { knockout: v === 'none' ? undefined : v })}>
                  <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
          {q.type === 'choice' && (
            <Input
              className="h-8 text-xs"
              placeholder="Options, comma separated"
              value={(q.options ?? []).join(', ')}
              onChange={(e) => set(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" /> Add question</Button>
    </div>
  );
}
