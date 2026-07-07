import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useTechnicians, checkTechnicianAvailability, type AvailabilityResult } from '@/hooks/useFieldServiceRpc';
import { useScheduleServiceOrder } from '@/hooks/useFieldService';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';

interface Props {
  orderId: string | null;
  onClose: () => void;
}

export function ScheduleVisitDialog({ orderId, onClose }: Props) {
  const { data: techs } = useTechnicians();
  const schedule$ = useScheduleServiceOrder();
  const [tech, setTech] = useState<string>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  useEffect(() => {
    if (!orderId) {
      setTech(''); setStart(''); setEnd(''); setResult(null);
    }
  }, [orderId]);

  useEffect(() => {
    setResult(null);
    if (!tech || !start || !end) return;
    let cancelled = false;
    setChecking(true);
    checkTechnicianAvailability({
      technician_id: tech, start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => { logger.error('avail check', e); if (!cancelled) setResult({ available: true, conflicts: [] }); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [tech, start, end]);

  async function submit() {
    if (!orderId || !start || !end) return;
    try {
      await schedule$.mutateAsync({
        id: orderId,
        scheduled_start: new Date(start).toISOString(),
        scheduled_end: new Date(end).toISOString(),
        technician_id: tech || undefined,
      });
      onClose();
    } catch (e) { logger.error('schedule', e); }
  }

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule visit</DialogTitle>
          <DialogDescription>Assign a technician and time window. Availability is checked but not enforced.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Technician</Label>
            <Select value={tech} onValueChange={setTech}>
              <SelectTrigger><SelectValue placeholder="Pick technician" /></SelectTrigger>
              <SelectContent>
                {(techs ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}{t.title ? ` — ${t.title}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>End</Label><Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>

          {tech && start && end && (
            <div className="rounded-md border p-3 text-sm">
              {checking ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking availability…
                </div>
              ) : result?.available ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" /> Available
                </div>
              ) : result ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> {result.conflicts.length} conflicting visit(s) — you may override
                  </div>
                  <ul className="text-xs text-muted-foreground list-disc pl-5">
                    {result.conflicts.map((c, i) => (
                      <li key={i}>
                        {c.order_number ?? c.service_order_id?.slice(0, 8) ?? 'visit'}
                        {c.scheduled_start && ` · ${format(new Date(c.scheduled_start), 'PP HH:mm')}`}
                        {c.scheduled_end && `–${format(new Date(c.scheduled_end), 'HH:mm')}`}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!start || !end || schedule$.isPending}>
            {schedule$.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirm visit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
