import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const timesheetsInputSchema = z.object({
  action: z.enum(['create', 'update', 'list', 'get']),
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  task_id: z.string().uuid().optional(),
  date: z.string().optional(),
  hours: z.number().positive().optional(),
  description: z.string().optional(),
});

const timesheetsOutputSchema = z.object({
  success: z.boolean(),
  entry_id: z.string().optional(),
  message: z.string().optional(),
});

type TimesheetsInput = z.infer<typeof timesheetsInputSchema>;
type TimesheetsOutput = z.infer<typeof timesheetsOutputSchema>;

export const timesheetsModule: ModuleDefinition<TimesheetsInput, TimesheetsOutput> = {
  id: 'timesheets',
  name: 'Timesheets',
  version: '1.0.0',
  description: 'Time tracking for employees and projects with billable/non-billable categorization',
  capabilities: ['data:write', 'data:read'],
  inputSchema: timesheetsInputSchema,
  outputSchema: timesheetsOutputSchema,

  async publish(input: TimesheetsInput): Promise<TimesheetsOutput> {
    const validated = timesheetsInputSchema.parse(input);

    if (validated.action === 'create') {
      const { data, error } = await supabase
        .from('time_entries')
        .insert({
          employee_id: validated.employee_id,
          project_id: validated.project_id,
          task_id: validated.task_id,
          date: validated.date,
          hours: validated.hours,
          description: validated.description,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[timesheets] create failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, entry_id: data.id, message: 'Time entry created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .order('date', { ascending: false })
        .limit(50);

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} time entries` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
