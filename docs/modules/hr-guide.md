---
title: "HR — the guide for a founder without an HR person"
description: HR → Start here leads a founder through welcoming a new employee — the contract, pay, vacation, the introduction, probation and the first salary — with why each step matters and the Swedish rule behind it, judged from the records, for a person in the admin and for an agent over MCP (hr_process_guide).
category: modules
---

# HR — the guide for a founder without an HR person

> Companion to the generated [HR module page](./hr.md). Hand-maintained. Written 2026-10-31.

HR has fourteen tabs and each one works. A founder hiring their first person
does not know which of them matter, in what order, or why — a HR person
would. **HR → Start here** (`/admin/hr`, the page opens on it) is that
person's checklist, read from the records instead of remembered:

- **The flow** — *Welcome a new employee* in three phases: before the first
  day, the first weeks, the first months.
- **Being welcomed now** — everyone who starts soon or started in the last six
  months, how many required steps are done, what is next and what is overdue.
- **One person's steps** (`/admin/hr?employee=<id>`) — every step with its
  state, its due date, *Why this matters* and the rule in Sweden, and a button
  that does it: *Allocate* / *Create the plan* in one click when nothing needs
  a person, *Open* for the tab where it is done, *Ask FlowPilot* to do it with
  you.
- **Where things are** — the other tabs grouped by what you are trying to do
  (your people, time away, pay, everyday work, growing, when it gets hard).

The guide is support, not a lawyer: it names the rule so the founder knows it
exists and what it asks. A collective agreement (kollektivavtal) can ask more.

## The steps

State is judged from the rows each time the guide is read — nothing is ticked
by hand except the introduction plan's own items.

| Phase | Step | Done when | The rule in Sweden |
|---|---|---|---|
| Before the first day | The person, with a start date | e-mail, job title and start date on the employee | — |
| | A written contract, signed by both | a contract in status signed or active; **due day one + 7** | LAS 6 c § — the essential terms in writing within 7 days of the first day, the rest within a month; permanent unless the contract says otherwise (LAS 4 §) |
| | Salary, personal identity number and tax | monthly salary and personal identity number recorded; a 30 % tax rate is flagged as the side-income rate | AGI — every salary is reported per person to Skatteverket each month |
| | Registered as an employer *(reminder)* | shown until the first payroll run is paid — FlowWink cannot see the registration | skatte- och avgiftsanmälan before the first payday |
| | A login *(optional)* | the employee has a `user_id` | — |
| The first weeks | Vacation days for the year | a `leave_allocations` row for the year; the button allocates what the vacation policy gives | Semesterlagen 4 § — 25 days a year; how many are paid in the first year depends on the earning year (7 §) |
| | An introduction plan | a checklist exists and every item is done; **due day one + 14**; created from the best-matching introduction template, or six sensible items | Arbetsmiljölagen 3 kap. 3 § — the employee knows the work and its risks |
| | Who they report to *(optional)* | `manager_id` set | — |
| | An emergency contact *(optional)* | `emergency_contact` recorded | — |
| The first months | Decide on the probation period | probation ended, or none on the contract; *to do* in the four weeks before the last day to give notice; flagged when longer than six months | LAS 6 § — at most six months; to end it, tell the person at least two weeks before (LAS 31 §) |
| | The first salary, paid and reported | a paid payroll run carries a line for them; overdue ten days after the start month | AGI by the 12th of the month after payday, the 17th in January and August |
| | Pension and insurance *(optional)* | an active benefit | not required by law without a collective agreement; part of the deal with one |

The rule lines show only when the business country is Sweden
(`site_settings.general.country`); elsewhere the steps stand and the page says
to check the local rules.

## An agent does the same

`hr_process_guide` (trust `auto`, read-only) is the guide itself:

```
hr_process_guide({ p_process: "onboarding" })                     → people, outline
hr_process_guide({ p_process: "onboarding", p_employee_id: "…" }) → steps, next
```

Each step carries `fix: { skill, args }` — the exact call. A `<placeholder>`
is a fact only a person has (personal identity number, the role a login needs,
a manager, a time): the agent asks, never invents. Signing, the probation
decision and paying are the person's; an agent prepares them.

| Step | Skill |
|---|---|
| The person | `manage_employee` (now with `emergency_contact`) |
| The contract | `manage_employment_contract` (new — create/update a draft for someone added directly), `sign_employment_contract`, `manage_employment_contract_template` |
| Vacation | `manage_leave_allocation` (new — one person's days), `auto_allocate_vacation` (everyone, at year-end) |
| Introduction | `onboarding_checklist`, `manage_onboarding_template` |
| Login | `invite_colleague` (waits for a person's approval) |
| Probation follow-up | `manage_performance` `schedule_one_on_one` |
| First salary | `create_payroll_run` → `approve_payroll_run` → `mark_payroll_paid` |
| Pension | `manage_benefits` |

## Next guides

`p_process` is the dial; *onboarding* is the first. Offboarding (notice under
LAS, the final salary and vacation pay, the certificate of employment, access
and equipment back) is the natural second.

## Files

| Purpose | Path |
|---|---|
| The guide (SQL) | `supabase/migrations/20261031140000_hr-guides-a-founder-through-a-hire.sql` |
| Start here tab | `src/components/admin/hr/HrGuide.tsx`, `src/pages/admin/HRPage.tsx` |
| Skills | `src/lib/modules/hr-module.ts` |

## See also

- [Hire-to-Retire](../processes/hire-to-retire.md) — the whole process, from the job ad
- [Recruitment](./recruitment-guide.md) — before the hire
- [Payroll](./payroll.md) — the salary run
