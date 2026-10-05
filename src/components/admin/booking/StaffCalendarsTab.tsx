import { useEffect, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEmployees } from '@/hooks/useEmployees';
import { useBookingServices } from '@/hooks/useBookings';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { useStaffCalendar, useStaffCalendarMutation, type StaffHoursWindow } from '@/hooks/useStaffCalendars';

/**
 * Bookings → Staff: one person's booking calendar. Weekly hours (empty = the
 * opening hours apply), time off, and the services they perform. A service
 * with at least one person is booked per person: the widget offers a time when
 * any of them is free and the booking is given one of them.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function StaffCalendarsTab() {
  const { data: employees = [] } = useEmployees();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const active = employees.filter((e) => e.status === 'active');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Staff calendars</CardTitle>
          <CardDescription>
            Each person's working hours, time off and services. Nobody is booked twice at the same time, and a service with
            staff is only offered when one of them is free.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-1">
            <Label>Staff member</Label>
            <Select value={employeeId ?? ''} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent>
                {active.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {active.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="mx-auto h-10 w-10 mb-2 opacity-50" />
              <p>No active employees yet — add people under HR first</p>
            </div>
          )}
        </CardContent>
      </Card>
      {employeeId && <StaffCalendarEditor key={employeeId} employeeId={employeeId} />}
    </div>
  );
}

function StaffCalendarEditor({ employeeId }: { employeeId: string }) {
  const { data: cal } = useStaffCalendar(employeeId);
  const { data: services = [] } = useBookingServices();
  const save = useStaffCalendarMutation();
  const { formatDateTime } = usePlatformFormat();
  const [hours, setHours] = useState<StaffHoursWindow[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [off, setOff] = useState({ starts: '', ends: '', reason: '' });

  useEffect(() => {
    if (!cal) return;
    setHours(cal.hours);
    setServiceIds(cal.services.map((s) => s.id));
  }, [cal]);

  if (!cal) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const setWindow = (i: number, patch: Partial<StaffHoursWindow>) =>
    setHours((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const sorted = hours
    .map((h, i) => ({ h, i }))
    .sort((a, b) => WEEK_ORDER.indexOf(a.h.day_of_week) - WEEK_ORDER.indexOf(b.h.day_of_week) || a.h.start_time.localeCompare(b.h.start_time));
  const hoursValid = hours.every((h) => h.start_time && h.end_time && h.end_time > h.start_time);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Working hours</CardTitle>
          <CardDescription>
            {cal.follows_opening_hours && hours.length === 0
              ? 'No hours of their own — they follow the opening hours.'
              : `Local time (${cal.timezone}). Bookings must fit inside a window.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {sorted.map(({ h, i }) => (
            <div key={i} className="grid grid-cols-[1fr_6.5rem_6.5rem_auto] gap-2 items-center">
              <Select value={String(h.day_of_week)} onValueChange={(v) => setWindow(i, { day_of_week: Number(v) })}>
                <SelectTrigger aria-label="Day"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEK_ORDER.map((d) => <SelectItem key={d} value={String(d)}>{DAYS[d]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="time" aria-label="Start" value={h.start_time} onChange={(e) => setWindow(i, { start_time: e.target.value })} />
              <Input type="time" aria-label="End" value={h.end_time} onChange={(e) => setWindow(i, { end_time: e.target.value })} />
              <Button variant="ghost" size="icon" aria-label="Remove window" onClick={() => setHours((hs) => hs.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setHours((hs) => [...hs, { day_of_week: 1, start_time: '09:00', end_time: '17:00' }])}>
              <Plus className="h-4 w-4 mr-1" /> Add window
            </Button>
            <Button size="sm" disabled={!hoursValid || save.isPending}
              onClick={() => save.mutate({ p_action: 'set_hours', p_employee_id: employeeId, p_hours: hours })}>
              Save hours
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Services</CardTitle>
          <CardDescription>Who performs what. A service with people is booked per person.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={serviceIds.includes(s.id)}
                onCheckedChange={(c) => setServiceIds((ids) => (c ? [...ids, s.id] : ids.filter((x) => x !== s.id)))}
              />
              {s.name}
            </label>
          ))}
          <Button size="sm" className="mt-2" disabled={save.isPending}
            onClick={() => save.mutate({ p_action: 'set_services', p_employee_id: employeeId, p_service_ids: serviceIds })}>
            Save services
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time off</CardTitle>
          <CardDescription>Holiday, sick leave, courses. Existing bookings are not moved — you are told about them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {cal.time_off.length === 0 && <p className="text-sm text-muted-foreground">Nothing planned.</p>}
          {cal.time_off.map((t) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <span>{formatDateTime(t.starts_at)} – {formatDateTime(t.ends_at)}</span>
              {t.reason && <Badge variant="outline">{t.reason}</Badge>}
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Remove time off"
                onClick={() => save.mutate({ p_action: 'remove_time_off', p_employee_id: employeeId, p_time_off_id: t.id })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-end pt-2">
            <Input type="datetime-local" aria-label="From" value={off.starts} onChange={(e) => setOff((o) => ({ ...o, starts: e.target.value }))} />
            <Input type="datetime-local" aria-label="To" value={off.ends} onChange={(e) => setOff((o) => ({ ...o, ends: e.target.value }))} />
            <Input placeholder="Reason" value={off.reason} onChange={(e) => setOff((o) => ({ ...o, reason: e.target.value }))} />
            <Button size="sm" disabled={!off.starts || !off.ends || off.ends <= off.starts || save.isPending}
              onClick={() => {
                save.mutate({
                  p_action: 'add_time_off', p_employee_id: employeeId,
                  // datetime-local is the admin's wall clock; the browser's offset makes it an instant.
                  p_starts_at: new Date(off.starts).toISOString(), p_ends_at: new Date(off.ends).toISOString(),
                  p_reason: off.reason || null,
                });
                setOff({ starts: '', ends: '', reason: '' });
              }}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next two weeks</CardTitle>
        </CardHeader>
        <CardContent>
          {cal.bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {cal.bookings.map((b) => (
                <li key={b.id} className="flex gap-2">
                  <span className="tabular-nums">{formatDateTime(b.start_time)}</span>
                  <Badge variant="outline">{b.status}</Badge>
                  <span className="text-muted-foreground">{services.find((s) => s.id === b.service_id)?.name ?? ''}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
