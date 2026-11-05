import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_by: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  /** Set when a person or the platform took the key out of service — see src/lib/key-state.ts. */
  revoked_at: string | null;
  created_at: string;
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      // There is no raw key to select (the column was dropped 2026-10-08) — the full key is shown ONCE at creation and only
      // its hash is stored. Listing just the prefix keeps the secret off the DB
      // read path (and out of any cached query state).
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, scopes, created_by, last_used_at, expires_at, revoked_at, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as ApiKey[];
    },
  });
}

async function sha256(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'fwk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; scopes?: string[]; expires_at?: string }) => {
      const raw = generateApiKey();
      const hash = await sha256(raw);
      const prefix = raw.slice(0, 12);

      const { data: { user } } = await supabase.auth.getUser();

      // Store ONLY the hash + prefix — never the raw key. The caller shows the
      // returned raw once; after that it is unrecoverable (regenerate to rotate).
      const { error } = await supabase.from('api_keys').insert({
        name: input.name,
        key_hash: hash,
        key_prefix: prefix,
        scopes: input.scopes ?? [],
        expires_at: input.expires_at ?? null,
        created_by: user?.id ?? null,
      } as any);

      if (error) throw error;
      return raw; // Return the raw key (shown once, never persisted)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: () => toast.error('Failed to create API key'),
  });
}

/**
 * Revoke = take the key out of service, keep the row. The RPC marks the key
 * revoked, stops it in the gateway and flips every agent that holds it to
 * `revoked` — the same thing /admin/agents' Revoke does (revoke_agent), so the
 * two pages can never tell different stories about one key.
 */
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('revoke_api_key' as never, { p_key_id: id } as never);
      if (error) throw error;
      return data as { success: boolean; name: string; agents_revoked: number };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      qc.invalidateQueries({ queryKey: ['connected-agents'] });
      toast.success(r?.agents_revoked ? `API key revoked — ${r.agents_revoked} agent${r.agents_revoked === 1 ? '' : 's'} with it` : 'API key revoked');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to revoke API key'),
  });
}

/**
 * Delete = remove the row. Only for a key that is already out of service
 * (revoked or expired); the page never offers it for an active key. An agent
 * that held the key keeps its row (api_key_id → NULL) and its history.
 */
export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('api_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      qc.invalidateQueries({ queryKey: ['connected-agents'] });
      toast.success('API key deleted');
    },
    onError: () => toast.error('Failed to delete API key'),
  });
}
