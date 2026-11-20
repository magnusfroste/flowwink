import { useState } from "react";
import { useEmployeeSelf } from "@/hooks/useEmployeeSelf";
import { useMyAttendance, useOpenAttendance, useClockIn, useClockOut } from "@/hooks/useAttendance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, Play, Square } from "lucide-react";
import { useCustomerFormat } from "@/hooks/useCustomerFormat";
import { useUiText } from "@/lib/ui-text";
import { durationWord } from "@/lib/staff-words";

export default function AttendancePage() {
  const { formatDateTime, formatTime } = useCustomerFormat();
  const t = useUiText();
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
          {t('staff.attendance.employeesOnly', 'Time & attendance is only available for employees.')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> {t('staff.attendance.title', 'Time clock')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {openLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : open ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-4">
                <p className="text-sm text-muted-foreground">{t('staff.attendance.clockedIn', 'Currently clocked in')}</p>
                <p className="text-2xl font-bold tabular-nums">
                  {t('staff.attendance.since', 'Since {time} — {duration}').replace('{time}', formatTime(open.clock_in)).replace('{duration}', durationWord((Date.now() - new Date(open.clock_in).getTime()) / 60000, t))}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="break">{t('staff.attendance.break', 'Break (minutes)')}</Label>
                  <Input id="break" type="number" min={0} value={breakMin} onChange={(e) => setBreakMin(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <Label htmlFor="notes">{t('staff.attendance.notes', 'Notes (optional)')}</Label>
                  <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('staff.attendance.notesPlaceholder', 'What did you work on?')} />
                </div>
              </div>
              <Button
                onClick={() => clockOut.mutate({ break_minutes: breakMin, notes: notes || undefined })}
                disabled={clockOut.isPending}
                size="lg"
                variant="destructive"
                className="w-full"
              >
                <Square className="h-4 w-4 mr-2" /> {t('staff.attendance.clockOut', 'Clock out')}
              </Button>
            </div>
          ) : (
            <Button onClick={() => clockIn.mutate()} disabled={clockIn.isPending} size="lg" className="w-full">
              <Play className="h-4 w-4 mr-2" /> {t('staff.attendance.clockIn', 'Clock in')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.attendance.recent', 'Recent entries')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!history?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('staff.attendance.none', 'No entries yet.')}</p>
          ) : (
            <div className="space-y-2">
              {history.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium">{formatDateTime(e.clock_in, { weekday: "short", month: "short", day: "numeric" })}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatTime(e.clock_in)} – {e.clock_out ? formatTime(e.clock_out) : t('staff.attendance.open', 'open')}
                      {e.break_minutes > 0 && ` · ${t('staff.attendance.breakTaken', '{minutes}m break').replace('{minutes}', String(e.break_minutes))}`}
                    </p>
                  </div>
                  <Badge variant={e.clock_out ? "secondary" : "default"} className="tabular-nums">
                    {durationWord(e.total_minutes, t)}
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
