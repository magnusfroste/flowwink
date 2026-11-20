/**
 * The platform as an MCP CLIENT (#862, part 2): just enough of Streamable HTTP
 * to ask a server what tools it has and to call one.
 *
 * It speaks to an address an admin typed in, so every request goes through
 * `fetchPublic` (the address and each redirect hop must be public) with a
 * timeout, and the answer is read up to a cap — a server that never ends its
 * answer, or answers with a hundred megabytes, costs one refusal.
 *
 * Pure over an injected fetch: the tests drive it with a fake server.
 */
import { fetchPublic, UrlNotAllowedError } from '../net/outbound-url.ts';

export const MCP_PROTOCOL_VERSION = '2025-03-26';
export const MCP_TIMEOUT_MS = 25_000;
/** What one answer may weigh. A tool's text beyond this is cut, and said to be. */
export const MCP_MAX_ANSWER_BYTES = 512_000;
/** What is handed to the model from one call. */
export const MCP_MAX_TEXT_CHARS = 24_000;

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The server's own claim (annotations.readOnlyHint). A hint, not a proof. */
  readOnlyHint: boolean;
}

export interface McpConnection {
  url: string;
  key?: string | null;
  fetchImpl?: typeof fetch;
  /** Tests and intranet deployments: skip the public-address check. */
  allowPrivate?: boolean;
}

export class McpClientError extends Error {
  code: 'URL_NOT_ALLOWED' | 'UNREACHABLE' | 'UNAUTHORIZED' | 'BAD_ANSWER' | 'RPC_ERROR';
  status: number;
  constructor(code: McpClientError['code'], message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface RpcAnswer {
  status: number;
  sessionId: string | null;
  json: Record<string, unknown> | null;
  raw: string;
}

/** The JSON-RPC answer inside a body that is either JSON or an event stream. */
export function parseRpcBody(text: string, id?: number): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return null;
  if (!(t.startsWith('event:') || t.startsWith('data:') || t.startsWith(':'))) {
    try { return JSON.parse(t) as Record<string, unknown>; } catch { return null; }
  }
  // An event stream may carry notifications before the answer: take the frame
  // that answers OUR id, else the last frame that parses.
  let last: Record<string, unknown> | null = null;
  for (const line of t.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const frame = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
      if (id !== undefined && frame.id === id) return frame;
      last = frame;
    } catch { /* a frame that is not JSON is not an answer */ }
  }
  return last;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MCP_MAX_ANSWER_BYTES) {
      await reader.cancel().catch(() => {});
      throw new McpClientError('BAD_ANSWER', `The server's answer is larger than ${Math.round(MCP_MAX_ANSWER_BYTES / 1000)} kB`);
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

async function post(conn: McpConnection, payload: Record<string, unknown>, sessionId: string | null): Promise<RpcAnswer> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Accept-Encoding': 'identity',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
  };
  if (conn.key) headers.Authorization = `Bearer ${conn.key}`;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  let res: Response;
  try {
    res = await fetchPublic(conn.url, {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
    }, { fetchImpl: conn.fetchImpl, allowPrivate: conn.allowPrivate, maxRedirects: 0 });
  } catch (e) {
    if (e instanceof UrlNotAllowedError) {
      // A key is given for one address. It is not carried to wherever that address points next.
      if (/redirect/.test(e.message)) throw new McpClientError('BAD_ANSWER', 'The server redirects — connect to the address it redirects to');
      throw new McpClientError('URL_NOT_ALLOWED', e.message);
    }
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new McpClientError('UNREACHABLE', timedOut
      ? `The server did not answer within ${MCP_TIMEOUT_MS / 1000} s`
      : `The server could not be reached: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel().catch(() => {});
    throw new McpClientError('BAD_ANSWER', `The server redirects (HTTP ${res.status}) — connect to the address it redirects to`, res.status);
  }
  const raw = await readCapped(res);
  if (res.status === 401 || res.status === 403) {
    throw new McpClientError('UNAUTHORIZED', `The server refused the key (HTTP ${res.status})`, res.status);
  }
  const id = typeof payload.id === 'number' ? payload.id : undefined;
  return { status: res.status, sessionId: res.headers.get('mcp-session-id'), json: parseRpcBody(raw, id), raw };
}

function rpcResult(answer: RpcAnswer, method: string): Record<string, unknown> {
  const { json, status } = answer;
  if (!json) {
    throw new McpClientError('BAD_ANSWER', `${method} → HTTP ${status} with ${answer.raw.trim() ? 'a body that is not JSON-RPC' : 'an empty body'}`, status);
  }
  if (json.error) {
    const err = json.error as { message?: unknown; code?: unknown } | string;
    const message = typeof err === 'string' ? err : String(err.message ?? JSON.stringify(err));
    throw new McpClientError('RPC_ERROR', `${method}: ${message.slice(0, 400)}`, status);
  }
  if (!json.result || typeof json.result !== 'object') {
    throw new McpClientError('BAD_ANSWER', `${method} → HTTP ${status} without a result`, status);
  }
  return json.result as Record<string, unknown>;
}

/** initialize + the initialized notification; returns what the later calls carry. */
async function open(conn: McpConnection): Promise<{ sessionId: string | null; serverName: string | null }> {
  const answer = await post(conn, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'flowwink', version: '1' } },
  }, null);
  const result = rpcResult(answer, 'initialize');
  const serverName = String((result.serverInfo as { name?: unknown } | undefined)?.name ?? '').slice(0, 120) || null;
  // Best effort: a stateless server answers 202 or ignores it; one that keeps
  // sessions needs it before it lists anything.
  await post(conn, { jsonrpc: '2.0', method: 'notifications/initialized' }, answer.sessionId).catch(() => null);
  return { sessionId: answer.sessionId, serverName };
}

export async function mcpListTools(conn: McpConnection): Promise<{ serverName: string | null; tools: McpToolInfo[] }> {
  const { sessionId, serverName } = await open(conn);
  const tools: McpToolInfo[] = [];
  let cursor: string | undefined;
  // A server pages its list; ten pages is far past any real catalogue.
  for (let page = 0; page < 10; page++) {
    const result = rpcResult(await post(conn, {
      jsonrpc: '2.0', id: 2 + page, method: 'tools/list', params: cursor ? { cursor } : {},
    }, sessionId), 'tools/list');
    const batch = Array.isArray(result.tools) ? result.tools as Array<Record<string, unknown>> : null;
    if (!batch) throw new McpClientError('BAD_ANSWER', 'tools/list answered without a tools array');
    for (const t of batch) {
      const name = String(t?.name ?? '').trim();
      if (!name) continue;
      const annotations = (t.annotations ?? {}) as { readOnlyHint?: unknown };
      const schema = t.inputSchema && typeof t.inputSchema === 'object' && !Array.isArray(t.inputSchema)
        ? t.inputSchema as Record<string, unknown>
        : { type: 'object', properties: {} };
      tools.push({
        name,
        description: String(t.description ?? '').trim().slice(0, 4000),
        inputSchema: schema,
        readOnlyHint: annotations.readOnlyHint === true,
      });
    }
    cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
    if (!cursor) break;
  }
  return { serverName, tools };
}

export interface McpToolAnswer {
  /** The tool's own verdict (isError) — a failed lookup is an answer, not a transport fault. */
  isError: boolean;
  text: string;
  truncated: boolean;
  structured?: unknown;
}

export async function mcpCallTool(conn: McpConnection, tool: string, args: Record<string, unknown>): Promise<McpToolAnswer> {
  const { sessionId } = await open(conn);
  const result = rpcResult(await post(conn, {
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args },
  }, sessionId), 'tools/call');
  const parts: string[] = [];
  for (const item of Array.isArray(result.content) ? result.content as Array<Record<string, unknown>> : []) {
    if (item?.type === 'text' && typeof item.text === 'string') parts.push(item.text);
    else if (item?.type) parts.push(`[${String(item.type)} content omitted]`);
  }
  const whole = parts.join('\n');
  const truncated = whole.length > MCP_MAX_TEXT_CHARS;
  return {
    isError: result.isError === true,
    text: truncated ? whole.slice(0, MCP_MAX_TEXT_CHARS) : whole,
    truncated,
    ...(result.structuredContent !== undefined && JSON.stringify(result.structuredContent).length <= MCP_MAX_TEXT_CHARS
      ? { structured: result.structuredContent } : {}),
  };
}
