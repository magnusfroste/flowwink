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

interface UseWorkspaceChatOpts {
  sources: WorkspaceSource[];
  mode?: CoworkMode;
  onError?: (msg: string) => void;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workspace-chat`;

export function useWorkspaceChat({ sources, mode, onError }: UseWorkspaceChatOpts) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || isStreaming) return;

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
      }
    },
    [messages, sources, mode, isStreaming, onError],
  );

  return { messages, isStreaming, send, stop, reset };
}
