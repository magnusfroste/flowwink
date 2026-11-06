---
title: "What's new — autumn 2026"
description: The capabilities that landed after v4.0.0, written for the people who run a FlowWink site — what each one is, who can use it (people in the admin, FlowChat, Flowwork, an external agent over MCP) and which skills carry it.
category: operators
order: 1
---

# What's new — autumn 2026

> Everything below is on `main` and reaches a live instance with the nightly
> fork sync (schema → edge functions → skills → frontend, see
> [`provisioning-and-updates.md`](./provisioning-and-updates.md)). The
> modules and skills switch on at the first admin visit after the deploy.

Four surfaces use the same skills. When a line below says *who*, it means:

| Surface | Who is at the keyboard | How a write is handled |
|---|---|---|
| **The admin** (`/admin`) | a person | the person does it |
| **FlowChat** (`/admin/flowchat`) | a person, asking | the skill runs as that person, at once |
| **Flowwork** (`/admin/flowwork`) | a person, working with the model | a write is staged and waits for the person's approval card |
| **An external agent over MCP** (`/mcp`) | Claude, ChatGPT, Cursor, Hermes, OpenClaw… | runs as the key's owner, within the owner's roles; a read-only key refuses every write |
| **FlowPilot** | nobody — the built-in operator on its heartbeat | trust level per skill (`notify` / `approve`) |

[Connect your agent](./connect-your-agent.md) explains the key, the address
and the three connection profiles.

---

## Reports — what an agent worked out, as a page

An agent that has worked something out — a quarter's costs, a reconciliation,
a pipeline review, an incident write-up — hands it to people as a page under
**Reports** (`/admin/reports/<slug>`), not as a chat message that scrolls
away. The wiki says how things are; a report says what happened, is dated and
is never overwritten: every publish is a new version.

- **Blocks, not only prose:** KPI tiles (`::kpis`), bar, stacked, line and pie
  charts (```` ```chart ````), notes (`::note warn`), collapsible details, plus
  **live figures** (```` ```live ````) fetched when the report is opened — a
  report of live blocks is a dashboard. The figures run as the person reading,
  so the role matrix applies to them too.
- **"The state of things" / "Läget just nu"** (`/admin/reports/overview`):
  a standard dashboard FlowPilot publishes in the site's language — what needs
  attention in the books and in operations — kept present by a daily
  automation. An admin creates it with one click under Reports until then.
- **Where they belong:** a report about a company, a deal or a project is
  listed on that page, and the accounting workspace lists the reports written
  for the books (*Reports → Written reports*).
- **Who may read** is the role matrix: the Reports module opens the page, a
  report's `audience_module` narrows it (`accounting`, `hr`, `deals`).
- **Agents add, never take away.** Archive, restore and rename are a person's;
  what a person renamed, an agent's next version keeps.

*Who:* FlowChat and FlowPilot publish directly; Flowwork stages the publish;
an external agent publishes with its own name stamped by the platform.
*Skills:* `publish_report`, `list_reports`, `get_report`,
`list_report_versions`, `update_report_details`, `publish_overview_dashboard`.
*Read:* [`../modules/reports.md`](../modules/reports.md).

## Developer and Skills — one door per reader

*Who: an admin, in the admin.*

**Developer** (`/admin/developer`) is for the people who build *against*
FlowWink, and now says who each tab is for: **MCP Keys** (a key for a script,
a job, or an agent you are still evaluating — a person's own agent is
connected on Agents → Connect an agent, which makes its key), **Content API**
(REST + GraphQL explorer, run as you, so the endpoints marked *requires auth*
answer; React / Next.js examples; the docs link works) and **Webhooks**
(tell another system when something happens here, every delivery logged).
The mock "Dev Tools" and the n8n brochure are gone.

**Skills** (`/admin/skills`, in the sidebar under System beside Modules) is
the operator's page: **Browse** is the catalogue, **Manage** the switches — *Enabled* is the
master switch, *MCP exposed* whether connected agents are shown it. It used
to be a tab on Developer, which made three pages that listed the same skills.
The old link `?tab=mcp-skills` still lands.

---

## Workspaces — Accounting, HR, Sales and Support get their own menu

Opening the accounting, HR, sales or support pages replaces the left menu
with that work's own: *to do*, *day to day*, *month*, *reports*, *year and
authorities* for the books; the equivalent for people, the pipeline and the
helpdesk. The FlowWink sidebar folds to a rail and is one click away. Whether
you keep it folded is remembered per person — there is no setting.

Employees who are not accountants or HR never see those workspaces: expenses,
timesheets, leave and payslips live under **My account**, where their everyday
work is.

*Who:* people. The skills behind every page are unchanged, so an agent is not
affected. *Read:* [`workspaces.md`](./workspaces.md).

## Recruitment — one application door, a candidate card, interviews the candidate books

A careers block on the site, one application RPC (CV upload, consent,
screening, confirmation mail), an admin pipeline with a candidate drawer (CV,
score reasons, notes, interviews, offers) and video interviews over WebMeet
that the candidate schedules. A person selects — the agent prepares.

*Who:* people in the admin; FlowChat, Flowwork and external agents through the
recruitment skills. *Read:* [`../modules/recruitment.md`](../modules/recruitment.md),
[`../modules/recruitment-guide.md`](../modules/recruitment-guide.md).

## HR — guides that lead a founder through a hire, and employment rules per country

*Start here* under HR is a guide, not a gate: onboarding and offboarding as
steps a person walks, with the person drawer beside them. `end_employment`
checks the notice against the rules. Employment rules are templates per
country or the company's own terms — never code.

*Who:* people, and every surface through the HR skills.
*Read:* [`../modules/hr-guide.md`](../modules/hr-guide.md), [`../modules/hr.md`](../modules/hr.md).

## The operations read — `check_operations`

The twin of `check_books`: one read across sales, receivables, contracts,
support, field service, automations and the chat, each finding with the skill
and arguments that fix it. Run it first in an operations session. It also
answers `assignable` — who a ticket or a visit can go to — and points at
`invite_colleague` when nobody can be assigned.

*Who:* every surface. The overview dashboard draws from it.

## Web search and page reading — one layer, your providers, your order

Every web search and page read (the visitor chat, Flowwork, FlowPilot,
research, enrichment, page migration, an agent over MCP) goes through one
layer and the providers you choose, in your order: SearXNG, Firecrawl (cloud
or self-hosted), Jina or the built-in reader. Status per provider in the
admin.

*Who:* every surface, the same way. *Read:* [`web-search-and-reading.md`](./web-search-and-reading.md).

## The feedback board — and the daily ping

Every instance has a feedback board (bug, feature, template, question) with
votes, comments and a status per post. By default an instance *sends* its
feedback to www.flowwink.com; an instance whose endpoint names itself
*receives* a public board at `/feedback`. The daily `feedback_ping` tells the
endpoint which modules are on; `share_usage: false` stops it.

*Who:* people at `/admin/feedback`; agents with `submit_feedback` (one report
per defect per instance in 14 days, three a day for an unattended caller).
*Read:* [`../modules/feedback.md`](../modules/feedback.md), [`telemetry.md`](./telemetry.md).

## The operator runs the platform too

`module_usage_report` says per module what is used and by whom, and
`manage_modules` (trust `approve`) switches a module, its skills and its
automations off or on — and remembers the decision, so nothing wakes a module
a person switched off. Module automations now follow the edge deploy: the
first admin visit after a deploy inserts the automations a module is missing
(by name, once — a retuned schedule or a deleted automation is left alone).

*Who:* FlowPilot and external agents, with a person's approval.

## Security and access

- **Two-factor authentication for staff** — enrolled per person, required
  per instance, enforced in the role gate. [`mfa.md`](./mfa.md).
- **Last sign-in** on the Users table: when each person last signed in and
  was last active, without scrolling the login activity. `users_list` answers
  the same two fields to an agent.
- **A read-only API key** runs read skills as they are, forces `dry_run` on a
  write that declares it and refuses every other write — hand one to an agent
  you are still evaluating.
- **The gateway at the site's own `/mcp`** — the address every other
  integration uses. [`connect-your-agent.md`](./connect-your-agent.md).
- **Definer functions declare their caller:** what the browser never calls is
  no longer executable from it.

## Email — receiving through Cloudflare Email Routing

One router, providers underneath; the inbound Worker is a paste-in file. Every
FlowPilot reply keeps why it said what it said. The SMTP card names its server
and its one secret. *Read:* [`../modules/email.md`](../modules/email.md),
[`../modules/email-guide.md`](../modules/email-guide.md).

## Blog — the floor under agent-written posts

`write_blog_post` refuses a body under the site's word floor, a post in the
wrong language, a title that re-words an earlier post, or a phrase the
identity rules out — a refusal, not an error, so it is never retried as is.
`audit_blog` is the read. A post's slug can be changed without breaking links.
*Read:* [`../modules/blog.md`](../modules/blog.md).

## FlowChat and Flowwork run on the shared engine

Both now run on the same `reason()` loop FlowPilot runs on — the same skill
selection, the same envelope (`error` / `code` / `retryable` / `hint`, refusals
that are not failures, `risk` and `reversible` on writes). What differs is who
is at the keyboard and how a write is handled, as in the table at the top.
*Read:* [`../concepts/flowchat-vs-flowpilot.md`](../concepts/flowchat-vs-flowpilot.md),
[`../architecture/agent-harness.md`](../architecture/agent-harness.md).

---

The full list, by version, is in [`CHANGELOG.md`](https://github.com/magnusfroste/flowwink/blob/main/CHANGELOG.md).
