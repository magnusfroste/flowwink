# Agent-to-agent communication — retired

The A2A transport (peer-to-peer chat and requests between FlowWink instances,
with its own inbound/outbound tokens, discovery card and connection ledger) was
removed on 2026-10-08. It was a second protocol for what MCP already does.

**One protocol, both directions: MCP.** Agents connect to FlowWink over the MCP
gateway; when FlowWink itself needs to talk to another agent (OpenClaw, a
supplier's agent, another FlowWink instance) it does so as an MCP client.

- How to connect an agent, and the owner model (one key, one agent, one owner):
  [`../operators/connect-your-agent.md`](../operators/connect-your-agent.md)
- The platform view of MCP: [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md)
- OpenClaw missions still go through `openclaw-responses` (OpenResponses API) and
  `dispatch_claw_mission`, under *Advanced* on `/admin/agents`.

`a2a_peers` stays as the agent register and `a2a_activity` as OpenClaw's exchange
log — wire names are stable; only the story changed.
