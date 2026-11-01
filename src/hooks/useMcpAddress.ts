import { useQuery } from '@tanstack/react-query';
import { MCP_PROXY_HEADER, mcpAddresses, pickMcpUrl } from '@/lib/mcp-address';

/**
 * Which address of the MCP gateway to show on this deployment. Probes the
 * site's /mcp once (an OPTIONS the gateway's CORS handler answers 204; the
 * proxy stamps X-FlowWink-MCP on it). While the probe is in flight, the
 * functions URL — always valid — is shown; the short form replaces it when the
 * proxy answered. Law 4: the feature works where it works, nobody flips a flag.
 */
export function useMcpAddress(): { url: string; via: 'site' | 'functions'; site: string | null; functions: string; probing: boolean } {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const addresses = mcpAddresses(origin, import.meta.env.VITE_SUPABASE_URL);
  const probe = useQuery({
    queryKey: ['mcp-address-probe', addresses.site],
    enabled: !!addresses.site,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      try {
        const r = await fetch(addresses.site as string, { method: 'OPTIONS', cache: 'no-store' });
        return r.headers.get(MCP_PROXY_HEADER) === 'proxy';
      } catch {
        return false;
      }
    },
  });
  const picked = pickMcpUrl(addresses, probe.data ?? null);
  return { ...picked, site: addresses.site, functions: addresses.functions, probing: probe.isLoading };
}
