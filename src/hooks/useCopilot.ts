import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUpdateModules, useModules, type ModulesSettings, defaultModulesSettings } from '@/hooks/useModules';
import { toast } from 'sonner';

// Block-to-Module mapping for auto-enabling modules
const BLOCK_MODULE_MAP: Record<string, keyof ModulesSettings> = {
  // Booking
  'booking': 'bookings',
  'smart-booking': 'bookings',
  
  // Blog
  'article-grid': 'blog',
  
  // Knowledge Base
  'kb-hub': 'knowledgeBase',
  'kb-featured': 'knowledgeBase',
  'kb-search': 'knowledgeBase',
  'kb-accordion': 'knowledgeBase',
  
  // Communication
  'chat': 'chat',
  'newsletter': 'newsletter',
  
  // E-commerce
  'products': 'products',
  'cart': 'orders',
  'pricing': 'products',
  'comparison': 'products',
  
  // Forms
  'form': 'forms',
  'contact': 'forms',
};

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

// Site Discovery Types
export interface DiscoveredPage {
  url: string;
  title: string;
  type: 'page' | 'blog' | 'kb';
  source: 'navigation' | 'sitemap' | 'link';
  status?: 'pending' | 'migrating' | 'completed' | 'skipped';
}

export interface SiteStructure {
  siteName: string;
  platform: string;
  baseUrl: string;
  pages: DiscoveredPage[];
  navigation: string[];
  hasBlog: boolean;
  hasKnowledgeBase: boolean;
}

export type DiscoveryStatus = 'idle' | 'analyzing' | 'ready' | 'migrating' | 'complete';

export interface CopilotBlock {
  id: string;
  type: string;
  data: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  sourceUrl?: string; // For migrated blocks
}

export type MigrationPhase = 'idle' | 'pages' | 'blog' | 'knowledgeBase' | 'complete';

export interface MigrationState {
  sourceUrl: string | null;
  baseDomain: string | null;
  detectedPlatform: string | null;
  pendingBlocks: CopilotBlock[];
  currentBlockIndex: number;
  migratedPages: string[];
  discoveredLinks: string[];
  isActive: boolean;
  pageTitle: string | null;
  // Full site migration phases
  phase: MigrationPhase;
  pagesCompleted: number;
  pagesTotal: number;
  blogPostsDiscovered: number;
  blogPostsMigrated: number;
  kbArticlesDiscovered: number;
  kbArticlesMigrated: number;
  // Detected content
  hasBlog: boolean;
  hasKnowledgeBase: boolean;
  blogUrls: string[];
  kbUrls: string[];
  // New site discovery
  siteStructure: SiteStructure | null;
  discoveryStatus: DiscoveryStatus;
  currentPageUrl: string | null;
}

interface UseCopilotReturn {
  messages: CopilotMessage[];
  blocks: CopilotBlock[];
  isLoading: boolean;
  error: string | null;
  isAutoContinue: boolean;
  migrationState: MigrationState;
  sendMessage: (content: string) => Promise<void>;
  approveBlock: (blockId: string) => Promise<void>;
  rejectBlock: (blockId: string) => void;
  regenerateBlock: (blockId: string, feedback?: string) => Promise<void>;
  cancelRequest: () => void;
  clearConversation: () => void;
  stopAutoContinue: () => void;
  approvedBlocks: CopilotBlock[];
  // Site discovery
  analyzeSite: (url: string) => Promise<void>;
  selectPageForMigration: (url: string) => void;
  togglePageSelection: (url: string) => void;
  migrateSelectedPages: () => Promise<void>;
  // Migration functions
  startMigration: (url: string) => Promise<void>;
  approveMigrationBlock: () => void;
  skipMigrationBlock: () => void;
  editMigrationBlock: (feedback: string) => void;
  migrateNextPage: (url: string) => Promise<void>;
  // Phase control
  startBlogMigration: () => Promise<void>;
  startKbMigration: () => Promise<void>;
  skipPhase: () => void;
}

const initialMigrationState: MigrationState = {
  sourceUrl: null,
  baseDomain: null,
  detectedPlatform: null,
  pendingBlocks: [],
  currentBlockIndex: 0,
  migratedPages: [],
  discoveredLinks: [],
  isActive: false,
  pageTitle: null,
  phase: 'idle',
  pagesCompleted: 0,
  pagesTotal: 0,
  blogPostsDiscovered: 0,
  blogPostsMigrated: 0,
  kbArticlesDiscovered: 0,
  kbArticlesMigrated: 0,
  hasBlog: false,
  hasKnowledgeBase: false,
  blogUrls: [],
  kbUrls: [],
  // New site discovery
  siteStructure: null,
  discoveryStatus: 'idle',
  currentPageUrl: null,
};

export function useCopilot(): UseCopilotReturn {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [blocks, setBlocks] = useState<CopilotBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoContinue, setIsAutoContinue] = useState(false);
  const [migrationState, setMigrationState] = useState<MigrationState>(initialMigrationState);
  const [enabledModulesCache, setEnabledModulesCache] = useState<Set<string>>(new Set());
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const updateModules = useUpdateModules();
  const { data: currentModules } = useModules();

  // Helper to auto-enable a module silently
  const autoEnableModule = useCallback(async (moduleId: keyof ModulesSettings) => {
    if (!currentModules) return;
    
    const moduleConfig = currentModules[moduleId];
    if (!moduleConfig || moduleConfig.enabled || moduleConfig.core) return;
    
    // Prevent duplicate toasts using cache
    if (enabledModulesCache.has(moduleId)) return;
    
    try {
      const updated = { ...currentModules };
      updated[moduleId] = { ...moduleConfig, enabled: true };
      await updateModules.mutateAsync(updated);
      
      setEnabledModulesCache(prev => new Set(prev).add(moduleId));
      
      // Educational toast
      toast.success(`${moduleConfig.name} enabled`, {
        description: moduleConfig.description,
        duration: 4000,
      });
    } catch (err) {
      console.error('Failed to auto-enable module:', moduleId, err);
    }
  }, [currentModules, updateModules, enabledModulesCache]);

  // Auto-enable modules for a block type
  const autoEnableModuleForBlock = useCallback(async (blockType: string) => {
    const requiredModule = BLOCK_MODULE_MAP[blockType];
    if (requiredModule) {
      await autoEnableModule(requiredModule);
    }
  }, [autoEnableModule]);

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
      
      // Detect blog and KB presence
      const hasBlog = data.metadata?.hasBlog || discoveredLinks.some(l => /blog|news|articles?|posts?/i.test(l));
      const hasKnowledgeBase = data.metadata?.hasKnowledgeBase || discoveredLinks.some(l => /help|faq|support|kb|knowledge/i.test(l));
      const blogUrls = discoveredLinks.filter(l => /blog|news|articles?|posts?/i.test(l));
      const kbUrls = discoveredLinks.filter(l => /help|faq|support|kb|knowledge/i.test(l));
      const pageUrls = discoveredLinks.filter(l => !blogUrls.includes(l) && !kbUrls.includes(l));
      
      // Extract base domain
      let baseDomain = null;
      try {
        baseDomain = new URL(url).origin;
      } catch {}

      setMigrationState(prev => ({
        ...prev,
        sourceUrl: url,
        baseDomain,
        detectedPlatform: data.metadata?.platform || 'unknown',
        pendingBlocks: migratedBlocks,
        currentBlockIndex: 0,
        migratedPages: [url],
        discoveredLinks: pageUrls,
        isActive: true,
        pageTitle: data.title || 'Untitled Page',
        phase: 'pages',
        pagesCompleted: 1,
        pagesTotal: pageUrls.length + 1,
        blogPostsDiscovered: blogUrls.length,
        blogPostsMigrated: 0,
        kbArticlesDiscovered: kbUrls.length,
        kbArticlesMigrated: 0,
        hasBlog,
        hasKnowledgeBase,
        blogUrls,
        kbUrls,
        currentPageUrl: url,
      }));

      // Add success message with first block preview
      const successMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `✨ Found ${migratedBlocks.length} sections on "${data.title || 'the page'}"${data.metadata?.platform ? ` (${data.metadata.platform})` : ''}!\n\nLet me show you each section one at a time. You can approve, edit, or skip each one.`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);

      // Auto-enable modules based on detected platform
      if (data.metadata?.platform) {
        const suggestedModules = detectModulesFromPlatform(data.metadata.platform);
        for (const moduleId of suggestedModules) {
          await autoEnableModule(moduleId);
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

    const lowerContent = content.toLowerCase().trim();

    // CONVERSATIONAL COMMANDS - Handle quick intents locally
    // Approval commands
    if (['yes', 'looks good', 'keep it', 'approve', 'ok', 'perfect', 'great'].includes(lowerContent)) {
      if (migrationState.isActive && migrationState.pendingBlocks.length > 0) {
        approveMigrationBlock();
        return;
      }
    }

    // Skip commands
    if (['skip', 'next', 'pass', 'no'].includes(lowerContent)) {
      if (migrationState.isActive && migrationState.pendingBlocks.length > 0) {
        skipMigrationBlock();
        return;
      }
    }

    // Phase skip commands
    if (lowerContent.includes('skip blog') || lowerContent.includes('skip kb') || 
        lowerContent.includes('just pages') || lowerContent.includes('only pages')) {
      if (migrationState.phase !== 'complete') {
        skipPhase();
        return;
      }
    }

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
          // Auto-enable modules silently instead of asking
          const args = data.toolCall.arguments as { modules: string[]; reason: string };
          for (const moduleId of args.modules) {
            await autoEnableModule(moduleId as keyof ModulesSettings);
          }
        } else if (data.toolCall.name === 'migrate_url') {
          // Migration request from AI
          const args = data.toolCall.arguments as { url: string };
          setMessages(prev => [...prev, assistantMessage]);
          await startMigration(args.url);
          return;
        } else if (data.toolCall.name.startsWith('create_') && data.toolCall.name.endsWith('_block')) {
          // Block creation - auto-approve and auto-enable required modules
          const blockType = data.toolCall.name.replace('create_', '').replace('_block', '');
          
          // Auto-enable required module for this block type
          await autoEnableModuleForBlock(blockType);
          
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
  }, [messages, isLoading, currentModules, migrationState, startMigration, autoEnableModule, autoEnableModuleForBlock]);

  const approveBlock = useCallback(async (blockId: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    
    // Auto-enable required module for this block type
    await autoEnableModuleForBlock(block.type);
    
    setBlocks(prev => prev.map(b => 
      b.id === blockId ? { ...b, status: 'approved' as const } : b
    ));
    toast.success('Block approved');
  }, [blocks, autoEnableModuleForBlock]);

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
    setError(null);
    setIsAutoContinue(false);
    setMigrationState(initialMigrationState);
    setEnabledModulesCache(new Set());
  }, []);

  // Phase control functions
  const startBlogMigration = useCallback(async () => {
    if (!migrationState.hasBlog || migrationState.blogUrls.length === 0) {
      const msg: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `No blog detected on this site. Let's move on!`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, msg]);
      return;
    }
    
    setMigrationState(prev => ({ ...prev, phase: 'blog' }));
    
    const msg: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: `📝 Great! I found ${migrationState.blogUrls.length} blog posts. Let me start migrating them as blog posts in your new system.\n\nI'll handle the content, categories, and metadata automatically.`,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    
    // Start migrating first blog URL
    if (migrationState.blogUrls[0]) {
      const fullUrl = migrationState.baseDomain 
        ? new URL(migrationState.blogUrls[0], migrationState.baseDomain).href 
        : migrationState.blogUrls[0];
      await startMigration(fullUrl);
    }
  }, [migrationState, startMigration]);

  const startKbMigration = useCallback(async () => {
    if (!migrationState.hasKnowledgeBase || migrationState.kbUrls.length === 0) {
      const msg: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `No knowledge base detected on this site. You're all set!`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, msg]);
      setMigrationState(prev => ({ ...prev, phase: 'complete' }));
      return;
    }
    
    setMigrationState(prev => ({ ...prev, phase: 'knowledgeBase' }));
    
    const msg: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: `📚 Found ${migrationState.kbUrls.length} knowledge base articles. I'll migrate these into structured FAQ/help content.\n\nEach article will be organized by category for easy navigation.`,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, msg]);
    
    // Start migrating first KB URL
    if (migrationState.kbUrls[0]) {
      const fullUrl = migrationState.baseDomain 
        ? new URL(migrationState.kbUrls[0], migrationState.baseDomain).href 
        : migrationState.kbUrls[0];
      await startMigration(fullUrl);
    }
  }, [migrationState, startMigration]);

  const skipPhase = useCallback(() => {
    const currentPhase = migrationState.phase;
    let nextPhase: MigrationPhase = 'complete';
    let message = '';
    
    if (currentPhase === 'pages') {
      if (migrationState.hasBlog) {
        nextPhase = 'blog';
        message = `Skipped remaining pages. Found ${migrationState.blogUrls.length} blog posts. Would you like me to migrate them?`;
      } else if (migrationState.hasKnowledgeBase) {
        nextPhase = 'knowledgeBase';
        message = `Skipped remaining pages. Found ${migrationState.kbUrls.length} KB articles. Would you like me to migrate them?`;
      } else {
        message = `Migration complete! All content has been imported.`;
      }
    } else if (currentPhase === 'blog') {
      if (migrationState.hasKnowledgeBase) {
        nextPhase = 'knowledgeBase';
        message = `Skipped blog migration. Found ${migrationState.kbUrls.length} KB articles. Would you like me to migrate them?`;
      } else {
        message = `Migration complete! Your pages and content are ready.`;
      }
    } else {
      message = `Migration complete! All content has been imported.`;
    }
    
    setMigrationState(prev => ({ ...prev, phase: nextPhase }));
    
    const msg: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: message,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, msg]);
  }, [migrationState]);

  const approvedBlocks = blocks.filter(b => b.status === 'approved');

  // ==================== SITE DISCOVERY FUNCTIONS ====================

  const analyzeSite = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    setMigrationState(prev => ({ ...prev, discoveryStatus: 'analyzing', sourceUrl: url }));

    // Add analyzing message
    const analyzeMessage: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: `🔍 Analyzing site structure for ${url}...\n\nScanning navigation, sitemap, and detecting content types.`,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, analyzeMessage]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('migrate-page', {
        body: { url, action: 'analyze-site' },
      });

      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Site analysis failed');

      const siteStructure: SiteStructure = {
        siteName: data.siteName || 'Unknown Site',
        platform: data.platform || 'unknown',
        baseUrl: data.baseUrl || url,
        pages: (data.pages || []).map((p: DiscoveredPage) => ({
          ...p,
          status: 'pending' as const,
        })),
        navigation: data.navigation || [],
        hasBlog: data.hasBlog || false,
        hasKnowledgeBase: data.hasKnowledgeBase || false,
      };

      // Categorize pages
      const pageCount = siteStructure.pages.filter(p => p.type === 'page').length;
      const blogCount = siteStructure.pages.filter(p => p.type === 'blog').length;
      const kbCount = siteStructure.pages.filter(p => p.type === 'kb').length;

      setMigrationState(prev => ({
        ...prev,
        siteStructure,
        discoveryStatus: 'ready',
        baseDomain: siteStructure.baseUrl,
        detectedPlatform: siteStructure.platform,
        hasBlog: siteStructure.hasBlog,
        hasKnowledgeBase: siteStructure.hasKnowledgeBase,
        pagesTotal: pageCount,
        blogPostsDiscovered: blogCount,
        kbArticlesDiscovered: kbCount,
      }));

      // Auto-enable modules based on detected platform
      if (siteStructure.platform && siteStructure.platform !== 'unknown') {
        const suggestedModules = detectModulesFromPlatform(siteStructure.platform);
        for (const moduleId of suggestedModules) {
          await autoEnableModule(moduleId);
        }
      }

      // Success message - immediately start migration
      const totalPages = siteStructure.pages.length;
      const firstPage = siteStructure.pages.find(p => p.type === 'page') || siteStructure.pages[0];
      
      const successMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `✨ **${siteStructure.siteName}** - Found ${totalPages} pages!${siteStructure.platform !== 'unknown' ? ` (${siteStructure.platform})` : ''}\n\nStarting with your homepage. I'll show you each section for review.`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);

      // AUTO-START MIGRATION with first page
      if (firstPage) {
        setMigrationState(prev => ({ ...prev, discoveryStatus: 'migrating', phase: 'pages' }));
        const fullUrl = firstPage.url.startsWith('http') 
          ? firstPage.url 
          : `${siteStructure.baseUrl}${firstPage.url}`;
        
        // Small delay for UX
        setTimeout(() => {
          startMigration(fullUrl);
        }, 500);
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze site';
      setError(message);
      setMigrationState(prev => ({ ...prev, discoveryStatus: 'idle' }));
      toast.error(message);

      const errorMessage: CopilotMessage = {
        id: generateId(),
        role: 'assistant',
        content: `❌ I couldn't analyze that site. ${message}\n\nPlease check that:\n• The URL is correct and accessible\n• The site isn't password protected`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [autoEnableModule, startMigration]);

  const selectPageForMigration = useCallback((url: string) => {
    setMigrationState(prev => {
      if (!prev.siteStructure) return prev;
      
      const updatedPages = prev.siteStructure.pages.map(p =>
        p.url === url ? { ...p, status: 'pending' as const } : p
      );
      
      return {
        ...prev,
        siteStructure: { ...prev.siteStructure, pages: updatedPages },
      };
    });
  }, []);

  const togglePageSelection = useCallback((url: string) => {
    setMigrationState(prev => {
      if (!prev.siteStructure) return prev;
      
      const updatedPages = prev.siteStructure.pages.map(p => {
        if (p.url === url) {
          const newStatus = p.status === 'pending' ? 'skipped' : 'pending';
          return { ...p, status: newStatus as 'pending' | 'skipped' };
        }
        return p;
      });
      
      return {
        ...prev,
        siteStructure: { ...prev.siteStructure, pages: updatedPages },
      };
    });
  }, []);

  const migrateSelectedPages = useCallback(async () => {
    if (!migrationState.siteStructure) return;

    const selectedPages = migrationState.siteStructure.pages.filter(
      p => p.status === 'pending'
    );

    if (selectedPages.length === 0) {
      toast.info('No pages selected for migration');
      return;
    }

    setMigrationState(prev => ({ ...prev, discoveryStatus: 'migrating', phase: 'pages' }));

    const startMsg: CopilotMessage = {
      id: generateId(),
      role: 'assistant',
      content: `🚀 Starting migration of ${selectedPages.length} pages...\n\nI'll process each page and show you the content for review.`,
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, startMsg]);

    // Start with the first selected page
    const firstPage = selectedPages[0];
    if (firstPage) {
      const fullUrl = firstPage.url.startsWith('http') 
        ? firstPage.url 
        : `${migrationState.siteStructure.baseUrl}${firstPage.url}`;
      await startMigration(fullUrl);
    }
  }, [migrationState.siteStructure, startMigration]);

  return {
    messages,
    blocks,
    isLoading,
    error,
    isAutoContinue,
    migrationState,
    sendMessage,
    approveBlock,
    rejectBlock,
    regenerateBlock,
    cancelRequest,
    clearConversation,
    stopAutoContinue,
    approvedBlocks,
    // Site discovery
    analyzeSite,
    selectPageForMigration,
    togglePageSelection,
    migrateSelectedPages,
    // Migration functions
    startMigration,
    approveMigrationBlock,
    skipMigrationBlock,
    editMigrationBlock,
    migrateNextPage,
    // Phase control
    startBlogMigration,
    startKbMigration,
    skipPhase,
  };
}
