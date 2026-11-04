---
id: reports
name: Reports
manual: true
title: "Reports"
category: modules
description: Reports agents publish for people — FlowPilot, Flowwork and external agents over MCP turn what they worked out into versioned pages under Reports, read behind the staff login and narrowed by the role matrix. Agents can add, never take away.
---

# Reports

> **Status:** first version (2026-11-03) — manually maintained.
> **Source of truth:** `src/lib/modules/reports-module.ts`, `supabase/migrations/20261103150000_agent-reports.sql` and this file.

An agent that has worked something out — a quarter's costs, a reconciliation,
a pipeline review, an incident write-up — should be able to hand it to a
person as a page they can open, not as a chat message that scrolls away.
**Reports** is that page, under **Reports** in the admin
(`/admin/reports/<slug>`).

**Reports and the wiki complement each other.** The wiki says how things are
and is rewritten when they change. A report says what happened, is dated, and
is never overwritten: every publish is a new version.

The model is [AgentReports](https://github.com/magnusfroste/agentreports) (the
standalone app for Hermes agents in the AgentHotel), with the business around
it. The same `publish_report` shape and markdown blocks work in both, so an agent
that publishes there publishes here.

## Who does what

| Agents (FlowPilot, Flowwork, MCP) | People (signed in, with the Reports module) |
|---|---|
| publish a report, or a new version of one (`publish_report`) | read every report their roles allow, and every version |
| change title, description, category, tags (`update_report_details`) — not what a person set | archive a report and bring it back |
| list, read, list versions (`list_reports`, `get_report`, `list_report_versions`) | restore an old version (it is published again as the newest — nothing is lost) |
| — | rename: title, description, category — **locked**, an agent's next version keeps it; *Hand back to agents* unlocks a field |

This split is enforced in the database, not in a prompt. There is no archive,
restore or rename skill, and the `report_person_*` functions refuse the service
role by name.

- **Every publish is a version.** Publishing identical content adds no
  version (`unchanged: true`). An agent that says which version it built on
  (`expected_version`) is refused with `STALE_VERSION` when someone published
  since, so two agents never silently undo each other.
- **Who published is stamped by the platform, never by a model.** It is
  *FlowPilot*, *Flowwork*, or the external agent's name from its MCP key
  (`a2a_peers.name`). When a person is at the keyboard, their name is *who
  asked*. A shared agent may pass `requested_by`, which is shown next to its
  name and never instead of it. The reader shows "Ana Lind via Hermes".
- **Flowwork stages a publish.** A write from Flowwork waits for the person's
  approval card (the read surface). FlowPilot and external agents publish
  directly. The reads run everywhere.

## Who may read

The role matrix decides, not a password:

- The **Reports** module opens the page. Every functional role gets it by
  default (seeded in `role_module_access_defaults`).
- A report's **`audience_module`** narrows it to the roles that module is
  granted to: `accounting` for the books, `hr` for people, `deals` for the
  pipeline. A salesperson does not see a report for `accounting`, not even
  through its direct link.
- This holds in RLS (`can_read_report`) and in the skills: a Flowwork user's
  `list_reports` returns what their roles allow. FlowPilot and an MCP key see
  everything.

A report can belong to something in the business (`subject_type` +
`subject_id`: a company, a deal, a project, a fiscal year), and `list_reports`
filters on it.

## Where reports show up

- **On their subject's page.** A report with `subject_type` `company`, `deal`,
  `project` or `contact` is listed on that company, deal or project page (a
  *Reports* card, `SubjectReports`), and the report links back to it
  (`src/lib/report-subjects.ts`). The card is absent when there is none, or
  when the reader's role may read none. The type is stored lower-case with
  underscores (`Company`, `fiscal year` → `company`, `fiscal_year`), so a page
  always finds its reports.
- **In the accounting workspace.** *Reports → Written reports* opens
  `/admin/reports?for=accounting`: the reports published with
  `audience_module: accounting`, inside the workspace. `?for=<module>` works
  for any module.

## The report format

`format: markdown` (default): plain markdown (headings, lists, tables, links)
plus four blocks. It is the same dialect as AgentReports
(`src/lib/report-blocks.ts`).

````markdown
# Q3 2026 — costs
What the quarter cost, per month and kind.

::kpis
- 3 752 294 kr | Total cost | +8 % on Q2
- 249 | Invoices | 12 scanned
::

::note warn
252 832 kr is not in the books yet.
::

```chart stacked title="Cost per month" unit="kr"
Month, Transport, Storage
2026-08, 298000, 84000
2026-09, 312000, 86000
```

::details Method
From accounting_reports and check_books.
::
````

Note kinds: `info`, `ok`, `warn`, `bad`. Chart kinds: `bar`, `stacked`,
`line`, `pie`. In a chart, the first column is the axis and the rest are
series; a pie has one slice per row and its first series is the size.

### Live figures — a report as a dashboard

A ```` ```live ```` block fetches its figures when the report is opened. A
report made of live blocks is a dashboard. AgentReports, which has no data,
shows the block as code.

````markdown
```live
{"skill": "check_books", "args": {}, "title": "The books right now",
 "kpis": [{"path": "summary.total", "label": "Need attention"}],
 "table": {"rows": "findings", "columns": [{"path": "label", "label": "Finding"}, {"path": "count", "label": "Count"}], "limit": 10}}
```
````

- **One JSON object:** `skill` and `args`, then what to draw from the answer:
  - `kpis`: `[{path, label, unit?, divide?}]`
  - `chart`: `{type bar|stacked|line|pie, rows, axis, series, unit?, divide?}`
  - `table`: `{rows, columns [{path, label}], limit?}`
- **Paths** are dot paths into the skill's answer (`summary.total`,
  `rows.0.amount`). `divide: 100` turns cents into currency units.
- **It runs as the person reading,** so the role matrix applies to the figures.
  A salesperson who opens a report with a live block from the books is told
  their role lacks the accounting module, rather than shown the numbers.
- **Opening a report never writes.** The reader calls agent-execute with
  `read_only: true`, and agent-execute refuses anything that the platform's
  read surface (`classifyCall`) does not classify as a read, with
  `READ_ONLY_RUN`.
- **`publish_report` checks live blocks** with the same parser the reader uses
  (`_shared/reports/blocks.ts`). A malformed block, a skill that does not
  exist, or one that is not a read refuses the publish with
  `LIVE_BLOCK_INVALID` and the reason, and nothing is published.
- Each block shows when it was fetched and has a refresh button.

### The overview dashboard

**Reports → "Läget just nu" / "The state of things"** (`/admin/reports/overview`)
is a standard dashboard made only of live blocks. It shows what needs attention
in the books (`check_books`, when accounting is on: findings and upcoming
filings) and in operations (`check_operations`: sales, receivables, contracts,
support, field service, automations).

- FlowPilot publishes it with `publish_overview_dashboard`, in the site's
  language, built from the modules that are on.
- A daily automation ("Overview dashboard", 04:41) keeps it present. Running it
  again with nothing changed adds no version.
- The automation reaches an existing instance with the edge deploy: the admin
  shell's skill sync inserts missing automations for enabled modules (see
  CLAUDE.md, Deployment). Until it has run, an admin creates the dashboard with
  **Create the overview dashboard** under Reports, or asks FlowPilot.
- Each block shows only what the reader's role allows.

Use live blocks for figures that change, such as status, open items or this
month. Use written figures for what a report concluded at a date.

`format: html` is a full HTML page, shown in a sandboxed frame
(`sandbox="allow-scripts"`, no `allow-same-origin`). Its scripts and charts
run, but it cannot reach the reader's session or the admin API. Max 2 MB.

## Skills

| Skill | |
|---|---|
| `publish_report` | `title`, `content`, `format`, `slug`, `description`, `category`, `tags`, `note`, `expected_version`, `requested_by`, `audience_module`, `subject_type`, `subject_id`. Returns the link (`/admin/reports/<slug>`), the version, `kept_person_fields` and `warnings`. |
| `list_reports` | Reports with their details and links, and the categories in use (reuse them). Filters: `category`, `search`, `include_archived`, `subject_type`, `subject_id`. |
| `get_report` | A report's content, current or an older `version`, to build on. |
| `list_report_versions` | Every version: when, by whom, who asked, the note. |
| `publish_overview_dashboard` | Publish or refresh the overview dashboard (live blocks for the books and operations) in the site's language. |
| `update_report_details` | Title, description, category, tags without new content (`not_changed` names what a person set). |

Handler: `internal:reports` in agent-execute, which stamps the publisher and
the viewer and calls the `report_*` functions.

## Files

| Purpose | Path |
|---|---|
| Tables, RLS, rules | `supabase/migrations/20261103150000_agent-reports.sql` |
| Skills and the format guide | `src/lib/modules/reports-module.ts` |
| Handler | `supabase/functions/agent-execute/index.ts` (`executeReportsAction`) |
| The dialect and live blocks (pure, shared with the edge) | `supabase/functions/_shared/reports/blocks.ts` (re-exported by `src/lib/report-blocks.ts`) |
| Reader | `src/pages/admin/ReportsPage.tsx`, `src/components/admin/reports/ReportBody.tsx`, `src/hooks/useReports.ts` |
| On the subject's page | `src/components/admin/reports/SubjectReports.tsx`, `src/lib/report-subjects.ts` |
| Guardrail | `src/lib/__tests__/reports-module.guardrails.test.ts` |

## Next

- **Scheduled reports:** FlowPilot's weekly digest and the month close
  published as reports, with the briefing linking to them.

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `publish_report` | internal | Publish a report — what you worked out (a quarter\ |
| `list_reports` | internal | List the reports staff can open — title, description, category, version, link — and the categories in use. Use when: before publishing (reuse a category, find the report to update); someone asks wh… |
| `get_report` | internal | Read a report — its content and details, the current or an older version. Use when: building a new version on it; someone asks what a report says; comparing with an earlier version. NOT for: listin… |
| `list_report_versions` | internal | Every version of a report: when, by whom (and who asked), the note. Use when: someone asks what changed or who published a report; before restoring is suggested to a person. NOT for: the content it… |
| `update_report_details` | internal | Change a report\ |
| `publish_overview_dashboard` | internal | Publish (or keep current) the overview dashboard "The state of things" / "Läget just nu" — one report of live blocks: what needs attention in the books (check_books, when accounting is on) and in o… |

<!-- generated:skills:end -->
