import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface AssignablePerson {
  id: string;
  name: string;
  email: string | null;
  /** True when the person is a member of the project being edited. */
  isMember: boolean;
}

/**
 * Who a task can be given to.
 *
 * `project_tasks.assigned_to` existed in the schema, was read by the task
 * list's "Mine" filter, was a parameter on `manage_project_task`, and was the
 * whole basis of `resource_capacity_report` — but no screen ever set it. On
 * optic that left 62 of 62 tasks unassigned, the capacity report answering with
 * an empty list, and FlowPilot asking "who is driving this?" in a comment
 * thread because the data could not say (2026-09-10).
 *
 * Members of the project come first: on a staffed project they are the likely
 * answer. Everyone else on the instance follows, because a small team often
 * staffs nothing and would otherwise see an empty picker — the failure this
 * hook exists to end.
 */
export function useAssignablePeople(projectId?: string) {
  return useQuery({
    queryKey: ['assignable-people', projectId ?? 'all'],
    queryFn: async (): Promise<AssignablePerson[]> => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true });
      if (error) throw error;

      let memberIds = new Set<string>();
      if (projectId) {
        // A project with no members is the normal case, not an error — the list
        // simply falls back to everyone. An UNREADABLE members table is a
        // different thing, and swallowing it would silently drop the ordering
        // with no way to tell the two apart. Degrade, but say so: the picker
        // still works, just unsorted by membership.
        const { data: members, error: memberErr } = await supabase
          .from('project_members')
          .select('user_id')
          .eq('project_id', projectId);
        if (memberErr) {
          logger.warn('[assignable-people] project members unreadable — listing everyone unsorted', memberErr);
        }
        memberIds = new Set((members ?? []).map((m) => m.user_id).filter(Boolean) as string[]);
      }

      const people: AssignablePerson[] = (profiles ?? []).map((p) => ({
        id: p.id,
        name: (p.full_name || p.email || 'Unnamed').trim(),
        email: p.email ?? null,
        isMember: memberIds.has(p.id),
      }));

      return people.sort((a, b) => {
        if (a.isMember !== b.isMember) return a.isMember ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
