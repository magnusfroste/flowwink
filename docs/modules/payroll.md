---
title: "Payroll Module"
module_id: "payroll"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
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
- New skills must pass the [Agent Contract Integrity](../architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)
