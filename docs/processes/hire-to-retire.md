---
title: "Hire-to-Retire"
category: processes
description: A new hire means re-typing the same person into five places — contract, checklist, HR record, all by hand — this process turns an accepted offer into employee record, draft cont…
---

# Hire-to-Retire

> The full employee lifecycle — from hire to offboarding.

**Problem it solves:** A new hire means re-typing the same person into five places — contract, checklist, HR record, all by hand — this process turns an accepted offer into employee record, draft contract and onboarding checklist in one call, and keeps leave and expenses tidy afterwards.

**Maturity level:** L3 — Operational (auto-hire bridge live; payroll internal cycle live; performance still manual)
**Status:** ✅ Hire-to-Onboard automated; ✅ payroll runs live (`create_payroll_run`→`approve_payroll_run`→`mark_payroll_paid`, `generate_agi_export`, `year_end_payroll_summary`); ⚠️ statutory filing (AGI/Skatteverket submit) still external; ⚠️ lacks performance management

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **Recruitment** | Job postings, applications, AI scoring, hire bridge (`hire_application`) |
| **HR** | Employee records, leave handling, onboarding checklists, vacation auto-allocation |
| **Contracts** | Employment agreements, lifecycle, renewal checks |
| **Documents** | HR documents (contracts, certificates, policies) |
| **Expenses** | Employee expense claims (full P2P loop: submit → approve → book → pay) |
| **Resume** | Consultant profiles / talent matching |

---

## Step-by-step flow

```mermaid
flowchart TD
    A["Candidate applies (Recruitment)"] --> B["AI screening — score + matching skills<br/>score_candidate"]
    B --> C["Stage advances → offer sent → offer accepted"]
    C --> D["One-call hire bridge<br/>hire_application"]
    D --> D1["Employee record created"]
    D --> D2["Draft contract from template<br/>tokens + probation auto-set"]
    D --> D3["Onboarding checklist seeded<br/>best-matching template"]
    D --> D4["Application marked hired, employee linked"]
    D2 --> E["Contract signed by both parties<br/>send_contract_for_signature"]
    E --> F["Ongoing: leave, expenses, attendance<br/>manage_leave, manage_expenses"]
    F --> G["Contract renewals (annual)<br/>contract_renewal_check"]
    G --> H["Offboarding — contracts terminated, access revoked"]

    classDef agent fill:#eef2ff,stroke:#6366f1,color:#312e81;
    class B,D,D1,D2,D3,D4,E,F,G agent
```

*🟦 = agent-runnable step (see Agent coverage below)*

---

## Agent coverage

| Step | 👤 Manual | 🤖 FlowPilot | 🔗 External agent |
|------|----------|-------------|-------------------|
| Candidate screening | ✅ | ✅ (`score_candidate`) | — |
| **Hire bridge (app→emp+contract+onboarding)** | ✅ | ✅ (`hire_application`) | ✅ MCP-exposed |
| Employee registration | ✅ | ✅ (`manage_employee`) | — |
| Contract handling | ✅ | ✅ (`manage_contract`, `send_contract_for_signature`) | — |
| Onboarding checklist | ✅ | ✅ (`onboarding_checklist`) | — |
| Leave requests | ✅ | ✅ (`manage_leave`) | — |
| **Year-end vacation allocation** | ✅ | ✅ (`auto_allocate_vacation`) | ✅ MCP-exposed |
| Contract renewal check | — | ✅ (`contract_renewal_check`) | — |
| Goals, 1:1s and performance reviews | ✅ (HR → Performance) | ✅ (`manage_performance`: create_goal / update_goal / schedule_one_on_one / complete_one_on_one / start_review / submit_review / acknowledge_review) | — |
| Org chart / reporting structure | ✅ (manager on the employee) | ✅ (`org_chart`, `manage_employee` `manager_id`) | — |
| Salary revision round and salary history | ✅ (HR → Compensation) | ✅ (`manage_compensation_revision`: create / propose / exclude / summary / approve / apply / apply_due / history) | — |
| Payroll runs | ✅ | ✅ (`create_payroll_run` → `approve_payroll_run` → `mark_payroll_paid`; `calc_sick_pay`, `apply_pension`, `list_payroll_lines`) | ✅ (admin functions, service-role verified) |

---

## Known gaps (missing for L3+)

- ✅ **Payroll runs** — the `payroll` module runs the internal cycle
  (create → approve → mark paid, with sick-pay calculation and pension
  application per line). What is still missing is the **statutory tail**:
  AGI/employer declarations to Skatteverket, payslip distribution, and
  export/integration to Fortnox Lön / Visma / Hogia for firms that file there
- ✅ Performance management (2026-10-06): goals, 1:1 notes and reviews through `manage_performance`, the org chart
  through `org_chart` — the same tables HR → Performance shows; proven in the battery (goal → 1:1 → probation review
  → acknowledged). Found on the way: the 1:1 policy compared an employee row with itself, so managers saw none of
  their 1:1s without the admin role — fixed.
- ✅ Compensation planning (2026-10-06): a budgeted revision round through `manage_compensation_revision` — lines
  pre-filled from each review's `salary_adjustment_pct` (or the round's default), approval refused over budget,
  application on the effective date writes the salary, the salary history row and the signed contract in one pass;
  an automation applies approved rounds on their date. Every salary change outside a round is logged too
  (`employee_salary_history`, hire / manual / revision). Proven in the battery (review +3 % → 43 260 kr → payroll).
- ✅ Time-off accrual: `auto_allocate_vacation` matches `vacation_policies` (age/tenure) + capped carry-over, audit-logged per employee
- ❌ Employment contract templates with Swedish collective agreements

---

## Webhook events

`employee.created`, `leave.requested`, `leave.status_changed`, `contract.created`, `contract.signed`, `contract.status_changed`, `expense.submitted`

---

## Best for

Smaller consultancies (< 30 employees) wanting simple HR data + document archive in one place.

## Not for

Companies that need a full HRIS with payroll, performance management, or collective-agreement logic. Pair with Fortnox/Visma for payroll.
