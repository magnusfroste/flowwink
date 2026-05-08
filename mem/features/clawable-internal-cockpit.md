---
name: clawable-internal-cockpit
description: Clawable is a FlowWink-internal admin UI for chatting with external operator peers; module with skills:[] and never MCP-exposed
type: feature
---

# Clawable — Internal Admin Cockpit

Clawable is the admin "test bench" for talking to external operator peers
(OpenClaw / Anthropic `/v1/responses`) directly from FlowWink.

- Module id: `clawable` (in `ModulesSettings`).
- Manifest: `src/lib/modules/clawable-module.ts` — `skills: []`, `capabilities: ['data:read']`.
- UI: `/admin/clawable` — gated by `useIsModuleEnabled('clawable')`.
- Edge function: `clawable-chat` proxies to `peer.url + /v1/responses` using
  the federation peer's `gateway_token`, persisting `last_response_id` for
  Responses-style chaining.
- Tables: `clawable_sessions`, `clawable_messages`. Peers come from `a2a_peers`.

## Invariant: never MCP-exposed

Clawable is a FlowWink-internal cockpit, not a business capability. External
claws must not be able to call "chat with peer X" via MCP — that would let a
peer reach other peers through us. The module ships **zero skills**, so MCP
exposure is structurally impossible.

For programmatic peer-to-peer messaging, the federation module's directional
connections + transports are the right surface — not Clawable.
