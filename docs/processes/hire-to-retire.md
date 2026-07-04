# Hire-to-Retire

> The full employee lifecycle — from hire to offboarding.

**Problem it solves:** A new hire means re-typing the same person into five places — contract, checklist, HR record, all by hand — this process turns an accepted offer into employee record, draft contract and onboarding checklist in one call, and keeps leave and expenses tidy afterwards.

**Maturity level:** L3 — Operational (auto-hire bridge live; payroll & performance still manual)
**Status:** ✅ Hire-to-Onboard automated; ⚠️ lacks payroll and performance management

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
    D2 --> E["Contract signed by both parties<br/>sign_employment_contract"]
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
| Contract handling | ✅ | ✅ (`manage_contract`, `sign_employment_contract`) | — |
| Onboarding checklist | ✅ | ✅ (`onboarding_checklist`, `apply_onboarding_template`) | — |
| Leave requests | ✅ | ✅ (`manage_leave`) | — |
| **Year-end vacation allocation** | ✅ | ✅ (`auto_allocate_vacation`) | ✅ MCP-exposed |
| Contract renewal check | — | ✅ (`contract_renewal_check`) | — |
| Performance reviews | ❌ Missing | — | — |
| Payroll | ❌ Missing | — | — |

---

## Known gaps (missing for L3+)

- ❌ **Payroll integration** (Fortnox Payroll, Visma, Hogia)
- ❌ Performance management / PDP / 1:1 notes
- ❌ Compensation planning
- ✅ Time-off accrual: `auto_allocate_vacation` matches `vacation_policies` (age/tenure) + capped carry-over, audit-logged per employee
- ❌ Org chart / reporting structure
- ❌ Employment contract templates with Swedish collective agreements

---

## Webhook events

`employee.created`, `leave.requested`, `leave.status_changed`, `contract.created`, `contract.signed`, `contract.status_changed`, `expense.submitted`

---

## Best for

Smaller consultancies (< 30 employees) wanting simple HR data + document archive in one place.

## Not for

Companies that need a full HRIS with payroll, performance management, or collective-agreement logic. Pair with Fortnox/Visma for payroll.
