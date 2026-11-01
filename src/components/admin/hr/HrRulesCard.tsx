import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Scale, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { describeTiers, type HrRules, type NoticeTier } from '@/lib/hr-guide';
import { logger } from '@/lib/logger';

interface RulesAnswer { country: string; rules: HrRules | null; template: HrRules | null }

async function rpc(action: string, rules?: Partial<HrRules>): Promise<RulesAnswer> {
  const { data, error } = await supabase.rpc('manage_hr_rules' as never, { p_action: action, p_rules: rules ?? null } as never);
  if (error) throw error;
  return data as unknown as RulesAnswer;
}

/**
 * The employment rules the guides and End an employment read — the FlowWink
 * template for the business country, or the company's own terms, which win.
 * The same rows an agent reads and writes (manage_hr_rules).
 */
export function HrRulesCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['hr-rules'], queryFn: () => rpc('get') });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['hr-rules'] }); qc.invalidateQueries({ queryKey: ['hr-process-guide'] }); };
  const reset = useMutation({
    mutationFn: () => rpc('reset'),
    onSuccess: () => { toast.success('Back to the template'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return null;
  const r = data.rules;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg"><Scale className="h-5 w-5 text-primary" /> Employment rules</CardTitle>
          <CardDescription>
            What the guides and End an employment check against
            {data.country ? <> — for <span className="font-medium text-foreground">{r?.label ?? data.country}</span></> : null}.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {r?.origin === 'own' && data.template && (
            <Button size="sm" variant="ghost" onClick={() => reset.mutate()} disabled={reset.isPending}>Back to template</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={!data.country}>
            {r ? (r.origin === 'own' ? 'Edit your terms' : 'Adjust') : 'Save your terms'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!data.country ? (
          <p className="text-muted-foreground">Set the business country (Site Settings → General) and the matching template applies.</p>
        ) : !r ? (
          <p className="text-muted-foreground">
            No template for {data.country}. The guides still show every step, but without rule lines, and End an employment only checks the contract's notice. Save your own terms — your employment law or collective agreement.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-normal">{r.origin === 'own' ? 'Your own terms' : 'FlowWink template'}</Badge>
              {r.notes && <span className="text-xs text-muted-foreground">{r.notes}</span>}
            </div>
            <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Employer's notice</dt><dd>{describeTiers(r.employer_notice) || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Employee's notice</dt><dd>{describeTiers(r.employee_notice) || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Probation</dt><dd>{r.probation_max_months != null ? `at most ${r.probation_max_months} months, ${r.probation_end_notice_days ?? 0} days to end it` : '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Vacation</dt><dd>{r.vacation_days != null ? `${r.vacation_days} days a year` : '—'}</dd></div>
            </dl>
          </>
        )}
      </CardContent>
      <RulesDialog open={editing} onOpenChange={setEditing} country={data.country} start={r ?? data.template} onSaved={refresh} />
    </Card>
  );
}

function TierEditor({ label, tiers, onChange }: { label: string; tiers: NoticeTier[]; onChange: (t: NoticeTier[]) => void }) {
  const set = (i: number, patch: Partial<{ from_years: number; amount: number; unit: 'months' | 'days' }>) => {
    onChange(tiers.map((t, j) => {
      if (j !== i) return t;
      const unit = patch.unit ?? ('months' in t && t.months != null ? 'months' : 'days');
      const amount = patch.amount ?? (t.months ?? t.days ?? 0);
      return { from_years: patch.from_years ?? t.from_years, ...(unit === 'months' ? { months: amount } : { days: amount }) };
    }));
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {tiers.map((t, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">from</span>
          <Input type="number" min={0} step="0.25" className="h-8 w-20" value={t.from_years} onChange={(e) => set(i, { from_years: Number(e.target.value) })} />
          <span className="text-muted-foreground">years:</span>
          <Input type="number" min={0} className="h-8 w-20" value={t.months ?? t.days ?? 0} onChange={(e) => set(i, { amount: Number(e.target.value) })} />
          <Select value={t.months != null ? 'months' : 'days'} onValueChange={(v) => set(i, { unit: v as 'months' | 'days' })}>
            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="months">months</SelectItem><SelectItem value="days">days</SelectItem></SelectContent>
          </Select>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => onChange(tiers.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onChange([...tiers, { from_years: tiers.length ? Math.max(...tiers.map((t) => t.from_years)) + 1 : 0, months: 1 }])}>
        <Plus className="mr-1 h-3 w-3" /> Add a step
      </Button>
    </div>
  );
}

function RulesDialog({ open, onOpenChange, country, start, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; country: string; start: HrRules | null; onSaved: () => void;
}) {
  const [label, setLabel] = useState('');
  const [employer, setEmployer] = useState<NoticeTier[]>([]);
  const [employee, setEmployee] = useState<NoticeTier[]>([]);
  const [probMax, setProbMax] = useState('');
  const [probNotice, setProbNotice] = useState('');
  const [vacation, setVacation] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!open) return;
    setLabel(start?.label ?? country);
    setEmployer(start?.employer_notice ?? [{ from_years: 0, months: 1 }]);
    setEmployee(start?.employee_notice ?? [{ from_years: 0, months: 1 }]);
    setProbMax(start?.probation_max_months?.toString() ?? '');
    setProbNotice(start?.probation_end_notice_days?.toString() ?? '');
    setVacation(start?.vacation_days?.toString() ?? '');
    setNotes(start?.origin === 'own' ? (start.notes ?? '') : '');
  }, [open, start, country]);
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const save = useMutation({
    mutationFn: () => rpc('save', {
      label, employer_notice: employer, employee_notice: employee,
      probation_max_months: num(probMax), probation_end_notice_days: num(probNotice), vacation_days: num(vacation), notes: notes.trim() || null,
    }),
    onSuccess: () => { toast.success('Your terms are saved — they win over the template'); onSaved(); onOpenChange(false); },
    onError: (e: Error) => { logger.error('[hr] save rules failed', e); toast.error(e.message); },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Employment rules for {country}</DialogTitle>
          <DialogDescription>
            Your own terms — from your country's law or your collective agreement. They win over the template; the rule text on each guide step stays the template's unless an agent saves your own.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="rules-label">Name</Label><Input id="rules-label" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <TierEditor label="Employer's notice, by length of employment" tiers={employer} onChange={setEmployer} />
          <TierEditor label="Employee's notice" tiers={employee} onChange={setEmployee} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="prob-max">Longest probation (months)</Label><Input id="prob-max" type="number" min={0} value={probMax} onChange={(e) => setProbMax(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="prob-notice">Notice to end it (days)</Label><Input id="prob-notice" type="number" min={0} value={probNotice} onChange={(e) => setProbNotice(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="vac">Vacation days a year</Label><Input id="vac" type="number" min={0} value={vacation} onChange={(e) => setVacation(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="rules-notes">Where the terms come from</Label><Textarea id="rules-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. our collective agreement, 2026" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
