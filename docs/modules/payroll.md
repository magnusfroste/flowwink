---
title: "Payroll Module"
module_id: "payroll"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
manual: true
description: Ships with 5 agent skills.
---

# Payroll (SE-locale MVP)

> Monthly payroll runs: snapshots employees + recurring components, posts wage journals (BAS 7210/7510/2710/2731/2890), and tracks net wage payment. 31.42 % employer social fee default, per-employee tax rate override.

Ships with **5 agent skills**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `payroll` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:read`, `data:write` |
| **MCP-exposed skills** | 5 |
| **Owns tables** | `payroll_runs`, `payroll_lines`, `payroll_components` |

## Lifecycle

```text
draft (create_payroll_run)
   └─► approved (approve_payroll_run)        ── posts wage journal
        └─► paid (mark_payroll_paid)         ── posts bank disbursement
```

## Skills

| Skill | Trust | Description |
|-------|-------|-------------|
| `create_payroll_run` | notify | Create a draft payroll run for one month. Snapshots active employees + recurring `payroll_components` into `payroll_lines`. Computes gross, taxable, PAYE, employer social fee (31.42 %), net. |
| `approve_payroll_run` | approve | Approve a draft run and post the wage JE: Dt 7210 wages, Dt 7510 social fees / Cr 2710 PAYE, Cr 2731 social-fee liability, Cr 2890 net-wage liability. |
| `mark_payroll_paid` | approve | Post bank disbursement (Dt 2890 / Cr 1930) for an approved run. NOT for: PAYE/social-fee payment to Skatteverket (separate entry against 2710/2731). |
| `list_payroll_runs` | auto | List recent runs with status and totals. |
| `list_payroll_lines` | auto | List per-employee lines for a specific run. |

## BAS 2024 Accounts Used

| Account | Purpose |
|---------|---------|
| `1930` | Bank — net wage payment |
| `2710` | PAYE liability (preliminary tax) |
| `2731` | Employer social-fee liability |
| `2890` | Net wage liability to employees |
| `7210` | Salaries — white-collar |
| `7510` | Employer social fees |

## Defaults & Overrides

| Setting | Default | Override |
|---------|---------|----------|
| Employer social fee | 31.42 % | per-employee field |
| PAYE tax | 30 % schablon | per-employee `tax_rate` |
| Run cadence | monthly | manual `period_date` |

## Module API Contract

**Actions:** `create_run`, `approve`, `mark_paid`, `list_runs`, `list_lines`

**Output fields:** `success`, `result`

## Roadmap (out of MVP scope)

- Multi-locale (NO/DK/FI/DE)
- AGI export to Skatteverket
- FORA + occupational pension files
- Holiday-pay accrual posting

## Used in Processes

- [hire-to-retire](../processes/hire-to-retire.md)
- [record-to-report](../processes/record-to-report.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/payroll-module.ts` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `create_payroll_run` | internal | Create a draft payroll run for one month. Snapshots all active employees with their monthly_salary_cents + recurring payroll_components into payroll_lines. Computes gross, taxable, PAYE tax, employ… |
| `approve_payroll_run` | internal | Approve a draft payroll run and post the wage journal entry (Dt 7210 wages, Dt 7510 social fees, Dt 7410 employer pension / Cr 2710 PAYE, Cr 2731 social fee liability, Cr 2950 pension liability, Cr… |
| `mark_payroll_paid` | internal | Mark an approved payroll run as paid and post the bank disbursement (Dt 2890 / Cr 1930). Use when: net wages have been transferred from the bank. NOT for: PAYE/social fee payment to Skatteverket (s… |
| `list_payroll_runs` | internal | List recent payroll runs with status and totals. Use when: viewing payroll history or generating reports. |
| `list_payroll_lines` | internal | List per-employee payroll lines for a specific run. Use when: reviewing or auditing a payroll run. |
| `apply_pension` | internal | Apply occupational pension to a DRAFT payroll run (employer contribution + optional employee deduction, as a % of gross). Use when: adding tjänstepension before approving a run. NOT for: a posted/a… |
| `apply_sick_pay` | internal | Apply Swedish statutory sick pay (sjuklön) as an adjustment on one employee\ |
| `calc_sick_pay` | internal | Compute Swedish statutory sick pay (sjuklön) for the employer period (days 1–14) at 80% with one karensavdrag. Use when: estimating sick pay for a payroll adjustment. Pure calculator — does not write. |
| `manage_salary_structure` | internal | Configure reusable salary structures (base salary + components: fixed or % of base, earning/benefit/deduction) and assign them to employees. Assigned structures are applied automatically on the nex… |
| `manage_payroll_country` | internal | Multi-country payroll: manage per-country statutory profiles (employer social fee %, default tax %, currency) and assign a payroll country to employees. Seeded with SE/NO/DK/FI/DE. Use when: employ… |
| `manage_salary_advance` | internal | Salary advances/loans: grant an advance (posts Dt 1610 / Cr 1930), list per employee, cancel (posts the reversal). Open advances are deducted from net pay on the next payroll run and settled (Cr 16… |
| `apply_tax_correction` | internal | Apply a preliminary-tax correction to one employee\ |
| `get_payslip` | internal | Structured payslip for one employee+run (employer, period, all components, gross→net breakdown incl. pension/sick pay/advances/tax corrections, YTD totals) — or, without a run id, the list of avail… |
| `year_end_payroll_summary` | internal | Year-end tax certification data: per-employee annual gross, benefits, withheld tax, employer social fees, pension and net over all approved/paid runs of a year (KU/kontrolluppgift-style income stat… |
| `generate_agi_export` | internal | Tax-authority integration: generate the monthly AGI declaration (arbetsgivardeklaration på individnivå) as Skatteverket-style XML — HU totals (social fees FK487, withheld tax FK497) plus one IU per… |

<!-- generated:skills:end -->
