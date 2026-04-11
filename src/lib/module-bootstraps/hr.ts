import { moduleRegistry } from '@/lib/module-registry';

moduleRegistry.register('hr', {
  bootstrap: async () => {
    const { supabase } = await import('@/integrations/supabase/client');

    const skills = [
      {
        name: 'manage_employee',
        handler: 'flowpilot',
        category: 'data' as const,
        scope: 'global' as const,
        description: 'Create, update, search, and deactivate employee records. Use when: adding new team members, updating roles/departments, offboarding. NOT for: leave requests, documents.',
        tool_definition: {
          type: 'function',
          function: {
            name: 'manage_employee',
            description: 'CRUD operations on employees',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create', 'update', 'search', 'deactivate'] },
                employee_id: { type: 'string' },
                data: { type: 'object' },
              },
              required: ['action'],
            },
          },
        },
      },
      {
        name: 'manage_leave',
        handler: 'flowpilot',
        category: 'data' as const,
        scope: 'global' as const,
        description: 'Create, approve, reject, or list leave requests for employees. Use when: handling vacation/sick requests, reviewing pending leave. NOT for: general employee data.',
        tool_definition: {
          type: 'function',
          function: {
            name: 'manage_leave',
            description: 'Leave request operations',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create', 'approve', 'reject', 'list_pending'] },
                request_id: { type: 'string' },
                employee_id: { type: 'string' },
                data: { type: 'object' },
              },
              required: ['action'],
            },
          },
        },
      },
      {
        name: 'onboarding_checklist',
        handler: 'flowpilot',
        category: 'data' as const,
        scope: 'global' as const,
        description: 'Create and manage onboarding checklists for new employees. Use when: a new employee is added and needs onboarding steps. NOT for: general task management.',
        tool_definition: {
          type: 'function',
          function: {
            name: 'onboarding_checklist',
            description: 'Manage onboarding checklists',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['create', 'update_item', 'get_status'] },
                employee_id: { type: 'string' },
                checklist_id: { type: 'string' },
                data: { type: 'object' },
              },
              required: ['action'],
            },
          },
        },
      },
    ];

    for (const skill of skills) {
      await supabase
        .from('agent_skills')
        .upsert(
          { ...skill, enabled: true, requires_approval: false, origin: 'system' as const, trust_level: 'high' as const },
          { onConflict: 'name' }
        );
    }

    // Automation: daily check for pending leave requests
    const automations = [
      {
        name: 'hr_leave_review_reminder',
        trigger_type: 'cron' as const,
        trigger_config: { cron: '0 9 * * *' },
        skill_name: 'manage_leave',
        skill_arguments: { action: 'list_pending' },
        description: 'Daily reminder to review pending leave requests',
        enabled: true,
      },
    ];

    for (const auto of automations) {
      await supabase
        .from('agent_automations')
        .upsert(auto, { onConflict: 'name' });
    }
  },
  teardown: async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    await supabase.from('agent_skills').delete().in('name', ['manage_employee', 'manage_leave', 'onboarding_checklist']);
    await supabase.from('agent_automations').delete().eq('name', 'hr_leave_review_reminder');
  },
});
