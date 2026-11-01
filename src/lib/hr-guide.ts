/**
 * HR process guides — the shapes hr_process_guide returns and the rule for a
 * one-click step (20261031140000 onboarding, 20261031150000 offboarding).
 * Shared by HR → Start here and its test.
 */

export type GuideProcess = 'onboarding' | 'offboarding';

/** A notice step: from this many years of employment, this many months or days. */
export interface NoticeTier { from_years: number; months?: number; days?: number }

/** Employment rules as manage_hr_rules answers them (20261031160000). */
export interface HrRules {
  country: string;
  label: string;
  origin: 'own' | 'template';
  employer_notice: NoticeTier[];
  employee_notice: NoticeTier[];
  probation_max_months: number | null;
  probation_end_notice_days: number | null;
  vacation_days: number | null;
  laws: Record<string, string>;
  notes: string | null;
}

/** What the guides say about the rules in force. */
export interface RulesSummary { country: string | null; origin: 'own' | 'template' | 'none'; label: string | null; template_available: boolean; notes: string | null }

/** "1 month, 2 months from 2 years, 6 months from 10 years". */
export function describeTiers(tiers: NoticeTier[] | null | undefined): string {
  return [...(tiers ?? [])]
    .sort((a, b) => a.from_years - b.from_years)
    .map((t) => {
      const amount = t.months != null ? `${t.months} month${t.months === 1 ? '' : 's'}` : `${t.days ?? 0} days`;
      return t.from_years > 0 ? `${amount} from ${t.from_years} year${t.from_years === 1 ? '' : 's'}` : amount;
    })
    .join(', ');
}

export interface ChecklistItem { key?: string; title: string; done: boolean }

/** One step as hr_process_guide returns it. */
export interface GuideStep {
  id: string;
  phase: string;
  label: string;
  why: string;
  law: string | null;
  required: boolean;
  state: 'done' | 'todo' | 'overdue' | 'info';
  due: string | null;
  detail: string;
  fix: { skill: string; args: Record<string, unknown> } | null;
  /** An HR tab, `route:/admin/…`, or `dialog:end_employment`. */
  open: string | null;
  /** The checklist a step is ticked on (introduction, handover). */
  checklist?: { id: string; items: ChecklistItem[]; skip_keys?: string[] } | null;
}

export const PROCESSES: Record<GuideProcess, { phases: Array<{ id: string; label: string; hint: string }> }> = {
  onboarding: {
    phases: [
      { id: 'prepare', label: 'Before the first day', hint: 'The record, the contract and what payroll needs.' },
      { id: 'first_week', label: 'The first weeks', hint: 'Vacation, the introduction and who they report to.' },
      { id: 'first_months', label: 'The first months', hint: 'The probation decision, the first salary, pension.' },
    ],
  },
  offboarding: {
    phases: [
      { id: 'notice', label: 'The decision', hint: 'Who ends it, the grounds, the notice in writing and how long it runs.' },
      { id: 'last_weeks', label: 'The last weeks', hint: 'Vacation left, handover, things returned, access.' },
      { id: 'after', label: 'After the last day', hint: 'The final salary, the certificate, closing the record.' },
    ],
  },
};

/** Onboarding's phases — kept for callers that predate offboarding. */
export const PHASES = PROCESSES.onboarding.phases;

/** Who ends an employment — end_employment's p_initiator, in a founder's words. */
export const INITIATORS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'employee', label: 'They resigned', hint: 'They give one month\'s notice unless the contract says more.' },
  { id: 'employer_redundancy', label: 'The work is gone (redundancy)', hint: 'Arbetsbrist. Your notice is 1–6 months by how long they have worked.' },
  { id: 'employer_personal', label: 'For personal reasons', hint: 'Needs objective grounds — talk to a lawyer or your employers\' organisation first.' },
  { id: 'probation', label: 'Ending the probation', hint: 'Tell them at least two weeks before.' },
  { id: 'fixed_term_end', label: 'A fixed term ends', hint: 'The date in the contract.' },
  { id: 'mutual', label: 'By agreement', hint: 'The date you both signed.' },
];

/**
 * Steps an admin can do in one click: the guide's own fix, only when every
 * value is known (no `<placeholder>` a person must give) and the write is a
 * plain row — a new allocation or checklist, or ticking a checklist item.
 * Everything else opens the tab where it is done, or hands it to FlowPilot.
 */
const ONE_CLICK: Record<string, { table: 'leave_allocations' | 'onboarding_checklists'; create: string; update?: string }> = {
  manage_leave_allocation: { table: 'leave_allocations', create: 'Allocate' },
  onboarding_checklist: { table: 'onboarding_checklists', create: 'Create the checklist', update: 'Mark as done' },
};

function hasPlaceholder(v: unknown): boolean {
  if (typeof v === 'string') return /^<.*>$/.test(v.trim());
  if (Array.isArray(v)) return v.some(hasPlaceholder);
  if (v && typeof v === 'object') return Object.values(v).some(hasPlaceholder);
  return false;
}

export interface OneClick { table: string; label: string; kind: 'insert' | 'update'; id?: string; row: Record<string, unknown> }

export function oneClickOf(step: GuideStep): OneClick | null {
  const fix = step.fix;
  if (!fix || step.state === 'done') return null;
  const target = ONE_CLICK[fix.skill];
  if (!target || hasPlaceholder(fix.args)) return null;
  const { action, id, ...row } = fix.args as { action?: string; id?: string } & Record<string, unknown>;
  if (action === 'create') return { table: target.table, label: target.create, kind: 'insert', row };
  if (action === 'update' && target.update && typeof id === 'string' && id) return { table: target.table, label: target.update, kind: 'update', id, row };
  return null;
}

/** A checklist with one item flipped, and completed_at as the toggle hook sets it. */
export function toggledChecklist(items: ChecklistItem[], index: number, done: boolean): { items: ChecklistItem[]; completed_at: string | null } {
  const next = items.map((it, i) => (i === index ? { ...it, done } : it));
  return { items: next, completed_at: next.length > 0 && next.every((i) => i.done) ? new Date().toISOString() : null };
}
