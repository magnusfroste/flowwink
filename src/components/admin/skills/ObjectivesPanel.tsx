import { useState, useEffect } from 'react';
import { Plus, Target, Trash2, CheckCircle2, PauseCircle, XCircle, Play } from 'lucide-react';
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
          <p className="text-lg font-medium">No objectives yet</p>
          <p className="text-sm mt-1">
            Define high-level goals for FlowPilot to work toward autonomously.
          </p>
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
  const [constraintsText, setConstraintsText] = useState('');
  const [criteriaText, setCriteriaText] = useState('');

  useEffect(() => {
    if (open) {
      setGoal(objective?.goal ?? '');
      setConstraintsText(objective?.constraints ? JSON.stringify(objective.constraints, null, 2) : '{}');
      setCriteriaText(objective?.success_criteria ? JSON.stringify(objective.success_criteria, null, 2) : '{}');
    }
  }, [open, objective]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const handleSave = () => {
    let constraints = {};
    let success_criteria = {};
    try { constraints = JSON.parse(constraintsText); } catch { /* keep empty */ }
    try { success_criteria = JSON.parse(criteriaText); } catch { /* keep empty */ }

    onSave({
      ...(objective?.id ? { id: objective.id } : {}),
      goal,
      constraints,
      success_criteria,
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

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="goal">Goal</Label>
            <Textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Publish 3 SEO-optimized blog posts per week to increase organic traffic by 20%"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="constraints">Constraints (JSON)</Label>
            <Textarea
              id="constraints"
              value={constraintsText}
              onChange={(e) => setConstraintsText(e.target.value)}
              placeholder={'{\n  "max_posts_per_day": 1,\n  "token_budget": 50000,\n  "excluded_skills": ["newsletter_send"],\n  "deadline": "2026-04-30"\n}'}
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Guardrails that limit FlowPilot — e.g. daily limits, token budgets, skill exclusions, deadlines.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="criteria">Success Criteria (JSON)</Label>
            <Textarea
              id="criteria"
              value={criteriaText}
              onChange={(e) => setCriteriaText(e.target.value)}
              placeholder={'{\n  "posts_published": 3,\n  "leads_generated": 10,\n  "avg_response_time_seconds": 30\n}'}
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Measurable targets — FlowPilot marks the objective complete when these are met.
            </p>
          </div>
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
