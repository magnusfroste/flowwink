import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

export interface ModuleConfig {
  enabled: boolean;
  name: string;
  description: string;
  icon: string;
  category: 'content' | 'data' | 'communication' | 'system';
  core?: boolean; // Core modules cannot be disabled
}

export interface ModulesSettings {
  pages: ModuleConfig;
  blog: ModuleConfig;
  chat: ModuleConfig;
  newsletter: ModuleConfig;
  forms: ModuleConfig;
  leads: ModuleConfig;
  deals: ModuleConfig;
  companies: ModuleConfig;
  products: ModuleConfig;
  contentApi: ModuleConfig;
  globalElements: ModuleConfig;
  mediaLibrary: ModuleConfig;
}

export const defaultModulesSettings: ModulesSettings = {
  pages: {
    enabled: true,
    name: 'Pages',
    description: 'Create and manage web pages with block editor',
    icon: 'FileText',
    category: 'content',
    core: true,
  },
  blog: {
    enabled: true,
    name: 'Blog',
    description: 'Blog posts with categories, tags and RSS feed',
    icon: 'BookOpen',
    category: 'content',
  },
  chat: {
    enabled: false,
    name: 'AI Chat',
    description: 'Intelligent chatbot with Context-Augmented Generation',
    icon: 'MessageSquare',
    category: 'communication',
  },
  newsletter: {
    enabled: false,
    name: 'Newsletter',
    description: 'Email campaigns and subscriber management via Resend',
    icon: 'Mail',
    category: 'communication',
  },
  forms: {
    enabled: true,
    name: 'Forms',
    description: 'Form submissions and contact requests',
    icon: 'Inbox',
    category: 'data',
  },
  leads: {
    enabled: true,
    name: 'Leads',
    description: 'AI-driven lead management with automatic qualification',
    icon: 'UserCheck',
    category: 'data',
  },
  deals: {
    enabled: true,
    name: 'Deals',
    description: 'Pipeline management for sales opportunities',
    icon: 'Briefcase',
    category: 'data',
  },
  companies: {
    enabled: true,
    name: 'Companies',
    description: 'Organization management with multiple contacts',
    icon: 'Building2',
    category: 'data',
  },
  products: {
    enabled: true,
    name: 'Products',
    description: 'Product catalog for deals and services',
    icon: 'Package',
    category: 'data',
  },
  contentApi: {
    enabled: false,
    name: 'Content Hub',
    description: 'REST and GraphQL API for headless CMS',
    icon: 'Database',
    category: 'system',
  },
  globalElements: {
    enabled: true,
    name: 'Global Elements',
    description: 'Header, footer and other reusable components',
    icon: 'LayoutGrid',
    category: 'system',
  },
  mediaLibrary: {
    enabled: true,
    name: 'Media Library',
    description: 'Manage images and files',
    icon: 'Image',
    category: 'data',
    core: true,
  },
};

// Map sidebar items to module IDs
export const SIDEBAR_TO_MODULE: Record<string, keyof ModulesSettings> = {
  '/admin/pages': 'pages',
  '/admin/blog': 'blog',
  '/admin/chat': 'chat',
  '/admin/newsletter': 'newsletter',
  '/admin/forms': 'forms',
  '/admin/leads': 'leads',
  '/admin/deals': 'deals',
  '/admin/companies': 'companies',
  '/admin/products': 'products',
  '/admin/content-hub': 'contentApi',
  '/admin/global-blocks': 'globalElements',
  '/admin/media': 'mediaLibrary',
};

export function useModules() {
  return useQuery({
    queryKey: ['site-settings', 'modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'modules')
        .maybeSingle();

      if (error) throw error;
      
      // Merge stored settings with defaults to ensure all modules exist
      const stored = (data?.value as unknown as Partial<ModulesSettings>) || {};
      return {
        ...defaultModulesSettings,
        ...Object.fromEntries(
          Object.entries(stored).map(([key, value]) => [
            key,
            { ...defaultModulesSettings[key as keyof ModulesSettings], ...value }
          ])
        ),
      } as ModulesSettings;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateModules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (modules: ModulesSettings) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'modules')
        .maybeSingle();

      const jsonValue = modules as unknown as Json;

      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ 
            value: jsonValue,
            updated_at: new Date().toISOString()
          })
          .eq('key', 'modules');

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ 
            key: 'modules', 
            value: jsonValue
          });

        if (error) throw error;
      }

      return modules;
    },
    onSuccess: (modules) => {
      queryClient.setQueryData(['site-settings', 'modules'], modules);
      toast({
        title: 'Saved',
        description: 'Module settings have been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Could not save module settings.',
        variant: 'destructive',
      });
      console.error('Failed to update modules:', error);
    },
  });
}

export function useIsModuleEnabled(moduleId: keyof ModulesSettings): boolean {
  const { data: modules } = useModules();
  return modules?.[moduleId]?.enabled ?? defaultModulesSettings[moduleId]?.enabled ?? false;
}

export function useEnabledModules(): (keyof ModulesSettings)[] {
  const { data: modules } = useModules();
  if (!modules) return Object.keys(defaultModulesSettings) as (keyof ModulesSettings)[];
  
  return Object.entries(modules)
    .filter(([_, config]) => config.enabled)
    .map(([key]) => key as keyof ModulesSettings);
}
