import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Play, Square, Plus, Trash2, Clock } from "lucide-react";
import {
  useAddTicketTimeEntry,
  useDeleteTicketTimeEntry,
  useTicketTimeEntries,
} from "@/hooks/useTicketTimeEntries";

interface Props { ticketId: string }

export function TicketTimeEntriesPanel({ ticketId }: Props) {
  const { data: entries = [] } = useTicketTimeEntries(ticketId);
  const addEntry = useAddTicketTimeEntry();
  const delEntry = useDeleteTicketTimeEntry();

  const [minutes, setMinutes] = useState<string>("");
  const [note, setNote] = useState("");
  const [billable, setBillable] = useState(true);

  // Timer state
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!timerStart) return;
    const int = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(int);
  }, [timerStart]);

  const elapsedMin = timerStart ? Math.max(1, Math.round((now - timerStart) / 60000)) : 0;
  const totalMin = useMemo(() => entries.reduce((s, e) => s + e.minutes, 0), [entries]);
  const billableMin = useMemo(() => entries.filter(e => e.billable).reduce((s, e) => s + e.minutes, 0), [entries]);

  const stopTimer = () => {
    if (!timerStart) return;
    const mins = Math.max(1, Math.round((Date.now() - timerStart) / 60000));
    addEntry.mutate(
      {
        ticket_id: ticketId,
        minutes: mins,
        note: note.trim() || `Timer: ${mins} min`,
        billable,
        started_at: new Date(timerStart).toISOString(),
      },
      { onSuccess: () => { setTimerStart(null); setNote(""); } }
    );
  };

  const addManual = () => {
    const m = Number(minutes);
    if (!m || m <= 0) return;
    addEntry.mutate(
      { ticket_id: ticketId, minutes: m, note: note.trim() || undefined, billable },
      { onSuccess: () => { setMinutes(""); setNote(""); } }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Time tracking</h4>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Total <span className="font-medium text-foreground">{formatMin(totalMin)}</span>
          {billableMin !== totalMin && <> · Billable {formatMin(billableMin)}</>}
        </div>
      </div>

      {/* Timer / manual entry */}
      <div className="border border-border rounded-md p-3 space-y-2 bg-muted/30">
        <div className="flex items-center gap-2">
          {timerStart ? (
            <>
              <Button size="sm" variant="destructive" onClick={stopTimer} className="gap-1.5">
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
              <span className="text-sm tabular-nums font-medium">Running: {elapsedMin} min</span>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setTimerStart(Date.now())} className="gap-1.5">
              <Play className="h-3.5 w-3.5" /> Start timer
            </Button>
          )}
          <div className="mx-2 text-xs text-muted-foreground">or</div>
          <Input
            type="number"
            min={1}
            placeholder="Minutes"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-8 text-sm w-24"
          />
          <Button size="sm" onClick={addManual} disabled={!minutes || addEntry.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Log
          </Button>
        </div>
        <Textarea
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={1}
          className="text-sm resize-none"
        />
        <div className="flex items-center gap-2">
          <Switch checked={billable} onCheckedChange={setBillable} />
          <span className="text-xs text-muted-foreground">Billable</span>
        </div>
      </div>

      {/* Entries list */}
      <div className="space-y-1.5">
        {entries.map((e) => (
          <div key={e.id} className="flex items-start justify-between rounded-md border border-border px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium">{formatMin(e.minutes)}</span>
                {e.billable && <Badge variant="outline" className="text-[10px]">Billable</Badge>}
                <span className="text-xs text-muted-foreground">{e.user_name ?? "Agent"}</span>
              </div>
              {e.note && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{e.note}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => delEntry.mutate({ id: e.id, ticket_id: ticketId })}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-3">No time logged yet</div>
        )}
      </div>
    </div>
  );
}

function formatMin(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
