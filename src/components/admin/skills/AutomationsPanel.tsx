import { useState, useEffect, useMemo } from 'react';
import {
  Timer, Zap, Radio, Trash2, AlertCircle, Info, Play, Loader2, Search, X,
} from 'lucide-react';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
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
  useAutomations, useToggleAutomation, useDeleteAutomation, useRunAutomationNow,
} from '@/hooks/useAutomations';
import { useSkills } from '@/hooks/useSkillHub';
import {
  EMPTY_AUTOMATION_FILTERS, automationModuleIndex, automationModuleOptions, automationHome,
  filterAutomations, hasActiveAutomationFilters,
  type AutomationFilters, type AutomationStateFilter,
} from '@/lib/automation-filter';
import type { AgentAutomation, AutomationTriggerType, AutomationExecutor } from '@/types/agent';

const triggerConfig: Record<AutomationTriggerType, { label: string; icon: typeof Timer; color: string }> = {
  cron: { label: 'Cron', icon: Timer, color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400' },
  event: { label: 'Event', icon: Zap, color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  signal: { label: 'Signal', icon: Radio, color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400' },
};

const executorLabels: Record<AutomationExecutor, string> = {
  platform: 'Platform',
  flowpilot: 'FlowPilot',
  openclaw: 'OpenClaw',
  external: 'External',
};

interface AutomationsPanelProps {
  onEdit: (automation: AgentAutomation) => void;
}

export function AutomationsPanel({ onEdit }: AutomationsPanelProps) {
  const { data: automations = [], isLoading } = useAutomations();
  const toggle = useToggleAutomation();
  const remove = useDeleteAutomation();
  const runNow = useRunAutomationNow();
  const [filters, setFilters] = useState<AutomationFilters>(EMPTY_AUTOMATION_FILTERS);
  const moduleIndex = useMemo(() => automationModuleIndex(), []);
  const moduleOptions = useMemo(() => automationModuleOptions(automations, moduleIndex), [automations, moduleIndex]);
  const visible = useMemo(() => filterAutomations(automations, filters, moduleIndex), [automations, filters, moduleIndex]);
  const filtering = hasActiveAutomationFilters(filters);
  const set = <K extends keyof AutomationFilters>(key: K, value: AutomationFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Automations run skills on a schedule or in response to events. You can create your own,
          and FlowPilot may suggest new ones based on recurring patterns it detects.
        </p>
      </div>

      {/* Toolbar: search + filters, the modules page's answer to a long list */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search automations by name, skill, cron, event, module…"
            value={filters.query}
            onChange={(e) => set('query', e.target.value)}
            className="pl-9"
            aria-label="Search automations"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.trigger} onValueChange={(v) => set('trigger', v as AutomationFilters['trigger'])}>
            <SelectTrigger className="h-9 w-[120px]" aria-label="Trigger"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All triggers</SelectItem>
              {(Object.keys(triggerConfig) as AutomationTriggerType[]).map((t) => (
                <SelectItem key={t} value={t}>{triggerConfig[t].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.state} onValueChange={(v) => set('state', v as AutomationStateFilter)}>
            <SelectTrigger className="h-9 w-[130px]" aria-label="State"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any state</SelectItem>
              <SelectItem value="enabled">Enabled</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
              <SelectItem value="failing">With errors</SelectItem>
              <SelectItem value="never_ran">Never ran</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.module} onValueChange={(v) => set('module', v)}>
            <SelectTrigger className="h-9 w-[160px]" aria-label="Module"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modules</SelectItem>
              {moduleOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtering && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs" onClick={() => setFilters(EMPTY_AUTOMATION_FILTERS)}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {filtering ? (
          <><span>{visible.length} of {automations.length} shown</span><span>·</span></>
        ) : null}
        <span>{automations.filter((a) => a.enabled).length} active</span>
        <span>·</span>
        <span>{automations.length} total</span>
        {automations.some((a) => a.last_error) && (
          <><span>·</span><span className="text-destructive">{automations.filter((a) => a.last_error).length} with errors</span></>
        )}
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
      ) : visible.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No automations match. <button type="button" className="underline" onClick={() => setFilters(EMPTY_AUTOMATION_FILTERS)}>Clear filters</button></p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((auto) => (
            <AutomationCard
              key={auto.id}
              automation={auto}
              moduleName={automationHome(auto, moduleIndex).name}
              onEdit={onEdit}
              onToggle={(id, enabled) => toggle.mutate({ id, enabled })}
              onDelete={(id) => remove.mutate(id)}
              onRun={(a) => runNow.mutate(a)}
              isRunning={runNow.isPending && runNow.variables?.id === auto.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AutomationCard({
  automation, moduleName, onEdit, onToggle, onDelete, onRun, isRunning,
}: {
  automation: AgentAutomation;
  moduleName: string;
  onEdit: (a: AgentAutomation) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onRun: (a: AgentAutomation) => void;
  isRunning: boolean;
}) {
  const { formatDateTime } = usePlatformFormat();
  const cfg = triggerConfig[automation.trigger_type];
  const TriggerIcon = cfg.icon;
  const cronExpr = automation.trigger_type === 'cron'
    ? (automation.trigger_config as any)?.expression
    : null;
  // The dispatcher matches `event_name` or `event` (module seeds use either).
  const eventCfg = (automation.trigger_config ?? {}) as { event_name?: string; event?: string };
  const eventName = automation.trigger_type === 'event' ? (eventCfg.event_name ?? eventCfg.event ?? null) : null;

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
          <Badge variant="outline" className="text-[10px]">
            via {executorLabels[automation.executor ?? 'platform']}
          </Badge>
          <Badge variant="outline" className="text-[10px]" title="The module that seeds this automation">
            {moduleName}
          </Badge>
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
              ? `${automation.run_count} runs · last ${automation.last_triggered_at ? formatDateTime(automation.last_triggered_at, { year: undefined, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}`
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

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              disabled={isRunning || (!automation.skill_id && !automation.skill_name)}
              onClick={() => onRun(automation)}
              title="Run this automation now"
            >
              {isRunning
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5" />}
              Run now
            </Button>

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
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Editor Sheet ─────────────────────────────────────────────────────────────

export function AutomationEditorSheet({
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
  const [executor, setExecutor] = useState<AutomationExecutor>('platform');

  useEffect(() => {
    if (open) {
      setName(automation?.name ?? '');
      setDescription(automation?.description ?? '');
      setTriggerType(automation?.trigger_type ?? 'cron');
      const tc = automation?.trigger_config ?? {};
      setCronExpression((tc as any).expression ?? '');
      setEventName((tc as any).event_name ?? '');
      setSignalCondition((tc as any).condition ? JSON.stringify((tc as any).condition, null, 2) : '');
      setSelectedSkillId(automation?.skill_id ?? '');
      setArgsText(automation?.skill_arguments ? JSON.stringify(automation.skill_arguments, null, 2) : '{}');
      setExecutor(automation?.executor ?? 'platform');
    }
  }, [open, automation]);

  const handleOpenChange = (isOpen: boolean) => {
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
      executor,
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

          <div className="space-y-2">
            <Label>Executor</Label>
            <Select value={executor} onValueChange={(v) => setExecutor(v as AutomationExecutor)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="platform">Platform — deterministic skill run</SelectItem>
                <SelectItem value="flowpilot">FlowPilot — agentic execution</SelectItem>
                <SelectItem value="openclaw">OpenClaw — external operator</SelectItem>
                <SelectItem value="external">External — webhook only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Who runs this when it fires. Platform = no AI required.
            </p>
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
                placeholder="e.g. lead.created"
                className="font-mono text-xs"
                list="canonical-events"
              />
              <datalist id="canonical-events">
                <option value="lead.created" />
                <option value="order.created" />
                <option value="order.paid" />
                <option value="deal.won" />
                <option value="ticket.created" />
                <option value="booking.created" />
              </datalist>
              <p className="text-xs text-muted-foreground">
                Platform events: <code>lead.created</code>, <code>order.created</code>,{' '}
                <code>order.paid</code>, <code>deal.won</code>, <code>ticket.created</code>,{' '}
                <code>booking.created</code>. The event payload is passed as <code>arguments.event</code>.
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
