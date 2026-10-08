# Connect your agent

FlowWink is the shared operating surface for a business. FlowPilot is the
operator built into it; everyone else brings the agent they already use —
Claude, ChatGPT, Cursor, OpenCode, Gemini, Copilot, Hermes — and connects it
over **MCP**. One protocol, in both directions. There is nothing else to learn.

## The model: an agent is a principal with an owner

| | |
|---|---|
| **One key, one agent, one owner** | Every connected agent has its own API key and a row in `a2a_peers` with `owner_user_id` — the person it acts for. |
| **It acts as its owner** | The gateway passes the owner as the caller: River posts, expenses, audit rows carry the person's name, not the admin's. |
| **It never reaches further than its owner** | Every call is checked against `can_access_module(owner, skill's module)`; discovery (`search_skills`) shows only what the owner may run; a call outside answers `Forbidden: … has no access to the X module`. Platform skills are admin-only, as in the executor. |
| **It knows who it is** | `flowwink://briefing` → `you`: name, client, owner, mission, reach, and `sign_as` ("Hermes (Peter)"). The onboarding prompt says the same. |
| **It dies with the person** | Revoking the agent (owner or admin) expires its key immediately; a deactivated user's agents go with them. |

## Connecting one — three choices

**Admin:** `/admin/agents` → *Connect an agent*. **Anyone with a role:** `/account/agents` → *My agents*.

1. **What do you call it?** — "Peter's Hermes", "My Claude".
2. **Which client does it run in?** — picks the config snippet.
3. **What is it for?** — *My whole role* (everything the owner can do), *One department* (growth, commerce, HR, finance), or *QA sweep* (inspect, report, change nothing). Admins have *Advanced*: every mission template, custom instructions, a toolset ceiling.

Admins may also pick **who it acts for**; a colleague connecting their own is always its owner.

The result is shown **once**: the client configuration (URL and key together — a
key is minted for one instance and rejected everywhere else) and the first
message to paste into the agent. The mission is also stored on the server at
`flowwink://mission`, so it survives the agent's context.

## Client snippets

All clients use MCP over Streamable HTTP with `Authorization: Bearer <key>`.
Operators connect to `…/functions/v1/mcp-server?mode=dispatch` (three tools:
`search_skills`, `read_skill`, `execute_skill`); auditors to the plain URL.

- **Claude Desktop / Claude Code** — `mcpServers.flowwink = { type: "http", url, headers }` in `claude_desktop_config.json`, or `claude mcp add --transport http flowwink <url> --header "Authorization: Bearer <key>"`.
- **ChatGPT** — Settings → Connectors → Create; the connector UI cannot send a header, so use `<url>&key=<key>` with "No authentication". The gateway accepts the key in the URL; same checks, same audit row.
- **Cursor** — `~/.cursor/mcp.json` or `.cursor/mcp.json`: `mcpServers.flowwink = { url, headers }`.
- **OpenCode** — `opencode.json`: `mcp.flowwink = { type: "remote", url, headers, enabled: true }`.
- **Gemini CLI** — `~/.gemini/settings.json`: `mcpServers.flowwink = { httpUrl, headers }`.
- **GitHub Copilot (VS Code)** — `.vscode/mcp.json`: `servers.flowwink = { type: "http", url, headers }`.
- **Hermes / OpenClaw** — paste the invite prompt; it carries endpoint, key and transport.

The exact snippet, filled in, is what the wizard shows.

## What happened to Federation

The A2A transport (peer-to-peer chat and requests between instances, with its own
tokens, a discovery card and a connection ledger) was removed on 2026-10-08. It was a
second protocol for what MCP already does, and the one real outbound case —
purchasing negotiating with suppliers' agents — is FlowWink as an MCP *client*, not a
protocol of its own. `a2a_peers` stays as the agent register, `/admin/federation`
redirects to `/admin/agents`, and OpenClaw mission dispatch lives under *Advanced*
there. The module's reference page is [`../modules/federation.md`](../modules/federation.md).
