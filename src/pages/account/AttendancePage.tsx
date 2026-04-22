import { useState } from "react";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { useMyAttendance, useOpenAttendance, useClockIn, useClockOut, formatMinutes } from "@/hooks/useAttendance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, Play, Square } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export default function AttendancePage() {
  const { isEmployee, loading } = useEmployeeSelf();
  const { data: open, isLoading: openLoading } = useOpenAttendance();
  const { data: history } = useMyAttendance(20);
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [breakMin, setBreakMin] = useState(30);
  const [notes, setNotes] = useState("");

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!isEmployee) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-muted-foreground">
          Time & attendance is only available for employees.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Time clock
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {openLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : open ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4">
                <p className="text-sm text-muted-foreground">Currently clocked in</p>
                <p className="text-2xl font-bold tabular-nums">
                  Since {format(new Date(open.clock_in), "HH:mm")} — {formatDistanceToNow(new Date(open.clock_in))}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="break">Break (minutes)</Label>
                  <Input id="break" type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you work on?" />
                </div>
              </div>
              <Button
                onClick={() => clockOut.mutate({ break_minutes: breakMin, notes: notes || undefined })}
                disabled={clockOut.isPending}
                size="lg"
                variant="destructive"
                className="w-full"
              >
                <Square className="h-4 w-4 mr-2" /> Clock out
              </Button>
            </div>
          ) : (
            <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending} size="lg" className="w-full">
              <Play className="h-4 w-4 mr-2" /> Clock in
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent entries</CardTitle>
        </CardHeader>
        <CardContent>
          {!history?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No entries yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{format(new Date(e.clock_in), "EEE MMM d")}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(e.clock_in), "HH:mm")} – {e.clock_out ? format(new Date(e.clock_out), "HH:mm") : "open"}
                      {e.break_minutes > 0 && ` · ${e.break_minutes}m break`}
                    </p>
                  </div>
                  <Badge variant={e.clock_out ? "secondary" : "default"} className="tabular-nums">
                    {formatMinutes(e.total_minutes)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
