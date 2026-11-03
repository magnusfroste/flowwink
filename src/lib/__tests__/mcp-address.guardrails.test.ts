/**
 * The gateway at the site's own /mcp — the address shape every other
 * integration uses. The proxy forwards what Streamable HTTP needs, the route
 * sits before the HTML catch-all (which would otherwise swallow an
 * extension-less /mcp), and the admin shows the short form only where it
 * answers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mcpAddresses, pickMcpUrl } from '@/lib/mcp-address';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('/mcp on the site domain', () => {
  it('the Vercel route reaches the proxy before the HTML catch-all, with a duration window', () => {
    const v = JSON.parse(read('vercel.json')) as { routes: Array<{ src: string; dest?: string }>; functions?: Record<string, { maxDuration?: number }> };
    const mcp = v.routes.findIndex((r) => r.src === '/mcp(?:/(.*))?');
    const html = v.routes.findIndex((r) => r.dest?.startsWith('/api/html'));
    expect(mcp).toBeGreaterThan(-1);
    expect(html).toBeGreaterThan(mcp);
    expect(v.routes[mcp].dest).toBe('/api/mcp?path=$1');
    expect(v.functions?.['api/mcp.ts']?.maxDuration).toBe(60);
  });
  it('the proxy streams, keeps the query and the headers, strips the hop-by-hop ones, and stamps itself', () => {
    const src = read('api/mcp.ts');
    expect(src).not.toMatch(/runtime: 'edge'/); // 25 s first-byte cap would cut a long tools/call
    expect(src).toMatch(/const target = `\$\{base\}\/functions\/v1\/mcp-server\$\{sub \? `\/\$\{sub\}` : ''\}\$\{url\.search\}`/);
    expect(src).toMatch(/url\.searchParams\.delete\('path'\)/);
    expect(src).toMatch(/body: hasBody \? req\.body : undefined/);
    expect(src).toMatch(/return new Response\(upstream\.body, \{ status: upstream\.status/);
    expect(src).toMatch(/HOP_BY_HOP = new Set\(\['host', 'connection'/);
    expect(src).toMatch(/out\.set\('X-FlowWink-MCP', 'proxy'\)/);
    expect(src).not.toMatch(/await upstream\.text\(\)/);
    // The Web-standard export shape: a bare default function is the LEGACY
    // (req, res) signature on Vercel's Node runtime and crashes this handler.
    expect(src).toMatch(/export default \{ fetch: handler \};/);
    expect(src).not.toMatch(/export default async function/);
  });
  it('the address rule: the site form off localhost, the functions form always, the probe decides', () => {
    const a = mcpAddresses('https://www.autoversio.ai', 'https://abc.supabase.co/');
    expect(a).toEqual({ site: 'https://www.autoversio.ai/mcp', functions: 'https://abc.supabase.co/functions/v1/mcp-server' });
    expect(mcpAddresses('http://localhost:8080', 'https://abc.supabase.co').site).toBeNull();
    expect(pickMcpUrl(a, true)).toEqual({ url: 'https://www.autoversio.ai/mcp', via: 'site' });
    expect(pickMcpUrl(a, false)).toEqual({ url: 'https://abc.supabase.co/functions/v1/mcp-server', via: 'functions' });
    expect(pickMcpUrl(a, null).via).toBe('functions');
  });
  it('the admin surfaces read the probed address, and the docs lead with the short form', () => {
    for (const f of ['src/pages/admin/ApiKeysPage.tsx', 'src/pages/admin/ContentApiPage.tsx', 'src/components/admin/agents/ConnectAgentWizard.tsx']) {
      expect(read(f), f).toMatch(/useMcpAddress\(\)/);
    }
    expect(read('src/pages/admin/ApiKeysPage.tsx')).not.toMatch(/your-project\.supabase\.co/);
    expect(read('docs/agents/README.md')).toMatch(/POST https:\/\/<your-site>\/mcp\n/);
    expect(read('nginx.conf')).toMatch(/location \/mcp \{/);
  });
});
