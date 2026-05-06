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
];

export const payrollModule = defineModule<Input, Output>({
  id: 'payroll',
  name: 'Payroll',
  version: '1.0.0',
  description:
    'Monthly payroll runs (SE-locale): snapshots employees + recurring components, posts wage journals (BAS 7210/7510/2710/2731/2890), and tracks net wage payment. 31.42% employer social fee default, per-employee tax rate override.',
  capabilities: ['data:read', 'data:write'],
  inputSchema,
  outputSchema,
  skills: ['create_payroll_run', 'approve_payroll_run', 'mark_payroll_paid', 'list_payroll_runs', 'list_payroll_lines'],
  skillSeeds: SKILLS,
  async publish(input: Input): Promise<Output> {
    return { success: true, result: { action: input.action } };
  },
});
