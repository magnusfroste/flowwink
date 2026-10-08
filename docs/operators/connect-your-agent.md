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

## Keys at rest, owners, idle agents

- **The key exists once: in the response.** Only its hash is stored. Until
  2026-10-08 the invite path also wrote `api_keys.key_raw` and
  `a2a_peers.mcp_api_key`; migration `20261008120000` drops the first column and
  nulls the second, and a guard scans every edge function for writes to either.
  Treat keys that sat there as exposed: run `npm run fleet:status` **before**
  pushing the migration — it lists them per instance (name + prefix) — and rotate
  each by revoking the agent and connecting it again. The one sanctioned raw store
  is the OpenClaw callback key, written by `openclaw-responses` for the outbound
  leg and handed to the Claw in its mission prompt.
- **No owner means full reach.** Agents whose key had no `created_by` got no owner
  in the #649 backfill, and the gateway has no one to hold them to. The Agents
  table shows them as **no owner — full reach** with a picker; setting the owner
  (`set_agent_owner`, Agents module) moves both the peer's owner and the key's
  creator, so reach, attribution and the owner's RLS agree from the next call.
- **Idle agents are flagged** after 30 days without a call. A key nobody uses is a
  key nobody misses when it leaks — revoke it.
- **Retiring a function is not done until it is deleted on every project.** The
  Supabase GitHub integration deploys but never deletes, so `fleet:status` (with
  `SUPABASE_ACCESS_TOKEN`) lists functions deployed but no longer in `config.toml`
  and prints the `supabase functions delete` lines.

## Client snippets

All clients use MCP over Streamable HTTP with `Authorization: Bearer <key>`.
Operators connect to `…/functions/v1/mcp-server?mode=dispatch` (three tools:
`search_skills`, `read_skill`, `execute_skill`); auditors to the plain URL.

- **Claude Desktop / Claude Code** — `mcpServers.flowwink = { type: "http", url, headers }` in `claude_desktop_config.json`, or `claude mcp add --transport http flowwink <url> --header "Authorization: Bearer <key>"`.
- **ChatGPT** — Settings → Connectors → Create; the connector UI cannot send a header, so use `<url>&key=<key>` with "No authentication". The gateway accepts the key in the URL **only** for agents connected as ChatGPT (anyone else gets a 401 that says to use the header); same checks, same audit row. A key in a URL lands in edge, proxy and browser logs, so ChatGPT keys **expire after 90 days** — reconnect to renew.
- **Cursor** — `~/.cursor/mcp.json` or `.cursor/mcp.json`: `mcpServers.flowwink = { url, headers }`.
- **OpenCode** — `opencode.json`: `mcp.flowwink = { type: "remote", url, headers, enabled: true }`.
- **Gemini CLI** — `~/.gemini/settings.json`: `mcpServers.flowwink = { httpUrl, headers }`.
- **GitHub Copilot (VS Code)** — `.vscode/mcp.json`: `servers.flowwink = { type: "http", url, headers }`.
- **Hermes / OpenClaw** — paste the invite prompt; it carries endpoint, key and transport.

The exact snippet, filled in, is what the wizard shows.

## What happened to Federation

The A2A transport (peer-to-peer chat and requests between instances) is being
retired: it was a second protocol for what MCP already does, and the one real
outbound case — purchasing negotiating with suppliers' agents — is FlowWink as an
MCP *client*, not a protocol of its own. `a2a_peers` stays as the agent register;
the legacy page lives under *Advanced* on `/admin/agents` until the removal PR.
