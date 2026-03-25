import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface A2APeer {
  id: string;
  name: string;
  url: string;
  outbound_token: string;
  inbound_token_hash: string | null;
  status: 'active' | 'paused' | 'revoked';
  capabilities: unknown;
  last_seen_at: string | null;
  request_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface A2AActivity {
  id: string;
  peer_id: string;
  direction: 'inbound' | 'outbound';
  skill_name: string | null;
  input: unknown;
  output: unknown;
  status: 'success' | 'error' | 'pending';
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export function useA2APeers() {
  return useQuery({
    queryKey: ['a2a-peers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('a2a_peers' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as A2APeer[];
    },
  });
}

export function useA2AActivity(limit = 50) {
  return useQuery({
    queryKey: ['a2a-activity', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('a2a_activity' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as unknown as A2AActivity[];
    },
    refetchInterval: 30000,
  });
}

export function useCreateA2APeer() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { name: string; url?: string; outbound_token?: string; inbound_token?: string }) => {
      // Hash the inbound token if provided (token peer sends TO us)
      let hashedToken: string | null = null;
      if (input.inbound_token) {
        const encoder = new TextEncoder();
        const data = encoder.encode(input.inbound_token);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        hashedToken = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      }

      const insertData: Record<string, unknown> = {
        name: input.name,
        url: input.url ? input.url.replace(/\/$/, '') : '',
        inbound_token_hash: hashedToken,
      };

      // If user provides the peer's API key, use it as outbound token
      if (input.outbound_token) {
        insertData.outbound_token = input.outbound_token;
      }

      const { data, error } = await supabase
        .from('a2a_peers' as any)
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as A2APeer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a2a-peers'] });
      toast({ title: 'Peer created', description: 'Share the outbound token with your peer.' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: 'Failed to create peer', variant: 'destructive' });
    },
  });
}

export function useUpdateA2APeer() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { id: string; status?: string; name?: string; url?: string }) => {
      const { id, ...updates } = input;
      const { error } = await supabase
        .from('a2a_peers' as any)
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a2a-peers'] });
      toast({ title: 'Updated', description: 'Peer settings saved.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update peer', variant: 'destructive' });
    },
  });
}

export function useRegenerateToken() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (peerId: string) => {
      // Generate new token client-side
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const newToken = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

      const { data, error } = await supabase
        .from('a2a_peers' as any)
        .update({ outbound_token: newToken })
        .eq('id', peerId)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as A2APeer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['a2a-peers'] });
      toast({ title: 'Token regenerated', description: 'Share the new token with your peer.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to regenerate token', variant: 'destructive' });
    },
  });
}
