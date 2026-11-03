import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Bot, CalendarClock, CheckCircle2, ChevronDown, Circle, CircleAlert, DoorOpen, Info, Loader2, Scale, UserPlus, Wand2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { PROCESSES, oneClickOf, toggledChecklist, type GuideProcess, type GuideStep, type RulesSummary } from '@/lib/hr-guide';
import { EndEmploymentDialog } from './EndEmploymentDialog';
import { HrRulesCard } from './HrRulesCard';

interface PersonGuide {
  process: GuideProcess;
  title: string;
  employee: { id: string; name: string; title: string | null; start_date: string | null; end_date: string | null; status: string };
  country: string | null;
  rules: RulesSummary | null;
  steps: GuideStep[];
  required_total: number;
  required_done: number;
  overdue: number;
  complete: boolean;
  next: GuideStep | null;
}

interface PersonRow {
  employee_id: string;
  name: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  required_total: number;
  required_done: number;
  overdue: number;
  complete: boolean;
  next: { id: string; label: string; state: string; due: string | null } | null;
}

interface Overview {
  process: GuideProcess;
  title: string;
  purpose: string;
  country: string | null;
  rules: RulesSummary | null;
  people: PersonRow[];
  outline: Array<{ id: string; phase: string; label: string; why: string; law: string | null; required: boolean }>;
}

function StateIcon({ state }: { state: GuideStep['state'] }) {
  if (state === 'done') return <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Done" />;
  if (state === 'overdue') return <CircleAlert className="h-5 w-5 shrink-0 text-destructive" aria-label="Overdue" />;
  if (state === 'info') return <Info className="h-5 w-5 shrink-0 text-muted-foreground" aria-label="Reminder" />;
  return <Circle className="h-5 w-5 shrink-0 text-warning" aria-label="To do" />;
}

function flowChatHref(prompt: string): string {
  return `/admin/flowchat?prompt=${encodeURIComponent(prompt)}`;
}

function useGuide<T>(process: GuideProcess, employeeId: string | null) {
  return useQuery({
    queryKey: ['hr-process-guide', process, employeeId],
    queryFn: async (): Promise<T> => {
      const args = employeeId ? { p_process: process, p_employee_id: employeeId } : { p_process: process };
      const { data, error } = await supabase.rpc('hr_process_guide' as never, args as never);
      if (error) throw error;
      return data as unknown as T;
    },
  });
}

/**
 * HR → Start here. The guides a founder without an HR person is led through:
 * "welcome a new employee" and "when someone leaves", step by step, each with
 * why, the rule behind it, what is done (read from the records) and the button
 * that does the rest. The same guides an agent reads (hr_process_guide).
 */
export function HrGuide({ onOpenTab, onNewEmployee }: { onOpenTab: (tab: string) => void; onNewEmployee: () => void }) {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employee');
  const process: GuideProcess = params.get('process') === 'offboarding' ? 'offboarding' : 'onboarding';
  const [ending, setEnding] = useState<{ open: boolean; employeeId?: string }>({ open: false });
  const select = (p: GuideProcess, id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) { next.set('employee', id); next.set('process', p); } else { next.delete('employee'); next.delete('process'); }
    setParams(next, { replace: true });
  };

  return (
    <>
      {employeeId
        ? <PersonStepper process={process} employeeId={employeeId} onBack={() => select(process, null)} onOpenTab={onOpenTab} onEnd={(id) => setEnding({ open: true, employeeId: id })} />
        : (
          <div className="space-y-6">
            <ProcessSection process="onboarding" onSelect={(id) => select('onboarding', id)} onNewEmployee={onNewEmployee} onEnd={() => setEnding({ open: true })} />
            <ProcessSection process="offboarding" onSelect={(id) => select('offboarding', id)} onNewEmployee={onNewEmployee} onEnd={() => setEnding({ open: true })} />
            <HrRulesCard />
            <HrMap onOpenTab={onOpenTab} />
          </div>
        )}
      <EndEmploymentDialog
        open={ending.open}
        employeeId={ending.employeeId}
        onOpenChange={(open) => setEnding((e) => ({ ...e, open }))}
        onEnded={(id) => { setEnding({ open: false }); select('offboarding', id); }}
      />
    </>
  );
}

function ProcessSection({ process, onSelect, onNewEmployee, onEnd }: {
  process: GuideProcess;
  onSelect: (id: string) => void;
  onNewEmployee: () => void;
  onEnd: () => void;
}) {
  const { formatDate } = usePlatformFormat();
  const recruitmentEnabled = useIsModuleEnabled('recruitment');
  const flowpilotEnabled = useIsModuleEnabled('flowpilot');
  const { data, isLoading, isError } = useGuide<Overview>(process, null);
  const leaving = process === 'offboarding';

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return <p className="p-6 text-sm text-destructive">Could not load the HR guide.</p>;
  const Icon = leaving ? DoorOpen : UserPlus;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /> {data.title}</CardTitle>
          <CardDescription>{data.purpose}</CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {leaving ? (
            <Button size="sm" variant="outline" onClick={onEnd}><DoorOpen className="mr-2 h-4 w-4" /> End an employment</Button>
          ) : (
            <>
              {recruitmentEnabled && <Button variant="outline" size="sm" asChild><Link to="/admin/recruitment">Hire from Recruitment</Link></Button>}
              <Button size="sm" onClick={onNewEmployee}><UserPlus className="mr-2 h-4 w-4" /> New employee</Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* The flow, as a founder reads it: three phases, the steps in order. */}
        <ol className="grid gap-4 md:grid-cols-3">
          {PROCESSES[process].phases.map((phase, i) => (
            <li key={phase.id} className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>
                {phase.label}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{phase.hint}</p>
              <ul className="mt-3 space-y-1.5">
                {data.outline.filter((s) => s.phase === phase.id).map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm" title={s.why}>
                    <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span>{s.label}{!s.required && <span className="text-muted-foreground"> · when it applies</span>}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        {data.rules?.origin === 'none' && (
          <p className="text-xs text-muted-foreground">
            No employment rules for {data.country ?? 'your country'} — every step still applies, but without the rule behind it. Save your terms under Employment rules below.
          </p>
        )}

        <div>
          <h3 className="text-sm font-semibold">{leaving ? 'Leaving now' : 'Being welcomed now'}</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            {leaving ? 'Everyone whose employment is ending, or ended in the last four months.' : 'Everyone who starts soon or started in the last six months.'} Pick a person to walk their steps.
          </p>
          {data.people.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {leaving
                ? 'Nobody is leaving. When someone resigns, or you have to end an employment, start with End an employment — it tells you the notice the law requires before anything is written.'
                : 'Nobody is starting right now. Add the person you are hiring — or hire them from Recruitment, which drafts the contract and the introduction for you — and the guide follows them from here.'}
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {data.people.map((p) => {
                const pct = p.required_total ? Math.round((p.required_done / p.required_total) * 100) : 0;
                const when = leaving
                  ? (p.end_date ? `last day ${formatDate(p.end_date)}` : 'no last day yet')
                  : (p.start_date ? `starts ${formatDate(p.start_date)}` : 'no start date');
                return (
                  <li key={p.employee_id}>
                    <button type="button" onClick={() => onSelect(p.employee_id)} className="flex w-full items-center gap-4 px-3 py-3 text-left hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          {p.name}
                          {p.complete && <Badge variant="outline" className="font-normal">Done</Badge>}
                          {p.overdue > 0 && <Badge variant="destructive" className="font-normal">{p.overdue} overdue</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[p.title, when].filter(Boolean).join(' · ')}
                          {p.next && <> · next: <span className="text-foreground">{p.next.label}</span></>}
                        </div>
                      </div>
                      <div className="hidden w-40 items-center gap-2 sm:flex">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-xs tabular-nums text-muted-foreground">{p.required_done}/{p.required_total}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {flowpilotEnabled && (
          <p className="text-xs text-muted-foreground">
            FlowPilot — or any agent over MCP — reads the same guide (<span className="font-mono">hr_process_guide</span>) and can do the steps for you; what only you can decide waits for you.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** What the fourteen tabs are for, in a founder's words. */
const MAP: Array<{ title: string; text: string; tabs: Array<[string, string]> }> = [
  { title: 'Your people', text: 'Who works here, on what terms, and who reports to whom.', tabs: [['employees', 'Employees'], ['contracts', 'Contracts'], ['orgchart', 'Org chart']] },
  { title: 'Time away', text: 'Vacation days each person has, requests to approve, and what is left.', tabs: [['leave', 'Leave requests'], ['allocations', 'Allocations'], ['balances', 'Balances']] },
  { title: 'Pay', text: 'The monthly salary run, salary changes and benefits such as pension.', tabs: [['payroll', 'Payroll'], ['compensation', 'Compensation']] },
  { title: 'Everyday work', text: 'Who is in, and who works which shift.', tabs: [['attendance', 'Attendance'], ['shifts', 'Shifts']] },
  { title: 'Growing', text: 'Goals, follow-up talks and reviews, courses and certificates.', tabs: [['performance', 'Performance'], ['training', 'Training'], ['skills', 'Skills & certs']] },
  { title: 'When it gets hard', text: 'A written record when something has gone wrong — before anything else is decided.', tabs: [['disciplinary', 'Disciplinary']] },
];

function HrMap({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Where things are</CardTitle>
        <CardDescription>The tabs above, by what you are trying to do.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MAP.map((m) => (
          <div key={m.title} className="rounded-lg border border-border p-4">
            <div className="text-sm font-semibold">{m.title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{m.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.tabs.map(([tab, label]) => (
                <Button key={tab} variant="secondary" size="sm" className="h-7 text-xs" onClick={() => onOpenTab(tab)}>{label}</Button>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PersonStepper({ process, employeeId, onBack, onOpenTab, onEnd }: {
  process: GuideProcess;
  employeeId: string;
  onBack: () => void;
  onOpenTab: (tab: string) => void;
  onEnd: (employeeId: string) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { formatDate } = usePlatformFormat();
  const flowpilotEnabled = useIsModuleEnabled('flowpilot');
  const { data, isLoading, isError, isFetching } = useGuide<PersonGuide>(process, employeeId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['hr-process-guide'] });
    qc.invalidateQueries({ queryKey: ['onboarding_checklists'] });
    qc.invalidateQueries({ queryKey: ['leave_allocations'] });
  };

  const doIt = useMutation({
    mutationFn: async (step: GuideStep) => {
      const action = oneClickOf(step);
      if (!action) throw new Error('This step needs a person');
      const { error } = action.kind === 'insert'
        ? await supabase.from(action.table as never).insert(action.row as never)
        : await supabase.from(action.table as never).update(action.row as never).eq('id' as never, action.id as never);
      if (error) throw error;
    },
    onSuccess: (_d, step) => { toast.success(`${step.label} — done`); refresh(); },
    onError: (e: Error) => { logger.error('[hr-guide] one-click step failed', e); toast.error(e.message); },
  });

  const tick = useMutation({
    mutationFn: async ({ step, index, done }: { step: GuideStep; index: number; done: boolean }) => {
      if (!step.checklist) return;
      const next = toggledChecklist(step.checklist.items, index, done);
      const { error } = await supabase.from('onboarding_checklists').update({ items: next.items as never, completed_at: next.completed_at }).eq('id', step.checklist.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => { logger.error('[hr-guide] checklist tick failed', e); toast.error(e.message); },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) return <p className="p-6 text-sm text-destructive">Could not load this person's guide.</p>;

  const leaving = process === 'offboarding';
  const pct = data.required_total ? Math.round((data.required_done / data.required_total) * 100) : 0;
  const name = data.employee.name;
  const wholePrompt = `Walk the ${leaving ? 'offboarding' : 'onboarding'} of ${name} with me (hr_process_guide, p_process ${process}, p_employee_id ${data.employee.id}). Explain each open step in plain words, do what you can, and ask me for what only I know.`;
  const open = (target: string) => {
    if (target === 'dialog:end_employment') onEnd(data.employee.id);
    else if (target.startsWith('route:')) navigate(target.slice(6));
    else onOpenTab(target);
  };
  const subtitle = leaving
    ? [data.employee.title, data.employee.end_date ? `last day ${formatDate(data.employee.end_date)}` : 'no last day yet']
    : [data.employee.title, data.employee.start_date ? `starts ${formatDate(data.employee.start_date)}` : 'no start date yet'];

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> All guides</Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{leaving ? `${name} is leaving` : `Welcome ${name}`}</CardTitle>
            <CardDescription>{subtitle.filter(Boolean).join(' · ')}</CardDescription>
          </div>
          {flowpilotEnabled && !data.complete && (
            <Button variant="outline" size="sm" asChild>
              <Link to={flowChatHref(wholePrompt)}><Bot className="mr-2 h-4 w-4" /> Let FlowPilot walk it with you</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-3">
            <Progress value={pct} className="h-2 flex-1" />
            <span className="text-sm tabular-nums text-muted-foreground">{data.required_done} of {data.required_total} required steps</span>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {data.complete ? (
            <p className="text-sm text-success">Every required step is done.</p>
          ) : data.next ? (
            <p className="text-sm">Next: <span className="font-medium">{data.next.label}</span>{data.next.due && <> — by {formatDate(data.next.due)}</>}</p>
          ) : null}
        </CardContent>
      </Card>

      {PROCESSES[process].phases.map((phase) => {
        const steps = data.steps.filter((s) => s.phase === phase.id);
        if (!steps.length) return null;
        return (
          <section key={phase.id} className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{phase.label}</h3>
            <ol className="space-y-2">
              {steps.map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  rulesLabel={data.rules?.label ?? null}
                  formatDate={formatDate}
                  onOpen={() => step.open && open(step.open)}
                  onDo={() => doIt.mutate(step)}
                  doing={doIt.isPending && doIt.variables?.id === step.id}
                  onTick={(index, done) => tick.mutate({ step, index, done })}
                  ticking={tick.isPending}
                  askHref={flowpilotEnabled && step.state !== 'done' && (step.fix || step.checklist)
                    ? flowChatHref(`Help me with "${step.label}" for ${name} (hr_process_guide, p_process ${process}, p_employee_id ${data.employee.id}, step ${step.id}). Explain what is needed and do what you can — ask me for anything only I know.`)
                    : null}
                />
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function StepRow({ step, rulesLabel, formatDate, onOpen, onDo, doing, onTick, ticking, askHref }: {
  step: GuideStep;
  rulesLabel: string | null;
  formatDate: (d: string) => string;
  onOpen: () => void;
  onDo: () => void;
  doing: boolean;
  onTick: (index: number, done: boolean) => void;
  ticking: boolean;
  askHref: string | null;
}) {
  const [open, setOpen] = useState(step.state === 'overdue');
  const oneClick = oneClickOf(step);
  const skip = new Set(step.checklist?.skip_keys ?? []);
  const items = (step.checklist?.items ?? []).map((item, index) => ({ item, index })).filter(({ item }) => !item.key || !skip.has(item.key));
  const openLabel = step.open === 'dialog:end_employment' ? 'End employment' : 'Open';
  return (
    <li className={cn('rounded-lg border bg-card', step.state === 'overdue' ? 'border-destructive/50' : 'border-border')}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-3 p-4">
          <StateIcon state={step.state} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('font-medium', step.state === 'done' && 'text-muted-foreground')}>{step.label}</span>
              {!step.required && <Badge variant="outline" className="font-normal">when it applies</Badge>}
              {step.due && step.state !== 'done' && (
                <span className={cn('inline-flex items-center gap-1 text-xs', step.state === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                  <CalendarClock className="h-3 w-3" /> {step.state === 'overdue' ? 'was due' : 'by'} {formatDate(step.due)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
            {items.length > 0 && step.state !== 'done' && (
              <ul className="mt-2 space-y-1.5">
                {items.map(({ item, index }) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`${step.id}-${index}`}
                      checked={item.done}
                      disabled={ticking}
                      onCheckedChange={(v) => onTick(index, v === true)}
                    />
                    <label htmlFor={`${step.id}-${index}`} className={cn('cursor-pointer', item.done && 'text-muted-foreground line-through')}>{item.title}</label>
                  </li>
                ))}
              </ul>
            )}
            <CollapsibleTrigger className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Why this matters <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </CollapsibleTrigger>
          </div>
          {step.state !== 'done' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
              {oneClick && (
                <Button size="sm" onClick={onDo} disabled={doing}>
                  {doing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-2 h-3.5 w-3.5" />}{oneClick.label}
                </Button>
              )}
              {step.open && <Button size="sm" variant={oneClick ? 'ghost' : 'outline'} onClick={onOpen}>{openLabel}</Button>}
              {askHref && (
                <Button size="sm" variant="ghost" asChild><Link to={askHref}><Bot className="mr-1.5 h-3.5 w-3.5" /> Ask FlowPilot</Link></Button>
              )}
            </div>
          )}
        </div>
        <CollapsibleContent>
          <div className="space-y-2 border-t border-border px-4 py-3 pl-12 text-sm">
            <p>{step.why}</p>
            {step.law && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <Scale className="mt-0.5 h-4 w-4 shrink-0" /> <span><span className="font-medium text-foreground">The rule{rulesLabel ? ` (${rulesLabel})` : ''}: </span>{step.law}</span>
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
