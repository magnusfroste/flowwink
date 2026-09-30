---
title: "Projects Module"
module_id: "projects"
version: "1.0.0"
category: "data"
autonomy: "agent-capable"
generated: true
generated_at: "2026-09-30"
description: Project and task management with Kanban boards, assignments, and time tracking integration
---

# Projects

> Project and task management with Kanban boards, assignments, and time tracking integration

Ships with **17 agent skills**, **2 database tables**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `projects` |
| **Version** | 1.0.0 |
| **Category** | data |
| **Autonomy** | agent-capable |
| **Core** | No |
| **Capabilities** | `data:write`, `data:read` |
| **MCP-exposed skills** | 17 |
| **Owns tables** | 2 |

## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `manage_project` | internal | Create, update, search, and close projects. Use when: starting new client work, updating project status, reviewing active projects. NOT for: individual tasks (use manage_project_task), timesheets (… |
| `manage_project_task` | internal | Create, update, move, complete, delete and list tasks within a project. Use when: adding work items, moving tasks on the kanban board, checking task status, removing a task planned by mistake. NOT … |
| `comment_on_task` | both | project_tasks.id (REQUIRED) |
| `manage_project_milestone` | internal | Manage project milestones (named delivery gates with a due date and task-completion progress). Use when: planning project phases, marking a milestone reached, tracking gate progress. NOT for: indiv… |
| `manage_project_template` | internal | Reusable project templates: snapshot an existing project (tasks + milestones with day offsets) or author a spec, then instantiate new projects from it. Use when: the same project structure repeats … |
| `manage_project_member` | internal | Team and stakeholder roles on a project: add/update/remove members with a role, rate override and time-tracking flag. Use when: staffing a project, setting a member\ |
| `project_cost_forecast` | internal | Cost forecasting and burn rate for a project: hours logged, cost (member rate overrides honored), 4-week burn rate, weeks until budget exhaustion, over-budget risk from open task estimates. Use whe… |
| `manage_task_workflow` | internal | Stage-workflow gating per project: restrict which task status transitions are allowed, require sub-tasks done before a parent closes, and block starting tasks with unfinished dependencies. Use when… |
| `manage_task_dependency` | internal | Task dependencies (finish-to-start edges), within or ACROSS projects, with cycle detection. Use when: task B cannot start before task A is done; the ledger close in one project gates the data room … |
| `project_attention` | internal | Which projects need a human now, and why — per project: open, done, overdue, due soon, blocked by an unfinished prerequisite, urgent, stalled in progress, deadline passed, last movement, and the ve… |
| `reorder_projects` | internal | Set the team order of projects — the order the project view shows by default and the order a status meeting walks through. Use when: someone asks to put a project first, to order the projects by im… |
| `project_changes` | internal | What changed in a project (or across all projects) between two moments — tasks created, completed, reopened, moved between statuses, reprioritised, reassigned, rescheduled, renamed, deleted, checkl… |
| `project_priority_guide` | internal | What low, medium, high and urgent MEAN on this instance — one sentence each, the team\ |
| `set_project_priority_guide` | internal | Set what the priority levels mean on this instance — the team\ |
| `project_portfolio_brief` | internal | Read-only: {portfolio:{projects,open,in_progress,blocked,undated_open,overdue,stale_in_progress,cross_project_edges,hub_blockers[]}, projects:[{id,name,open,in_progress,done,blocked,undated_open,ov… |
| `get_project_schedule` | internal | Gantt-ready schedule for a project: every task with start/due dates, estimated hours, dependency edges and topological depth, external prerequisites (tasks in other projects this one waits for), pl… |
| `resource_capacity_report` | internal | Resource/capacity planning: per person — open tasks, estimated hours of backlog, hours logged, utilization % against weekly capacity, overload flag. Use when: "who has room for this?", spotting ove… |

## Data Model

Tables created by this module (from migrations):

- `public.project_task_dependencies`
- `public.project_templates`

All tables ship with Row-Level Security policies. See migration files for the exact rules.

## Module API Contract

**Actions:** `create`, `list`, `get`, `update`, `list_tasks`, `create_task`

**Input fields:** `action`, `id`, `name`, `project_id`, `is_active`, `title`, `description`, `assigned_to`, `due_date`, `priority`, `status`

**Output fields:** `success`, `project_id`, `task_id`, `message`

## Used in Processes

This module participates in the following end-to-end business processes:

- [quote-to-cash](../processes/quote-to-cash.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/projects-module.ts` |
| Hook | `src/hooks/useProjects.ts` |
| Admin page | `src/pages/admin/ProjectsPage.tsx` |
| Migration | `supabase/migrations/20260708020000_projects-parity-r6.sql` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*This file is auto-generated by `scripts/generate-module-docs.ts`. Do not edit manually — re-run the script after changing the module definition.*