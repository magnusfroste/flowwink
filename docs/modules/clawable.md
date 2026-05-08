# Clawable

Internal admin cockpit for chatting with **external operator peers** (OpenClaw / Anthropic-style `/v1/responses`) directly from FlowWink.

## Why it exists

Clawable lets a FlowWink admin open a session with a registered federation peer
(e.g. an OpenClaw workspace) and exchange messages with `previous_response_id`
chaining — all without leaving FlowWink. It is the "test bench" for verifying
that an external operator is reachable, authenticated, and behaving correctly
before we hand it real work via federation channels.

## Architecture

- **UI:** `/admin/clawable` — admin-only page, gated by `useIsModuleEnabled('clawable')`.
- **Edge function:** `clawable-chat` — proxy that calls `peer.url + /v1/responses`
  using the federation peer's `gateway_token`.
- **Tables:** `clawable_sessions`, `clawable_messages` (with `last_response_id`
  for OpenAI Responses-style chaining).
- **Peer source:** rows from `a2a_peers` (the federation peer registry).

## What this module is NOT

- ❌ **Not MCP-exposed.** Clawable is a FlowWink-internal UI for administering
  external operators. It exposes zero skills. External claws have no business
  calling "chat with another peer" through us.
- ❌ **Not a routing layer.** For agent-to-agent messaging at scale, use the
  federation module's directional connections + transports.

## Settings

Enable / disable from `/admin/modules`. No additional configuration — peers
are managed in the Federation module.
