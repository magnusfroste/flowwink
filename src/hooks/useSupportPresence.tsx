import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type AgentStatus = 'online' | 'away' | 'busy' | 'offline';

interface SupportAgent {
  id: string;
  user_id: string;
  status: AgentStatus;
  current_conversations: number;
  max_conversations: number;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

interface OnlineAgent {
  user_id: string;
  status: AgentStatus;
  available_slots: number;
  online_at: string;
}

export function useSupportPresence() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [onlineAgents, setOnlineAgents] = useState<OnlineAgent[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch current agent record
  const { data: agentRecord, isLoading: agentLoading } = useQuery({
    queryKey: ['support-agent', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('support_agents')
        .select('*')
        .eq('user_id', user.id)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return data as SupportAgent | null;
    },
    enabled: !!user?.id,
  });

  // Create agent record if doesn't exist
  const createAgentRecord = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('No user');
      
      const { data, error } = await supabase
        .from('support_agents')
        .insert({ user_id: user.id, status: 'offline' })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-agent', user?.id] });
    },
  });

  // Update agent status
  const updateStatus = useMutation({
    mutationFn: async (status: AgentStatus) => {
      if (!user?.id) throw new Error('No user');
      
      const { error } = await supabase
        .from('support_agents')
        .update({ 
          status, 
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
      
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ['support-agent', user?.id] });
    },
  });

  // Set up realtime presence
  useEffect(() => {
    if (!user?.id || !agentRecord) return;

    const channel = supabase.channel('support-presence', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const agents: OnlineAgent[] = [];
        
        Object.entries(state).forEach(([key, presences]) => {
          const presence = presences[0] as any;
          if (presence) {
            agents.push({
              user_id: key,
              status: presence.status,
              available_slots: presence.available_slots,
              online_at: presence.online_at,
            });
          }
        });
        
        setOnlineAgents(agents);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('Agent joined:', key);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('Agent left:', key);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          
          // Only track if agent is online
          if (agentRecord.status !== 'offline') {
            await channel.track({
              status: agentRecord.status,
              available_slots: agentRecord.max_conversations - agentRecord.current_conversations,
              online_at: new Date().toISOString(),
            });
          }
        }
      });

    return () => {
      channel.unsubscribe();
      setIsConnected(false);
    };
  }, [user?.id, agentRecord?.status]);

  // Go online
  const goOnline = useCallback(async () => {
    if (!agentRecord) {
      await createAgentRecord.mutateAsync();
    }
    await updateStatus.mutateAsync('online');
  }, [agentRecord, createAgentRecord, updateStatus]);

  // Go offline
  const goOffline = useCallback(async () => {
    await updateStatus.mutateAsync('offline');
  }, [updateStatus]);

  // Set away
  const setAway = useCallback(async () => {
    await updateStatus.mutateAsync('away');
  }, [updateStatus]);

  // Set busy
  const setBusy = useCallback(async () => {
    await updateStatus.mutateAsync('busy');
  }, [updateStatus]);

  return {
    agentRecord,
    agentLoading,
    onlineAgents,
    isConnected,
    goOnline,
    goOffline,
    setAway,
    setBusy,
    updateStatus: updateStatus.mutate,
    isUpdating: updateStatus.isPending,
  };
}

// Hook to get all online agents (for routing)
export function useOnlineAgents() {
  return useQuery({
    queryKey: ['online-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_agents')
        .select('*')
        .in('status', ['online', 'away'])
        .order('current_conversations', { ascending: true });
      
      if (error) throw error;
      return data as SupportAgent[];
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}
