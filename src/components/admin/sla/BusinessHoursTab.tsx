import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Save } from 'lucide-react';
import {
  useBusinessHours,
  useSetBusinessHours,
  useClearBusinessDay,
  useAddBusinessHoliday,
  useRemoveBusinessHoliday,
} from '@/hooks/useBusinessHours';

// 0 = Sunday … 6 = Saturday. Display Mon → Sun.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

const toHm = (t: string | null | undefined): string => {
  if (!t) return '';
  // Accept "HH:MM" or "HH:MM:SS"
  const [h, m] = t.split(':');
  return `${h}:${m}`;
};

interface RowDraft {
  is_open: boolean;
  open_time: string;
  close_time: string;
  dirty: boolean;
}

export function BusinessHoursTab() {
  const { data, isLoading } = useBusinessHours();
  const setHours = useSetBusinessHours();
  const clearDay = useClearBusinessDay();
  const addHoliday = useAddBusinessHoliday();
  const removeHoliday = useRemoveBusinessHoliday();

  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');

  const byWeekday = useMemo(() => {
    const m = new Map<number, { is_open: boolean; open_time: string; close_time: string }>();
    (data?.hours ?? []).forEach((h) => {
      m.set(h.weekday, {
        is_open: h.is_open,
        open_time: toHm(h.open_time) || '09:00',
        close_time: toHm(h.close_time) || '17:00',
      });
    });
    return m;
  }, [data]);

  const getRow = (wd: number): RowDraft => {
    if (drafts[wd]) return drafts[wd];
    const src = byWeekday.get(wd);
    return {
      is_open: src?.is_open ?? false,
      open_time: src?.open_time ?? '09:00',
      close_time: src?.close_time ?? '17:00',
      dirty: false,
    };
  };

  const patch = (wd: number, p: Partial<RowDraft>) =>
    setDrafts((d) => ({ ...d, [wd]: { ...getRow(wd), ...p, dirty: true } }));

  const save = async (wd: number) => {
    const row = getRow(wd);
    if (!row.is_open) {
      await clearDay.mutateAsync(wd);
    } else {
      await setHours.mutateAsync({
        p_weekday: wd,
        p_open_time: row.open_time,
        p_close_time: row.close_time,
        p_is_open: true,
      });
    }
    setDrafts((d) => {
      const { [wd]: _drop, ...rest } = d;
      return rest;
    });
  };

  const submitHoliday = async () => {
    if (!holidayDate) return;
    await addHoliday.mutateAsync({ p_holiday: holidayDate, p_holiday_name: holidayName.trim() });
    setHolidayDate('');
    setHolidayName('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Weekly schedule</CardTitle>
          <p className="text-sm text-muted-foreground">
            Working-hours SLA timers only tick during open hours and skip holidays. Toggle a day closed to
            exclude it from SLA calculation.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4">Loading…</div>
          ) : (
            <div className="divide-y">
              {WEEKDAYS.map(({ value, label }) => {
                const row = getRow(value);
                const busy = setHours.isPending || clearDay.isPending;
                return (
                  <div
                    key={value}
                    className="grid grid-cols-1 md:grid-cols-[10rem_auto_1fr_1fr_auto] items-center gap-3 py-3"
                  >
                    <div className="font-medium">{label}</div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`open-${value}`}
                        checked={row.is_open}
                        onCheckedChange={(v) => patch(value, { is_open: v })}
                      />
                      <Label htmlFor={`open-${value}`} className="text-sm">
                        {row.is_open ? 'Open' : 'Closed'}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`from-${value}`} className="text-xs text-muted-foreground w-10">
                        From
                      </Label>
                      <Input
                        id={`from-${value}`}
                        type="time"
                        value={row.open_time}
                        disabled={!row.is_open}
                        onChange={(e) => patch(value, { open_time: e.target.value })}
                        className="w-32"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`to-${value}`} className="text-xs text-muted-foreground w-10">
                        To
                      </Label>
                      <Input
                        id={`to-${value}`}
                        type="time"
                        value={row.close_time}
                        disabled={!row.is_open}
                        onChange={(e) => patch(value, { close_time: e.target.value })}
                        className="w-32"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant={row.dirty ? 'default' : 'outline'}
                      disabled={!row.dirty || busy}
                      onClick={() => save(value)}
                    >
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                      Save
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
          <p className="text-sm text-muted-foreground">
            Days SLA timers are paused regardless of weekly schedule.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="hol-date">Date</Label>
              <Input
                id="hol-date"
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="grid gap-2 flex-1 min-w-[12rem]">
              <Label htmlFor="hol-name">Name (optional)</Label>
              <Input
                id="hol-name"
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="e.g. Midsummer's Eve"
              />
            </div>
            <Button onClick={submitHoliday} disabled={!holidayDate || addHoliday.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>

          <div className="rounded-lg border divide-y">
            {(data?.holidays ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No holidays configured</div>
            ) : (
              [...(data?.holidays ?? [])]
                .sort((a, b) => a.holiday.localeCompare(b.holiday))
                .map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">
                        {h.holiday}
                      </Badge>
                      <span className="text-sm">{h.name || <span className="text-muted-foreground">—</span>}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Remove holiday ${h.holiday}?`)) removeHoliday.mutate(h.holiday);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
