/**
 * useAgentOperate
 * 
 * Hook for FlowPilot "Operate" mode — chat-based CMS control
 * through the agent-execute skill engine.
 * 
 * Supports SSE streaming for token-by-token response rendering.
 * Conversations are persisted to chat_conversations/chat_messages.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AgentSkill, AgentActivity } from '@/types/agent';

export interface OperateMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  /** Tool execution status shown during streaming */
  toolStatus?: {
    phase: 'thinking' | 'executing' | 'streaming' | 'done';
    tools?: string[];
    iteration?: number;
  };
  skillResults?: Array<{
    skill: string;
    status: 'success' | 'pending_approval' | 'error';
    result?: unknown;
  }>;
  /** @deprecated Use skillResults instead */
  skillResult?: {
    skill: string;
    status: 'success' | 'pending_approval' | 'error';
    result?: unknown;
  };
}

const FLOWPILOT_CONVERSATION_KEY = 'flowpilot_conversation_id';
const OPERATE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-operate`;

// ─── SSE stream parser ────────────────────────────────────────────────────────

interface StreamCallbacks {
  onDelta: (content: string) => void;
  onToolStart: (tools: string[], iteration: number) => void;
  onToolDone: (tools: string[], iteration: number) => void;
  onSkillResults: (results: any[]) => Promise<void> | void;
  onError: (message: string) => void;
  onDone: () => void;
}

async function parseOperateStream(response: Response, callbacks: StreamCallbacks, signal?: AbortSignal) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.trim() === '' || line.startsWith(':')) continue;

        // Parse SSE event type
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();
          // Find next data line
          const dataIdx = buffer.indexOf('\n');
          if (dataIdx === -1) {
            // Put event line back, wait for more data
            buffer = line + '\n' + buffer;
            break;
          }
          let dataLine = buffer.slice(0, dataIdx);
          buffer = buffer.slice(dataIdx + 1);
          if (dataLine.endsWith('\r')) dataLine = dataLine.slice(0, -1);

          if (dataLine.startsWith('data: ')) {
            const jsonStr = dataLine.slice(6).trim();
            try {
              const data = JSON.parse(jsonStr);
              switch (eventType) {
                case 'delta':
                  if (data.content) callbacks.onDelta(data.content);
                  break;
                case 'tool_start':
                  callbacks.onToolStart(data.tools || [], data.iteration || 0);
                  break;
                case 'tool_done':
                  callbacks.onToolDone(data.tools || [], data.iteration || 0);
                  break;
                case 'skill_results':
                  await callbacks.onSkillResults(data);
                  break;
                case 'error':
                  callbacks.onError(data.message || 'Unknown error');
                  break;
                case 'done':
                  callbacks.onDone();
                  return;
              }
            } catch { /* ignore parse errors */ }
          }
          continue;
        }
      }
    }
  } finally {
    try { reader.cancel(); } catch { /* already closed */ }
  }
  callbacks.onDone();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface FlowPilotConversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export function useAgentOperate() {
  const [messages, setMessages] = useState<OperateMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<FlowPilotConversation[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Conversation persistence ───────────────────────────────────────

  const getOrCreateConversation = useCallback(async (): Promise<string> => {
    // If we already have an active conversation in state, use it
    const existingId = localStorage.getItem(FLOWPILOT_CONVERSATION_KEY);
    if (existingId && conversationId === existingId) return existingId;

    if (existingId) {
      const { data } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('id', existingId)
        .maybeSingle();
      if (data) {
        setConversationId(existingId);
        return existingId;
      }
    }

    // Try to find today's existing session
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayLabel = todayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const { data: { user } } = await supabase.auth.getUser();

    const { data: todaySession } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('conversation_status', 'active')
      .is('session_id', null)
      .eq('user_id', user?.id ?? '')
      .gte('created_at', todayStart.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (todaySession) {
      localStorage.setItem(FLOWPILOT_CONVERSATION_KEY, todaySession.id);
      setConversationId(todaySession.id);
      return todaySession.id;
    }

    // Create a new daily session
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        title: `Session — ${todayLabel}`,
        conversation_status: 'active',
        priority: 'normal',
        user_id: user?.id,
      })
      .select('id')
      .single();

    if (error) throw new Error('Failed to create conversation');
    
    localStorage.setItem(FLOWPILOT_CONVERSATION_KEY, data.id);
    setConversationId(data.id);
    return data.id;
  }, [conversationId]);

  const persistMessage = useCallback(async (convId: string, role: string, content: string, metadata?: any) => {
    await supabase.from('chat_messages').insert({
      conversation_id: convId,
      role,
      content,
      metadata: metadata || null,
    });
  }, []);

  // Load existing conversation on mount — auto-select today's session
  useEffect(() => {
    const loadExistingConversation = async () => {
      const existingId = localStorage.getItem(FLOWPILOT_CONVERSATION_KEY);
      
      if (existingId) {
        const { data: conv } = await supabase
          .from('chat_conversations')
          .select('id, created_at')
          .eq('id', existingId)
          .maybeSingle();

        if (conv) {
          // Check if stored conversation is from today — if so, use it
          const convDate = new Date(conv.created_at);
          const today = new Date();
          const isFromToday = convDate.toDateString() === today.toDateString();
          
          if (isFromToday) {
            setConversationId(existingId);
            const { data: msgs } = await supabase
              .from('chat_messages')
              .select('*')
              .eq('conversation_id', existingId)
              .order('created_at', { ascending: true });

            if (msgs && msgs.length > 0) {
              const loaded: OperateMessage[] = msgs
                .filter((m: any) => m.role === 'user' || m.role === 'assistant')
                .map((m: any) => ({
                  id: m.id,
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                  createdAt: new Date(m.created_at),
                  skillResults: m.metadata?.skill_results || undefined,
                  skillResult: m.metadata?.skill_results?.[0] || undefined,
                }));
              setMessages(loaded);
            }
            return;
          }
        }
      }

      // No valid today-session in localStorage — find or defer to getOrCreateConversation
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: { user } } = await supabase.auth.getUser();

      const { data: todaySession } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('conversation_status', 'active')
        .is('session_id', null)
        .eq('user_id', user?.id ?? '')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (todaySession) {
        localStorage.setItem(FLOWPILOT_CONVERSATION_KEY, todaySession.id);
        setConversationId(todaySession.id);

        const { data: msgs } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', todaySession.id)
          .order('created_at', { ascending: true });

        if (msgs && msgs.length > 0) {
          const loaded: OperateMessage[] = msgs
            .filter((m: any) => m.role === 'user' || m.role === 'assistant')
            .map((m: any) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              createdAt: new Date(m.created_at),
              skillResults: m.metadata?.skill_results || undefined,
              skillResult: m.metadata?.skill_results?.[0] || undefined,
            }));
          setMessages(loaded);
        }
      } else {
        // Clear stale reference — new session will be created on first message
        localStorage.removeItem(FLOWPILOT_CONVERSATION_KEY);
      }
    };

    loadExistingConversation();
  }, []);

  // Load available skills
  const loadSkills = useCallback(async () => {
    const { data } = await supabase
      .from('agent_skills')
      .select('*')
      .eq('enabled', true)
      .in('scope', ['internal', 'both'])
      .order('category');
    if (data) setSkills(data as unknown as AgentSkill[]);
  }, []);

  // Load recent activity
  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from('agent_activity')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setActivities(data as unknown as AgentActivity[]);
  }, []);

  // ─── Send message with SSE streaming ────────────────────────────────

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: OperateMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: OperateMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
      toolStatus: { phase: 'thinking' },
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);

    // Abort controller for cancellation
    const controller = new AbortController();
    abortRef.current = controller;

    let finalContent = '';
    let skillResults: any[] = [];
    let relayFollowUp: string | null = null;

    try {
      const convId = await getOrCreateConversation();
      await persistMessage(convId, 'user', content);

      // Update conversation title from first user message
      if (messages.length === 0) {
        const shortTitle = content.replace(/^@\w+\s*/, '').slice(0, 80) || 'FlowPilot Session';
        supabase.from('chat_conversations').update({ title: shortTitle }).eq('id', convId).then();
      }

      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const resp = await fetch(OPERATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: history,
          available_skills: skills.map(s => s.tool_definition),
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`Request failed: ${resp.status}`);
      }

      await parseOperateStream(resp, {
        onDelta: (chunk) => {
          finalContent += chunk;
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: finalContent, toolStatus: { phase: 'streaming' } }
              : m
          ));
        },
        onToolStart: (tools, iteration) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, toolStatus: { phase: 'executing', tools, iteration } }
              : m
          ));
        },
        onToolDone: (tools, iteration) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, toolStatus: { phase: 'thinking', tools, iteration } }
              : m
          ));
        },
        onSkillResults: async (results) => {
          // Check for relay_required responses from browser_fetch
          for (const result of results) {
            if (result?.result?.action === 'relay_required' && result?.result?.url && relayHandlerRef.current) {
              const relayUrl = result.result.url;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: `🔗 Fetching via browser relay: ${relayUrl}`, toolStatus: { phase: 'executing', tools: ['browser_relay'] } }
                  : m
              ));

              const relayResult = await relayHandlerRef.current(relayUrl);
              if (relayResult && !relayResult.error) {
                // Check if the scrape detected an error page
                const isErrorPage = relayResult.method === 'error' || relayResult.is_error;
                
                // Send relay result back to browser-fetch to get formatted response
                const { data: fetchResult } = await supabase.functions.invoke('browser-fetch', {
                  body: { url: relayUrl, relay_result: relayResult },
                });
                // Replace the relay_required result with actual content
                result.result = fetchResult;
                result.status = isErrorPage ? 'failed' : 'success';

                // Build follow-up content for the agent to continue reasoning
                const title = relayResult.title || '';
                const content = relayResult.content || fetchResult?.content || '';
                
                if (isErrorPage) {
                  relayFollowUp = `Browser relay to ${relayUrl} failed: The page returned a 404 or error. The URL may be incorrect. Try a different URL format (e.g. for LinkedIn posts, try the /recent-activity/all/ path, or use the direct post URL).`;
                } else {
                  relayFollowUp = `Here is the fetched content from ${relayUrl}:\n\n**${title}**\n\n${content}`;
                }
              } else {
                result.result = { error: relayResult?.error || 'Browser relay failed' };
                result.status = 'failed';
              }
            }
          }

          skillResults = results;
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, skillResults: results, skillResult: results[0] }
              : m
          ));
        },
        onError: (message) => {
          finalContent = `Something went wrong: ${message}`;
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: finalContent, toolStatus: { phase: 'done' } }
              : m
          ));
        },
        onDone: () => {
          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, toolStatus: { phase: 'done' } }
              : m
          ));
        },
      }, controller.signal);

      // Persist final assistant message
      if (finalContent) {
        await persistMessage(convId, 'assistant', finalContent, {
          skill_results: skillResults.length > 0 ? skillResults : undefined,
        });
      }
      await loadActivity();

      // If a relay fetched content, automatically send it as a follow-up
      // so the agent can use it to continue reasoning
      if (relayFollowUp) {
        setIsLoading(false);
        // Small delay to let UI settle, then send follow-up
        setTimeout(() => {
          sendMessage(relayFollowUp!);
        }, 500);
        return; // Skip finally's setIsLoading since we'll re-enter sendMessage
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorContent = `Something went wrong: ${err.message}`;
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: errorContent, toolStatus: { phase: 'done' } }
          : m
      ));
      toast.error('Agent error', { description: err.message });
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [messages, skills, loadActivity, getOrCreateConversation, persistMessage]);

  // Execute a specific skill directly
  const executeSkill = useCallback(async (skillName: string, args: Record<string, unknown>) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-execute', {
        body: { skill_name: skillName, arguments: args, agent_type: 'flowpilot' },
      });

      if (error) throw new Error(error.message);

      if (data.status === 'pending_approval') {
        // Inject a proactive HIL card into the chat as a chat_message
        const activityId = data.activity_id;
        const currentConvId = conversationId;
        if (currentConvId) {
          const actionPayload = {
            type: 'approval',
            title: `"${skillName.replace(/_/g, ' ')}" needs your approval`,
            activityId,
            skillName,
            actions: [
              { label: 'Approve & Execute', action: 'approve', variant: 'default', activityId },
              { label: 'Reject', action: 'reject', variant: 'destructive', activityId },
            ],
          };
          // Persist the HIL card as a proactive message
          await supabase.from('chat_messages').insert({
            conversation_id: currentConvId,
            role: 'assistant',
            content: `⏳ I'd like to execute **${skillName.replace(/_/g, ' ')}** but it requires your approval first.\n\nPlease review and approve or reject below.`,
            source: 'proactive',
            action_payload: actionPayload,
          });
        }
      }

      const msg: OperateMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.status === 'pending_approval'
          ? `⏳ "${skillName}" requires approval before executing.`
          : `✅ Executed "${skillName}" successfully.`,
        createdAt: new Date(),
        skillResult: { skill: skillName, status: data.status, result: data.result },
      };
      setMessages(prev => [...prev, msg]);
      await loadActivity();
      return data;

    } catch (err: any) {
      toast.error('Skill execution failed', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [loadActivity]);

  // Approve a pending action and re-execute it
  const approveAction = useCallback(async (activityId: string) => {
    const { data: activity, error: fetchErr } = await supabase
      .from('agent_activity')
      .select('*')
      .eq('id', activityId)
      .single();

    if (fetchErr || !activity) {
      toast.error('Failed to find action');
      return;
    }

    const { error } = await supabase
      .from('agent_activity')
      .update({ status: 'approved' })
      .eq('id', activityId);

    if (error) {
      toast.error('Failed to approve action');
      return;
    }

    toast.success('Action approved — re-executing...');

    try {
      const { data, error: execErr } = await supabase.functions.invoke('agent-execute', {
        body: {
          skill_name: activity.skill_name,
          arguments: activity.input || {},
          agent_type: activity.agent || 'flowpilot',
          conversation_id: activity.conversation_id,
        },
      });

      if (execErr) throw new Error(execErr.message);

      const msg: OperateMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `✅ Approved and executed "${activity.skill_name}" successfully.`,
        createdAt: new Date(),
        skillResult: { skill: activity.skill_name || '', status: 'success', result: data?.result },
      };
      setMessages(prev => [...prev, msg]);
      toast.success(`"${activity.skill_name}" executed`);
    } catch (err: any) {
      toast.error('Re-execution failed', { description: err.message });
    }

    await loadActivity();
  }, [loadActivity]);

  // Reject a pending action
  const rejectAction = useCallback(async (activityId: string) => {
    const { error } = await supabase
      .from('agent_activity')
      .update({ status: 'rejected' })
      .eq('id', activityId);
    if (error) {
      toast.error('Failed to reject action');
      return;
    }
    const msg: OperateMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '❌ Action rejected.',
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    toast.success('Action rejected');
    await loadActivity();
  }, [loadActivity]);

  const cancelRequest = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ─── Conversation history ────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select('id, title, created_at, updated_at')
      .eq('conversation_status', 'active')
      .not('title', 'is', null)
      .is('session_id', null)        // Exclude public/visitor chats
      .order('updated_at', { ascending: false })
      .limit(50);
    if (data) setConversations(data as FlowPilotConversation[]);
  }, []);

  const switchConversation = useCallback(async (targetId: string) => {
    if (targetId === conversationId) return;

    localStorage.setItem(FLOWPILOT_CONVERSATION_KEY, targetId);
    setConversationId(targetId);
    setMessages([]);

    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', targetId)
      .order('created_at', { ascending: true });

    if (msgs && msgs.length > 0) {
      const loaded: OperateMessage[] = msgs
        .filter((m: any) => m.role === 'user' || m.role === 'assistant')
        .map((m: any) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: new Date(m.created_at),
          skillResults: m.metadata?.skill_results || undefined,
          skillResult: m.metadata?.skill_results?.[0] || undefined,
        }));
      setMessages(loaded);
    }
  }, [conversationId]);

  const deleteConversation = useCallback(async (targetId: string) => {
    // Hard delete: clean up related records first
    await Promise.all([
      supabase.from('chat_messages').delete().eq('conversation_id', targetId),
      supabase.from('chat_feedback').delete().eq('conversation_id', targetId),
    ]);
    const { error } = await supabase.from('chat_conversations').delete().eq('id', targetId);
    if (error) {
      console.error('Failed to delete conversation:', error);
      return;
    }
    setConversations(prev => prev.filter(c => c.id !== targetId));
    if (conversationId === targetId) {
      setConversationId(null);
      setMessages([]);
      localStorage.removeItem(FLOWPILOT_CONVERSATION_KEY);
    }
  }, [conversationId]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(FLOWPILOT_CONVERSATION_KEY);
    setConversationId(null);
  }, []);

  // ─── Extension relay handler ──────────────────────────────────────────
  // Can be set by the CopilotPage to handle relay_required responses
  const relayHandlerRef = useRef<((url: string) => Promise<any>) | null>(null);

  const setRelayHandler = useCallback((handler: (url: string) => Promise<any>) => {
    relayHandlerRef.current = handler;
  }, []);

  return {
    messages,
    isLoading,
    skills,
    activities,
    conversationId,
    conversations,
    sendMessage,
    executeSkill,
    approveAction,
    rejectAction,
    cancelRequest,
    loadSkills,
    loadActivity,
    loadConversations,
    switchConversation,
    deleteConversation,
    clearMessages,
    setRelayHandler,
  };
}
