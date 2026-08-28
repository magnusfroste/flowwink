import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { StagedResolution } from '@/lib/staged-action-outcome';

export type { StagedResolution };

export type WorkspaceSource =
  | 'documents'
  | 'contracts'
  | 'kb'
  | 'pages'
  | 'crm'
  | 'employees'
  | 'wiki'
  | 'handbook'
  | 'flowtable';

export const ALL_WORKSPACE_SOURCES: WorkspaceSource[] = [
  'documents',
  'contracts',
  'kb',
  'pages',
  'crm',
  'employees',
  'wiki',
  'handbook',
  'flowtable',
];

export interface WorkspaceCitation {
  ref: number;
  type: string;
  id: string;
  title: string;
  url?: string;
}

export interface ConsultedSkill {
  skill: string;
  ok: boolean;
  ms: number;
}

/** A write the assistant prepared. A human click executes it — never the model. */
export interface StagedAction {
  operation_id: string;
  skill: string;
  args: Record<string, unknown>;
  reinvoke_args: Record<string, unknown>;
  preview?: unknown;
  /** Server-side name→uuid substitutions, shown on the card. */
  resolved?: string[];
  /**
   * Outcome — DERIVED from `pending_operations`, never authored here and never
   * persisted onto the chat row. Undefined means "still awaiting a decision".
   * See src/lib/staged-action-outcome.ts.
   */
  resolution?: StagedResolution;
  result_note?: string;
}

export interface WorkspaceMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: WorkspaceCitation[];
  /** Live skills the assistant executed to ground this answer. */
  consulted?: ConsultedSkill[];
  /** Writes staged for approval in this turn. */
  staged?: StagedAction[];
  createdAt: string;
}

export type CoworkMode = 'strict' | 'cowork';

export interface ContextMeta {
  tokens_used: number;
  tokens_budget: number;
  sources_active: number;
  sources_truncated: string[];
  per_source: Record<string, number>;
  // ── History-window half (Model Context Window Guard) — optional so old
  // edge deploys that don't send them keep parsing. ──
  /** Estimated total prompt: system + soul + retrieval + history (~chars/4). */
  prompt_tokens_est?: number;
  /** The resolved model's context window (conservative when unknown). */
  window_tokens?: number;
  /** False when the window is a conservative guess — indicator shows "~". */
  window_known?: boolean;
  /** True when older turns were compressed into a session distillate. */
  history_distilled?: boolean;
  /** Raw messages dropped (oldest first) by the hard cap. */
  history_dropped?: number;
}

interface UseWorkspaceChatOpts {
  sources: WorkspaceSource[];
  mode?: CoworkMode;
  onError?: (msg: string) => void;
  onPersistUser?: (text: string) => Promise<void> | void;
  onPersistAssistant?: (
    text: string,
    citations: WorkspaceCitation[],
    staged: StagedAction[],
  ) => Promise<void> | void;
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

  /**
   * Paint an outcome the card just derived from `pending_operations`.
   *
   * This is presentation only — it copies what the operation row already says
   * so the user sees it without a refetch. The durable truth stays in
   * `pending_operations`, and `loadMessages` re-derives it on every reload.
   */
  const resolveStaged = useCallback(
    (messageId: string, operationId: string, resolution: StagedResolution, note?: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId && m.staged
            ? {
                ...m,
                staged: m.staged.map((a) =>
                  a.operation_id === operationId ? { ...a, resolution, result_note: note } : a,
                ),
              }
            : m,
        ),
      );
    },
    [],
  );

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
      let assistantStaged: StagedAction[] = [];

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

              if (currentEvent === 'staged') {
                try {
                  const st = JSON.parse(data);
                  if (Array.isArray(st)) {
                    assistantStaged = st as StagedAction[];
                    setMessages((prev) =>
                      prev.map((m) => (m.id === assistantId ? { ...m, staged: st } : m)),
                    );
                  }
                } catch (err) {
                  logger.error('parse staged failed', err);
                }
                continue;
              }

              if (currentEvent === 'consulted') {
                try {
                  const cs = JSON.parse(data);
                  if (Array.isArray(cs)) {
                    setMessages((prev) =>
                      prev.map((m) => (m.id === assistantId ? { ...m, consulted: cs } : m)),
                    );
                  }
                } catch (err) {
                  logger.error('parse consulted failed', err);
                }
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
        // Persist even a contentless turn when it staged something: the
        // approval card is the message. Dropping it here is how an approved
        // write lost its card (and its diagnosis) on the next reload.
        if (onPersistAssistant && (assistantContent || assistantStaged.length > 0)) {
          try { await onPersistAssistant(assistantContent, assistantCitations, assistantStaged); } catch (e) { logger.error('onPersistAssistant failed', e); }
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

  return {
    resolveStaged, messages, isStreaming, send, stop, reset, loadHistory, lastContextMeta, regenerate };
}
