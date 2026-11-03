/**
 * The MCP gateway at the site's own address: https://<site>/mcp
 *
 * The convention the integrations an operator sees in Hermes, Claude or Cursor
 * follow (mcp.stripe.com, mcp.linear.app/mcp, mcp.notion.com/mcp) is the
 * vendor's OWN host with /mcp as the path. A FlowWink instance's gateway lived
 * only at <ref>.supabase.co/functions/v1/mcp-server — the backend vendor's
 * domain, long, and nothing a buyer recognises. This route gives every
 * instance (and every fork) the short form on its own domain at the next
 * deploy, with no DNS: /mcp and every subpath (/mcp/rest/execute,
 * /mcp/rest/groups) are proxied to the instance's mcp-server, query string
 * (?mode=dispatch, ?groups=) and headers (Authorization, x-api-key,
 * Mcp-Session-Id, Accept) intact, the response streamed back as it comes —
 * Streamable HTTP's SSE answers included. A `mcp.<domain>` alias is the same
 * route behind one more domain on the Vercel project.
 *
 * Node runtime, not edge: an edge function must begin its response within
 * 25 s, and a tools/call that runs a long skill can take longer than that to
 * produce its first byte. maxDuration is set in vercel.json (60 s, the floor
 * every plan allows); a job longer than that goes to the functions URL
 * directly, which the admin pages still show beside this one.
 *
 * The marker header X-FlowWink-MCP tells the admin pages the short address
 * works on this deployment (useMcpAddress probes it); a Docker self-host
 * without the proxy keeps showing the functions URL.
 */
declare const process: { env: Record<string, string | undefined> };

const HOP_BY_HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'content-length']);

async function handler(req: Request): Promise<Response> {
  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) {
    return new Response(JSON.stringify({ error: 'This site has no backend configured; the MCP gateway is not reachable here.' }), {
      status: 503, headers: { 'Content-Type': 'application/json', 'X-FlowWink-MCP': 'unconfigured' },
    });
  }
  const url = new URL(req.url);
  // The route passes the subpath as ?path=; everything else in the query is the
  // caller's (?mode=dispatch, ?groups=crm) and travels on.
  const sub = (url.searchParams.get('path') || url.pathname.replace(/^\/mcp/, '')).replace(/^\/+/, '');
  url.searchParams.delete('path');
  const target = `${base}/functions/v1/mcp-server${sub ? `/${sub}` : ''}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v); });
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // A streamed request body needs this in Node's fetch.
      ...(hasBody ? { duplex: 'half' } : {}),
      redirect: 'manual',
    } as RequestInit);
  } catch (e) {
    return new Response(JSON.stringify({ error: `The gateway did not answer: ${e instanceof Error ? e.message : String(e)}`, retryable: true }), {
      status: 502, headers: { 'Content-Type': 'application/json', 'X-FlowWink-MCP': 'proxy' },
    });
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v); });
  out.set('X-FlowWink-MCP', 'proxy');
  out.set('Cache-Control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

// Vercel's Node runtime takes the Web-standard signature only as `{ fetch }`
// (or named GET/POST exports); a bare default function is called the legacy
// way, (req, res), and this handler then throws on req.headers.forEach —
// FUNCTION_INVOCATION_FAILED on flowwink.vercel.app the night it shipped.
export default { fetch: handler };
