import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const hrInputSchema = z.object({
  action: z.enum(['list_employees', 'get_employee', 'list_leave_requests', 'update_leave_status']),
  id: z.string().uuid().optional(),
  employee_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'denied']).optional(),
});

const hrOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

type HrInput = z.infer<typeof hrInputSchema>;
type HrOutput = z.infer<typeof hrOutputSchema>;

export const hrModule: ModuleDefinition<HrInput, HrOutput> = {
  id: 'hr',
  name: 'HR & Employees',
  version: '1.0.0',
  description: 'Employee directory, leave management, and organizational structure',
  capabilities: ['data:write', 'data:read'],
  inputSchema: hrInputSchema,
  outputSchema: hrOutputSchema,

  async publish(input: HrInput): Promise<HrOutput> {
    const validated = hrInputSchema.parse(input);

    if (validated.action === 'list_employees') {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name')
        .limit(100);

      if (error) {
        logger.error('[hr] list_employees failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} employees` };
    }

    if (validated.action === 'list_leave_requests') {
      let query = supabase
        .from('leave_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (validated.employee_id) {
        query = query.eq('employee_id', validated.employee_id);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} leave requests` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
