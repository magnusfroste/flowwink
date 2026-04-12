import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const projectsInputSchema = z.object({
  action: z.enum(['create', 'list', 'get', 'update', 'list_tasks', 'create_task']),
  id: z.string().uuid().optional(),
  name: z.string().optional(),
  project_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  // Task fields
  title: z.string().optional(),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  due_date: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
});

const projectsOutputSchema = z.object({
  success: z.boolean(),
  project_id: z.string().optional(),
  task_id: z.string().optional(),
  message: z.string().optional(),
});

type ProjectsInput = z.infer<typeof projectsInputSchema>;
type ProjectsOutput = z.infer<typeof projectsOutputSchema>;

export const projectsModule: ModuleDefinition<ProjectsInput, ProjectsOutput> = {
  id: 'projects',
  name: 'Projects',
  version: '1.0.0',
  description: 'Project and task management with Kanban boards, assignments, and time tracking integration',
  capabilities: ['data:write', 'data:read'],
  inputSchema: projectsInputSchema,
  outputSchema: projectsOutputSchema,

  async publish(input: ProjectsInput): Promise<ProjectsOutput> {
    const validated = projectsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.name) {
        return { success: false, message: 'name is required' };
      }

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: validated.name,
          is_active: validated.is_active ?? true,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[projects] create failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, project_id: data.id, message: 'Project created' };
    }

    if (validated.action === 'create_task') {
      if (!validated.title || !validated.project_id) {
        return { success: false, message: 'title and project_id are required' };
      }

      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          title: validated.title,
          project_id: validated.project_id,
          description: validated.description,
          assigned_to: validated.assigned_to,
          due_date: validated.due_date,
          priority: validated.priority || 'medium',
          status: validated.status || 'todo',
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[projects] create_task failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, task_id: data.id, message: 'Task created' };
    }

    if (validated.action === 'list') {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} projects` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
