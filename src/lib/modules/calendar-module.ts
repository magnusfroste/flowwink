import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import { getEnabledCalendarSources, type CalendarEvent } from '@/lib/calendar-sources';
import { supabase } from '@/integrations/supabase/client';

const inputSchema = z.object({
  action: z.enum(['list_events']).default('list_events'),
  start: z.string().describe('ISO date for range start'),
  end: z.string().describe('ISO date for range end'),
  sources: z.array(z.string()).optional().describe('Optional subset of source IDs'),
});

const outputSchema = z.object({
  success: z.boolean(),
  events: z.array(z.any()).optional(),
  error: z.string().optional(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Calendar — view-only aggregator module.
 *
 * Owns no data. Aggregates events from other modules' tables via the
 * CalendarSource registry (src/lib/calendar-sources.ts).
 */
export const calendarModule = defineModule<Input, Output>({
  id: 'calendar' as any, // added to ModulesSettings in useModules.tsx
  name: 'Calendar',
  version: '1.0.0',
  description: 'Unified calendar aggregating bookings, tasks, leave and renewals',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: ['check_calendar'],

  async publish(input: Input): Promise<Output> {
    try {
      const validated = inputSchema.parse(input);

      // Fetch enabled modules from settings to filter sources
      const { data: settings } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'modules')
        .maybeSingle();

      const modules = (settings?.value as any) ?? {};
      const sources = getEnabledCalendarSources(modules);
      const range = { start: new Date(validated.start), end: new Date(validated.end) };

      const filtered = validated.sources
        ? sources.filter((s) => validated.sources!.includes(s.id))
        : sources;

      const results = await Promise.all(
        filtered.map(async (s) => {
          try {
            return await s.fetch(range);
          } catch {
            return [] as CalendarEvent[];
          }
        }),
      );

      return { success: true, events: results.flat() };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  },
});
