import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getEnabledCalendarSources,
  type CalendarEvent,
  type CalendarSource,
  type DateRange,
} from '@/lib/calendar-sources';
import { useModules } from '@/hooks/useModules';

interface UseCalendarEventsOptions {
  range: DateRange;
  /** Subset of source IDs to include. Undefined = all enabled. */
  enabledSourceIds?: string[];
}

export function useCalendarSources(): CalendarSource[] {
  const { data: modules } = useModules();
  return useMemo(() => getEnabledCalendarSources(modules), [modules]);
}

export function useCalendarEvents({ range, enabledSourceIds }: UseCalendarEventsOptions) {
  const sources = useCalendarSources();

  const activeSources = useMemo(
    () => (enabledSourceIds ? sources.filter((s) => enabledSourceIds.includes(s.id)) : sources),
    [sources, enabledSourceIds],
  );

  return useQuery<CalendarEvent[]>({
    queryKey: [
      'calendar-events',
      range.start.toISOString(),
      range.end.toISOString(),
      activeSources.map((s) => s.id).sort(),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        activeSources.map(async (s) => {
          try {
            return await s.fetch(range);
          } catch (e) {
            console.error(`[calendar] source ${s.id} failed`, e);
            return [];
          }
        }),
      );
      return results.flat();
    },
    staleTime: 30_000,
  });
}
