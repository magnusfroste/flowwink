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
  {
    name: 'manage_calendar_event',
    description: 'Create, update, delete or list standalone calendar events (meetings, deadlines) with attendees. Use when: scheduling an internal meeting or deadline; listing what is on the calendar. NOT for: customer bookings (book_appointment / manage_bookings) — those live in the booking module and are aggregated separately.',
    category: 'crm',
    handler: 'rpc:manage_calendar_event',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_calendar_event',
        description: 'CRUD for calendar_events. list takes an optional p_from/p_to range (defaults: -7d to +30d).',
        parameters: {
          type: 'object',
          required: ['p_action'],
          properties: {
            p_action: { type: 'string', enum: ['list', 'create', 'update', 'delete'] },
            p_event_id: { type: 'string', format: 'uuid' },
            p_title: { type: 'string' },
            p_description: { type: 'string' },
            p_starts_at: { type: 'string', description: 'ISO timestamp' },
            p_ends_at: { type: 'string', description: 'ISO timestamp (must be >= starts_at)' },
            p_all_day: { type: 'boolean' },
            p_location: { type: 'string' },
            p_attendees: { type: 'array', items: { type: 'object' }, description: '[{email, name?}]' },
            p_from: { type: 'string', description: 'list: range start (ISO)' },
            p_to: { type: 'string', description: 'list: range end (ISO)' },
          },
        },
      },
    },
    instructions: 'Standalone events only — bookings remain in the booking module (list_events aggregates both views for read). Admin/service-role for mutations; staff can read.',
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
  processes: ['hire-to-retire', 'lead-to-customer'],
  maturity: 'L3',
  description: 'Unified calendar aggregating bookings, tasks, leave and renewals',
  capabilities: ['data:read'],
  tier: 'standard',
  inputSchema,
  outputSchema,

  skills: ['list_events', 'manage_calendar_event'],
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
