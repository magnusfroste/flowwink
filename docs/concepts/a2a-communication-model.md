# A2A — Agent-to-Agent Communication Model

> How FlowPilot federates with peer agents (OpenClaw, Claude Desktop, custom MCP clients) without a central broker.

---

## The model in one diagram

```
       ┌───────────────────┐         ┌──────────────────────┐
       │   FlowPilot (us)  │  MCP    │  External Operator   │
       │   ─ Operator      │◀───────▶│  ─ Architect / Auditor│
       │   ─ Gatekeeper    │  A2A    │  (OpenClaw / Claude) │
       └───────────────────┘         └──────────────────────┘
                ▲                              ▲
                │ /v1/responses                │
                ▼                              ▼
       ┌───────────────────────────────────────────────┐
       │           Federation Bus (REST + SSE)         │
       └───────────────────────────────────────────────┘
```

**Three transports, one peer model.** A single peer can use any combination:

| Transport | Direction | Used for |
|-----------|-----------|----------|
| **MCP** | inbound (peer → us) | External agent calls our skills |
| **A2A** | bidirectional | Long-running coordination, delegate_task |
| **/v1/responses** | outbound (us → peer) | We call peer for reasoning we don't do locally |

See [`mem://federation/directional-connections-model`] for the data model (`federation_connections` table).

---

## Roles

FlowWink uses a **federated role model** (`mem://philosophy/federated-agent-roles`):

- **Operator** — runs the day-to-day work inside one FlowWink site. Default: FlowPilot.
- **Gatekeeper** — validates inbound peer requests, enforces trust + RLS.
- **Architect** — reasons about long-horizon design changes (often an external peer like OpenClaw).
- **Auditor** — reads-only mission, used during onboarding.

**Single Architect Policy:** at any time only one peer holds the Architect role. Others may observe but cannot push architectural changes simultaneously. This prevents conflicting refactors.

---

## Onboarding a peer (4 steps)

1. **Invite** — admin issues an invite token in `/admin/federation`.
2. **Verify MCP** — peer connects to `/rest/groups`, we verify they can list our skills.
3. **Register peer** — row added to `federation_connections` (peer + direction + transport).
4. **Operational verification** — peer runs an Auditor mission (read-only) to confirm the link.

Promotion to Operator/Architect requires a second admin approval.

---

## Bidirectional feedback

Every peer call generates a `beta_test_findings` row attributed to `reported_by = <peer_id>`. This builds a longitudinal trust + quality signal per peer (`mem://federation/bidirectional-feedback-loop-logic`).

---

## Why no central broker

FlowWink is single-tenant per deployment. A central broker would re-introduce the SaaS-vendor coupling we set out to remove. Instead each site is its own MCP endpoint, and peers discover each other via shared registries (optional) or direct invites.

---

## See also

- [`concepts/operator-strategy.md`](./operator-strategy.md)
- [`mem://federation/directional-connections-model`]
- [`mem://federation/orchestrator-onboarding-process`]
- [`docs/agents/agent_invite.md`](../agents/agent_invite.md)
