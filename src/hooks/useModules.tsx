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
  contentApi: ModuleConfig;
  globalElements: ModuleConfig;
  mediaLibrary: ModuleConfig;
}

export const defaultModulesSettings: ModulesSettings = {
  pages: {
    enabled: true,
    name: 'Sidor',
    description: 'Skapa och hantera webbsidor med blockeditor',
    icon: 'FileText',
    category: 'content',
    core: true,
  },
  blog: {
    enabled: true,
    name: 'Blogg',
    description: 'Blogginlägg med kategorier, taggar och RSS-flöde',
    icon: 'BookOpen',
    category: 'content',
  },
  chat: {
    enabled: false,
    name: 'AI-chatt',
    description: 'Intelligent chatbot med Context-Augmented Generation',
    icon: 'MessageSquare',
    category: 'communication',
  },
  newsletter: {
    enabled: false,
    name: 'Nyhetsbrev',
    description: 'E-postutskick och prenumeranthantering via Resend',
    icon: 'Mail',
    category: 'communication',
  },
  forms: {
    enabled: true,
    name: 'Formulär',
    description: 'Formulärinlämningar och kontaktförfrågningar',
    icon: 'Inbox',
    category: 'data',
  },
  leads: {
    enabled: true,
    name: 'Leads',
    description: 'AI-driven lead-hantering med automatisk kvalificering',
    icon: 'UserCheck',
    category: 'data',
  },
  contentApi: {
    enabled: false,
    name: 'Content Hub',
    description: 'REST och GraphQL API för headless CMS',
    icon: 'Database',
    category: 'system',
  },
  globalElements: {
    enabled: true,
    name: 'Globala element',
    description: 'Header, footer och andra återanvändbara komponenter',
    icon: 'LayoutGrid',
    category: 'system',
  },
  mediaLibrary: {
    enabled: true,
    name: 'Mediabibliotek',
    description: 'Hantera bilder och filer',
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
        title: 'Sparad',
        description: 'Modulinställningarna har uppdaterats.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara modulinställningar.',
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
