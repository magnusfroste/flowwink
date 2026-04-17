import { useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg } from '@fullcalendar/core';
import { Loader2 } from 'lucide-react';

import { useCalendarSources, useCalendarEvents } from '@/hooks/useCalendarEvents';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function CalendarPage() {
  const navigate = useNavigate();
  const calendarRef = useRef<FullCalendar | null>(null);
  const allSources = useCalendarSources();

  const [enabledIds, setEnabledIds] = useState<string[] | null>(null); // null = all
  const [range, setRange] = useState(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  });

  const activeIds = useMemo(
    () => (enabledIds ?? allSources.map((s) => s.id)),
    [enabledIds, allSources],
  );

  const { data: events = [], isLoading } = useCalendarEvents({
    range,
    enabledSourceIds: activeIds,
  });

  const fcEvents = useMemo(() => {
    return events.map((e) => {
      const source = allSources.find((s) => s.id === e.sourceId);
      return {
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        backgroundColor: e.color || source?.color,
        borderColor: e.color || source?.color,
        extendedProps: { url: e.url, sourceId: e.sourceId },
      };
    });
  }, [events, allSources]);

  const handleDatesSet = (arg: DatesSetArg) => {
    setRange({ start: arg.start, end: arg.end });
  };

  const handleEventClick = (arg: EventClickArg) => {
    const url = arg.event.extendedProps?.url as string | undefined;
    if (url) {
      arg.jsEvent.preventDefault();
      navigate(url);
    }
  };

  const toggleSource = (id: string, on: boolean) => {
    const next = new Set(activeIds);
    if (on) next.add(id);
    else next.delete(id);
    setEnabledIds(Array.from(next));
  };

  return (
    <>
      <Helmet>
        <title>Calendar — Admin</title>
      </Helmet>

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Unified view of bookings, tasks, leave and contract renewals.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => calendarRef.current?.getApi().today()}>
            Today
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
          {/* Source toggles */}
          <Card className="p-4 h-fit">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Sources
            </h3>
            {allSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sources available. Enable modules like Bookings, HR or Projects to see events.
              </p>
            ) : (
              <div className="space-y-2">
                {allSources.map((s) => {
                  const checked = activeIds.includes(s.id);
                  const Icon = s.icon;
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`src-${s.id}`}
                        checked={checked}
                        onCheckedChange={(v) => toggleSource(s.id, !!v)}
                      />
                      <Label
                        htmlFor={`src-${s.id}`}
                        className="flex items-center gap-2 cursor-pointer text-sm font-normal flex-1"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                          style={{ backgroundColor: s.color }}
                        />
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{s.label}</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
            {isLoading && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading…
              </div>
            )}
          </Card>

          {/* Calendar */}
          <Card className="p-4 calendar-host">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
              }}
              height="auto"
              events={fcEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              firstDay={1}
              nowIndicator
              dayMaxEvents={4}
              eventDisplay="block"
            />
          </Card>
        </div>
      </div>

      {/* Theme bridge: make FullCalendar adopt our design tokens */}
      <style>{`
        .calendar-host .fc { font-family: inherit; }
        .calendar-host .fc-theme-standard td,
        .calendar-host .fc-theme-standard th,
        .calendar-host .fc-theme-standard .fc-scrollgrid {
          border-color: hsl(var(--border));
        }
        .calendar-host .fc .fc-toolbar-title { font-size: 1.05rem; font-weight: 600; }
        .calendar-host .fc .fc-button {
          background: hsl(var(--secondary));
          color: hsl(var(--secondary-foreground));
          border: 1px solid hsl(var(--border));
          box-shadow: none;
          text-transform: capitalize;
          font-weight: 500;
          padding: 0.35rem 0.7rem;
        }
        .calendar-host .fc .fc-button:hover {
          background: hsl(var(--accent));
          color: hsl(var(--accent-foreground));
        }
        .calendar-host .fc .fc-button-primary:not(:disabled).fc-button-active,
        .calendar-host .fc .fc-button-primary:not(:disabled):active {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-color: hsl(var(--primary));
        }
        .calendar-host .fc .fc-col-header-cell-cushion,
        .calendar-host .fc .fc-daygrid-day-number {
          color: hsl(var(--foreground));
          text-decoration: none;
        }
        .calendar-host .fc .fc-day-today {
          background: hsl(var(--accent) / 0.4) !important;
        }
        .calendar-host .fc-event { cursor: pointer; border-radius: 4px; padding: 1px 4px; font-size: 0.78rem; }
        .calendar-host .fc-list-event:hover td { background: hsl(var(--accent) / 0.4); }
      `}</style>
    </>
  );
}
