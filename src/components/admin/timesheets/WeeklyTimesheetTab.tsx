import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTimeEntries, useCreateTimeEntry, useDeleteTimeEntry, useProjects, getWeekDates } from '@/hooks/useTimesheets';
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function WeeklyTimesheetTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { weekStart, weekEnd, days } = getWeekDates(weekOffset);

  const { data: entries = [], isLoading } = useTimeEntries(weekStart, weekEnd);
  const { data: projects = [] } = useProjects();
  const createEntry = useCreateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();

  // Quick-add state
  const [selectedProject, setSelectedProject] = useState('');
  const [quickHours, setQuickHours] = useState<Record<string, string>>({});
  const [quickDesc, setQuickDesc] = useState('');

  const handleQuickAdd = async (dayIndex: number) => {
    const date = days[dayIndex];
    const hours = parseFloat(quickHours[date] || '0');
    if (!selectedProject || hours <= 0) return;

    await createEntry.mutateAsync({
      project_id: selectedProject,
      entry_date: date,
      hours,
      description: quickDesc || undefined,
    });
    setQuickHours((prev) => ({ ...prev, [date]: '' }));
  };

  // Group entries by project
  const byProject = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = e.project_id;
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(e);
  }

  // Daily totals
  const dailyTotals = days.map((d) =>
    entries.filter((e) => e.entry_date === d).reduce((s, e) => s + Number(e.hours), 0)
  );
  const weekTotal = dailyTotals.reduce((s, h) => s + h, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Week of {format(parseISO(weekStart), 'MMM d')} – {format(parseISO(weekEnd), 'MMM d, yyyy')}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekOffset((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="grid grid-cols-[200px_repeat(7,1fr)_80px] gap-2 text-xs font-medium text-muted-foreground">
          <span>Project</span>
          {days.map((d, i) => (
            <span key={d} className="text-center">
              {DAY_LABELS[i]}
              <br />
              <span className="text-[10px]">{format(parseISO(d), 'd/M')}</span>
            </span>
          ))}
          <span className="text-right">Total</span>
        </div>

        {/* Existing entries grouped by project */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          Array.from(byProject.entries()).map(([projectId, projectEntries]) => {
            const project = projectEntries[0]?.projects;
            const projectTotal = projectEntries.reduce((s, e) => s + Number(e.hours), 0);

            return (
              <div key={projectId} className="grid grid-cols-[200px_repeat(7,1fr)_80px] gap-2 items-center">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: project?.color || '#6366f1' }}
                  />
                  <span className="text-sm font-medium truncate">{project?.name || 'Unknown'}</span>
                </div>
                {days.map((d) => {
                  const dayEntries = projectEntries.filter((e) => e.entry_date === d);
                  const dayHours = dayEntries.reduce((s, e) => s + Number(e.hours), 0);
                  return (
                    <div key={d} className="text-center text-sm group relative">
                      {dayHours > 0 ? (
                        <span className="font-medium">{dayHours}</span>
                      ) : (
                        <span className="text-muted-foreground/30">–</span>
                      )}
                      {dayEntries.length === 1 && (
                        <button
                          className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteEntry.mutate(dayEntries[0].id)}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <span className="text-right text-sm font-semibold">{projectTotal}h</span>
              </div>
            );
          })
        )}

        {/* Totals row */}
        <div className="grid grid-cols-[200px_repeat(7,1fr)_80px] gap-2 border-t pt-2">
          <span className="text-sm font-semibold">Daily total</span>
          {dailyTotals.map((t, i) => (
            <span key={i} className={`text-center text-sm font-semibold ${t >= 8 ? 'text-primary' : t > 0 ? 'text-foreground' : 'text-muted-foreground/30'}`}>
              {t > 0 ? `${t}h` : '–'}
            </span>
          ))}
          <span className="text-right text-sm font-bold text-primary">{weekTotal}h</span>
        </div>

        {/* Quick add row */}
        <div className="border-t pt-4 space-y-3">
          <div className="flex items-center gap-3">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Description (optional)"
              value={quickDesc}
              onChange={(e) => setQuickDesc(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="grid grid-cols-[200px_repeat(7,1fr)_80px] gap-2">
            <span className="text-xs text-muted-foreground flex items-center">
              <Plus className="h-3 w-3 mr-1" /> Log hours
            </span>
            {days.map((d, i) => (
              <div key={d} className="flex gap-1">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  placeholder="0"
                  value={quickHours[d] || ''}
                  onChange={(e) => setQuickHours((prev) => ({ ...prev, [d]: e.target.value }))}
                  className="text-center text-sm h-8"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleQuickAdd(i);
                  }}
                />
              </div>
            ))}
            <div />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
