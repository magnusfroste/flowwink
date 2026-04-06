import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface HandbookChapter {
  id: string;
  repo_owner: string;
  repo_name: string;
  file_path: string;
  title: string;
  slug: string;
  sort_order: number;
  frontmatter: Record<string, unknown>;
  content: string;
  sha: string;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface HandbookConfig {
  repoOwner: string;
  repoName: string;
  path: string;
  branch: string;
}

const DEFAULT_CONFIG: HandbookConfig = {
  repoOwner: 'magnusfroste',
  repoName: 'clawable',
  path: 'content/chapters',
  branch: 'main',
};

export function useHandbookConfig() {
  return useQuery({
    queryKey: ['site-settings', 'handbook_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'handbook_config')
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_CONFIG, ...(data?.value as unknown as Partial<HandbookConfig>) };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateHandbookConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: HandbookConfig) => {
      const { data: existing } = await supabase
        .from('site_settings')
        .select('id')
        .eq('key', 'handbook_config')
        .maybeSingle();

      const value = config as unknown as Record<string, unknown>;
      if (existing) {
        const { error } = await supabase
          .from('site_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', 'handbook_config');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('site_settings')
          .insert({ key: 'handbook_config', value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-settings', 'handbook_config'] });
      toast.success('Handbook config saved');
    },
    onError: () => toast.error('Failed to save handbook config'),
  });
}

export function useHandbookChapters(repoOwner?: string, repoName?: string) {
  return useQuery({
    queryKey: ['handbook-chapters', repoOwner, repoName],
    queryFn: async () => {
      let query = supabase
        .from('handbook_chapters')
        .select('*')
        .order('sort_order', { ascending: true });

      if (repoOwner) query = query.eq('repo_owner', repoOwner);
      if (repoName) query = query.eq('repo_name', repoName);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as HandbookChapter[];
    },
    enabled: !!repoOwner && !!repoName,
  });
}

export function useSyncHandbook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (config: HandbookConfig) => {
      const { data, error } = await supabase.functions.invoke('github-content-sync', {
        body: {
          repo_owner: config.repoOwner,
          repo_name: config.repoName,
          path: config.path,
          branch: config.branch,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['handbook-chapters'] });
      toast.success(`Synced ${data.synced} chapters (${data.skipped} unchanged, ${data.deleted} removed)`);
    },
    onError: (err) => toast.error(`Sync failed: ${err.message}`),
  });
}
