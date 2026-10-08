---
id: federation
name: Federation
manual: true
description: Connected agents — the agents people bring (Claude, ChatGPT, Cursor, OpenCode, Gemini, Copilot, Hermes, OpenClaw) operate this instance over MCP, each with an owner, a mission and the owner's reach.
title: "Federation (Connected agents)"
category: modules
---

# Federation — connected agents

> **Status:** manually maintained. **Source of truth:** `src/lib/modules/federation-module.ts` + this file.
> _The auto-generator skips this file because of `manual: true`; the skills table at the bottom is still written by it._

FlowWink is the shared operating surface of a business. **FlowPilot** is the operator
built into it. Everyone else brings the agent they already use and connects it over
**MCP** — one protocol, in both directions. This module is the register of those
agents and the rules they run under. The practical guide is
[`../operators/connect-your-agent.md`](../operators/connect-your-agent.md).

The A2A transport (peer-to-peer chat and requests between instances with their own
tokens, a discovery card and a connection ledger) was retired on 2026-10-08. It was a
second protocol for what MCP already does. The one outbound case that remains —
purchasing negotiating with suppliers' agents — is FlowWink as an MCP *client*, not a
protocol of its own.

---

## The model: an agent is a principal with an owner

| Rule | Where it is enforced |
|---|---|
| **One key, one agent, one owner.** Every connected agent is a row in `a2a_peers` with its own `api_keys` row and an `owner_user_id` — the person it acts for. | `federation-invite-peer` mints both; `20261007180000_agenten-har-en-agare.sql` |
| **It acts as its owner.** River posts, expenses, audit rows carry the owner's name, not the admin's. | `mcp-server` resolves the key → peer → owner and passes the owner as `_caller_user_id` to `agent-execute` |
| **It never reaches further than its owner.** Every call is checked against `can_access_module(owner, module of the skill)`; discovery shows only what the owner may run; a call outside answers `Forbidden: … has no access to the X module`. Platform (unmapped) skills are admin-only — fail closed. | `ownerMayRun` / `filterByOwner` in `mcp-server` |
| **It knows who it is.** `flowwink://briefing` carries a `you` block: name, client, owner, mission, reach and `sign_as` ("Hermes (Peter)"). | `describeCaller` in `mcp-server` |
| **It dies with the person.** Revoking the agent (owner or admin) expires its key at once; `revoke_agent(p_peer_id)` is callable by the owner under RLS. | migration above; `useRevokeAgent` |

A key is minted for **one instance** and rejected everywhere else (the gateway names
the instance in its 401 hint).

---

## Surfaces

| Surface | Who | What |
|---|---|---|
| `/admin/agents` | admins | Connected agents (owner, client, mission, reach, last active), *Connect an agent* wizard, MCP activity, QA findings, OpenClaw mission dispatch under *Advanced* |
| `/account/agents` | anyone with a role | *My agents* — connect, see, revoke your own |
| `/admin/developer` → MCP Keys | admins | The raw key ledger; an agent's key appears here too |
| `/admin/federation` | — | redirects to `/admin/agents` |

The wizard asks three things — *what do you call it*, *which client does it run in*,
*what is it for* (my whole role / one department / QA sweep; admins also get every
mission template and a toolset ceiling) — and shows the client configuration and the
first message **once**. Client snippets live in `src/lib/agent-clients.ts`, mission
templates in `src/lib/agent-missions.tsx`, the onboarding prompt in
`src/lib/agent-prompt.ts`.

---

## How a connected agent talks to FlowWink

```
Owner's agent (Claude / ChatGPT / Cursor / OpenClaw / …)
   ↓ MCP over Streamable HTTP, Authorization: Bearer <key>   (or ?key= for clients that cannot send headers)
mcp-server  ?mode=dispatch → search_skills · read_skill · execute_skill
   ↓ key → peer → owner;  ownerMayRun(skill, owner)
agent-execute  (_caller_user_id = owner)
   ↓
the same skills FlowPilot runs — audit row signed by the owner
```

- **Dispatch mode** keeps three schemas in context; `?groups=crm,commerce` narrows to
  a department; no parameter exposes everything the owner may run.
- **Resources:** `flowwink://briefing` (identity, modules, health, `you`),
  `flowwink://mission` (the stored mission — survives the agent's context),
  `flowwink://peers` (connected agents: name, owner, status, last seen).
- **REST facade:** `/rest/execute`, `/rest/resources/:key`, `/rest/groups` mirror the
  tool surface for scripts and clients without MCP.

FlowPilot does **not** go through this gateway — it shares the Skill Relevance Engine
and calls `executeSkill` in-process. MCP is for crossing a trust boundary.

---

## Data

| Table | Purpose |
|---|---|
| `a2a_peers` | **The agent register** — name, `owner_user_id`, `client_kind`, `api_key_id`, mission, toolset groups, status, last seen. Wire name kept (fleet-wide value); the story is "connected agents". |
| `api_keys` | The keys. `created_by` = owner; `owner_user_id` on the peer. |
| `peer_invitations` | Who invited whom (`invite_peer_agent` lets an agent mint a sub-agent within its own reach). |
| `a2a_activity` | OpenClaw's exchange log (`openclaw_exchange`, missions). |
| `beta_test_sessions` / `beta_test_findings` / `beta_test_exchanges` | QA sweeps: `start_qa_session`, `report_finding`, `resolve_finding`, `scan_beta_findings`. |

MCP call attribution itself lives in `agent_activity` (`agent='mcp'`) and the audit
trail, not here.

---

## OpenClaw

OpenClaw (`https://openclaw.liteit.se`) is a connected agent like any other — it
operates instances through `mcp-server?mode=dispatch`. What is specific to it is the
**outbound** leg: `dispatch_claw_mission` and `openclaw_exchange` POST
`openclaw-responses` (OpenResponses API, `gateway_token`), and the Claw reports back
over MCP. Dispatch lives under *Advanced* on `/admin/agents`.

---

## Development notes

- **Owner enforcement is by skill → module map**, not by toolset groups. Toolset groups
  are a ceiling the admin sets; the owner's module access is the floor the gateway
  enforces. `search_skills` filters with the same map so an agent never sees what it
  cannot run.
- **`a2a_peers` / `a2a_activity` are runtime identifiers.** Renaming them is a
  fleet-wide lockstep with zero user value — fix the story (docs, UI copy), not the wire.
- **Skills are self-describing.** If an external agent picks the wrong skill the fix is
  better `Use when:` / `NOT for:` metadata, never a routing hack (Law 1 and 2).
- **Guards:** `connect-your-agent.guardrails.test.ts` (wizard, clients, missions, owner
  model), `a2a-is-retired.guardrails.test.ts` (the transport stays gone),
  `agent-invite-link.guardrails.test.ts`, `shared-surfaces-reachable.guardrails.test.ts`
  (`/admin/agents` reachable for every role that may connect an agent).

See also: [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md),
[`../agents/agent-setup.md`](../agents/agent-setup.md),
[`../agents/agent_invite.md`](../agents/agent_invite.md).

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `start_qa_session` | internal | Start a beta test session with a scenario description. Use when: initiating a new round of beta testing; defining test scope and purpose; preparing for a new testing task. NOT for: ending a session… |
| `end_qa_session` | internal | End a beta test session with summary. Use when: concluding a beta testing round; collecting final session feedback; marking a test as complete. NOT for: starting a new test session (start_qa_sessio… |
| `report_finding` | internal | Report a bug, UX issue, suggestion, positive note, missing feature, or performance issue from beta testing. Use when: documenting observed problems during a test; submitting improvement ideas; logg… |
| `openclaw_exchange` | internal | Send a message between OpenClaw and FlowPilot. Use when: passing information between systems; requesting an action from the other AI; synchronizing state or data. NOT for: reporting QA findings (re… |
| `openclaw_get_status` | internal | Get current beta test status. Use when: checking progress of an ongoing beta test; verifying if a test session is active; monitoring testing phase. NOT for: starting a new session (start_qa_session… |
| `dispatch_claw_mission` | internal | Dispatch a one-shot mission to an external OpenClaw agent via /v1/responses. Fire-and-forget: the Claw works independently and reports results back via MCP callback. Use when: running template audi… |
| `queue_beta_test` | internal | Queue a test scenario for OpenClaw to execute on next poll. Use when: scheduling tests for asynchronous execution. NOT for: dispatching a mission for immediate execution (use dispatch_claw_mission). |
| `resolve_finding` | internal | Mark a beta test finding as resolved. Use when: closing fixed issues, updating finding status. NOT for: reporting new findings (use report_finding). |
| `confirm_fulfillment` | external | Confirm delivery/fulfillment of an order or purchase order. Use when: an external agent (Claw/supplier) confirms that goods have been delivered. NOT for: updating order status manually (use manage_… |
| `scan_beta_findings` | internal | Scan unresolved beta test findings from OpenClaw. Use when: reviewing outstanding QA issues, finding unresolved bugs. NOT for: resolving findings (use resolve_finding). |
| `invite_peer_agent` | external | Invite a new sub-agent into the FlowWink federation. Auto-generates an MCP API key and registers the peer with full transitive trust (the new peer inherits the inviter\ |

<!-- generated:skills:end -->
