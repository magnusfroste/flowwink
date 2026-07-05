import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, CheckCircle2, RotateCcw, Flag } from 'lucide-react';
import { format } from 'date-fns';
import { useProjectTasks } from '@/hooks/useProjects';
import {
  useProjectMilestones,
  useCreateProjectMilestone,
  useUpdateProjectMilestone,
  useReachProjectMilestone,
  useReopenProjectMilestone,
  useDeleteProjectMilestone,
  type ProjectMilestone,
} from '@/hooks/useProjectMilestones';

interface Draft {
  id?: string;
  name: string;
  description: string;
  due_date: string;
}

const emptyDraft = (): Draft => ({ name: '', description: '', due_date: '' });

export function ProjectMilestonesPanel({ projectId }: { projectId: string }) {
  const { data: milestones = [], isLoading } = useProjectMilestones(projectId);
  const { data: tasks = [] } = useProjectTasks(projectId);
  const create = useCreateProjectMilestone();
  const update = useUpdateProjectMilestone();
  const reach = useReachProjectMilestone();
  const reopen = useReopenProjectMilestone();
  const del = useDeleteProjectMilestone();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  const openCreate = () => {
    setDraft(emptyDraft());
    setOpen(true);
  };
  const openEdit = (m: ProjectMilestone) => {
    setDraft({
      id: m.id,
      name: m.name,
      description: m.description ?? '',
      due_date: m.due_date ?? '',
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!draft.name.trim()) return;
    const payload = {
      p_name: draft.name.trim(),
      p_description: draft.description.trim() || null,
      p_due_date: draft.due_date || null,
    };
    if (draft.id) {
      await update.mutateAsync({ p_milestone_id: draft.id, ...payload });
    } else {
      await create.mutateAsync({ p_project_id: projectId, ...payload });
    }
    setOpen(false);
  };

  // Progress heuristic: share of project tasks completed with due_date ≤ milestone due_date.
  // If milestone has no due_date, use ALL project tasks.
  const progressFor = useMemo(() => {
    return (m: ProjectMilestone) => {
      const inScope = m.due_date
        ? tasks.filter((t) => t.due_date && t.due_date <= m.due_date!)
        : tasks;
      if (inScope.length === 0) return { pct: 0, done: 0, total: 0 };
      const done = inScope.filter((t) => t.status === 'done' || !!t.completed_at).length;
      return { pct: Math.round((done / inScope.length) * 100), done, total: inScope.length };
    };
  }, [tasks]);

  const sorted = [...milestones].sort((a, b) => {
    if (a.is_reached !== b.is_reached) return a.is_reached ? 1 : -1;
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Milestones</CardTitle>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            New milestone
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No milestones — add one to track major deliverables.
            </div>
          ) : (
            <ul className="divide-y">
              {sorted.map((m) => {
                const { pct, done, total } = progressFor(m);
                return (
                  <li key={m.id} className="py-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.is_reached ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Flag className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span
                          className={`font-medium truncate ${m.is_reached ? 'text-emerald-600 line-through' : ''}`}
                        >
                          {m.name}
                        </span>
                        {m.due_date && (
                          <Badge variant="outline" className="font-mono text-xs">
                            {format(new Date(m.due_date), 'yyyy-MM-dd')}
                          </Badge>
                        )}
                        {m.is_reached && <Badge variant="secondary">Reached</Badge>}
                      </div>
                      {m.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.description}</p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                          {done}/{total} · {pct}%
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 md:justify-end shrink-0">
                      {m.is_reached ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reopen.mutate({ p_milestone_id: m.id })}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Reopen
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reach.mutate({ p_milestone_id: m.id })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                          Mark reached
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete milestone "${m.name}"?`)) del.mutate({ p_milestone_id: m.id });
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft.id ? 'Edit milestone' : 'New milestone'}</DialogTitle>
            <DialogDescription>Track a major deliverable and its due date.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ms-name">Name</Label>
              <Input
                id="ms-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Beta launch"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ms-due">Due date</Label>
              <Input
                id="ms-due"
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                className="w-48"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ms-desc">Description</Label>
              <Textarea
                id="ms-desc"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={3}
                placeholder="What defines this milestone as reached?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={!draft.name.trim() || create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? 'Saving…'
                : draft.id
                ? 'Save changes'
                : 'Create milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
