import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { History, ShieldCheck, ShieldOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ROLE_LABELS, type AppRole } from '@/types/cms';

interface AuditRow {
  id: string;
  action: string;
  user_id: string | null;
  created_at: string;
  metadata: { role?: string; module_id?: string } | null;
  actor_email?: string | null;
}

export function RoleAccessAuditPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['role-access-audit'],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('id, action, user_id, created_at, metadata')
        .eq('entity_type', 'role_module_access')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const userIds = Array.from(
        new Set((logs ?? []).map((l) => l.user_id).filter(Boolean) as string[]),
      );
      let emailMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);
        emailMap = Object.fromEntries(
          (profiles ?? []).map((p: any) => [p.id, p.email ?? '']),
        );
      }
      return (logs ?? []).map((l) => ({
        ...(l as any),
        actor_email: l.user_id ? emailMap[l.user_id] ?? null : null,
      }));
    },
    refetchInterval: 15_000,
  });

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Recent permission changes</h2>
        <Badge variant="outline" className="ml-auto text-[10px]">
          last 100
        </Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No permission changes logged yet.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.map((row) => {
            const granted = row.action === 'role_module_access.grant';
            const role = (row.metadata?.role as AppRole) ?? 'unknown';
            const moduleId = row.metadata?.module_id ?? '?';
            return (
              <li key={row.id} className="py-2.5 flex items-start gap-3 text-sm">
                <div
                  className={`mt-0.5 rounded-md p-1.5 ${
                    granted
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {granted ? (
                    <ShieldCheck className="h-3.5 w-3.5" />
                  ) : (
                    <ShieldOff className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">
                      {granted ? 'Granted' : 'Revoked'}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {ROLE_LABELS[role] ?? role}
                    </Badge>
                    <span className="text-muted-foreground">→</span>
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">
                      {moduleId}
                    </code>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.actor_email ?? row.user_id ?? 'system'} ·{' '}
                    {formatDistanceToNow(new Date(row.created_at), {
                      addSuffix: true,
                    })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
