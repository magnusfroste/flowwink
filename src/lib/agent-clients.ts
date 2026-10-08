/**
 * How each MCP client connects to a FlowWink instance.
 *
 * The URL and the key travel together — a key is minted for ONE instance and
 * is rejected everywhere else — so every snippet carries both. Clients that
 * cannot send an Authorization header (ChatGPT's connector UI) get the
 * `?key=` form the gateway also accepts.
 */

export type AgentClientKind =
  | 'claude'
  | 'chatgpt'
  | 'cursor'
  | 'opencode'
  | 'gemini'
  | 'copilot'
  | 'hermes'
  | 'openclaw'
  | 'other';

export interface AgentClient {
  id: AgentClientKind;
  label: string;
  /** Where the snippet goes, in one line. */
  where: string;
  /** The config or instruction block to paste, with URL and key filled in. */
  snippet: (url: string, key: string, serverName?: string) => string;
  /** 'json' renders as code; 'text' as prose steps. */
  format: 'json' | 'text';
}

const json = (obj: unknown) => JSON.stringify(obj, null, 2);

export const AGENT_CLIENTS: AgentClient[] = [
  {
    id: 'claude',
    label: 'Claude (Desktop, Code)',
    where: 'Claude Desktop: Settings → Developer → Edit Config (claude_desktop_config.json). Claude Code: `claude mcp add --transport http flowwink <url> --header "Authorization: Bearer <key>"`, or .mcp.json in the project.',
    format: 'json',
    snippet: (url, key, name = 'flowwink') => json({ mcpServers: { [name]: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } }),
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    where: 'ChatGPT: Settings → Connectors → Create (developer mode). Paste the URL below as the MCP server URL; authentication "No authentication" — the key rides in the URL, where edge and proxy logs can see it, so ChatGPT keys expire after 90 days. Reconnect to renew.',
    format: 'text',
    snippet: (url, key) => `MCP server URL:\n${url}${url.includes('?') ? '&' : '?'}key=${key}\n\nName: FlowWink\nAuthentication: No authentication (the key is in the URL)`,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    where: 'Cursor: Settings → MCP → Add new global MCP server (~/.cursor/mcp.json), or .cursor/mcp.json in the project.',
    format: 'json',
    snippet: (url, key, name = 'flowwink') => json({ mcpServers: { [name]: { url, headers: { Authorization: `Bearer ${key}` } } } }),
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    where: 'OpenCode: opencode.json in the project (or ~/.config/opencode/opencode.json).',
    format: 'json',
    snippet: (url, key, name = 'flowwink') => json({ mcp: { [name]: { type: 'remote', url, headers: { Authorization: `Bearer ${key}` }, enabled: true } } }),
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    where: 'Gemini CLI: ~/.gemini/settings.json (or .gemini/settings.json in the project).',
    format: 'json',
    snippet: (url, key, name = 'flowwink') => json({ mcpServers: { [name]: { httpUrl: url, headers: { Authorization: `Bearer ${key}` } } } }),
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot (VS Code)',
    where: 'VS Code: .vscode/mcp.json in the workspace, or "MCP: Add Server" from the command palette.',
    format: 'json',
    snippet: (url, key, name = 'flowwink') => json({ servers: { [name]: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } }),
  },
  {
    id: 'hermes',
    label: 'Hermes / OpenClaw (prompt-driven)',
    where: 'Paste the whole invite prompt into the agent; it connects over MCP (Streamable HTTP) with the bearer key.',
    format: 'text',
    snippet: (url, key) => `MCP endpoint: ${url}\nAuthorization: Bearer ${key}\nTransport: Streamable HTTP (JSON-RPC over POST). Use resources/read, tools/list, tools/call.`,
  },
  {
    id: 'other',
    label: 'Other MCP client',
    where: 'Any client that speaks MCP over Streamable HTTP: give it the URL and the bearer header.',
    format: 'json',
    snippet: (url, key, name = 'flowwink') => json({ mcpServers: { [name]: { url, headers: { Authorization: `Bearer ${key}` } } } }),
  },
];

export function agentClient(kind: string | null | undefined): AgentClient {
  return AGENT_CLIENTS.find((c) => c.id === kind) ?? AGENT_CLIENTS[AGENT_CLIENTS.length - 1];
}
