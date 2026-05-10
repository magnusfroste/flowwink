import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';
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

const CALENDAR_SKILLS: SkillSeed[] = [
  {
    name: 'list_events',
    description:
      'List unified calendar events across enabled domain modules (bookings, project tasks, leave requests, contract renewals, recurring billing, SLA deadlines) within a date range. Use when: a user asks "what is on my calendar this week?", planning capacity, surfacing upcoming work, or feeding a digest. NOT for: creating events (use book_appointment for bookings, manage_project_task for tasks, manage_leave for leave). Read-only aggregator.',
    category: 'system',
    handler: 'module:calendar',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_events',
        description: 'List aggregated calendar events from all enabled modules within a range.',
        parameters: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list_events'] },
            start: { type: 'string', description: 'ISO date for range start (e.g. 2026-05-01)' },
            end: { type: 'string', description: 'ISO date for range end (e.g. 2026-05-31)' },
            sources: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional subset of source IDs (e.g. ["bookings","tasks"]). Omit for all enabled.',
            },
          },
          required: ['action', 'start', 'end'],
        },
      },
    },
    instructions:
      'Default to a 7-day window if user is vague. Returned events are normalized: { id, sourceId, title, start, end, url }. Source IDs map to module domains.',
  },
];

/**
 * Calendar — view-only aggregator module.
 *
 * Owns no data. Aggregates events from other modules' tables via the
 * CalendarSource registry (src/lib/calendar-sources.ts).
 */
export const calendarModule = defineModule<Input, Output>({
  id: 'calendar',
  name: 'Calendar',
  version: '1.0.0',
  description: 'Unified calendar aggregating bookings, tasks, leave and renewals',
  capabilities: ['data:read'],
  inputSchema,
  outputSchema,

  skills: ['list_events'],
  skillSeeds: CALENDAR_SKILLS,


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
