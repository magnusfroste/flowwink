import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, GitBranch, Trash2, AlertCircle, Play, ArrowRight,
  ChevronDown, ChevronUp, GripVertical, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useWorkflows, useUpsertWorkflow, useToggleWorkflow, useDeleteWorkflow } from '@/hooks/useWorkflows';
import { useSkills } from '@/hooks/useSkillHub';
import type { AgentWorkflow, WorkflowStep } from '@/types/agent';

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function WorkflowsPanel() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentWorkflow | null>(null);

  const { data: workflows = [], isLoading } = useWorkflows();
  const upsert = useUpsertWorkflow();
  const toggle = useToggleWorkflow();
  const remove = useDeleteWorkflow();

  const handleNew = () => { setEditing(null); setEditorOpen(true); };
  const handleEdit = (w: AgentWorkflow) => { setEditing(w); setEditorOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Workflows chain multiple skills into multi-step sequences. FlowPilot can also compose
          workflows autonomously when it identifies repeating multi-skill patterns.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{workflows.filter((w) => w.enabled).length} active</span>
          <span>·</span>
          <span>{workflows.length} total</span>
        </div>
        <div className="flex-1" />
        <Button onClick={handleNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading workflows…</p>
      ) : workflows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No workflows yet</p>
          <p className="text-sm mt-1">
            Create multi-step DAG workflows that chain skills together with conditional branching.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onEdit={handleEdit}
              onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}
        </div>
      )}

      <WorkflowEditorSheet
        workflow={editing}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={(data) => upsert.mutate(data)}
      />
    </div>
  );
}

// ─── Workflow Card with DAG visualization ─────────────────────────────────────

function WorkflowCard({
  workflow, onEdit, onToggle, onDelete,
}: {
  workflow: AgentWorkflow;
  onEdit: (w: AgentWorkflow) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const steps = (workflow.steps ?? []) as WorkflowStep[];

  return (
    <Card className="group hover:ring-1 hover:ring-primary/20 transition-all">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex-1 cursor-pointer"
            onClick={() => onEdit(workflow)}
          >
            <CardTitle className="text-sm font-medium leading-snug flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              {workflow.name}
            </CardTitle>
            {workflow.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{workflow.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="text-[10px] font-mono">
              {workflow.trigger_type}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {steps.length} steps
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Compact DAG preview */}
        {steps.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide' : 'Show'} pipeline
          </button>
        )}

        {expanded && steps.length > 0 && (
          <div className="rounded-md border bg-muted/30 p-3">
            <StepsPipeline steps={steps} />
          </div>
        )}

        {workflow.last_error && (
          <div className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span className="truncate">{workflow.last_error}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {workflow.run_count > 0
              ? `${workflow.run_count} runs · last ${workflow.last_run_at ? format(new Date(workflow.last_run_at), 'MMM d HH:mm') : '—'}`
              : 'Never run'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Switch
              checked={workflow.enabled}
              onCheckedChange={(checked) => onToggle(workflow.id, checked)}
            />
            <span className="text-xs text-muted-foreground">
              {workflow.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete workflow?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this workflow and all its steps.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(workflow.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DAG Pipeline Visualization ───────────────────────────────────────────────

function StepsPipeline({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={step.id} className="flex items-start gap-2">
          {/* Vertical connector */}
          <div className="flex flex-col items-center pt-0.5">
            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className="w-px h-6 bg-border" />
            )}
          </div>

          {/* Step content */}
          <div className="flex-1 pb-2 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium truncate">{step.name}</span>
              <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                {step.skill_name}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {step.condition && (
                <span className="text-[9px] text-accent-foreground">
                  if: {step.condition}
                </span>
              )}
              {step.on_failure && (
                <span className="text-[9px] text-destructive">
                  fallback → {steps.find(s => s.id === step.on_failure)?.name ?? step.on_failure}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Editor Sheet ─────────────────────────────────────────────────────────────

function WorkflowEditorSheet({
  workflow, open, onClose, onSave,
}: {
  workflow: AgentWorkflow | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<AgentWorkflow> & { name: string }) => void;
}) {
  const { data: skills = [] } = useSkills();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState('manual');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  useEffect(() => {
    if (open) {
      setName(workflow?.name ?? '');
      setDescription(workflow?.description ?? '');
      setTriggerType(workflow?.trigger_type ?? 'manual');
      setSteps((workflow?.steps ?? []) as WorkflowStep[]);
    }
  }, [open, workflow]);

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Step ${prev.length + 1}`,
        skill_name: '',
        arguments: {},
      },
    ]);
  };

  const updateStep = (idx: number, patch: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const handleSave = () => {
    onSave({
      ...(workflow?.id ? { id: workflow.id } : {}),
      name,
      description: description || null,
      trigger_type: triggerType,
      steps,
      enabled: workflow?.enabled ?? true,
    });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent className="sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            {workflow ? 'Edit Workflow' : 'New Workflow'}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Basics */}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="wf-name">Name</Label>
              <Input id="wf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Content Publishing Pipeline" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wf-desc">Description</Label>
              <Input id="wf-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this workflow accomplish?" />
            </div>
            <div className="space-y-2">
              <Label>Trigger</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="cron">Cron</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="signal">Signal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Pipeline Steps</Label>
              <Button variant="outline" size="sm" onClick={addStep} className="gap-1.5 h-7 text-xs">
                <Plus className="h-3 w-3" />
                Add Step
              </Button>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground">
                <Play className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs">Add steps to build your workflow pipeline</p>
              </div>
            ) : (
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <StepEditor
                    key={step.id}
                    step={step}
                    index={i}
                    total={steps.length}
                    skills={skills}
                    allSteps={steps}
                    onChange={(patch) => updateStep(i, patch)}
                    onRemove={() => removeStep(i)}
                    onMove={(dir) => moveStep(i, dir)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview */}
          {steps.length > 1 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Preview</Label>
              <div className="rounded-md border bg-muted/30 p-3">
                <StepsPipeline steps={steps} />
              </div>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || steps.length === 0}>
            {workflow ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ─── Step Editor ──────────────────────────────────────────────────────────────

function StepEditor({
  step, index, total, skills, allSteps, onChange, onRemove, onMove,
}: {
  step: WorkflowStep;
  index: number;
  total: number;
  skills: { id: string; name: string; enabled: boolean }[];
  allSteps: WorkflowStep[];
  onChange: (patch: Partial<WorkflowStep>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const otherSteps = allSteps.filter((s) => s.id !== step.id);

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/50">
        <div className="flex flex-col">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-20 h-3">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-20 h-3">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[9px] font-bold text-primary">
          {index + 1}
        </span>
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left text-xs font-medium truncate">
          {step.name || 'Unnamed step'}
          {step.skill_name && (
            <span className="ml-1.5 text-muted-foreground font-mono">({step.skill_name})</span>
          )}
        </button>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Step Name</Label>
              <Input
                value={step.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className="h-7 text-xs"
                placeholder="Describe this step"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Skill</Label>
              <Select value={step.skill_name || ''} onValueChange={(v) => onChange({ skill_name: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Pick skill…" /></SelectTrigger>
                <SelectContent>
                  {skills.filter(s => s.enabled).map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      <span className="font-mono text-xs">{s.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Condition (optional)</Label>
            <Input
              value={step.condition ?? ''}
              onChange={(e) => onChange({ condition: e.target.value || undefined })}
              className="h-7 text-xs font-mono"
              placeholder="e.g. previous.status === 'success'"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-primary">On Success →</Label>
              <Select value={step.on_success ?? 'next'} onValueChange={(v) => onChange({ on_success: v === 'next' ? undefined : v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Next step" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next">Next step (default)</SelectItem>
                  {otherSteps.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-destructive">On Failure →</Label>
              <Select value={step.on_failure ?? 'stop'} onValueChange={(v) => onChange({ on_failure: v === 'stop' ? undefined : v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Stop" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop">Stop (default)</SelectItem>
                  {otherSteps.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Arguments (JSON)</Label>
            <Textarea
              value={JSON.stringify(step.arguments ?? {}, null, 2)}
              onChange={(e) => {
                try { onChange({ arguments: JSON.parse(e.target.value) }); } catch { /* skip */ }
              }}
              className="font-mono text-xs min-h-[60px]"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
}
