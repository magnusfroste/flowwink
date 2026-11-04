import { useQuery } from '@tanstack/react-query';
import { mcpAddresses, pickMcpUrl } from '@/lib/mcp-address';
import { probeMcp } from '@/lib/mcp-probe';

/**
 * Which address of the MCP gateway to show on this deployment. Probes the
 * site's /mcp once with a real `initialize` (no key — the gateway's JSON
 * refusal through the proxy is the proof; an OPTIONS header was the earlier
 * probe, and it passed a door that answered nothing a client could decode,
 * 2026-11-04). While the probe is in flight, the functions URL — always valid
 * — is shown; the short form replaces it when the door answered. Law 4: the
 * feature works where it works, nobody flips a flag.
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
      const r = await probeMcp(addresses.site as string);
      return r.ok && r.viaProxy;
    },
  });
  const picked = pickMcpUrl(addresses, probe.data ?? null);
  return { ...picked, site: addresses.site, functions: addresses.functions, probing: probe.isLoading };
}
