import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Bot, CalendarClock, CheckCircle2, ChevronDown, Circle, CircleAlert, Info, Loader2, Scale, UserPlus, Wand2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useIsModuleEnabled } from '@/hooks/useModules';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { PHASES, oneClickOf, type GuideStep } from '@/lib/hr-guide';

interface PersonGuide {
  process: string;
  title: string;
  employee: { id: string; name: string; title: string | null; start_date: string | null; status: string };
  country: string | null;
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
  required_total: number;
  required_done: number;
  overdue: number;
  complete: boolean;
  next: { id: string; label: string; state: string; due: string | null } | null;
}

interface Overview {
  process: string;
  title: string;
  purpose: string;
  country: string | null;
  people: PersonRow[];
  outline: Array<{ id: string; phase: GuideStep['phase']; label: string; why: string; law: string | null; required: boolean }>;
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

/**
 * HR → Start here. The guide a founder without an HR person is led through:
 * "welcome a new employee", step by step, each with why, the rule behind it,
 * what is done (read from the records) and the button that does the rest.
 * The same guide an agent reads (hr_process_guide) — FlowPilot can walk it.
 */
export function HrGuide({ onOpenTab, onNewEmployee }: { onOpenTab: (tab: string) => void; onNewEmployee: () => void }) {
  const [params, setParams] = useSearchParams();
  const employeeId = params.get('employee');
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('employee', id); else next.delete('employee');
    setParams(next, { replace: true });
  };

  return employeeId
    ? <PersonStepper employeeId={employeeId} onBack={() => select(null)} onOpenTab={onOpenTab} />
    : <GuideOverview onSelect={select} onOpenTab={onOpenTab} onNewEmployee={onNewEmployee} />;
}

function GuideOverview({ onSelect, onOpenTab, onNewEmployee }: { onSelect: (id: string) => void; onOpenTab: (tab: string) => void; onNewEmployee: () => void }) {
  const { formatDate } = usePlatformFormat();
  const recruitmentEnabled = useIsModuleEnabled('recruitment');
  const flowpilotEnabled = useIsModuleEnabled('flowpilot');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['hr-process-guide', 'onboarding', null],
    queryFn: async (): Promise<Overview> => {
      const { data, error } = await supabase.rpc('hr_process_guide' as never, { p_process: 'onboarding' } as never);
      if (error) throw error;
      return data as unknown as Overview;
    },
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) return <p className="p-6 text-sm text-destructive">Could not load the HR guide.</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> {data.title}</CardTitle>
          <CardDescription>{data.purpose}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* The flow, as a founder reads it: three phases, the steps in order. */}
          <ol className="grid gap-4 md:grid-cols-3">
            {PHASES.map((phase, i) => (
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
                      <span>{s.label}{!s.required && <span className="text-muted-foreground"> · optional</span>}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {data.country !== 'SE' && (
            <p className="text-xs text-muted-foreground">
              The rule behind each step is given for Sweden. Your business country is {data.country ?? 'not set'} — the steps still apply, check the local rules.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">Being welcomed now</CardTitle>
            <CardDescription>Everyone who starts soon or started in the last six months. Pick a person to walk their steps.</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {recruitmentEnabled && (
              <Button variant="outline" size="sm" asChild><Link to="/admin/recruitment">Hire from Recruitment</Link></Button>
            )}
            <Button size="sm" onClick={onNewEmployee}><UserPlus className="mr-2 h-4 w-4" /> New employee</Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.people.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nobody is starting right now. Add the person you are hiring — or hire them from Recruitment, which drafts the contract and the introduction for you — and the guide follows them from here.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.people.map((p) => {
                const pct = p.required_total ? Math.round((p.required_done / p.required_total) * 100) : 0;
                return (
                  <li key={p.employee_id}>
                    <button type="button" onClick={() => onSelect(p.employee_id)} className="flex w-full items-center gap-4 py-3 text-left hover:bg-muted/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          {p.name}
                          {p.complete && <Badge variant="outline" className="font-normal">Done</Badge>}
                          {p.overdue > 0 && <Badge variant="destructive" className="font-normal">{p.overdue} overdue</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[p.title, p.start_date ? `starts ${formatDate(p.start_date)}` : 'no start date'].filter(Boolean).join(' · ')}
                          {p.next && <> · next: <span className="text-foreground">{p.next.label}</span></>}
                        </div>
                      </div>
                      <div className="flex w-40 items-center gap-2">
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
          {flowpilotEnabled && (
            <p className="mt-4 text-xs text-muted-foreground">
              FlowPilot — or any agent over MCP — reads the same guide (<span className="font-mono">hr_process_guide</span>) and can do the steps for you; what only you can decide waits for you.
            </p>
          )}
        </CardContent>
      </Card>

      <HrMap onOpenTab={onOpenTab} />
    </div>
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

function PersonStepper({ employeeId, onBack, onOpenTab }: { employeeId: string; onBack: () => void; onOpenTab: (tab: string) => void }) {
  const qc = useQueryClient();
  const { formatDate } = usePlatformFormat();
  const flowpilotEnabled = useIsModuleEnabled('flowpilot');
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['hr-process-guide', 'onboarding', employeeId],
    queryFn: async (): Promise<PersonGuide> => {
      const { data, error } = await supabase.rpc('hr_process_guide' as never, { p_process: 'onboarding', p_employee_id: employeeId } as never);
      if (error) throw error;
      return data as unknown as PersonGuide;
    },
  });

  const doIt = useMutation({
    mutationFn: async (step: GuideStep) => {
      const action = oneClickOf(step);
      if (!action) throw new Error('This step needs a person');
      const { error } = await supabase.from(action.table as never).insert(action.row as never);
      if (error) throw error;
    },
    onSuccess: (_d, step) => {
      toast.success(`${step.label} — done`);
      qc.invalidateQueries({ queryKey: ['hr-process-guide'] });
      qc.invalidateQueries({ queryKey: ['onboarding_checklists'] });
      qc.invalidateQueries({ queryKey: ['leave_allocations'] });
    },
    onError: (e: Error) => { logger.error('[hr-guide] one-click step failed', e); toast.error(e.message); },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) return <p className="p-6 text-sm text-destructive">Could not load this person's guide.</p>;

  const pct = data.required_total ? Math.round((data.required_done / data.required_total) * 100) : 0;
  const name = data.employee.name;
  const wholePrompt = `Walk the onboarding of ${name} with me (hr_process_guide, p_employee_id ${data.employee.id}). Explain each open step in plain words, do what you can, and ask me for what only I know.`;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Everyone being welcomed</Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Welcome {name}</CardTitle>
            <CardDescription>
              {[data.employee.title, data.employee.start_date ? `starts ${formatDate(data.employee.start_date)}` : 'no start date yet'].filter(Boolean).join(' · ')}
            </CardDescription>
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

      {PHASES.map((phase) => {
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
                  formatDate={formatDate}
                  onOpen={() => step.open && onOpenTab(step.open)}
                  onDo={() => doIt.mutate(step)}
                  doing={doIt.isPending && doIt.variables?.id === step.id}
                  askHref={flowpilotEnabled && step.state !== 'done' && step.fix
                    ? flowChatHref(`Help me with "${step.label}" for ${name} (hr_process_guide, p_employee_id ${data.employee.id}, step ${step.id}). Explain what is needed and do what you can — ask me for anything only I know.`)
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

function StepRow({ step, formatDate, onOpen, onDo, doing, askHref }: {
  step: GuideStep;
  formatDate: (d: string) => string;
  onOpen: () => void;
  onDo: () => void;
  doing: boolean;
  askHref: string | null;
}) {
  const [open, setOpen] = useState(step.state === 'overdue');
  const oneClick = oneClickOf(step);
  return (
    <li className={cn('rounded-lg border bg-card', step.state === 'overdue' ? 'border-destructive/50' : 'border-border')}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start gap-3 p-4">
          <StateIcon state={step.state} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('font-medium', step.state === 'done' && 'text-muted-foreground')}>{step.label}</span>
              {!step.required && <Badge variant="outline" className="font-normal">optional</Badge>}
              {step.due && step.state !== 'done' && (
                <span className={cn('inline-flex items-center gap-1 text-xs', step.state === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                  <CalendarClock className="h-3 w-3" /> {step.state === 'overdue' ? 'was due' : 'by'} {formatDate(step.due)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{step.detail}</p>
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
              {step.open && <Button size="sm" variant={oneClick ? 'ghost' : 'outline'} onClick={onOpen}>Open</Button>}
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
                <Scale className="mt-0.5 h-4 w-4 shrink-0" /> <span><span className="font-medium text-foreground">The rule in Sweden: </span>{step.law}</span>
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
