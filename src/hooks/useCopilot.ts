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
  sourceUrl?: string; // For migrated blocks
}

export interface ModuleRecommendation {
  modules: (keyof ModulesSettings)[];
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface MigrationState {
  sourceUrl: string | null;
  detectedPlatform: string | null;
  pendingBlocks: CopilotBlock[];
  currentBlockIndex: number;
  migratedPages: string[];
  discoveredLinks: string[];
  isActive: boolean;
  pageTitle: string | null;
}

interface UseCopilotReturn {
  messages: CopilotMessage[];
  blocks: CopilotBlock[];
  moduleRecommendation: ModuleRecommendation | null;
  isLoading: boolean;
  error: string | null;
  isAutoContinue: boolean;
  migrationState: MigrationState;
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
  // Migration functions
  startMigration: (url: string) => Promise<void>;
  approveMigrationBlock: () => void;
  skipMigrationBlock: () => void;
  editMigrationBlock: (feedback: string) => void;
  migrateNextPage: (url: string) => Promise<void>;
}

const initialMigrationState: MigrationState = {
  sourceUrl: null,
  detectedPlatform: null,
  pendingBlocks: [],
  currentBlockIndex: 0,
  migratedPages: [],
  discoveredLinks: [],
  isActive: false,
  pageTitle: null,
};

export function useCopilot(): UseCopilotReturn {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [blocks, setBlocks] = useState<CopilotBlock[]>([]);
  const [moduleRecommendation, setModuleRecommendation] = useState<ModuleRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoContinue, setIsAutoContinue] = useState(false);
  const [migrationState, setMigrationState] = useState<MigrationState>(initialMigrationState);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const updateModules = useUpdateModules();
  const { data: currentModules } = useModules();

  const generateId = () => Math.random().toString(36).substring(2, 15);

  // Extract internal links from a URL
  const extractInternalLinks = (html: string, baseUrl: string): string[] => {
    try {
      const base = new URL(baseUrl);
      const links: string[] = [];
      const regex = /href=["']([^"']+)["']/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        try {
          const url = new URL(match[1], baseUrl);
          if (url.hostname === base.hostname && 
              !url.pathname.includes('#') &&
              !links.includes(url.pathname) &&
              url.pathname !== '/' &&
              url.pathname !== base.pathname) {
            links.push(url.pathname);
          }
        } catch {
          // Invalid URL, skip
        }
      }
      return links.slice(0, 10); // Limit to 10 links
    } catch {
      return [];
    }
  };

  // Detect modules based on platform
  const detectModulesFromPlatform = (platform: string): (keyof ModulesSettings)[] => {
    const platformModules: Record<string, (keyof ModulesSettings)[]> = {
      wordpress: ['blog', 'forms', 'newsletter'],
      woocommerce: ['products', 'orders', 'blog', 'newsletter'],
      shopify: ['products', 'orders', 'newsletter'],
      wix: ['forms', 'bookings', 'blog'],
      squarespace: ['blog', 'newsletter', 'forms'],
    };
    return platformModules[platform.toLowerCase()] || ['forms', 'newsletter'];
  };

  const startMigration = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);

    // Add assistant message about starting migration
    const startMessage: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: `🔍 Analyzing ${url}... I'll scan the page and prepare your content for migration.`,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, startMessage]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('migrate-page', {
        body: { url },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Migration failed');

      const migratedBlocks: CopilotBlock[] = (data.blocks || []).map((block: { id?: string; type: string; data: Record<string, unknown> }) => ({
        id: block.id || generateId(),
        type: block.type,
        data: block.data,
        status: 'pending' as const,
        sourceUrl: url,
      }));

      // Extract discovered links from metadata if available
      const discoveredLinks: string[] = data.metadata?.internalLinks || [];

      setMigrationState({
        sourceUrl: url,
        detectedPlatform: data.metadata?.platform || 'unknown',
        pendingBlocks: migratedBlocks,
        currentBlockIndex: 0,
        migratedPages: [url],
        discoveredLinks,
        isActive: true,
        pageTitle: data.title || 'Untitled Page',
      });

      // Add success message with first block preview
      const successMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `✨ Found ${migratedBlocks.length} sections on "${data.title || 'the page'}"${data.metadata?.platform ? ` (${data.metadata.platform})` : ''}!\n\nLet me show you each section one at a time. You can approve, edit, or skip each one.`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);

      // Recommend modules based on detected platform
      if (data.metadata?.platform) {
        const suggestedModules = detectModulesFromPlatform(data.metadata.platform);
        if (suggestedModules.length > 0) {
          setModuleRecommendation({
            modules: suggestedModules,
            reason: `Based on your ${data.metadata.platform} site, these modules will help you maintain similar functionality.`,
            status: 'pending',
          });
        }
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze URL';
      setError(message);
      toast.error(message);
      
      const errorMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `❌ I couldn't analyze that URL. ${message}\n\nPlease check that:\n• The URL is correct and accessible\n• The site isn't password protected\n• You've included https://`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const approveMigrationBlock = useCallback(() => {
    if (!migrationState.isActive || migrationState.pendingBlocks.length === 0) return;

    const currentBlock = migrationState.pendingBlocks[migrationState.currentBlockIndex];
    if (!currentBlock) return;

    // Add to approved blocks
    setBlocks(prev => [...prev, { ...currentBlock, status: 'approved' }]);

    // Move to next block
    const nextIndex = migrationState.currentBlockIndex + 1;
    
    if (nextIndex >= migrationState.pendingBlocks.length) {
      // All blocks reviewed
      setMigrationState(prev => ({ ...prev, currentBlockIndex: nextIndex }));
      
      const completionMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `🎉 All ${migrationState.pendingBlocks.length} sections reviewed!${migrationState.discoveredLinks.length > 0 ? `\n\nI found ${migrationState.discoveredLinks.length} other pages on this site. Would you like me to migrate any of them?` : '\n\nYour page is ready! Click "Finish & create page" when you\'re happy with the result.'}`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, completionMessage]);
    } else {
      setMigrationState(prev => ({ ...prev, currentBlockIndex: nextIndex }));
      
      const progressMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `✓ Added! Here's section ${nextIndex + 1} of ${migrationState.pendingBlocks.length}...`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, progressMessage]);
    }

    toast.success('Block added');
  }, [migrationState]);

  const skipMigrationBlock = useCallback(() => {
    if (!migrationState.isActive || migrationState.pendingBlocks.length === 0) return;

    const nextIndex = migrationState.currentBlockIndex + 1;
    
    if (nextIndex >= migrationState.pendingBlocks.length) {
      setMigrationState(prev => ({ ...prev, currentBlockIndex: nextIndex }));
      
      const completionMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Review complete! ${blocks.length} sections added.${migrationState.discoveredLinks.length > 0 ? ` Want to migrate more pages?` : ''}`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, completionMessage]);
    } else {
      setMigrationState(prev => ({ ...prev, currentBlockIndex: nextIndex }));
    }
  }, [migrationState, blocks.length]);

  const editMigrationBlock = useCallback((feedback: string) => {
    if (!migrationState.isActive) return;
    
    const currentBlock = migrationState.pendingBlocks[migrationState.currentBlockIndex];
    if (!currentBlock) return;

    // Send feedback to regenerate
    sendMessage(`Modify the ${currentBlock.type} section: ${feedback}`);
  }, [migrationState]);

  const migrateNextPage = useCallback(async (url: string) => {
    // Check if already migrated
    if (migrationState.migratedPages.includes(url)) {
      toast.info('This page has already been migrated');
      return;
    }
    
    await startMigration(url);
  }, [migrationState.migratedPages, startMigration]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Check if this is a migration request
    const urlMatch = content.match(/https?:\/\/[^\s]+/);
    const isMigrationRequest = content.toLowerCase().includes('migrate') || 
                               content.toLowerCase().includes('import') ||
                               content.toLowerCase().includes('clone');
    
    if (urlMatch && isMigrationRequest) {
      // Add user message first
      const userMessage: CopilotMessage = {
        id: generateId(),
        role: 'user',
        content,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Start migration directly
      await startMigration(urlMatch[0]);
      return;
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
          migrationState: migrationState.isActive ? {
            sourceUrl: migrationState.sourceUrl,
            platform: migrationState.detectedPlatform,
          } : null,
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
        } else if (data.toolCall.name === 'migrate_url') {
          // Migration request from AI
          const args = data.toolCall.arguments as { url: string };
          setMessages(prev => [...prev, assistantMessage]);
          await startMigration(args.url);
          return;
        } else if (data.toolCall.name.startsWith('create_') && data.toolCall.name.endsWith('_block')) {
          // Block creation - auto-approve by default
          const blockType = data.toolCall.name.replace('create_', '').replace('_block', '');
          const newBlock: CopilotBlock = {
            id: generateId(),
            type: blockType,
            data: data.toolCall.arguments as Record<string, unknown>,
            status: 'approved',
          };
          setBlocks(prev => [...prev, newBlock]);
        }
      }

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to send message';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, isLoading, currentModules, migrationState, startMigration]);

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

      // If in migration mode, don't auto-continue
      if (!migrationState.isActive) {
        // Continue conversation to start creating blocks
        setTimeout(() => {
          sendMessage('Great! Modules are activated. Now please create a hero block for my website.');
        }, 500);
      }
    } catch (err) {
      toast.error('Could not activate modules');
    }
  }, [moduleRecommendation, currentModules, updateModules, sendMessage, migrationState.isActive]);

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
  }, []);

  const stopAutoContinue = useCallback(() => {
    setIsAutoContinue(false);
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setBlocks([]);
    setModuleRecommendation(null);
    setError(null);
    setIsAutoContinue(false);
    setMigrationState(initialMigrationState);
  }, []);

  const approvedBlocks = blocks.filter(b => b.status === 'approved');

  return {
    messages,
    blocks,
    moduleRecommendation,
    isLoading,
    error,
    isAutoContinue,
    migrationState,
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
    // Migration functions
    startMigration,
    approveMigrationBlock,
    skipMigrationBlock,
    editMigrationBlock,
    migrateNextPage,
  };
}
