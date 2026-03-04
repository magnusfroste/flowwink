import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Plus, Timer, Zap, Radio, Trash2, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  useAutomations, useUpsertAutomation, useToggleAutomation, useDeleteAutomation,
} from '@/hooks/useAutomations';
import { useSkills } from '@/hooks/useSkillHub';
import type { AgentAutomation, AutomationTriggerType } from '@/types/agent';

const triggerConfig: Record<AutomationTriggerType, { label: string; icon: typeof Timer; color: string }> = {
  cron: { label: 'Cron', icon: Timer, color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  event: { label: 'Event', icon: Zap, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  signal: { label: 'Signal', icon: Radio, color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
};

export function AutomationsPanel() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AgentAutomation | null>(null);

  const { data: automations = [], isLoading } = useAutomations();
  const upsert = useUpsertAutomation();
  const toggle = useToggleAutomation();
  const remove = useDeleteAutomation();

  const handleNew = () => { setEditing(null); setEditorOpen(true); };
  const handleEdit = (a: AgentAutomation) => { setEditing(a); setEditorOpen(true); };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{automations.filter((a) => a.enabled).length} active</span>
          <span>·</span>
          <span>{automations.length} total</span>
        </div>
        <div className="flex-1" />
        <Button onClick={handleNew} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Automation
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading automations…</p>
      ) : automations.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Timer className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No automations yet</p>
          <p className="text-sm mt-1">
            Schedule skills to run on a cron, react to events, or respond to signals.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((auto) => (
            <AutomationCard
              key={auto.id}
              automation={auto}
              onEdit={handleEdit}
              onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
              onDelete={(id) => remove.mutate(id)}
            />
          ))}
        </div>
      )}

      <AutomationEditorSheet
        automation={editing}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={(data) => upsert.mutate(data)}
      />
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AutomationCard({
  automation, onEdit, onToggle, onDelete,
}: {
  automation: AgentAutomation;
  onEdit: (a: AgentAutomation) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = triggerConfig[automation.trigger_type];
  const TriggerIcon = cfg.icon;
  const cronExpr = automation.trigger_type === 'cron'
    ? (automation.trigger_config as any)?.expression
    : null;
  const eventName = automation.trigger_type === 'event'
    ? (automation.trigger_config as any)?.event_name
    : null;

  return (
    <Card
      className="group cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all"
      onClick={() => onEdit(automation)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium leading-snug line-clamp-2">
            {automation.name}
          </CardTitle>
          <Badge variant="secondary" className={`shrink-0 text-[10px] ${cfg.color}`}>
            <TriggerIcon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {automation.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{automation.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {automation.skill_name && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {automation.skill_name}
            </Badge>
          )}
          {cronExpr && (
            <Badge variant="outline" className="text-[10px] font-mono">
              {cronExpr}
            </Badge>
          )}
          {eventName && (
            <Badge variant="outline" className="text-[10px]">
              on: {eventName}
            </Badge>
          )}
        </div>

        {automation.last_error && (
          <div className="flex items-center gap-1 text-[10px] text-destructive">
            <AlertCircle className="h-3 w-3" />
            <span className="truncate">{automation.last_error}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {automation.run_count > 0
              ? `${automation.run_count} runs · last ${automation.last_triggered_at ? format(new Date(automation.last_triggered_at), 'MMM d HH:mm') : '—'}`
              : 'Never run'}
          </span>
        </div>

        <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Switch
              checked={automation.enabled}
              onCheckedChange={(checked) => onToggle(automation.id, checked)}
            />
            <span className="text-xs text-muted-foreground">
              {automation.enabled ? 'Enabled' : 'Disabled'}
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
                <AlertDialogTitle>Delete automation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this automation trigger.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(automation.id)}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Editor Sheet ─────────────────────────────────────────────────────────────

function AutomationEditorSheet({
  automation, open, onClose, onSave,
}: {
  automation: AgentAutomation | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<AgentAutomation> & { name: string }) => void;
}) {
  const { data: skills = [] } = useSkills();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('cron');
  const [cronExpression, setCronExpression] = useState('');
  const [eventName, setEventName] = useState('');
  const [signalCondition, setSignalCondition] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [argsText, setArgsText] = useState('{}');

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(automation?.name ?? '');
      setDescription(automation?.description ?? '');
      setTriggerType(automation?.trigger_type ?? 'cron');
      const tc = automation?.trigger_config ?? {};
      setCronExpression((tc as any).expression ?? '');
      setEventName((tc as any).event_name ?? '');
      setSignalCondition((tc as any).condition ? JSON.stringify((tc as any).condition, null, 2) : '');
      setSelectedSkillId(automation?.skill_id ?? '');
      setArgsText(automation?.skill_arguments ? JSON.stringify(automation.skill_arguments, null, 2) : '{}');
    }
    if (!isOpen) onClose();
  };

  const selectedSkill = skills.find((s) => s.id === selectedSkillId);

  const handleSave = () => {
    let trigger_config: Record<string, unknown> = {};
    if (triggerType === 'cron') trigger_config = { expression: cronExpression };
    else if (triggerType === 'event') trigger_config = { event_name: eventName };
    else {
      try { trigger_config = { condition: JSON.parse(signalCondition) }; } catch { trigger_config = { condition: signalCondition }; }
    }

    let skill_arguments = {};
    try { skill_arguments = JSON.parse(argsText); } catch { /* keep empty */ }

    onSave({
      ...(automation?.id ? { id: automation.id } : {}),
      name,
      description: description || null,
      trigger_type: triggerType,
      trigger_config,
      skill_id: selectedSkillId || null,
      skill_name: selectedSkill?.name ?? null,
      skill_arguments,
      enabled: automation?.enabled ?? true,
    });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{automation ? 'Edit Automation' : 'New Automation'}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="auto-name">Name</Label>
            <Input
              id="auto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly analytics digest"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auto-desc">Description</Label>
            <Input
              id="auto-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="space-y-2">
            <Label>Trigger Type</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as AutomationTriggerType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">
                  <span className="flex items-center gap-2"><Timer className="h-3.5 w-3.5" /> Cron Schedule</span>
                </SelectItem>
                <SelectItem value="event">
                  <span className="flex items-center gap-2"><Zap className="h-3.5 w-3.5" /> Event</span>
                </SelectItem>
                <SelectItem value="signal">
                  <span className="flex items-center gap-2"><Radio className="h-3.5 w-3.5" /> Signal</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Trigger-specific config */}
          {triggerType === 'cron' && (
            <div className="space-y-2">
              <Label htmlFor="cron-expr">Cron Expression</Label>
              <Input
                id="cron-expr"
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="0 9 * * 1 (every Monday 9am)"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Standard cron: minute hour day month weekday
              </p>
            </div>
          )}

          {triggerType === 'event' && (
            <div className="space-y-2">
              <Label htmlFor="event-name">Event Name</Label>
              <Input
                id="event-name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g. lead.created, blog.published"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Webhook event that triggers this automation.
              </p>
            </div>
          )}

          {triggerType === 'signal' && (
            <div className="space-y-2">
              <Label htmlFor="signal-cond">Signal Condition (JSON)</Label>
              <Textarea
                id="signal-cond"
                value={signalCondition}
                onChange={(e) => setSignalCondition(e.target.value)}
                placeholder='{"metric": "bounce_rate", "threshold": 0.5, "direction": "above"}'
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Data condition that triggers execution when met.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Skill to Execute</Label>
            <Select value={selectedSkillId} onValueChange={setSelectedSkillId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a skill…" />
              </SelectTrigger>
              <SelectContent>
                {skills.filter((s) => s.enabled).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="font-mono text-xs">{s.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="skill-args">Skill Arguments (JSON)</Label>
            <Textarea
              id="skill-args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder='{"period": "week"}'
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Default arguments passed to the skill on each trigger.
            </p>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || !selectedSkillId}>
            {automation ? 'Update' : 'Create'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
