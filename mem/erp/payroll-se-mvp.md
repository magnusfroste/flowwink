---
name: Payroll Module (SE-locale MVP)
description: Monthly payroll runs with SE social fees (31.42%) and BAS 2024 wage journals
type: feature
---

# Payroll MVP

Monthly payroll for SE companies. 3-tier flow: **draft → approved → paid**.

## Tables
- `payroll_runs` — one per period (month). Status, totals, links to approval + payment journal entries
- `payroll_lines` — per-employee snapshot per run (gross, taxable, tax, social fee, net, components jsonb)
- `payroll_components` — recurring per-employee bonuses/benefits/deductions (active/recurring flags)
- `employees.monthly_salary_cents` + `employees.tax_rate_pct` (default 30%)

## RPCs (all admin-only, MCP-exposed via `mcp_*` wrappers)
- `create_payroll_run(period_date)` — snapshots active employees, sums recurring components, computes tax (per-employee `tax_rate_pct`) and social fee (31.42%)
- `approve_payroll_run(run_id)` — posts wage JE:
  - **Dt 7210** Löner tjänstemän
  - **Dt 7510** Arbetsgivaravgifter
  - **Cr 2710** Personalskatt
  - **Cr 2731** Avräkning sociala avgifter
  - **Cr 2890** Nettolöneskuld
- `mark_payroll_paid(run_id, payment_date?)` — posts **Dt 2890 / Cr 1930**
- `list_payroll_runs(limit)` / `list_payroll_lines(run_id)`

## UI
`/admin/payroll` — 3 tabs: Runs (with approve/mark-paid + line drilldown), New run, Salary & components per employee.

## Out of scope (next iterations)
- AGI export to Skatteverket
- FORA + tjänstepension files
- Vacation pay liability revaluation (semesterlöneskuld)
- Multi-locale (DK, NO, etc.)
- Payslip PDF + employee portal
- Skattetabell-table (real progressive tax) — currently flat per-employee schablon
