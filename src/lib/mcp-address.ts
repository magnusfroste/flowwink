/**
 * The two addresses of one gateway.
 *
 * `site` is the convention an operator recognises from every other integration
 * (mcp.stripe.com, mcp.linear.app/mcp): the company's own domain, /mcp. It is
 * served by api/mcp.ts on Vercel and answers with the X-FlowWink-MCP header;
 * a Docker self-host without that proxy has only `functions`, the Supabase
 * address the gateway has always had. Both carry ?mode=dispatch and ?groups=.
 */
export interface McpAddresses {
  /** https://www.example.com/mcp — the short form, when the deployment serves it. */
  site: string | null;
  /** https://<ref>.supabase.co/functions/v1/mcp-server — always valid. */
  functions: string;
}

export const MCP_PROXY_HEADER = 'x-flowwink-mcp';

export function mcpAddresses(origin: string | null | undefined, supabaseUrl: string | null | undefined): McpAddresses {
  const base = String(supabaseUrl || '').replace(/\/+$/, '');
  const o = String(origin || '').replace(/\/+$/, '');
  // localhost and 127.0.0.1 are the Vite dev server: no api/ routes there.
  const site = o && /^https?:\/\//.test(o) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(o) ? `${o}/mcp` : null;
  return { site, functions: base ? `${base}/functions/v1/mcp-server` : '' };
}

/** The address to show: the site's when its proxy answered, else the functions URL. */
export function pickMcpUrl(a: McpAddresses, siteProxyAnswers: boolean | null): { url: string; via: 'site' | 'functions' } {
  return a.site && siteProxyAnswers ? { url: a.site, via: 'site' } : { url: a.functions, via: 'functions' };
}
