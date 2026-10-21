import { Phone, Mail, Users, CheckSquare, type LucideIcon } from 'lucide-react';
import type { ActivityKind } from '@/hooks/useCrmTasks';

/** One icon and one label per kind, shared by the Tasks card and the kanban chip. */
export const ACTIVITY_KIND_ICON: Record<ActivityKind, LucideIcon> = {
  todo: CheckSquare,
  call: Phone,
  email: Mail,
  meeting: Users,
};

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  todo: 'To-do',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
};
