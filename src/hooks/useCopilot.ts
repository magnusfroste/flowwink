import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateModules, useModules, type ModulesSettings, defaultModulesSettings } from '@/hooks/useModules';
import { toast } from 'sonner';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface CopilotBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ModuleRecommendation {
  modules: (keyof ModulesSettings)[];
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface UseCopilotReturn {
  messages: CopilotMessage[];
  blocks: CopilotBlock[];
  moduleRecommendation: ModuleRecommendation | null;
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  approveBlock: (blockId: string) => void;
  rejectBlock: (blockId: string) => void;
  regenerateBlock: (blockId: string, feedback?: string) => Promise<void>;
  acceptModules: () => Promise<void>;
  rejectModules: () => void;
  cancelRequest: () => void;
  clearConversation: () => void;
  approvedBlocks: CopilotBlock[];
}

export function useCopilot(): UseCopilotReturn {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [blocks, setBlocks] = useState<CopilotBlock[]>([]);
  const [moduleRecommendation, setModuleRecommendation] = useState<ModuleRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const updateModules = useUpdateModules();
  const { data: currentModules } = useModules();

  const generateId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Add user message
    const userMessage: CopilotMessage = {
      id: generateId(),
      role: 'user',
      content,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Build conversation history for API
      const conversationHistory = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error: fnError } = await supabase.functions.invoke('copilot-action', {
        body: { 
          messages: conversationHistory,
          currentModules: currentModules || defaultModulesSettings,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      // Process response
      const assistantMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.message || '',
        createdAt: new Date(),
      };

      // Handle tool calls
      if (data.toolCall) {
        assistantMessage.toolCall = data.toolCall;

        if (data.toolCall.name === 'activate_modules') {
          // Module recommendation
          const args = data.toolCall.arguments as { modules: string[]; reason: string };
          setModuleRecommendation({
            modules: args.modules as (keyof ModulesSettings)[],
            reason: args.reason,
            status: 'pending',
          });
        } else if (data.toolCall.name.startsWith('create_') && data.toolCall.name.endsWith('_block')) {
          // Block creation
          const blockType = data.toolCall.name.replace('create_', '').replace('_block', '');
          const newBlock: CopilotBlock = {
            id: generateId(),
            type: blockType,
            data: data.toolCall.arguments as Record<string, unknown>,
            status: 'pending',
          };
          setBlocks(prev => [...prev, newBlock]);
        }
      }

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, currentModules]);

  const approveBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, status: 'approved' as const } : b
    ));
    toast.success('Block godkänt');
  }, []);

  const rejectBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, status: 'rejected' as const } : b
    ));
  }, []);

  const regenerateBlock = useCallback(async (blockId: string, feedback?: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;

    const regeneratePrompt = feedback 
      ? `Regenerera ${block.type}-blocket med följande feedback: ${feedback}`
      : `Regenerera ${block.type}-blocket med bättre innehåll`;

    // Remove the old block
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    
    // Send regenerate request
    await sendMessage(regeneratePrompt);
  }, [blocks, sendMessage]);

  const acceptModules = useCallback(async () => {
    if (!moduleRecommendation || !currentModules) return;

    try {
      const updatedModules = { ...currentModules };
      moduleRecommendation.modules.forEach(moduleId => {
        if (updatedModules[moduleId] && !updatedModules[moduleId].core) {
          updatedModules[moduleId] = {
            ...updatedModules[moduleId],
            enabled: true,
          };
        }
      });

      await updateModules.mutateAsync(updatedModules);
      setModuleRecommendation(prev => prev ? { ...prev, status: 'accepted' } : null);
      toast.success('Moduler aktiverade');
    } catch (err) {
      toast.error('Kunde inte aktivera moduler');
    }
  }, [moduleRecommendation, currentModules, updateModules]);

  const rejectModules = useCallback(() => {
    setModuleRecommendation(prev => prev ? { ...prev, status: 'rejected' } : null);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setBlocks([]);
    setModuleRecommendation(null);
    setError(null);
  }, []);

  const approvedBlocks = blocks.filter(b => b.status === 'approved');

  return {
    messages,
    blocks,
    moduleRecommendation,
    isLoading,
    error,
    sendMessage,
    approveBlock,
    rejectBlock,
    regenerateBlock,
    acceptModules,
    rejectModules,
    cancelRequest,
    clearConversation,
    approvedBlocks,
  };
}
