---
name: Federation page is transport-agnostic (A2A or MCP)
description: The Federation page was conceived as a transport-agnostic "external agent surface" — A2A or MCP, it doesn't matter — which is why an agent's findings surface there. Note on the resulting MCP-onboarding/UX coupling, deferred.
type: architecture
---

# Federation page = transport-agnostic agent surface

**Intent.** The Federation page is a *concept*, not a protocol: "the place where external
agents connect, get tasked, and report back." Whether the transport is **A2A** (Google
agent-to-agent JSON-RPC) or **MCP** is deliberately irrelevant. That's why an invited
agent's **findings** (e.g. the "QA agent exercises the MCP surface and reports structured
findings" mission) surface on the Federation page — the page owns the *agent relationship*,
not the wire.

## MCP is the spine; federation rides on it (already true in code)
- `api_keys` is the single MCP credential store. `mcp-server` validates any key from it and
  exposes the **enabled modules'** skills — it is module-agnostic and works with the
  federation module OFF (see comment in mcp-server + `mem://architecture/mcp-exposure-invariants`).
- Federation is a *consumer*: `federation-invite-peer` mints an `api_key` + registers an
  `a2a_peer` (trust groups, transitive trust); OpenClaw missions inject MCP callback creds so
  the Claw reports findings **back via MCP**. So MCP is already the callback transport even for
  A2A/OpenClaw flows.

## The coupling we noticed (DEFERRED — left as-is for now)
There are two doors to MCP credentials, gated by different modules:
- **Developer page** (`/admin/developer`, `developer` module) → `useCreateApiKey`: a plain MCP
  key. No federation needed. Some MCP log also lives here.
- **Federation page** (`/admin/federation`, `federation` module) → `AgentInvites`: key **+**
  mission templates **+** `a2a_peer` registration. This richer "invite an MCP agent and task
  it" flow only shows when the **federation module is on**.

So today, onboarding an external **MCP** agent with a mission effectively requires the
federation module enabled (sidebar visibility) — even though MCP itself doesn't need it. Mild
tension with "MCP is the way forward."

## If we ever revisit
Conceptually two distinct things are bundled:
1. *Issue MCP key + dispatch a mission* → a **Developer/MCP** concern (no `a2a_peer` required).
2. *Register a trusted federated peer* (transitive trust, OpenClaw boss→worker) → a **Federation/A2A**
   concern.

Clean move: surface MCP-agent onboarding under Developer (decoupled from federation); keep the
A2A peer/trust/OpenClaw bits on the Federation page. Not urgent: selective deploy means a
federation-OFF site deploys none of the a2a functions (0 slot cost), and MCP works regardless.

**Decision (this session):** leave it. MCP-forward; A2A may stay as long as it doesn't get
complex. Recorded for later, not acted on.
