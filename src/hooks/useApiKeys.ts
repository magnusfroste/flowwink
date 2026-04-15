import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_raw: string | null;
  scopes: string[];
  created_by: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, key_prefix, key_raw, scopes, created_by, last_used_at, expires_at, created_at')
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

      const { error } = await supabase.from('api_keys').insert({
        name: input.name,
        key_hash: hash,
        key_prefix: prefix,
        key_raw: raw,
        scopes: input.scopes ?? [],
        expires_at: input.expires_at ?? null,
        created_by: user?.id ?? null,
      } as any);

      if (error) throw error;
      return raw; // Return the raw key (shown once)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: () => toast.error('Failed to create API key'),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('api_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    },
    onError: () => toast.error('Failed to revoke API key'),
  });
}
