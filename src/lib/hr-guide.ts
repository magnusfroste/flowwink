/**
 * HR process guide — the shapes hr_process_guide returns and the rule for a
 * one-click step (20261031140000). Shared by HR → Start here and its test.
 */

/** One step as hr_process_guide returns it (20261031140000). */
export interface GuideStep {
  id: string;
  phase: 'prepare' | 'first_week' | 'first_months';
  label: string;
  why: string;
  law: string | null;
  required: boolean;
  state: 'done' | 'todo' | 'overdue' | 'info';
  due: string | null;
  detail: string;
  fix: { skill: string; args: Record<string, unknown> } | null;
  open: string | null;
}

export const PHASES: Array<{ id: GuideStep['phase']; label: string; hint: string }> = [
  { id: 'prepare', label: 'Before the first day', hint: 'The record, the contract and what payroll needs.' },
  { id: 'first_week', label: 'The first weeks', hint: 'Vacation, the introduction and who they report to.' },
  { id: 'first_months', label: 'The first months', hint: 'The probation decision, the first salary, pension.' },
];

/**
 * Steps an admin can do in one click: a plain insert of the guide's own fix
 * args, only when every value is known (no `<placeholder>` a person must give).
 * Everything else opens the tab where it is done, or hands it to FlowPilot.
 */
const ONE_CLICK: Record<string, { table: 'leave_allocations' | 'onboarding_checklists'; label: string }> = {
  manage_leave_allocation: { table: 'leave_allocations', label: 'Allocate' },
  onboarding_checklist: { table: 'onboarding_checklists', label: 'Create the plan' },
};

function hasPlaceholder(v: unknown): boolean {
  if (typeof v === 'string') return /^<.*>$/.test(v.trim());
  if (Array.isArray(v)) return v.some(hasPlaceholder);
  if (v && typeof v === 'object') return Object.values(v).some(hasPlaceholder);
  return false;
}

export function oneClickOf(step: GuideStep): { table: string; label: string; row: Record<string, unknown> } | null {
  const fix = step.fix;
  if (!fix || step.state === 'done') return null;
  const target = ONE_CLICK[fix.skill];
  if (!target || fix.args?.action !== 'create' || hasPlaceholder(fix.args)) return null;
  const { action: _action, ...row } = fix.args;
  return { ...target, row };
}

