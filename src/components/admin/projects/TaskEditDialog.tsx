import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAssignablePeople } from "@/hooks/useAssignablePeople";
import { DependencyPicker } from "./DependencyPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpRight, Bot, CheckCircle2, HelpCircle, Loader2, MessageSquare, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllProjectTasks,
  useProjects,
  useUpdateProjectTask,
  type ProjectTask,
} from "@/hooks/useProjects";
import {
  useTaskDependencies,
  useManageDependency,
} from "@/hooks/useProjectSchedule";
import { useAddTaskComment, useTaskActivity, useTaskComments } from "@/hooks/useTaskCard";
import { addChecklistItem, blockedBy, checklistProgress, commentVoice, toggleChecklistItem, type ChecklistItem } from "@/lib/task-card";
import { cn } from "@/lib/utils";

/**
 * The task card. A task is a surface a person can check in on and an agent
 * can work in: the brief (what and what done looks like), a checklist of the
 * pieces of done, the dependencies that block it — shown with their status —
 * and one thread, in time order, where people and agents write together:
 * notes, steps, questions, decisions. FlowPilot's skill calls on the task
 * ride in from the activity log, so nothing an agent did is hidden.
 */
/**
 * The task card's body — form on the left, thread on the right. Rendered by
 * TaskEditDialog (a popup, from the board) and by the split pane in TasksView
 * (Gmail-style: list left, the open task right). One component, two frames,
 * so the two never drift apart.
 */
/** Radix Select cannot hold an empty value, so "nobody" needs a name. */
const UNASSIGNED = "__unassigned__";

export function TaskDetail({
  task,
  projectId,
  onClose,
  variant = "dialog",
  onOpenProject,
}: {
  task: ProjectTask;
  projectId: string;
  onClose: () => void;
  /** "pane": Save keeps the task open; Close clears the selection. */
  variant?: "dialog" | "pane";
  onOpenProject?: (projectId: string) => void;
}) {
  const { user, profile } = useAuth();
  const update = useUpdateProjectTask();
  // Every active project's tasks, not only this one's: a dependency may
  // cross projects (the ledger close in Ekonomi gates the data room in
  // Finansiering). Titles from other projects carry the project name.
  const { data: allTasks } = useAllProjectTasks();
  const { data: projects } = useProjects();
  const { data: people = [] } = useAssignablePeople(projectId);
  const { data: deps } = useTaskDependencies(task.id, projectId);
  const depMut = useManageDependency();
  const { data: comments = [] } = useTaskComments(task.id);
  const { data: activity = [] } = useTaskActivity(task.id);
  const addComment = useAddTaskComment();

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState<string>(task.description ?? "");
  const [startDate, setStartDate] = useState<string>((task as any).start_date ?? "");
  const [dueDate, setDueDate] = useState<string>(task.due_date ?? "");
  const [estHours, setEstHours] = useState<string>(task.estimated_hours != null ? String(task.estimated_hours) : "");
  // UNASSIGNED is a real choice, so it needs a value the Select can hold —
  // an empty string is how Radix says "nothing selected", not "nobody".
  const [assignedTo, setAssignedTo] = useState<string>(task.assigned_to ?? UNASSIGNED);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(Array.isArray((task as any).checklist) ? ((task as any).checklist as ChecklistItem[]) : []);
  const [newItem, setNewItem] = useState("");
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"comment" | "question" | "decision">("comment");

  const depSet = new Set(deps ?? []);
  const projectName = new Map((projects ?? []).map((p) => [p.id, p.name] as const));
  const labelFor = (t: { title: string; project_id: string }) =>
    t.project_id === projectId ? t.title : `${projectName.get(t.project_id) ?? "…"} · ${t.title}`;
  const byId = new Map((allTasks ?? []).map((t) => [t.id, t] as const));
  const blocking = blockedBy(deps, new Map((allTasks ?? []).map((t) => [t.id, t.status] as const)));
  const progress = checklistProgress(checklist);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      {
        id: task.id,
        project_id: projectId,
        title,
        description: description.trim() || null,
        start_date: startDate || null,
        due_date: dueDate || null,
        estimated_hours: estHours ? Number(estHours) : null,
        assigned_to: assignedTo === UNASSIGNED ? null : assignedTo,
        checklist,
      } as any,
      { onSuccess: () => { if (variant === "dialog") onClose(); else toast.success("Saved"); } },
    );
  };

  // Checklist writes go straight through: ticking is an act, not a form field.
  const persistChecklist = (next: ChecklistItem[]) => {
    setChecklist(next);
    update.mutate({ id: task.id, project_id: projectId, checklist: next } as any);
  };

  const postNote = async () => {
    const body = note.trim();
    if (!body) return;
    try {
      await addComment.mutateAsync({
        task_id: task.id, project_id: projectId, body, kind: noteKind,
        author_id: user?.id ?? null, author_name: profile?.full_name ?? profile?.email ?? null,
      });
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not post");
    }
  };

  // One thread: comments and agent steps, oldest first.
  const thread = [
    ...comments.map((c) => ({ id: c.id, at: c.created_at, label: commentVoice(c), body: c.body, kind: c.kind, agent: c.author_type !== "person" })),
    ...activity.map((a) => ({
      id: a.id, at: a.created_at,
      label: `${a.agent === "flowpilot" || !a.agent ? "FlowPilot" : a.agent} ran ${(a.skill_name ?? "a skill").replace(/_/g, " ")}`,
      body: a.error_message ? `Failed: ${a.error_message}` : summarize(a.output),
      kind: a.status === "pending_approval" ? "question" : a.error_message ? "error" : "step",
      agent: true,
    })),
  ].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));

  const badges = (
    <>
      {blocking.length > 0 && <Badge variant="destructive" className="text-[10px]">blocked</Badge>}
      {progress.total > 0 && <Badge variant="outline" className="text-[10px]">{progress.done}/{progress.total} done</Badge>}
    </>
  );

  return (
    <div className="space-y-4">
        {variant === "pane" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-lg font-semibold">Task</span>
            {badges}
            {onOpenProject && (
              <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => onOpenProject(projectId)}>
                Open project <ArrowUpRight className="ml-0.5 h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        {variant === "dialog" && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Task {badges}</DialogTitle>
          </DialogHeader>
        )}
        <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <form onSubmit={save} className="min-w-0 space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Brief</Label>
              {/* What needs to happen and what done looks like — the text a
                  colleague or an agent reads before touching the task. */}
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What needs to happen, what done looks like, links and decisions. Markdown works."
                rows={5}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Start</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>Due</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div>
                <Label>Est. hours</Label>
                <Input type="number" step="0.25" min="0" value={estHours} onChange={(e) => setEstHours(e.target.value)} />
              </div>
            </div>
            <div>
              {/* The column, the skill parameter, the "Mine" filter and the
                  capacity report all waited on this value; no screen ever set
                  it. Optic ran 62 tasks with nobody on any of them. */}
              <Label>Assignee</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.isMember ? " · on this project" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Checklist</Label>
              <p className="text-[11px] text-muted-foreground mb-1">The pieces of done. People and agents tick them; the list shows {progress.done}/{progress.total}.</p>
              <div className="space-y-1">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm group">
                    <Checkbox checked={item.done} onCheckedChange={() => persistChecklist(toggleChecklistItem(checklist, item.id, user?.id ?? null))} aria-label={item.text} />
                    <span className={cn("flex-1", item.done && "line-through text-muted-foreground")}>{item.text}</span>
                    <button type="button" onClick={() => persistChecklist(checklist.filter((i) => i.id !== item.id))} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive" aria-label="Remove item">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item…" className="h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); persistChecklist(addChecklistItem(checklist, newItem)); setNewItem(""); } }} />
                  <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => { persistChecklist(addChecklistItem(checklist, newItem)); setNewItem(""); }} disabled={!newItem.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label>Depends on</Label>
              <div className="flex flex-wrap gap-1 mt-1 mb-2">
                {(deps ?? []).length === 0 && <span className="text-xs text-muted-foreground">No dependencies</span>}
                {(deps ?? []).map((id) => {
                  const t = byId.get(id);
                  const open = blocking.includes(id);
                  return (
                    <Badge key={id} variant={open ? "destructive" : "secondary"} className="gap-1" title={open ? "Not done yet — this task is blocked by it" : "Done"}>
                      {open ? <HelpCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {t ? labelFor(t) : id.slice(0, 6)}
                      <button type="button" onClick={() => depMut.mutate({ action: "remove", task_id: task.id, depends_on_task_id: id, project_id: projectId })} aria-label="Remove dependency">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
              {/* Picking IS adding — one step, no separate button. Own project
                  first; other projects behind one row or a search. */}
              <DependencyPicker
                taskId={task.id}
                projectId={projectId}
                tasks={(allTasks ?? []).map((t) => ({ id: t.id, title: t.title, project_id: t.project_id, status: t.status }))}
                projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name }))}
                excludeIds={depSet}
                disabled={depMut.isPending}
                onPick={(id) => depMut.mutate({ action: "add", task_id: task.id, depends_on_task_id: id, project_id: projectId })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
              <Button type="submit" disabled={update.isPending}>{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            </div>
          </form>

          {/* The thread — the card's ledger. People write; agents write; the
              activity log's skill calls on this task ride in. Time order. */}
          <div className="min-w-0 space-y-2 border-t pt-4 md:border-t-0 md:pt-0 md:border-l md:pl-4">
            <Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Thread</Label>
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {thread.length === 0 && <p className="text-xs text-muted-foreground">Nothing yet. Notes, questions and decisions land here — and every step an agent takes on this task.</p>}
              {thread.map((e) => (
                <div key={e.id} className={cn("rounded-md px-2.5 py-1.5 text-xs", e.kind === "question" ? "bg-warning/10" : e.kind === "error" ? "bg-destructive/10" : e.agent ? "bg-primary/5" : "bg-muted")}>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {e.agent && <Bot className="h-3 w-3" />}
                    {e.label} · {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                  </div>
                  <div className="whitespace-pre-wrap">{e.body}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="flex gap-1 text-[11px]">
                {(["comment", "question", "decision"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setNoteKind(k)} className={cn("rounded px-2 py-0.5 border", noteKind === k ? "bg-accent border-accent" : "border-border text-muted-foreground")}>{k}</button>
                ))}
              </div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={noteKind === "question" ? "Ask — an agent working here will see it" : noteKind === "decision" ? "What was settled, and why" : "A note for whoever picks this up next"}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void postNote(); }} />
              <Button type="button" size="sm" onClick={postNote} disabled={!note.trim() || addComment.isPending} className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Post
              </Button>
            </div>
          </div>
        </div>
    </div>
  );
}

/** The popup frame around TaskDetail — what the board opens on the pencil. */
export function TaskEditDialog({
  task,
  projectId,
  onOpenChange,
}: {
  task: ProjectTask;
  projectId: string;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      {/* Never wider than the window: the two-column grid used to size itself
          from its inputs (min-content) and push the thread column past the
          edge, leaving a horizontal scrollbar (optic, 2026-09-09). minmax(0,…)
          lets the columns shrink; below md the thread drops under the form. */}
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <TaskDetail task={task} projectId={projectId} onClose={() => onOpenChange(false)} variant="dialog" />
      </DialogContent>
    </Dialog>
  );
}

function summarize(output: unknown): string {
  if (!output || typeof output !== "object") return "";
  const o = output as Record<string, unknown>;
  const keys = ["note", "message", "summary", "status", "result"];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.slice(0, 240);
  }
  try { return JSON.stringify(o).slice(0, 160); } catch { return ""; }
}
