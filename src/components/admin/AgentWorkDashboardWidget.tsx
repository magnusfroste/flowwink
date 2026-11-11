import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Ban, AlertTriangle, Flag as FlagIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { WidgetShell, MetricTile } from '@/components/admin/DashboardWidgetShell';
import { Link } from 'react-router-dom';
import { useActiveModules, skillShown, moduleShown, ownerModuleOf } from '@/lib/module-visibility';
import { useModules } from '@/hooks/useModules';
import { logger } from '@/lib/logger';
import { useModuleAccess } from '@/hooks/useRoleModuleAccess';
import { navigationGroups } from '@/components/admin/adminNavigation';
import { classifyCall } from '../../../supabase/functions/_shared/skills/read-surface';
import { useBusinessClock } from '@/hooks/useBusinessClock';
import { summarizeAgentWork, mergeFlags, type AgentActivityRow, type TaskCommentRow, type CheckFinding } from '@/lib/agent-work';

/**
 * Agent work, in plain words (#869): what the agents did today, what waits on
 * a person, and where an agent was stopped — for an owner, not a developer.
 * The reading is src/lib/agent-work.ts; this only fetches and draws.
 *
 * Role-scoped by the data's own policy: an admin reads everything, staff read
 * the agent work of the modules their role is granted (agent_activity.module,
 * 20261111090000). What a reader may not see is simply not in the answer.
 */
const WINDOW_DAYS = 7;
const AREA_LIMIT = 6;

/** The first admin page of a module, as the sidebar lists it. */
function modulePage(moduleId: string): string | null {
  for (const group of navigationGroups) {
    const item = group.items.find((i) => i.moduleId === moduleId);
    if (item) return item.href;
  }
  return null;
}

/** Where a person goes to deal with a flagged area — the area's own page. */
const AREA_PAGE: Record<string, string> = {
  sales: '/admin/deals',
  receivables: '/admin/invoices',
  contracts: '/admin/contracts',
  support: '/admin/tickets',
  field_service: '/admin/field-service',
  automations: '/admin/automations',
  chat: '/admin/chat',
  books: '/admin/accounting',
};
/** The module a flagged area belongs to in the role matrix. Automations are the admin's. */
const AREA_MODULE: Record<string, string> = {
  sales: 'deals', receivables: 'invoicing', contracts: 'contracts', support: 'tickets',
  field_service: 'fieldService', chat: 'chat', books: 'accounting',
};
const AREA_NAME: Record<string, string> = {
  sales: 'Sales', receivables: 'Receivables', contracts: 'Contracts', support: 'Support',
  field_service: 'Field service', automations: 'Automations', chat: 'Chat', books: 'Books', operations: 'Operations',
};

/**
 * One check, as the reader: the RPC judges only the modules that are on and
 * refuses a role that may not ask. A refusal is not an error to show — the
 * panel simply has nothing from that check.
 */
async function runCheck(name: 'check_operations' | 'check_books'): Promise<CheckFinding[] | null> {
  const { data, error } = await supabase.rpc(name as never);
  if (error) {
    logger.warn(`[agent-work] ${name} not read`, error.message);
    return null;
  }
  const findings = (data as { findings?: unknown } | null)?.findings;
  return Array.isArray(findings) ? (findings as CheckFinding[]) : [];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AgentWorkDashboardWidget() {
  const active = useActiveModules();
  // The Agents page is the admin's; everyone else reads the panel without its door.
  const { isAdmin, canAccess } = useModuleAccess();
  const agentsHref = isAdmin ? '/admin/agents' : undefined;
  const { today, toInstant } = useBusinessClock();
  const { data: modules } = useModules();
  const moduleName = (id: string) =>
    id === 'platform' ? 'Platform' : ((modules as unknown as Record<string, { name?: string } | undefined> | undefined)?.[id]?.name ?? id);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'agent-work', [...active].sort().join(',')],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const todayStart = toInstant(`${today()}T00:00`) ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      const [activity, comments, staged] = await Promise.all([
        supabase
          // api_key_id is newer than the generated types; the arguments are read as two fields, never the whole input.
          .from('agent_activity' as never)
          .select('id, agent, skill_name, status, error_message, output, created_at, api_key_id, action:input->>action, dry_run:input->>dry_run')
          .gte('created_at', since)
          .in('status', ['success', 'refused', 'failed'])
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('project_task_comments' as never)
          .select('task_id, project_id, kind, author_type, author_name, created_at')
          .gte('created_at', since)
          .limit(2000),
        supabase.from('pending_operations').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      const rows = (activity.data ?? []) as unknown as AgentActivityRow[];
      const keyIds = [...new Set(rows.map((r) => r.api_key_id).filter((k): k is string => !!k))];
      const agentNames: Record<string, string> = {};
      // A connected agent's name is Federation's (a2a_peers): asked for only when that module is on.
      if (keyIds.length && moduleShown('federation', active)) {
        const { data: peers, error } = await supabase.from('a2a_peers').select('api_key_id, name').in('api_key_id', keyIds);
        if (error) logger.warn('[agent-work] agent names unreadable, showing the generic label', error.message);
        for (const p of (peers ?? []) as Array<{ api_key_id: string | null; name: string }>) {
          if (p.api_key_id) agentNames[p.api_key_id] = p.name;
        }
      }
      return summarizeAgentWork({
        activity: rows,
        comments: (comments.data ?? []) as unknown as TaskCommentRow[],
        stagedCount: staged.count ?? 0,
        todayStart,
        shown: (skill) => skillShown(skill, active),
        readers: {
          ownerOf: ownerModuleOf,
          isRead: (skill, args) => classifyCall(skill, args) === 'read',
          agentNames,
        },
      });
    },
  });

  // What the checks flag — the list an agent starts its day from. The books
  // are asked only when Accounting is on.
  const booksOn = moduleShown('accounting', active);
  const { data: checks } = useQuery({
    queryKey: ['dashboard', 'agent-work', 'flags', booksOn, isAdmin],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [operations, books] = await Promise.all([
        runCheck('check_operations'),
        booksOn ? runCheck('check_books') : Promise.resolve(null),
      ]);
      return { operations, books };
    },
  });
  // A check answers for the whole business; a reader sees the areas their role is granted.
  const flags = useMemo(
    () => (checks ? mergeFlags(checks, 5, (area) => isAdmin || (AREA_MODULE[area] ? canAccess(AREA_MODULE[area]) : false)) : null),
    [checks, isAdmin, canAccess],
  );

  const waiting = (data?.staged ?? 0) + (data?.openQuestions ?? 0);

  return (
    <WidgetShell title="Agent work" icon={Bot} href={agentsHref} linkLabel="Agents" isLoading={isLoading} tileCount={4}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Actions today" value={data?.actionsToday ?? 0} href={agentsHref} />
        <MetricTile
          label="Waiting for you"
          value={waiting}
          tone={waiting > 0 ? 'warning' : 'default'}
          href={(data?.staged ?? 0) > 0 ? '/admin/approvals' : '/admin/projects'}
        />
        <MetricTile label="Refused (7 days)" value={data?.refused ?? 0} tone={(data?.refused ?? 0) > 0 ? 'warning' : 'default'} href={agentsHref} />
        <MetricTile label="Failed (7 days)" value={data?.failed ?? 0} tone={(data?.failed ?? 0) > 0 ? 'destructive' : 'default'} href={agentsHref} />
      </div>

      {data && (data.agentsToday.length > 0 || waiting > 0) && (
        <p className="mt-3 text-xs text-muted-foreground">
          {data.agentsToday.length > 0 && <>Today: {data.agentsToday.join(', ')}. </>}
          {data.staged > 0 && <>{data.staged} staged {data.staged === 1 ? 'operation' : 'operations'} to approve. </>}
          {data.openQuestions > 0 && (
            <>{data.openQuestions} {data.openQuestions === 1 ? 'question' : 'questions'} from an agent without an answer.</>
          )}
        </p>
      )}

      {data && data.areas.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">This week, by area</p>
          {data.areas.slice(0, AREA_LIMIT).map((a) => {
            const href = modulePage(a.module);
            const name = moduleName(a.module);
            return (
              <div key={a.module} className="flex items-center gap-2 text-xs py-1">
                <span className="truncate flex-1">
                  {href ? (
                    <Link to={href} className="font-medium hover:underline">{name}</Link>
                  ) : (
                    <span className="font-medium">{name}</span>
                  )}
                  <span className="text-muted-foreground">
                    {' · '}
                    {a.changes > 0 && <>{plural(a.changes, 'change', 'changes')}</>}
                    {a.changes > 0 && a.lookups > 0 && ', '}
                    {a.lookups > 0 && <>{plural(a.lookups, 'lookup', 'lookups')}</>}
                    {' · '}
                    {a.agents.join(', ')}
                    {a.topChanges.length > 0 && <> · <span className="font-mono">{a.topChanges.join(', ')}</span></>}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(a.lastAt), { addSuffix: true })}
                </span>
              </div>
            );
          })}
          {data.areas.length > AREA_LIMIT && (
            <p className="text-xs text-muted-foreground">and {plural(data.areas.length - AREA_LIMIT, 'more area', 'more areas')}</p>
          )}
        </div>
      )}

      {flags && flags.total > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            Flagged · {[flags.high && `${flags.high} high`, flags.medium && `${flags.medium} medium`, flags.low && `${flags.low} low`].filter(Boolean).join(', ')}
          </p>
          {flags.top.map((f) => {
            const href = AREA_PAGE[f.area];
            return (
              <div key={f.key} className="flex items-center gap-2 text-xs py-1">
                <FlagIcon className={`h-3 w-3 shrink-0 ${f.severity === 'high' ? 'text-destructive' : 'text-muted-foreground'}`} />
                <span className="truncate flex-1">
                  {href ? <Link to={href} className="hover:underline">{f.label}</Link> : f.label}
                  {f.same > 1 && <span className="font-medium"> and {f.same - 1} more like it</span>}
                  <span className="text-muted-foreground">
                    {' · '}{AREA_NAME[f.area] ?? f.area}
                    {f.fixSkill ? <> · fix: <span className="font-mono">{f.fixSkill}</span></> : <> · for you to decide</>}
                  </span>
                </span>
              </div>
            );
          })}
          {flags.rows > flags.top.length && (
            <p className="text-xs text-muted-foreground">and {flags.rows - flags.top.length} more</p>
          )}
        </div>
      )}

      {data && data.stopped.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Stopped</p>
          {data.stopped.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-xs py-1">
              {s.outcome === 'failed' ? (
                <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
              ) : (
                <Ban className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1">
                <span className="font-mono">{s.skill}</span>
                <span className="text-muted-foreground"> · {s.agent} · {s.outcome}: {s.reason}</span>
              </span>
              <span className="text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(s.at), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
