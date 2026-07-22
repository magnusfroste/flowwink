import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

type Ctx = Record<string, unknown>;

interface Props {
  entityId: string;
  reason: string | null;
  createdAt: string;
  requiredRole: string;
  context: Ctx;
}

// Naive line diff — good enough for reviewing instruction changes.
function computeLineDiff(before: string, after: string) {
  const b = before.split('\n');
  const a = after.split('\n');
  const set = new Set(b);
  const setA = new Set(a);
  const rows: { kind: 'same' | 'add' | 'del'; text: string }[] = [];
  // Simple: iterate max length, mark diffs by presence in the other side
  const max = Math.max(b.length, a.length);
  for (let i = 0; i < max; i++) {
    const lb = b[i];
    const la = a[i];
    if (lb === la && lb !== undefined) {
      rows.push({ kind: 'same', text: lb });
    } else {
      if (lb !== undefined && !setA.has(lb)) rows.push({ kind: 'del', text: lb });
      if (la !== undefined && !set.has(la)) rows.push({ kind: 'add', text: la });
      if (lb !== undefined && setA.has(lb) && la !== undefined && set.has(la) && lb !== la) {
        // both moved lines — skip duplication
      }
    }
  }
  return rows;
}

function InstructionsDiff({ skillName, proposed }: { skillName: string; proposed: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent_skill', 'instructions', skillName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('instructions')
        .eq('name', skillName)
        .maybeSingle();
      if (error) throw error;
      return (data?.instructions as string | null) ?? '';
    },
  });

  const current = data ?? '';
  const rows = computeLineDiff(current, proposed);

  return (
    <details className="rounded-md border bg-muted/20">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        View proposed change to instructions
      </summary>
      <div className="border-t p-3 space-y-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading current instructions…</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current
                </div>
                <pre className="max-h-64 overflow-auto rounded border bg-background p-2 text-xs whitespace-pre-wrap font-mono">
                  {current || <span className="text-muted-foreground italic">(empty)</span>}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Proposed
                </div>
                <pre className="max-h-64 overflow-auto rounded border bg-background p-2 text-xs whitespace-pre-wrap font-mono">
                  {proposed}
                </pre>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Diff
              </div>
              <pre className="max-h-64 overflow-auto rounded border bg-background p-2 text-xs whitespace-pre-wrap font-mono">
                {rows.map((r, i) => (
                  <div
                    key={i}
                    className={
                      r.kind === 'add'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : r.kind === 'del'
                        ? 'bg-destructive/10 text-destructive'
                        : 'text-muted-foreground'
                    }
                  >
                    {r.kind === 'add' ? '+ ' : r.kind === 'del' ? '- ' : '  '}
                    {r.text || ' '}
                  </div>
                ))}
              </pre>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

function ArgsFields({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(
    ([k]) => k !== 'skill_name' && k !== 'reason' && k !== 'instructions'
  );
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Proposed arguments
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
        {entries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-xs text-muted-foreground pt-0.5">{k}</dt>
            <dd className="text-sm">
              {typeof v === 'string' ? (
                v
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(v, null, 2)}</pre>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function AgentSkillApprovalHeader({
  reason,
  createdAt,
  requiredRole,
  context,
}: Props) {
  const executingSkill = typeof context.skill_name === 'string' ? context.skill_name : null;
  const agent = typeof context.agent === 'string' ? context.agent : null;
  const args = (context.args ?? {}) as Record<string, unknown>;
  const targetSkill = typeof args.skill_name === 'string' ? args.skill_name : null;

  const title = targetSkill ?? executingSkill ?? 'agent_skill';

  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            <Badge variant="secondary">agent_skill</Badge>
            <span className="font-mono text-sm truncate">{title}</span>
            {targetSkill && executingSkill && (
              <Badge variant="outline" className="text-xs">
                via {executingSkill}
              </Badge>
            )}
            {agent && (
              <Badge variant="outline" className="text-xs">
                by {agent}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Requires <span className="font-medium">{requiredRole}</span> · requested{' '}
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            {reason && <span className="ml-1">· {reason}</span>}
          </CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

export function AgentSkillApprovalBody({ context }: { context: Ctx }) {
  const executingSkill = typeof context.skill_name === 'string' ? context.skill_name : null;
  const args = (context.args ?? {}) as Record<string, unknown>;
  const targetSkill = typeof args.skill_name === 'string' ? args.skill_name : null;
  const rationale = typeof args.reason === 'string' ? args.reason : null;
  const proposedInstructions =
    typeof args.instructions === 'string' ? args.instructions : null;

  const isInstructionUpdate =
    executingSkill === 'update_skill_instructions' && targetSkill && proposedInstructions;

  return (
    <div className="space-y-3">
      {rationale && (
        <div className="rounded-md border-l-2 border-primary/60 bg-muted/30 px-3 py-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Why the agent proposes this
          </div>
          <p className="text-sm italic">"{rationale}"</p>
        </div>
      )}

      {isInstructionUpdate && (
        <InstructionsDiff skillName={targetSkill!} proposed={proposedInstructions!} />
      )}

      {!isInstructionUpdate && Object.keys(args).length > 0 && <ArgsFields args={args} />}
    </div>
  );
}
