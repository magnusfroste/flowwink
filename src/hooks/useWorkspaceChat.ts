import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export type WorkspaceSource =
  | 'documents'
  | 'contracts'
  | 'kb'
  | 'pages'
  | 'crm'
  | 'employees';

export const ALL_WORKSPACE_SOURCES: WorkspaceSource[] = [
  'documents',
  'contracts',
  'kb',
  'pages',
  'crm',
  'employees',
];

export interface WorkspaceCitation {
  ref: number;
  type: string;
  id: string;
  title: string;
  url?: string;
}

export interface WorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: WorkspaceCitation[];
  createdAt: string;
}

export type CoworkMode = 'strict' | 'cowork';

export interface ContextMeta {
  tokens_used: number;
  tokens_budget: number;
  sources_active: number;
  sources_truncated: string[];
  per_source: Record<string, number>;
}

interface UseWorkspaceChatOpts {
  sources: WorkspaceSource[];
  mode?: CoworkMode;
  onError?: (msg: string) => void;
  onPersistUser?: (text: string) => Promise<void> | void;
  onPersistAssistant?: (text: string, citations: WorkspaceCitation[]) => Promise<void> | void;
  onFirstMessage?: (text: string) => Promise<string | null> | string | null;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workspace-chat`;

export function useWorkspaceChat({ sources, mode, onError, onPersistUser, onPersistAssistant, onFirstMessage }: UseWorkspaceChatOpts) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastContextMeta, setLastContextMeta] = useState<ContextMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setLastContextMeta(null);
  }, []);

  const loadHistory = useCallback((msgs: WorkspaceMessage[]) => {
    abortRef.current?.abort();
    setMessages(msgs);
    setLastContextMeta(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || isStreaming) return;

      // First-message hook (e.g. create a session, return its id) — fire and continue.
      if (messages.length === 0 && onFirstMessage) {
        try { await onFirstMessage(trimmed); } catch (e) { logger.error('onFirstMessage failed', e); }
      }
      if (onPersistUser) {
        try { await onPersistUser(trimmed); } catch (e) { logger.error('onPersistUser failed', e); }
      }

      const userMsg: WorkspaceMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      const assistantId = crypto.randomUUID();
      let assistantContent = '';
      let assistantCitations: WorkspaceCitation[] = [];

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        },
      ]);
      setIsStreaming(true);

      const upsertAssistant = (chunk: string) => {
        assistantContent += chunk;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: assistantContent } : m,
          ),
        );
      };

      const setCitations = (cits: WorkspaceCitation[]) => {
        assistantCitations = cits;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, citations: cits } : m,
          ),
        );
      };

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          throw new Error('Not authenticated');
        }

        abortRef.current = new AbortController();

        const historyForApi = [...messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const resp = await fetch(ENDPOINT, {
          method: 'POST',
          signal: abortRef.current.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: historyForApi,
            sources,
            ...(mode ? { mode } : {}),
          }),
        });

        if (!resp.ok || !resp.body) {
          const text = await resp.text();
          let errMsg = `Request failed (${resp.status})`;
          try {
            const j = JSON.parse(text);
            if (j?.error) errMsg = j.error;
          } catch {
            /* ignore */
          }
          throw new Error(errMsg);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);

            if (line === '') {
              currentEvent = null;
              continue;
            }
            if (line.startsWith(':')) continue;

            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
              continue;
            }

            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                continue;
              }

              if (currentEvent === 'citations') {
                try {
                  const cits = JSON.parse(data);
                  if (Array.isArray(cits)) setCitations(cits);
                } catch (err) {
                  logger.error('parse citations failed', err);
                }
                continue;
              }

              if (currentEvent === 'context_meta') {
                try {
                  const meta = JSON.parse(data) as ContextMeta;
                  setLastContextMeta(meta);
                } catch (err) {
                  logger.error('parse context_meta failed', err);
                }
                continue;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length > 0) {
                  upsertAssistant(delta);
                }
              } catch {
                // partial JSON — put back
                buffer = line + '\n' + buffer;
                break;
              }
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // user stopped — fine
        } else {
          const msg = err?.message || 'Workspace chat failed';
          logger.error('workspace chat error', err);
          onError?.(msg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: assistantContent || `⚠️ ${msg}` }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        // Final flush so citations stay attached
        if (assistantCitations.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, citations: assistantCitations, content: assistantContent }
                : m,
            ),
          );
        }
        if (onPersistAssistant && assistantContent) {
          try { await onPersistAssistant(assistantContent, assistantCitations); } catch (e) { logger.error('onPersistAssistant failed', e); }
        }
      }
    },
    [messages, sources, mode, isStreaming, onError, onPersistUser, onPersistAssistant, onFirstMessage],
  );

  /**
   * Re-run the last user message. Drops the trailing assistant turn(s) first
   * so the new response replaces the old one.
   */
  const regenerate = useCallback(() => {
    setMessages((prev) => {
      // Find the last user message
      let lastUserIdx = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx === -1) return prev;
      const lastUserText = prev[lastUserIdx].content;
      // Strip everything from the last user message onward, then re-send.
      const trimmed = prev.slice(0, lastUserIdx);
      // Defer send to next tick so state settles
      queueMicrotask(() => { void send(lastUserText); });
      return trimmed;
    });
  }, [send]);

  return { messages, isStreaming, send, stop, reset, loadHistory, lastContextMeta, regenerate };
}
