# Hire-to-Retire

> The full employee lifecycle — from hire to offboarding.

**Maturity level:** L2 — Manual (with agent assistance for checklists)
**Status:** ⚠️ Basic HR functions; lacks payroll and performance management

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
Candidate → Hire decision
       ↓
Employee created (HR)
       ↓
Employment contract generated (Contracts) → signing
       ↓
Onboarding checklist started (HR)
       ↓
Documents archived (Documents — related to employee_id)
       ↓
[Ongoing] Leave requests, expense claims
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
