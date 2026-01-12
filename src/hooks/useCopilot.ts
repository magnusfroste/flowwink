import { useState, useCallback, useRef, useEffect } from 'react';
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

// Full page generation sequence
const FULL_PAGE_SEQUENCE = ['hero', 'features', 'testimonials', 'cta', 'contact'];

interface UseCopilotReturn {
  messages: CopilotMessage[];
  blocks: CopilotBlock[];
  moduleRecommendation: ModuleRecommendation | null;
  isLoading: boolean;
  error: string | null;
  isAutoContinue: boolean;
  sendMessage: (content: string) => Promise<void>;
  approveBlock: (blockId: string) => void;
  rejectBlock: (blockId: string) => void;
  regenerateBlock: (blockId: string, feedback?: string) => Promise<void>;
  acceptModules: () => Promise<void>;
  rejectModules: () => void;
  cancelRequest: () => void;
  clearConversation: () => void;
  stopAutoContinue: () => void;
  approvedBlocks: CopilotBlock[];
}

export function useCopilot(): UseCopilotReturn {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [blocks, setBlocks] = useState<CopilotBlock[]>([]);
  const [moduleRecommendation, setModuleRecommendation] = useState<ModuleRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoContinue, setIsAutoContinue] = useState(false);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoContinueRef = useRef<boolean>(false);
  const updateModules = useUpdateModules();
  const { data: currentModules } = useModules();

  const generateId = () => {
    return Math.random().toString(36).substring(2, 15);
  };

  // Get the next block to generate in auto-continue mode
  const getNextBlockInSequence = useCallback((currentBlocks: CopilotBlock[]): string | null => {
    const createdTypes = new Set(currentBlocks.map(b => b.type));
    for (const blockType of FULL_PAGE_SEQUENCE) {
      if (!createdTypes.has(blockType)) {
        return blockType;
      }
    }
    return null;
  }, []);

  // Format block type for display
  const formatBlockType = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Detect if this is a full page generation request
    const isFullPageRequest = content.toLowerCase().includes('complete landing page');
    if (isFullPageRequest) {
      setIsAutoContinue(true);
      autoContinueRef.current = true;
    }

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

      let newBlockType: string | null = null;

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
          // Block creation - auto-approve by default
          const blockType = data.toolCall.name.replace('create_', '').replace('_block', '');
          newBlockType = blockType;
          const newBlock: CopilotBlock = {
            id: generateId(),
            type: blockType,
            data: data.toolCall.arguments as Record<string, unknown>,
            status: 'approved',
          };
          setBlocks(prev => {
            const updatedBlocks = [...prev, newBlock];
            
            // Auto-continue: trigger next block after a short delay
            if (autoContinueRef.current) {
              const nextBlock = getNextBlockInSequence(updatedBlocks);
              if (nextBlock) {
                setTimeout(() => {
                  if (autoContinueRef.current) {
                    // Use a ref-based approach to avoid stale closure
                    const continueMessage = `Continue with the ${formatBlockType(nextBlock)} section`;
                    // We need to call sendMessage but avoid the dependency issue
                    // Instead, we'll use a different approach with state
                  }
                }, 800);
              } else {
                // All blocks complete
                setIsAutoContinue(false);
                autoContinueRef.current = false;
              }
            }
            
            return updatedBlocks;
          });
        }
      }

      setMessages(prev => [...prev, assistantMessage]);

      // Auto-continue logic after state updates
      if (autoContinueRef.current && newBlockType) {
        setBlocks(currentBlocks => {
          const nextBlock = getNextBlockInSequence(currentBlocks);
          if (nextBlock) {
            // Schedule next block generation
            setTimeout(() => {
              if (autoContinueRef.current) {
                const continueMessage = `Continue with the ${formatBlockType(nextBlock)} section`;
                // Trigger next message via a queued approach
                queueMicrotask(() => {
                  if (autoContinueRef.current && !isLoading) {
                    // We need to avoid the recursive call issue
                    // This will be handled by the useEffect below
                  }
                });
              }
            }, 500);
          } else {
            setIsAutoContinue(false);
            autoContinueRef.current = false;
            toast.success('Full page generated!');
          }
          return currentBlocks;
        });
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled
        setIsAutoContinue(false);
        autoContinueRef.current = false;
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
      toast.error(message);
      setIsAutoContinue(false);
      autoContinueRef.current = false;
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, currentModules, getNextBlockInSequence]);

  // Effect to handle auto-continue chain
  useEffect(() => {
    if (!isAutoContinue || isLoading || blocks.length === 0) return;

    const nextBlock = getNextBlockInSequence(blocks);
    if (nextBlock) {
      const timer = setTimeout(() => {
        if (autoContinueRef.current && !isLoading) {
          const continueMessage = `Continue with the ${formatBlockType(nextBlock)} section`;
          sendMessage(continueMessage);
        }
      }, 1000);
      return () => clearTimeout(timer);
    } else if (blocks.length >= FULL_PAGE_SEQUENCE.length) {
      setIsAutoContinue(false);
      autoContinueRef.current = false;
    }
  }, [blocks, isAutoContinue, isLoading, getNextBlockInSequence, sendMessage]);

  const approveBlock = useCallback((blockId: string) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, status: 'approved' as const } : b
    ));
    toast.success('Block approved');
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
      ? `Regenerate the ${block.type} block with this feedback: ${feedback}`
      : `Regenerate the ${block.type} block with better content`;

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
      toast.success('Modules activated');

      // Continue conversation to start creating blocks
      const continueMessage = 'Great! Modules are activated. Now please create a hero block for my website.';
      // Add slight delay to ensure state is updated
      setTimeout(() => {
        sendMessage(continueMessage);
      }, 500);
    } catch (err) {
      toast.error('Could not activate modules');
    }
  }, [moduleRecommendation, currentModules, updateModules, sendMessage]);

  const rejectModules = useCallback(() => {
    setModuleRecommendation(prev => prev ? { ...prev, status: 'rejected' } : null);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
    setIsAutoContinue(false);
    autoContinueRef.current = false;
  }, []);

  const stopAutoContinue = useCallback(() => {
    setIsAutoContinue(false);
    autoContinueRef.current = false;
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setBlocks([]);
    setModuleRecommendation(null);
    setError(null);
    setIsAutoContinue(false);
    autoContinueRef.current = false;
  }, []);

  const approvedBlocks = blocks.filter(b => b.status === 'approved');

  return {
    messages,
    blocks,
    moduleRecommendation,
    isLoading,
    error,
    isAutoContinue,
    sendMessage,
    approveBlock,
    rejectBlock,
    regenerateBlock,
    acceptModules,
    rejectModules,
    cancelRequest,
    clearConversation,
    stopAutoContinue,
    approvedBlocks,
  };
}
