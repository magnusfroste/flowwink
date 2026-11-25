import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { GOAL_OPTIONS } from '@/lib/flowpilot-starter-goals';
import { Link } from 'react-router-dom';
import { Plus, Target, Trash2, CheckCircle2, PauseCircle, XCircle, Play, Info } from 'lucide-react';
import { isHeldForBusinessIdentity } from '@/lib/business-identity-gate';
import { readObjectiveRules, writeObjectiveRules, criteriaToRows, rowsToCriteria, type ObjectiveRules, type CriterionRow } from '@/lib/objective-rules';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useObjectives,
  useUpsertObjective,
  useObjectiveActivities,
  useDeleteObjective,
  useUpdateObjectiveStatus,
} from '@/hooks/useObjectives';
import type { AgentObjective, AgentObjectiveStatus } from '@/types/agent';

const statusConfig: Record<AgentObjectiveStatus, { label: string; color: string; icon: typeof Target }> = {
  active: { label: 'Active', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', icon: Play },
  paused: { label: 'Paused', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', icon: PauseCircle },
  completed: { label: 'Completed', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-500/15 text-red-700 dark:text-red-400', icon: XCircle },
};

function deriveProgress(progress: Record<string, unknown>): number | null {
  // Look for common patterns: {current: N, target: M} or {done: N, total: M}
  const current = (progress.current ?? progress.done ?? progress.count) as number | undefined;
  const target = (progress.target ?? progress.total ?? progress.goal) as number | undefined;
  if (typeof current === 'number' && typeof target === 'number' && target > 0) {
    return Math.min(Math.round((current / target) * 100), 100);
  }
  return null;
}

export function ObjectivesPanel() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentObjective | null>(null);

  const { data: objectives = [], isLoading } = useObjectives(statusFilter);
  const upsert = useUpsertObjective();
  const remove = useDeleteObjective();
  const updateStatus = useUpdateObjectiveStatus();

  const handleNew = () => { setEditing(null); setEditorOpen(true); };
  const handleEdit = (obj: AgentObjective) => { setEditing(obj); setEditorOpen(true); };

  return (
    <div className="space-y-4">
      {/* How it works hint */}
      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Objectives guide what FlowPilot works on. You can create your own, and FlowPilot may also
          propose new objectives based on site performance, conversations, and trends — you'll always
          be able to review and adjust them here.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={handleNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Objective
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading objectives…</p>
      ) : objectives.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Target className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No goals yet</p>
          <p className="text-sm mt-1">
            A goal is what FlowPilot works on when nobody asks it anything. Start with one of these, or write your own.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 max-w-2xl mx-auto text-left">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                className="rounded-md border p-3 hover:bg-accent transition-colors"
                onClick={() => upsert.mutate({ goal: g.objective, status: 'active', progress: { source: 'starter', goal_type: g.id } })}
              >
                <div className="text-sm font-medium text-foreground">{g.title}</div>
                <div className="text-xs text-muted-foreground">{g.description}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {objectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              onEdit={handleEdit}
              onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* Editor sheet */}
      <ObjectiveEditorSheet
        objective={editing}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={(data) => upsert.mutate(data)}
      />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function ObjectiveCard({
  objective,
  onEdit,
  onStatusChange,
  onDelete,
}: {
  objective: AgentObjective;
  onEdit: (o: AgentObjective) => void;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = statusConfig[objective.status];
  const StatusIcon = cfg.icon;
  const pct = deriveProgress(objective.progress);
  const constraintKeys = Object.keys(objective.constraints);

  return (
    <Card
      className="group cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all"
      onClick={() => onEdit(objective)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-snug line-clamp-2">
            {objective.goal}
          </CardTitle>
          <Badge variant="secondary" className={`shrink-0 text-[10px] ${cfg.color}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isHeldForBusinessIdentity(objective) && (
          <p
            className="rounded-md bg-warning/10 px-2.5 py-2 text-xs leading-relaxed text-warning"
            onClick={(e) => e.stopPropagation()}
          >
            Waiting for Business Identity — content written before FlowPilot knows who this company is
            comes out generic. Add your company name and services in{' '}
            <Link to="/admin/company-insights" className="font-medium underline underline-offset-2">
              Company Insights
            </Link>{' '}
            and this objective resumes automatically.
          </p>
        )}
        {pct !== null && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )}

        {constraintKeys.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {constraintKeys.slice(0, 3).map((k) => (
              <Badge key={k} variant="outline" className="text-[10px]">
                {k}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
          <Select
            value={objective.status}
            onValueChange={(v) => onStatusChange(objective.id, v)}
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete objective?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this objective and unlink all associated activity entries.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(objective.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Editor Sheet ─────────────────────────────────────────────────────────────

function ObjectiveEditorSheet({
  objective,
  open,
  onClose,
  onSave,
}: {
  objective: AgentObjective | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<AgentObjective> & { goal: string }) => void;
}) {
  const [goal, setGoal] = useState('');
  const [rules, setRules] = useState<ObjectiveRules>(() => readObjectiveRules({}));
  const [rows, setRows] = useState<CriterionRow[]>([]);
  const [restText, setRestText] = useState('');

  useEffect(() => {
    if (open) {
      setGoal(objective?.goal ?? '');
      const r = readObjectiveRules(objective?.constraints);
      setRules(r);
      setRows(criteriaToRows(objective?.success_criteria));
      setRestText(Object.keys(r.rest).length ? JSON.stringify(r.rest, null, 2) : '');
    }
  }, [open, objective]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const patch = (p: Partial<ObjectiveRules>) => setRules((r) => ({ ...r, ...p }));
  const cadence = rules.cadence;

  const handleSave = () => {
    // The keys the form does not edit stay as they were; if a person edited
    // them by hand and broke the JSON, refuse rather than drop them silently.
    let rest: Record<string, unknown> = {};
    if (restText.trim()) {
      try {
        const parsed = JSON.parse(restText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        rest = parsed;
      } catch {
        toast.error('Other settings is not valid JSON — nothing was saved.');
        return;
      }
    }
    if (cadence && !cadence.counts.trim()) {
      toast.error('Say which skill counts as one delivery, or switch the rhythm off.');
      return;
    }

    onSave({
      ...(objective?.id ? { id: objective.id } : {}),
      goal,
      constraints: writeObjectiveRules({ ...rules, rest }),
      success_criteria: rowsToCriteria(rows),
      status: objective?.status ?? 'active',
      progress: objective?.progress ?? {},
    });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{objective ? 'Edit Objective' : 'New Objective'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Publish 3 SEO-optimized blog posts per week to increase organic traffic by 20%"
              rows={4}
            />
          </div>

          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="rhythm">Limit how often</Label>
                <p className="text-xs text-muted-foreground">
                  A rhythm written in the goal is not binding; this one is. FlowPilot counts what it delivered and pauses the goal until the period is over.
                </p>
              </div>
              <Switch
                id="rhythm"
                checked={!!cadence}
                onCheckedChange={(on) => patch({ cadence: on ? { max: 1, per: 'week', every: 1, counts: 'write_blog_post' } : null })}
              />
            </div>
            {cadence && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cad-max" className="text-xs">At most</Label>
                  <Input id="cad-max" type="number" min={1} value={cadence.max}
                    onChange={(e) => patch({ cadence: { ...cadence, max: Number(e.target.value) || 1 } })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Per</Label>
                  <Select value={cadence.per} onValueChange={(v) => patch({ cadence: { ...cadence, per: v === 'day' ? 'day' : 'week' } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Day</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cad-every" className="text-xs">Every (1 = every period, 2 = every other …)</Label>
                  <Input id="cad-every" type="number" min={1} value={cadence.every}
                    onChange={(e) => patch({ cadence: { ...cadence, every: Number(e.target.value) || 1 } })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cad-counts" className="text-xs">Counted skill</Label>
                  <Input id="cad-counts" value={cadence.counts} placeholder="write_blog_post"
                    onChange={(e) => patch({ cadence: { ...cadence, counts: e.target.value } })} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <Label htmlFor="needs-identity">Needs the business profile</Label>
              <p className="text-xs text-muted-foreground">
                The goal waits until the business profile has a company name and a service, so nothing is written about a company FlowPilot does not know yet.
              </p>
            </div>
            <Switch id="needs-identity" checked={rules.requiresIdentity} onCheckedChange={(on) => patch({ requiresIdentity: on })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={rules.priority || 'none'} onValueChange={(v) => patch({ priority: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  {rules.priority && !['high', 'medium', 'low'].includes(rules.priority) && (
                    <SelectItem value={rules.priority}>{rules.priority}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="deadline" className="text-xs">Deadline</Label>
              <Input id="deadline" type="date" value={rules.deadline} onChange={(e) => patch({ deadline: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Success criteria</Label>
            <p className="text-xs text-muted-foreground">
              Measurable targets FlowPilot reads to judge when the goal is met — e.g. posts_published 3, leads_generated 10.
            </p>
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <Input value={row.name} placeholder="posts_published" aria-label="Target"
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} />
                <Input value={row.value} placeholder="3" aria-label="Value" className="w-28"
                  onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                <Button variant="ghost" size="icon" aria-label="Remove target" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setRows([...rows, { name: '', value: '' }])}>
              <Plus className="h-4 w-4 mr-1" /> Add target
            </Button>
          </div>

          {restText.trim() !== '' && (
            <div className="space-y-2">
              <Label htmlFor="rest">Other settings</Label>
              <Textarea id="rest" value={restText} onChange={(e) => setRestText(e.target.value)} rows={4} className="font-mono text-xs" />
              <p className="text-xs text-muted-foreground">
                Set by a template or an agent; kept as it is unless you change it here.
              </p>
            </div>
          )}

          {objective?.id && <ObjectiveHistory objectiveId={objective.id} />}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!goal.trim()}>
            {objective ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── History: what FlowPilot did for this goal ─────────────────────────────
// agent_objective_activities links runs to goals; the hook existed and nothing
// rendered it, so an admin could not see what a goal had actually produced.
function ObjectiveHistory({ objectiveId }: { objectiveId: string }) {
  const { data: links = [] } = useObjectiveActivities(objectiveId);
  const ids = links.slice(0, 15).map((l) => l.activity_id).filter(Boolean) as string[];
  const { data: rows = [] } = useQuery({
    queryKey: ['objective-history', objectiveId, ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_activity')
        .select('id, skill_name, status, created_at')
        .in('id', ids)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="space-y-2 border-t pt-4">
      <Label>What FlowPilot did for this goal</Label>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing linked to this goal yet.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <span>{(r.skill_name ?? 'action').replace(/_/g, ' ')}</span>
              <span className={r.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                {r.status} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {links.length > rows.length && rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Latest {rows.length} of {links.length}. The Log tab has every run.</p>
      )}
    </div>
  );
}
