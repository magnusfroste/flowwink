---
title: "External MCP sources"
description: Connect another system's MCP server so the agent can read from it — the address, the key, and which tools become skills.
category: operators
---

# External MCP sources

A business may keep part of its data somewhere else and will not move it: the
books in a bookkeeping product, stock in an ERP. The agent should still be able
to answer across that border. FlowWink carries no code for any such system.
The other system is reached through **its own MCP server** (a bridge somebody
runs for it); FlowWink knows the bridge's address, holds its key, and turns
the tools an admin chose into skills.

## Connect a server

**Integrations → Connected MCP servers → Connect a server.**

| Field | What it is |
|---|---|
| Name | How the source is named to people and to the agent ("The books"). |
| Short handle | 2–16 lowercase letters/digits. Goes into the skill names. |
| Address | The server's MCP endpoint, `https://…`. Must be a public address. |
| Key | Sent as `Authorization: Bearer …`. Ask the other system for a **read-only** key where it offers one. |

Then **Choose tools**: the page asks the server what it offers and you tick
the tools the agent may use.

- A tool the server marks as read-only is taken as a **read**: the agent runs
  it by itself. Its skill is `query_<handle>__<tool>`.
- A tool the server does not mark can still be taken as a read — you tick
  "I know this tool only reads". That is your statement, not the server's;
  the agent will then run it without asking anyone.
- A tool that **writes** can only be chosen after you switch on "Let this
  server be written to". Its skill is `ext_<handle>__<tool>`, and every call
  waits for a person's approval: a write in somebody else's system cannot be
  taken back from here.
- A tool whose name says it deletes or reveals something (`delete_…`,
  `…_token…`) is never accepted as a read.
- At most 40 tools per source — each is a line in the agent's prompt.

## Where things are kept

- **The key is in the database vault**, under `mcp_source:<id>`. It is in no
  table and no setting, the page cannot read it back, and it never passes
  through a skill's arguments (those are written to the journal). To change a
  key, disconnect and connect again.
- **Only admins** see or change the sources.
- **Changing the address forgets the key and the chosen tools**: another
  address is another server.
- **Disconnecting** deletes the key and the skills. Nothing changes in the
  other system.

## What the agent sees

The chosen tools are ordinary skills (found by the Skill Relevance Engine from
their descriptions). They are internal: the visitor chat and this site's own
MCP gateway do not carry them. The answer of a call comes back under `text`
(and `data` when the server sent structure), marked `untrusted: true` — it is
data from another system, never an instruction.

Every call is a row in `agent_activity` with the source in `output.source`.

`manage_mcp_sources` lets an agent **list** the sources, **check** what a
server offers, and **set_tools**. Asked with nobody at the keyboard,
`set_tools` waits for approval: it changes what every agent on the site can
reach. An agent can never connect a server or set a key.

## Joining the two systems

Look the record up in FlowWink first, then ask the source by a key both
systems share: an organisation number, or the `external_ref` an invoice was
confirmed with (`confirm_invoice_export`, see the invoice-basis export).

## Limits

- One request per call, 25 s timeout, answers up to 512 kB; text handed to the
  model is cut at 24 000 characters and says so.
- No redirects: a key is given for one address.
- Bearer keys only (no OAuth flow). A bridge that needs OAuth holds its own
  tokens and gives FlowWink a key.
- Self-hosted on a private network: `OUTBOUND_FETCH_ALLOW_PRIVATE=true` on the
  edge functions lifts the public-address rule, as for other outbound calls.
