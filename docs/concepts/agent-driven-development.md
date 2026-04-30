# Agent-Driven Development

> FlowWink is built so that the agent can extend itself — within strict, well-defined boundaries.

---

## The boundary

| What FlowPilot can do | What only the Coding Agent can do |
|-----------------------|------------------------------------|
| Create / update / archive **content** (pages, blogs, KB) | Create new React components |
| Create / update **business records** (leads, orders, invoices) | Modify edge functions |
| Configure **skills, automations, objectives** | Change `defineModule()` manifests |
| Run **migrations of data** (not schema) | Run **schema migrations** |
| Tune **agent_memory** via JSON5 patches | Refactor architecture |
| Delegate work to **federated peers** | Add new modules |

This split is documented in `mem://philosophy/coding-agent-vs-flowpilot-boundaries`.

---

## Why split this way

**Speed where it's safe, friction where it's risky.**

Content + business records change every day — gating these on a developer kills the velocity. Architecture changes happen rarely but break everything when wrong — gating these on a human is correct.

The split is enforced by:

- **Trust matrix** (`mem://architecture/agent-trust-and-gating-logic`) — `auto`, `notify`, `approve` per skill.
- **DEDICATED_SKILL_TABLES** — generic CRUD blocked on sensitive tables; only domain skills (e.g. `place_order`) write to them.
- **Skill schemas mirror DB NOT NULLs** — agents cannot guess required fields (`mem://constraints/skill-schema-must-mirror-db-not-null`).
- **Agent Contract Integrity** pre-release checklist (`mem://architecture/agent-contract-integrity`).

---

## The self-improvement loop

FlowPilot can:

1. Notice a recurring pattern in `chat_messages` (e.g. visitors keep asking "do you ship to Norway?").
2. Propose a new objective via `agent_objectives`.
3. Draft a new automation in `/admin/automations` (status `pending_approval`).
4. Once approved, execute the automation — and log results back to `audit_logs` for the next reasoning cycle.

What FlowPilot **cannot** do is write the React block that exposes the new feature on the public site — that's a Coding Agent job. This intentional limit keeps the UI surface human-curated.

---

## Federated architects

External peers (OpenClaw, Claude Desktop) **can** propose architectural changes via the A2A channel. They go through the same approval flow as FlowPilot proposals. See [`a2a-communication-model.md`](./a2a-communication-model.md).

---

## See also

- [`openclaw-law.md`](./openclaw-law.md) — the four laws that make this safe
- [`mem://philosophy/autonomy-execution-layers`] — Objectives → Automations → Workflows
- [`mem://constraints/agent-autonomy-boundaries`]
