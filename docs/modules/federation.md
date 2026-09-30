---
id: federation
name: Federation
manual: true
description: Multi-agent federation — connect FlowPilot to external Architects (Claude, OpenClaw peers) via MCP, A2A, and /v1/responses. Directional connections, channel-aware auth, automated callback injection.
title: "Federation"
category: modules
---

# Federation

> **Status:** Flagship module — manually maintained.
> **Source of truth:** `src/lib/modules/federation-module.ts` + this file.
> _The auto-generator skips this file because of `manual: true`._

Federation is FlowWink's **agent-to-agent fabric**. It lets FlowPilot operate as one node in a mesh of cooperating agents — receiving tasks from external Architects, delegating to specialist peers, and exposing its own capabilities as a discoverable MCP server.

The design assumption is **no central orchestrator**. Each agent is a peer with its own soul, objectives, and trust policies. Federation defines *how they talk*, not *who's in charge*.

---

## Three transports, three intents

| Transport | Direction | Used for |
|---|---|---|
| **MCP** (`/mcp`) | Inbound (peers call us) | Exposing skills as tools to external Architects |
| **A2A** | Bidirectional | Conversational coordination, delegation, status updates |
| **`/v1/responses`** | Outbound (we call peers) | Asking external models/agents for reasoning we don't own |

A single peer can have **multiple channels** — e.g. Claude Code might be MCP-inbound (it calls our skills) AND `/v1/responses`-outbound (we call it for research). Stored in `federation_connections` with `(peer_id, direction, transport)`. See `mem://federation/directional-connections-model`.

---

## Architecture

### Data model

| Table | Purpose |
|---|---|
| `federation_peers` | Identity records — name, type, persona, public metadata |
| `federation_connections` | Per-peer channels (direction + transport + endpoint + auth) |
| `api_keys` | Symmetric keys: `gateway_token` (peers calling us), `peer_api_key` (us calling peers), `fwk_*` (auto-injected MCP callbacks) |
| `agent_objectives` | Delegation targets — peers can be assigned objectives |
| `beta_test_findings` | Cross-peer issue reports with `reported_by` attribution |

### Channel & collaborator architecture

See `mem://federation/channel-and-collaborator-architecture` for the full model. Summary:

```
External Architect (Claude / OpenClaw / custom)
   ↓ MCP (gateway_token)
FlowWink MCP server (/mcp endpoint)
   ↓ skill scoring + execution
agent-execute (handlers: internal:* / edge:*)
   ↓ result
External Architect resumes reasoning
```

For outbound:

```
FlowPilot needs reasoning we don't own
   ↓ proactive-peer-delegation
   ↓ /v1/responses (peer_api_key)
External peer (Claude / GPT / OpenClaw)
   ↓ response
FlowPilot integrates into its own loop
```

---

## Skills (MCP-exposed)

| Skill | Purpose |
|---|---|
| `register_peer` | Create a new federation peer (name, type, transport hints). |
| `add_peer_channel` | Attach a channel (direction + transport + endpoint + auth). |
| `delegate_task` | Send a task to a peer; returns objective ID. |
| `proactive_peer_delegation` | FlowPilot picks a peer for an objective and delegates. |
| `peer_status` | Read current peer health + recent activity. |
| `report_finding` | Attribute a finding to a peer (cross-agent QA). |

External peers calling **into** FlowWink see all platform-level skills filtered by module activation + `?groups=` filter. See `mem://architecture/mcp-toolset-groups-and-tool-bloat-strategy` and `mem://architecture/mcp-module-aware-filtering`.

---

## MCP server (inbound)

The `/mcp` endpoint is a JSON-RPC 2.0 server that implements the Model Context Protocol. Key behaviors:

- **Auth:** `Authorization: Bearer <gateway_token>` from `api_keys` table
- **Tool discovery:** `tools/list` returns only skills from active modules
- **Group filtering:** `?groups=accounting,crm` narrows the catalog (combats tool-bloat)
- **Resources:** `flowwink://briefing` provides aggregated platform context in one call (latency optimization). See `mem://architecture/mcp-context-briefing-resource`.
- **Discovery transparency:** `/rest/groups` returns both `available_modules` (catalog) and `active_modules` (live state with tool counts). See `mem://architecture/mcp-discovery-transparency-pattern`.

Self-describing skills are mandatory — if a skill isn't selected correctly by external Architects, the fix is **better metadata**, never a routing hack. See `mem://philosophy/flowpilot-development-laws`.

---

## A2A (bidirectional collaboration)

A2A channels are conversation-oriented. Used when:
- Two peers need to coordinate a multi-turn task
- A peer wants to subscribe to events
- Bidirectional status streaming during long-running work

The A2A surface is served by the `a2a` edge function, with peer discovery via
`agent-card`. The former reference implementation (the "Agent Bridge" on
`clawstack.froste.eu`) is **decommissioned** — do not use it. The live external
peer today is OpenClaw (`https://openclaw.liteit.se`), which operates FlowWink
instances through the outward MCP gateway (`mcp-server`, `?mode=dispatch`)
rather than A2A.

---

## Outbound (`/v1/responses`)

When FlowPilot needs reasoning capacity it doesn't own (e.g. heavy code analysis, specialist domain knowledge), it calls peers via OpenAI-compatible `/v1/responses`. Stored as outbound-direction connections with `peer_api_key` auth.

Compatible peer types include:
- OpenClaw instances (use `rawMessage` envelope per `mem://federation/compatibility-openclaw`)
- Hosted Claude / GPT endpoints
- Custom self-hosted agents exposing `/v1/responses`

---

## Onboarding a new peer (4-step process)

See `mem://federation/orchestrator-onboarding-process` and the practical
walkthrough in [`../agents/agent-setup.md`](../agents/agent-setup.md)
(invite → role → Game Master seed/reset loop). Summary:

1. **Invite** — generate gateway_token (inbound) or capture peer_api_key (outbound)
2. **Verify MCP** — call `tools/list` from peer side; confirm catalog visible
3. **Register peer** — `register_peer` + `add_peer_channel` skills
4. **Operational verification** — assign a low-risk Operator or Audit mission. See `mem://federation/agent-onboarding-missions-strategy`.

Automated MCP callback injection generates `fwk_*` keys when peers register, so they don't need to manually configure return paths. See `mem://federation/automated-mcp-callback-injection`.

---

## Trust & single-architect policy

A federated peer can act as **Architect** (issues objectives), **Operator** (executes work), **Auditor** (reviews + reports), or any combination per channel.

Hard rule: **at most one Architect per objective.** Two peers cannot both claim ownership of the same goal — prevents thrashing. See `mem://federation/single-architect-policy`.

Bidirectional feedback: when a peer responds to a delegated task, FlowPilot captures the result + any signals (cost, latency, refusal reasons) into `agent_events` for learning. See `mem://federation/bidirectional-feedback-loop-logic`.

---

## Admin UI

`/admin/federation` — peer browser, channel inspector, mission assignment, finding tracker.

Key sub-pages:
- `/admin/federation/peers` — registered peers + health
- `/admin/federation/channels` — per-peer channel matrix (direction × transport)
- `/admin/federation/missions` — active operator/audit missions
- `/admin/federation/findings` — cross-peer issue reports

---

## Extending

### Add a new transport
1. Implement adapter in `supabase/functions/federation-<transport>/`.
2. Add row to `federation_transports` registry.
3. Update `add_peer_channel` schema enum.
4. Document auth model + payload envelope.

### Add a new external peer type
1. Most peers fit existing types (OpenClaw / OpenAI-compatible / MCP-only).
2. For exotic peers, add a `peer_type` enum value + adapter logic in `proactive-peer-delegation`.
3. Always use the canonical `agent_objectives` payload — never invent peer-specific schemas.

---

## Development context

- **Channels are directional.** A peer that calls us is NOT automatically callable by us. Add a separate outbound channel.
- **Gateway tokens vs peer API keys are not interchangeable.** UI maps them per channel. See `mem://federation/transport-agnostic-ui`.
- **MCP exposure follows module activation.** Disable a module → its skills vanish from the MCP catalog. Re-enable → they reappear automatically (no re-registration).
- **Skill linter blocks publication of incomplete contracts.** `bun run lint:skills` runs the Agent Contract Integrity checklist before any skill can be exposed via MCP. See `mem://architecture/agent-contract-integrity`.
- **Bridge polling discipline.** Always `since_id=0`, always show raw messages when in doubt.

See also: `mem://federation/security-and-auth`, `mem://federation/proactive-peer-delegation`, `mem://federation/clawstack-bridge-endpoint`, `mem://federation/clawthree-workspace-api`.

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `a2a_chat` | external | Handle incoming A2A messages from federation peers. Routes natural language messages to FlowPilot for intelligent response. Use when: a peer agent sends a chat message; processing cross-agent commu… |
| `start_qa_session` | internal | Start a beta test session with a scenario description. Use when: initiating a new round of beta testing; defining test scope and purpose; preparing for a new testing task. NOT for: ending a session… |
| `end_qa_session` | internal | End a beta test session with summary. Use when: concluding a beta testing round; collecting final session feedback; marking a test as complete. NOT for: starting a new test session (start_qa_sessio… |
| `report_finding` | internal | Report a bug, UX issue, suggestion, positive note, missing feature, or performance issue from beta testing. Use when: documenting observed problems during a test; submitting improvement ideas; logg… |
| `openclaw_exchange` | internal | Send a message between OpenClaw and FlowPilot. Use when: passing information between systems; requesting an action from the other AI; synchronizing state or data. NOT for: generalized A2A chat (a2a… |
| `openclaw_get_status` | internal | Get current beta test status. Use when: checking progress of an ongoing beta test; verifying if a test session is active; monitoring testing phase. NOT for: starting a new session (start_qa_session… |
| `a2a_request` | internal | Send a request to a connected A2A peer agent. Use when: delegating tasks to external agents, requesting music generation or audits from peers. NOT for: handling incoming peer messages (use a2a_chat). |
| `dispatch_claw_mission` | internal | Dispatch a one-shot mission to an external OpenClaw agent via /v1/responses. Fire-and-forget: the Claw works independently and reports results back via MCP callback. Use when: running template audi… |
| `queue_beta_test` | internal | Queue a test scenario for OpenClaw to execute on next poll. Use when: scheduling tests for asynchronous execution. NOT for: dispatching a mission for immediate execution (use dispatch_claw_mission). |
| `resolve_finding` | internal | Mark a beta test finding as resolved. Use when: closing fixed issues, updating finding status. NOT for: reporting new findings (use report_finding). |
| `confirm_fulfillment` | external | Confirm delivery/fulfillment of an order or purchase order. Use when: an external agent (Claw/supplier) confirms that goods have been delivered. NOT for: updating order status manually (use manage_… |
| `scan_beta_findings` | internal | Scan unresolved beta test findings from OpenClaw. Use when: reviewing outstanding QA issues, finding unresolved bugs. NOT for: resolving findings (use resolve_finding). |
| `invite_peer_agent` | external | Invite a new sub-agent into the FlowWink federation. Auto-generates an MCP API key and registers the peer with full transitive trust (the new peer inherits the inviter\ |

<!-- generated:skills:end -->
