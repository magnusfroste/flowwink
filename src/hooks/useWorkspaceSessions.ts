import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface WorkspaceSession {
  id: string;
  title: string;
  updatedAt: string;
}

const SCOPE = 'internal';

export function useWorkspaceSessions() {
  const [sessions, setSessions] = useState<WorkspaceSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setSessions([]);
        return;
      }
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('id, title, updated_at')
        .eq('user_id', auth.user.id)
        .eq('scope', SCOPE)
        .order('updated_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setSessions(
        (data || []).map((r: any) => ({
          id: r.id,
          title: r.title || 'Untitled chat',
          updatedAt: r.updated_at,
        })),
      );
    } catch (err) {
      logger.error('load sessions failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSession = useCallback(async (title: string): Promise<string | null> => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from('chat_conversations')
        .insert({
          user_id: auth.user.id,
          scope: SCOPE,
          title: title.slice(0, 80),
          session_id: crypto.randomUUID(),
        })
        .select('id')
        .single();
      if (error) throw error;
      await refresh();
      return data.id;
    } catch (err) {
      logger.error('create session failed', err);
      return null;
    }
  }, [refresh]);

  const renameSession = useCallback(async (id: string, title: string) => {
    try {
      await supabase
        .from('chat_conversations')
        .update({ title: title.slice(0, 80) })
        .eq('id', id);
      await refresh();
    } catch (err) {
      logger.error('rename session failed', err);
    }
  }, [refresh]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await supabase.from('chat_messages').delete().eq('conversation_id', id);
      await supabase.from('chat_conversations').delete().eq('id', id);
      await refresh();
    } catch (err) {
      logger.error('delete session failed', err);
    }
  }, [refresh]);

  const loadMessages = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, metadata, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []).map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        citations: m.metadata?.citations,
        createdAt: m.created_at,
      }));
    } catch (err) {
      logger.error('load messages failed', err);
      return [];
    }
  }, []);

  const appendMessage = useCallback(
    async (
      conversationId: string,
      role: 'user' | 'assistant',
      content: string,
      metadata?: Record<string, unknown>,
    ) => {
      try {
        await supabase.from('chat_messages').insert({
          conversation_id: conversationId,
          role,
          content,
          metadata: metadata || {},
          source: 'cowork',
        });
        await supabase
          .from('chat_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId);
      } catch (err) {
        logger.error('append message failed', err);
      }
    },
    [],
  );

  return {
    sessions,
    loading,
    refresh,
    createSession,
    renameSession,
    deleteSession,
    loadMessages,
    appendMessage,
  };
}
