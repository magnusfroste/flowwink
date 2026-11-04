/**
 * Does the MCP door answer? One real call, judged on the body.
 *
 * The lesson of 2026-11-04: the admin's address probe checked a header
 * (X-FlowWink-MCP on an OPTIONS) and handed every agent the site's /mcp — which
 * had answered plain JSON labelled gzip, or nothing at all, since the day it
 * shipped. A header says the route exists; only a decoded JSON-RPC answer says
 * the door works. So this POSTs `initialize` and reads the body:
 *
 *   - without a key: the gateway's 401 `{ error }` is the proof — the proxy
 *     carried a JSON body a client could decode. That is what the nightly
 *     regression asks of every site in the fleet (MCP_PROBE_SITES).
 *   - with a key: `initialize` must succeed and `tools/list` answer, and the
 *     tool count is reported — the "Test the connection" button in the
 *     Connect-agent wizard, and the admin's address probe.
 *
 * Pure over the global fetch (browser and Node alike); no platform imports.
 */
export interface McpProbeResult {
  /** The door answers: a decodable JSON-RPC body came back. */
  ok: boolean;
  status: number;
  /** The proxy's marker, when the address is the site's /mcp. */
  viaProxy: boolean;
  /** With a key: what the gateway calls itself. */
  serverName?: string;
  /** With a key: how many tools the client will see. */
  tools?: number;
  /** When not ok: what went wrong, for a person. */
  error?: string;
}

const INITIALIZE = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'flowwink-probe', version: '1' } },
};

function parseRpc(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!t) return null;
  // Streamable HTTP may answer as an event stream: the first data frame.
  const body = t.startsWith('event:') || t.startsWith('data:')
    ? (t.split('\n').find((l) => l.startsWith('data:')) ?? '').slice(5).trim()
    : t;
  try { return JSON.parse(body) as Record<string, unknown>; } catch { return null; }
}

async function call(url: string, key: string | undefined, payload: unknown): Promise<{ status: number; viaProxy: boolean; json: Record<string, unknown> | null; raw: string }> {
  // Identity, so nothing is decompressed on the way: Node's fetch forgives a
  // body labelled gzip that is not, and a broken door passed as fine through
  // it (optic, 2026-11-04) — asked for plain bytes, that door answers nothing,
  // which is a verdict. A browser drops the header and decodes strictly, so
  // the mislabel fails there by itself. Twenty seconds, or the probe would
  // hang on a door that never ends its answer (autoversio, the same day).
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Accept-Encoding': 'identity' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const viaProxy = res.headers.get('x-flowwink-mcp') === 'proxy';
  // A body labelled with an encoding it is not in throws here — the failure
  // Hermes saw ("error -3 while decompressing"); an empty body parses to null.
  const raw = await res.text();
  return { status: res.status, viaProxy, json: parseRpc(raw), raw };
}

export async function probeMcp(url: string, key?: string): Promise<McpProbeResult> {
  let first: Awaited<ReturnType<typeof call>>;
  try {
    first = await call(url, key, INITIALIZE);
  } catch (e) {
    return { ok: false, status: 0, viaProxy: false, error: `No decodable answer from ${url}: ${e instanceof Error ? e.message : String(e)}` };
  }
  const { status, viaProxy, json } = first;
  if (!json) {
    return { ok: false, status, viaProxy, error: status === 0 ? 'No answer' : `HTTP ${status} with ${first.raw.trim() ? 'a body that is not JSON' : 'an empty body'} — the address does not carry the gateway's answer` };
  }
  if (!key) {
    // The gateway refuses without a key, as it should; a JSON refusal through
    // the door is the proof the door works.
    const refused = status === 401 && typeof json.error === 'string';
    const answered = status === 200 && typeof json.result === 'object';
    return refused || answered
      ? { ok: true, status, viaProxy }
      : { ok: false, status, viaProxy, error: `HTTP ${status}: ${String(json.error ?? JSON.stringify(json)).slice(0, 200)}` };
  }
  if (status !== 200 || typeof json.result !== 'object' || !json.result) {
    const msg = typeof json.error === 'string' ? json.error : (json.error as { message?: string } | undefined)?.message;
    return { ok: false, status, viaProxy, error: `initialize → HTTP ${status}${msg ? `: ${msg}` : ''}` };
  }
  const serverName = ((json.result as { serverInfo?: { name?: string } }).serverInfo?.name) ?? undefined;
  try {
    const list = await call(url, key, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    const tools = (list.json?.result as { tools?: unknown[] } | undefined)?.tools;
    if (!Array.isArray(tools)) {
      const msg = (list.json?.error as { message?: string } | undefined)?.message;
      return { ok: false, status: list.status, viaProxy, serverName, error: `tools/list → HTTP ${list.status}${msg ? `: ${msg}` : ''}` };
    }
    return { ok: true, status: 200, viaProxy, serverName, tools: tools.length };
  } catch (e) {
    return { ok: false, status: 0, viaProxy, serverName, error: `tools/list failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
