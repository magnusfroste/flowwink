/**
 * Payroll Module (SE-locale MVP)
 *
 * Manages monthly payroll runs:
 *  - create_payroll_run: snapshot active employees + recurring components into draft lines
 *  - approve_payroll_run: post wage journal (Dt 7210/7510, Cr 2710/2731/2890)
 *  - mark_payroll_paid: post bank disbursement (Dt 2890 / Cr 1930)
 *
 * Defaults: 31.42% employer social fee, 30% PAYE schablon (override per employee).
 * Multi-locale, AGI export, FORA, and pension files come in later iterations.
 */
import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import type { SkillSeed } from '@/lib/module-bootstrap';

const inputSchema = z.object({
  action: z.enum(['create_run', 'approve', 'mark_paid', 'list_runs', 'list_lines']),
});
const outputSchema = z.object({ success: z.boolean(), result: z.unknown().optional() });
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

const SKILLS: SkillSeed[] = [
  {
    name: 'create_payroll_run',
    description:
      'Create a draft payroll run for one month. Snapshots all active employees with their monthly_salary_cents + recurring payroll_components into payroll_lines. Computes gross, taxable, PAYE tax, employer social fee (31.42%), and net per employee. Use when: starting month-end payroll. NOT for: ad-hoc bonuses (use a one-off non-recurring component first).',
    category: 'commerce',
    handler: 'rpc:mcp_create_payroll_run',
    scope: 'internal',
    trust_level: 'notify',
    tool_definition: {
      type: 'function',
      function: {
        name: 'create_payroll_run',
        description: 'Create a draft payroll run for the given period.',
        parameters: {
          type: 'object',
          properties: {
            period_date: { type: 'string', description: 'YYYY-MM-DD anywhere in the target month. Defaults to current month.' },
          },
        },
      },
    },
  },
  {
    name: 'approve_payroll_run',
    description:
      'Approve a draft payroll run and post the wage journal entry (Dt 7210 wages, Dt 7510 social fees / Cr 2710 PAYE, Cr 2731 social fee liability, Cr 2890 net wage liability). Use when: payroll has been reviewed and is ready for posting. Requires admin.',
    category: 'commerce',
    handler: 'rpc:mcp_approve_payroll_run',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'approve_payroll_run',
        description: 'Post the wage journal for an approved run.',
        parameters: {
          type: 'object',
          properties: { run_id: { type: 'string', description: 'UUID of the payroll run.' } },
          required: ['run_id'],
        },
      },
    },
  },
  {
    name: 'mark_payroll_paid',
    description:
      'Mark an approved payroll run as paid and post the bank disbursement (Dt 2890 / Cr 1930). Use when: net wages have been transferred from the bank. NOT for: PAYE/social fee payment to Skatteverket (separate entry against 2710/2731).',
    category: 'commerce',
    handler: 'rpc:mcp_mark_payroll_paid',
    scope: 'internal',
    trust_level: 'approve',
    tool_definition: {
      type: 'function',
      function: {
        name: 'mark_payroll_paid',
        description: 'Post bank payment for net wages.',
        parameters: {
          type: 'object',
          properties: {
            run_id: { type: 'string' },
            payment_date: { type: 'string', description: 'YYYY-MM-DD. Defaults today.' },
          },
          required: ['run_id'],
        },
      },
    },
  },
  {
    name: 'list_payroll_runs',
    description: 'List recent payroll runs with status and totals. Use when: viewing payroll history or generating reports.',
    category: 'commerce',
    handler: 'rpc:mcp_list_payroll_runs',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_payroll_runs',
        description: 'List payroll runs.',
        parameters: { type: 'object', properties: { limit: { type: 'integer', default: 24 } } },
      },
    },
  },
  {
    name: 'list_payroll_lines',
    description: 'List per-employee payroll lines for a specific run. Use when: reviewing or auditing a payroll run.',
    category: 'commerce',
    handler: 'rpc:mcp_list_payroll_lines',
    scope: 'internal',
    trust_level: 'auto',
    tool_definition: {
      type: 'function',
      function: {
        name: 'list_payroll_lines',
        description: 'List payroll lines for a run.',
        parameters: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'] },
      },
    },
  },
  {
    name: 'apply_pension',
    description: 'Apply occupational pension to a DRAFT payroll run (employer contribution + optional employee deduction, as a % of gross). Use when: adding tjänstepension before approving a run. NOT for: a posted/approved run (immutable). Idempotent — re-run to change the rate.',
    category: 'system',
    handler: 'rpc:apply_pension',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'apply_pension',
        description: 'Per-line pension on gross for a draft run. Employee % reduces net; recomputes run totals (total_pension_employer/employee_cents). Re-running replaces (no compounding).',
        parameters: {
          type: 'object',
          required: ['p_run_id', 'p_employer_pct'],
          properties: {
            p_run_id: { type: 'string', format: 'uuid' },
            p_employer_pct: { type: 'number', description: 'Employer pension % of gross (e.g. 4.5)' },
            p_employee_pct: { type: 'number', description: 'Employee pension % of gross, deducted from net (default 0)' },
          },
        },
      },
    },
    instructions: 'Only valid on a draft run. Employer pension is an additional cost (not part of net); employee pension is deducted from net. Idempotent: re-running with a new pct restores net from the prior employee pension first. Admin/service-role only.',
  },
  {
    name: 'calc_sick_pay',
    description: 'Compute Swedish statutory sick pay (sjuklön) for the employer period (days 1–14) at 80% with one karensavdrag. Use when: estimating sick pay for a payroll adjustment. Pure calculator — does not write.',
    category: 'system',
    handler: 'rpc:calc_sick_pay',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'calc_sick_pay',
        description: '80% × daily salary × min(sick_days,14) − one karensavdrag (20% of a 5-day 80% week). Returns sick_pay_cents + breakdown.',
        parameters: {
          type: 'object',
          required: ['p_monthly_salary_cents', 'p_sick_days'],
          properties: {
            p_monthly_salary_cents: { type: 'number' },
            p_sick_days: { type: 'number' },
            p_work_days_per_month: { type: 'number', description: 'Default 21' },
          },
        },
      },
    },
    instructions: 'Statutory model: employer pays days 1–14 (cap), 80% of daily salary, minus one karensavdrag (= 0.8 × daily). Returns sick_pay_cents (net), gross_sick_pay_cents, karensavdrag_cents, paid_sick_days, capped. Read-only.',
  },
];

export const payrollModule = defineModule<Input, Output>({
  id: 'payroll',
  name: 'Payroll',
  version: '1.0.0',
  processes: ['hire-to-retire', 'record-to-report'],
  maturity: 'L2',
  description:
    'Monthly payroll runs (SE-locale): snapshots employees + recurring components, posts wage journals (BAS 7210/7510/2710/2731/2890), and tracks net wage payment. 31.42% employer social fee default, per-employee tax rate override.',
  requires: ['hr'],
  capabilities: ['data:read', 'data:write'],
  tier: 'extended',
  inputSchema,
  outputSchema,
  skills: ['create_payroll_run', 'approve_payroll_run', 'mark_payroll_paid', 'list_payroll_runs', 'list_payroll_lines', 'apply_pension', 'calc_sick_pay'],
  skillSeeds: SKILLS,
  // No publish() — Payroll exposes its behaviour exclusively through MCP skills
  // (mcp_create_payroll_run, mcp_approve_payroll_run, mcp_mark_payroll_paid).
  // The registry returns a clear "no_publish_handler" error for direct calls.
});
