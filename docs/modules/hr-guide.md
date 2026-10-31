---
title: "HR — the guide for a founder without an HR person"
description: HR → Start here leads a founder through welcoming a new employee and through someone leaving — contract, pay, vacation, introduction, probation, the notice the law allows, handover, access, the final salary — with why each step matters and the Swedish rule behind it, judged from the records, for a person in the admin and for an agent over MCP (hr_process_guide, end_employment).
category: modules
---

# HR — the guide for a founder without an HR person

> Companion to the generated [HR module page](./hr.md). Hand-maintained. Written 2026-10-31.

HR has fourteen tabs and each one works. A founder hiring their first person
does not know which of them matter, in what order, or why — a HR person
would. **HR → Start here** (`/admin/hr`, the page opens on it) is that
person's checklist, read from the records instead of remembered:

- **Two guides**, each a flow in three phases with its people: *Welcome a new
  employee* (before the first day, the first weeks, the first months) and *When
  someone leaves* (the decision, the last weeks, after the last day).
- **Being welcomed now / Leaving now** — who is in each, how many required
  steps are done, what is next and what is overdue.
- **One person's steps** (`/admin/hr?process=onboarding|offboarding&employee=<id>`) — every step with its
  state, its due date, *Why this matters* and the rule behind it for your country, and a button
  that does it: *Allocate* / *Create the plan* in one click when nothing needs
  a person, checkboxes for the checklist a step is ticked on, *Open* for the tab
  where it is done, *Ask FlowPilot* to do it with you.
- **Where things are** — the other tabs grouped by what you are trying to do
  (your people, time away, pay, everyday work, growing, when it gets hard).

The guide is support, not a lawyer: it names the rule so the founder knows it
exists and what it asks. A collective agreement (kollektivavtal) can ask more.

## Welcome a new employee — the steps

State is judged from the rows each time the guide is read — nothing is ticked
by hand except the introduction plan's own items.

| Phase | Step | Done when | The rule (Sweden template) |
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

The rule lines and every number the guides check (notice, probation,
vacation) come from the **employment rules** for the business country — see
below. The steps themselves are the same in every country.

## Employment rules per country — a template, or your own terms

No law is written in the code. The guides and *End an employment* read one
set of rules for the business country (`site_settings.general.country`):

1. **Your own terms** (`hr_rules`) — saved under *Start here → Employment
   rules* or with `manage_hr_rules save`: from the template and adjusted (a
   collective agreement with longer notice), or written from nothing where
   FlowWink has no template. They win.
2. **The FlowWink template** (`hr_rule_templates`) — today **SE** (LAS,
   semesterlagen, AGI), **NO** (arbeidsmiljøloven), **DK** (funktionærloven),
   **FI** (työsopimuslaki), **DE** (BGB, KSchG). Re-seeded by migrations, never
   edited on an instance. Each carries a note to check it against the current
   law and any collective agreement; SE is the most complete.
3. **Nothing** — every step still shows, without rule lines, and *End an
   employment* checks only the contract's notice and says so.

A rule set holds: the employer's and the employee's notice as steps by length
of employment (`[{from_years, months | days}]` — the step with the highest
`from_years` reached applies), the longest probation and the notice to end it,
vacation days a year, and the rule line per guide step (`laws`, keyed
`<process>.<step id>`, e.g. `offboarding.decision`). The admin edits the
numbers; an agent can also write the rule lines. `manage_hr_rules reset`
returns to the template.

Not modelled: notice that grows with age (Norway), "to the 15th or the end of
a month" (Germany) — the earliest day shown is then a minimum, and the
template's note says so.

## An agent does the same

`hr_process_guide` (trust `auto`, read-only) is the guide itself:

```
hr_process_guide({ p_process: "onboarding" })                     → people, outline
hr_process_guide({ p_process: "onboarding", p_employee_id: "…" }) → steps, next
end_employment({ p_employee_id, p_initiator, p_dry_run: true })   → the earliest last day and why
manage_hr_rules({})                                               → the rules in force: own, template or none
hr_process_guide({ p_process: "offboarding", p_employee_id: "…" }) → steps, next
```

`end_employment` is trust `approve`: an agent's call waits under Approvals —
a person decides who leaves, as a person decides who is hired.

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
| The decision to end it | `end_employment` (waits for a person) |
| The rules for the country | `manage_hr_rules` (get / list / save / reset) |
| Ticking the written notice, handover, certificate | `onboarding_checklist` update (the step hands out the exact items array) |
| Closing the record | `manage_employee` `status: terminated` |

## When someone leaves — the steps

It starts with **End an employment** (on the guide, or `end_employment`): who
ends it, the day notice was given, the last day and why. Before anything is
written it answers the earliest last day the law allows and the rule behind
it; a shorter last day is refused unless a shorter notice was agreed in
writing (*We agreed a shorter notice in writing* / `p_force`). Recording it
sets the employee's end date (`employees.end_date`, the decision in
`employees.termination`), the contract's end date and reason, and creates the
**Offboarding** checklist — what only a person can confirm is ticked there,
and the guide reads it by item key.

| Phase | Step | Done when | The rule (Sweden template) |
|---|---|---|---|
| The decision | Who ends it, and the last day | `end_employment` recorded | LAS 11 § — the employee gives one month; the employer 1 month under two years, 2 from two, 3 from four, 4 from six, 5 from eight, 6 from ten years; a longer period in the contract wins. Ending a probation: two weeks (LAS 31 §) |
| | The grounds *(when you end it)* | resigned / agreed / fixed term: nothing needed; personal reasons: the written warnings on record are counted | LAS 7 § objective grounds; personal reasons: LAS 30 § two weeks' advance word; redundancy: MBL 11 § negotiation, LAS 22 § order of priority (three may be exempted) |
| | The notice in writing | its checklist item ticked | LAS 8 § — in writing, saying how to challenge it and whether there is a priority right |
| | A notice period the law allows | the last day is not before the earliest allowed, or a shorter one was agreed | LAS 11 § |
| The last weeks | Vacation days left | none left, or the final salary is paid | Semesterlagen 28 § — unused paid days are paid out as vacation pay |
| | Handover, things returned, an exit talk | every other checklist item ticked | — |
| | Access removed on the last day | no login, or no roles left on it — **a person does this under Users, never an agent** | — |
| After the last day | The final salary, with vacation pay | a paid run for the last month carries a line for them | AGI by the 12th (17th in January and August) |
| | An employer's certificate *(when they ask)* | its checklist item ticked | Lag om arbetslöshetsförsäkring 47 § |
| | Their right to come back *(redundancy only)* | a reminder until nine months after the last day | LAS 25 § |
| | Close the employee record | status terminated | Salary records are kept seven years (bokföringslagen 7 kap.) — close, never delete |

## Next guides

`p_process` is the dial: *onboarding* and *offboarding* today. Parental leave
and long-term sick leave (sjuklön days 2–14, Försäkringskassan from day 15,
rehabilitation) are natural next ones.

## Files

| Purpose | Path |
|---|---|
| The guides (SQL) | `supabase/migrations/20261031140000_hr-guides-a-founder-through-a-hire.sql`, `supabase/migrations/20261031150000_hr-guides-someone-leaving.sql`, `supabase/migrations/20261031160000_hr-rules-per-country.sql` |
| Start here tab | `src/components/admin/hr/HrGuide.tsx`, `src/components/admin/hr/EndEmploymentDialog.tsx`, `src/components/admin/hr/HrRulesCard.tsx`, `src/lib/hr-guide.ts`, `src/pages/admin/HRPage.tsx` |
| Skills | `src/lib/modules/hr-module.ts` |

## See also

- [Hire-to-Retire](../processes/hire-to-retire.md) — the whole process, from the job ad
- [Recruitment](./recruitment-guide.md) — before the hire
- [Payroll](./payroll.md) — the salary run
