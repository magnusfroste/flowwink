import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/slugify';

/**
 * Connected agents — the people's own MCP clients (Claude, ChatGPT, Cursor, …)
 * and FlowPilot's helpers (OpenClaw), each a row in a2a_peers with an owner.
 * Admins (the federation module) see every agent; everyone else sees their own
 * through RLS, so the same hooks serve /admin/agents and /account/agents.
 */

export interface ConnectedAgent {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'revoked';
  client_kind: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  toolset_groups: string[];
  api_key_id: string | null;
  key_prefix: string | null;
  last_used_at: string | null;
  last_seen_at: string | null;
  request_count: number;
  mission_name: string | null;
  created_at: string;
}

export function useConnectedAgents() {
  return useQuery({
    queryKey: ['connected-agents'],
    queryFn: async (): Promise<ConnectedAgent[]> => {
      const { data, error } = await supabase
        .from('a2a_peers')
        .select('id, name, status, client_kind, owner_user_id, toolset_groups, api_key_id, last_seen_at, request_count, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // owner_user_id / client_kind are newer than the generated types; the shape is the row's.
      const peers = (data ?? []) as unknown as Array<Omit<ConnectedAgent, 'owner_name' | 'owner_email' | 'key_prefix' | 'last_used_at' | 'mission_name'>>;
      if (peers.length === 0) return [];

      const ownerIds = [...new Set(peers.map((p) => p.owner_user_id).filter(Boolean))] as string[];
      const keyIds = [...new Set(peers.map((p) => p.api_key_id).filter(Boolean))] as string[];
      const peerIds = peers.map((p) => p.id);
      const [owners, keys, missions] = await Promise.all([
        ownerIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', ownerIds) : Promise.resolve({ data: [], error: null }),
        keyIds.length ? supabase.from('api_keys').select('id, key_prefix, last_used_at').in('id', keyIds) : Promise.resolve({ data: [], error: null }),
        supabase.from('federation_peer_missions').select('peer_id, mission_name').in('peer_id', peerIds),
      ]);
      // A reader without the federation module cannot see other people's profiles or
      // keys; that is RLS doing its job, not a failure of the list. Say so, keep going.
      if (owners.error) logger.warn('[agents] owner profiles unreadable', owners.error);
      if (keys.error) logger.warn('[agents] key metadata unreadable', keys.error);
      if (missions.error) logger.warn('[agents] missions unreadable', missions.error);
      const ownerMap = new Map((owners.data ?? []).map((o: { id: string; full_name: string | null; email: string | null }) => [o.id, o]));
      const keyMap = new Map((keys.data ?? []).map((k: { id: string; key_prefix: string | null; last_used_at: string | null }) => [k.id, k]));
      const missionMap = new Map((missions.data ?? []).map((m: { peer_id: string; mission_name: string | null }) => [m.peer_id, m.mission_name]));
      return peers.map((p) => {
        const o = p.owner_user_id ? ownerMap.get(p.owner_user_id) : undefined;
        const k = p.api_key_id ? keyMap.get(p.api_key_id) : undefined;
        return {
          ...p,
          toolset_groups: Array.isArray(p.toolset_groups) ? p.toolset_groups : [],
          owner_name: o?.full_name ?? null,
          owner_email: o?.email ?? null,
          key_prefix: k?.key_prefix ?? null,
          last_used_at: k?.last_used_at ?? null,
          mission_name: missionMap.get(p.id) ?? null,
        };
      });
    },
  });
}

export function useRevokeAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (peerId: string) => {
      const { data, error } = await supabase.rpc('revoke_agent' as never, { p_peer_id: peerId } as never);
      if (error) throw error;
      return data as { success: boolean; name: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connected-agents'] }),
  });
}

export interface ConnectAgentInput {
  name: string;
  clientKind: string;
  /** Admins may connect an agent for a colleague; omitted = the signed-in user. */
  ownerUserId?: string | null;
  missionId: string;
  missionName: string;
  instructions: string;
  focusResources: string[];
  /** Empty = full access within the owner's reach. */
  toolsetGroups: string[];
}

export interface ConnectAgentResult {
  peerId: string;
  rawKey: string;
  mcpUrl: string;
  ownerUserId: string | null;
}

/** Mints the key + agent row through federation-invite-peer with the signed-in user's JWT. */
export function useConnectAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectAgentInput): Promise<ConnectAgentResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sign in first');
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${base}/functions/v1/federation-invite-peer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          invitee_name: input.name,
          invitee_description: `MCP Agent: ${input.missionName}`,
          invitee_url: `https://${slugify(input.name) || 'agent'}.local`,
          owner_user_id: input.ownerUserId ?? undefined,
          client_kind: input.clientKind,
          toolset_groups: input.toolsetGroups,
          mission_id: input.missionId,
          mission_name: input.missionName,
          instructions: input.instructions,
          focus_resources: input.focusResources,
          focus_tools: [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not connect the agent (HTTP ${res.status})`);
      const rawKey: string | undefined = body.credentials?.mcp_api_key;
      if (!rawKey) throw new Error('No key came back');
      return {
        peerId: String(body.peer?.id ?? body.peer_id ?? ''),
        rawKey,
        mcpUrl: `${base}/functions/v1/mcp-server`,
        ownerUserId: body.owner_user_id ?? input.ownerUserId ?? null,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connected-agents'] }),
  });
}
