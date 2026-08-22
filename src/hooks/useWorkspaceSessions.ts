import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  outcomeFromPendingOperation,
  type PendingOperationOutcomeRow,
} from '@/lib/staged-action-outcome';
import type { StagedAction, WorkspaceMessage } from '@/hooks/useWorkspaceChat';

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

  /**
   * Rehydrate a session — including the outcome of anything that was staged.
   *
   * The chat row stores only WHAT was staged. WHAT HAPPENED is read back from
   * `pending_operations`, the one writer of that truth, so a reload can never
   * turn a failed execution back into "väntar på ditt beslut".
   */
  const loadMessages = useCallback(async (id: string): Promise<WorkspaceMessage[]> => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, role, content, metadata, created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const msgs: WorkspaceMessage[] = (data || []).map((m: any) => {
        const staged = Array.isArray(m.metadata?.staged)
          ? (m.metadata.staged as StagedAction[]).filter((a) => a?.operation_id)
          : undefined;
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          citations: m.metadata?.citations,
          ...(staged?.length ? { staged } : {}),
          createdAt: m.created_at,
        };
      });

      const opIds = [
        ...new Set(msgs.flatMap((m) => m.staged?.map((a) => a.operation_id) ?? [])),
      ];
      if (opIds.length === 0) return msgs;

      const { data: ops, error: opErr } = await supabase
        .from('pending_operations')
        .select('id, status, execution_result, rejection_reason, expires_at')
        .in('id', opIds);
      // A read failure is not evidence of anything — leave the cards as they
      // were staged rather than inventing an outcome.
      if (opErr) {
        logger.error('load staged outcomes failed', opErr);
        return msgs;
      }

      const byId = new Map<string, PendingOperationOutcomeRow>(
        (ops || []).map((o) => [o.id, o as PendingOperationOutcomeRow]),
      );
      return msgs.map((m) =>
        m.staged
          ? {
              ...m,
              staged: m.staged.map((a) => {
                const outcome = outcomeFromPendingOperation(byId.get(a.operation_id));
                // Never carry a stale resolution in from metadata: the row is
                // the authority, and "no outcome yet" must clear the field.
                const { resolution: _r, result_note: _n, ...rest } = a;
                return outcome
                  ? { ...rest, resolution: outcome.resolution, result_note: outcome.note }
                  : rest;
              }),
            }
          : m,
      );
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
        await supabase.from('chat_messages').insert([{
          conversation_id: conversationId,
          role,
          content,
          metadata: (metadata || {}) as any,
          source: 'cowork',
        }]);
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
