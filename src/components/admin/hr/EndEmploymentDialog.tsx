import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Scale } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useEmployees } from '@/hooks/useEmployees';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { businessToday } from '@/lib/platform-fallbacks';
import { INITIATORS } from '@/lib/hr-guide';
import { logger } from '@/lib/logger';

/** The server's sentence, without the half addressed to an agent (p_force). */
function humanError(message: string, formatDate: (d: string) => string): string {
  const m = message.match(/^The last day (\S+) is shorter than the notice allows \(earliest (\S+)\): (.*?)\. Agree a shorter notice/);
  if (!m) return message;
  return `That is earlier than the notice allows — the earliest last day is ${formatDate(m[2])}. ${m[3]}. Choose a later day, or tick below if you agreed a shorter notice in writing.`;
}

interface Termination { initiator: string; notice_date: string; last_day: string; minimum_last_day: string; rule: string; shortened: boolean }

/**
 * End an employment — the decision the offboarding guide starts from. The
 * same call an agent makes (end_employment): a dry run first says the
 * earliest last day the law allows and why; nothing is written until the
 * person confirms. A shorter notice only when one was agreed in writing.
 */
export function EndEmploymentDialog({ open, employeeId, onOpenChange, onEnded }: {
  open: boolean;
  employeeId?: string;
  onOpenChange: (open: boolean) => void;
  onEnded: (employeeId: string) => void;
}) {
  const qc = useQueryClient();
  const { formatDate } = usePlatformFormat();
  const { data: employees = [] } = useEmployees();
  const [emp, setEmp] = useState<string>('');
  const [initiator, setInitiator] = useState<string>('');
  const [noticeDate, setNoticeDate] = useState<string>(businessToday());
  const [lastDay, setLastDay] = useState<string>('');
  const [reason, setReason] = useState('');
  const [agreedShorter, setAgreedShorter] = useState(false);
  const [preview, setPreview] = useState<Termination | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmp(employeeId ?? ''); setInitiator(''); setNoticeDate(businessToday()); setLastDay('');
    setReason(''); setAgreedShorter(false); setPreview(null); setError(null);
  }, [open, employeeId]);

  const call = async (dryRun: boolean) => {
    const { data, error: rpcErr } = await supabase.rpc('end_employment' as never, {
      p_employee_id: emp, p_initiator: initiator, p_last_day: lastDay || null, p_notice_date: noticeDate || null,
      p_reason: reason.trim() || null, p_dry_run: dryRun, p_force: agreedShorter,
    } as never);
    if (rpcErr) throw rpcErr;
    return data as unknown as { termination: Termination; employee_id: string };
  };

  // The dry run answers as soon as who and when are known.
  useEffect(() => {
    if (!open || !emp || !initiator) { setPreview(null); return; }
    let live = true;
    call(true)
      .then((r) => { if (live) { setPreview(r.termination); setError(null); } })
      .catch((e: Error) => { if (live) { setPreview(null); setError(e.message); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emp, initiator, noticeDate, lastDay, agreedShorter]);

  const save = useMutation({
    mutationFn: () => call(false),
    onSuccess: (r) => {
      toast.success('Recorded — the offboarding guide takes it from here');
      qc.invalidateQueries({ queryKey: ['hr-process-guide'] });
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['onboarding_checklists'] });
      onEnded(r.employee_id);
    },
    onError: (e: Error) => { logger.error('[hr] end_employment failed', e); setError(e.message); },
  });

  const candidates = employees.filter((e) => e.status !== 'terminated');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>End an employment</DialogTitle>
          <DialogDescription>Who ends it and when. You see the notice the law requires before anything is saved.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={emp} onValueChange={setEmp}>
              <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent>
                {candidates.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.title ? ` — ${e.title}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Who ends it</Label>
            <RadioGroup value={initiator} onValueChange={setInitiator} className="gap-2">
              {INITIATORS.map((i) => (
                <label key={i.id} htmlFor={`init-${i.id}`} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 hover:bg-muted/40">
                  <RadioGroupItem id={`init-${i.id}`} value={i.id} className="mt-0.5" />
                  <span><span className="text-sm font-medium">{i.label}</span><span className="block text-xs text-muted-foreground">{i.hint}</span></span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="notice-date">Notice given on</Label>
              <Input id="notice-date" type="date" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last-day">Last day</Label>
              <Input id="last-day" type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} placeholder="the earliest allowed" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="end-reason">Why, in a sentence (kept on the contract)</Label>
            <Textarea id="end-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          {preview && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="flex items-start gap-2">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {preview.rule}. Earliest last day: <span className="font-medium">{formatDate(preview.minimum_last_day)}</span>.
                  {' '}Last day will be <span className="font-medium">{formatDate(preview.last_day)}</span>.
                </span>
              </p>
            </div>
          )}
          {error && (
            <div className="space-y-2">
              <p className="text-sm text-destructive" role="alert">{humanError(error, formatDate)}</p>
              {/shorter than the notice/.test(error) && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={agreedShorter} onCheckedChange={(v) => setAgreedShorter(v === true)} />
                  We agreed a shorter notice in writing
                </label>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!preview || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
