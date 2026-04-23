# Hire-to-Retire

> The full employee lifecycle — from hire to offboarding.

**Maturity level:** L3 — Operational (auto-hire bridge live; payroll & performance still manual)
**Status:** ✅ Hire-to-Onboard automated; ⚠️ lacks payroll and performance management

---

## Modules involved

| Module | Role in the process |
|--------|---------------------|
| **HR** | Employee records, leave handling, onboarding checklists |
| **Contracts** | Employment agreements, lifecycle |
| **Documents** | HR documents (contracts, certificates, policies) |
| **Expenses** | Employee expense claims |
| **Resume** | Consultant profiles / talent matching |

---

## Step-by-step flow

```
Candidate applies (Recruitment) → application row
       ↓
AI screening (score_candidate) → ai_score, matching_skills
       ↓
Stage advances → offer_sent → offer accepted
       ↓
🤖 hire_application(application_id)  ← ONE-CALL HIRE BRIDGE
       │
       ├─→ employees row created (name, email, title, dept, start_date)
       ├─→ employment_contracts (draft) generated from template
       │     • Token substitution: {{employee_name}}, {{title}}, {{start_date}}, {{monthly_salary}}
       │     • Probation period auto-set from template
       ├─→ onboarding_checklists seeded from best-matching template
       │     (matched by department + employment_type, falls back to default)
       └─→ application.stage = 'hired', employee_id linked
       ↓
Contract signed by employer + employee (sign_employment_contract)
       ↓
[Ongoing] Leave requests, expense claims, attendance
       ↓
[Ongoing] Contract renewals (annually)
       ↓
Offboarding → contracts terminated, access revoked
```

---

## Agent coverage

| Step | 👤 Manual | 🤖 FlowPilot | 🔗 External agent |
|------|----------|-------------|-------------------|
| Employee registration | ✅ | ✅ (`manage_employee`) | — |
| Contract handling | ✅ | ✅ (`manage_contract`) | — |
| Onboarding checklist | ✅ | ✅ (`onboarding_checklist`) | — |
| Leave requests | ✅ | ✅ (`manage_leave`) | — |
| Contract renewal check | — | ✅ (`contract_renewal_check`) | — |
| Performance reviews | ❌ Missing | — | — |
| Payroll | ❌ Missing | — | — |

---

## Known gaps (missing for L3+)

- ❌ **Payroll integration** (Fortnox Lön, Visma, Hogia)
- ❌ Performance management / PDP / 1:1 notes
- ❌ Compensation planning
- ❌ Time-off accrual rules (vacation days per collective agreement)
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
