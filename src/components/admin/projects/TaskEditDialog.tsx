import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bot, CheckCircle2, HelpCircle, Loader2, MessageSquare, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useProjectTasks,
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
export function TaskEditDialog({
  task,
  projectId,
  onOpenChange,
}: {
  task: ProjectTask;
  projectId: string;
  onOpenChange: (o: boolean) => void;
}) {
  const { user, profile } = useAuth();
  const update = useUpdateProjectTask();
  const { data: allTasks } = useProjectTasks(projectId);
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
  const [checklist, setChecklist] = useState<ChecklistItem[]>(Array.isArray((task as any).checklist) ? ((task as any).checklist as ChecklistItem[]) : []);
  const [newItem, setNewItem] = useState("");
  const [pickDep, setPickDep] = useState<string>("");
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"comment" | "question" | "decision">("comment");

  const depSet = new Set(deps ?? []);
  const candidates = (allTasks ?? []).filter((t) => t.id !== task.id && !depSet.has(t.id));
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
        checklist,
      } as any,
      { onSuccess: () => onOpenChange(false) },
    );
  };

  // Checklist writes go straight through: ticking is an act, not a form field.
  const persistChecklist = (next: ChecklistItem[]) => {
    setChecklist(next);
    update.mutate({ id: task.id, project_id: projectId, checklist: next } as any);
  };

  const addDep = () => {
    if (!pickDep) return;
    depMut.mutate(
      { action: "add", task_id: task.id, depends_on_task_id: pickDep, project_id: projectId },
      { onSuccess: () => setPickDep("") },
    );
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

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Task
            {blocking.length > 0 && <Badge variant="destructive" className="text-[10px]">blocked</Badge>}
            {progress.total > 0 && <Badge variant="outline" className="text-[10px]">{progress.done}/{progress.total} done</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
          <form onSubmit={save} className="space-y-4">
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
                      {t?.title ?? id.slice(0, 6)}
                      <button type="button" onClick={() => depMut.mutate({ action: "remove", task_id: task.id, depends_on_task_id: id, project_id: projectId })} aria-label="Remove dependency">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <select value={pickDep} onChange={(e) => setPickDep(e.target.value)} className="h-8 flex-1 rounded-md border bg-background px-2 text-sm">
                  <option value="">Pick a task this one waits for…</option>
                  {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
                <Button type="button" size="sm" variant="outline" className="h-8" onClick={addDep} disabled={!pickDep || depMut.isPending}>Add</Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="submit" disabled={update.isPending}>{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
            </div>
          </form>

          {/* The thread — the card's ledger. People write; agents write; the
              activity log's skill calls on this task ride in. Time order. */}
          <div className="space-y-2 border-l pl-4">
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
