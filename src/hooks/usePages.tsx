import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Page, PageStatus, ContentBlock, PageMeta } from '@/types/cms';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './useAuth';
import type { Json } from '@/integrations/supabase/types';

// Helper to safely cast database JSON to our types
function parsePage(data: {
  id: string;
  slug: string;
  title: string;
  status: string;
  content_json: Json;
  meta_json: Json;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  scheduled_at?: string | null;
}): Page {
  return {
    ...data,
    status: data.status as PageStatus,
    content_json: (data.content_json || []) as unknown as ContentBlock[],
    meta_json: (data.meta_json || {}) as unknown as PageMeta,
    scheduled_at: data.scheduled_at ?? null,
  };
}

export function usePages(status?: PageStatus) {
  return useQuery({
    queryKey: ['pages', status],
    queryFn: async () => {
      let query = supabase
        .from('pages')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []).map(parsePage);
    },
  });
}

export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: ['page', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('pages')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      return parsePage(data);
    },
    enabled: !!id,
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useCreatePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ title, slug }: { title: string; slug: string }) => {
      const { data, error } = await supabase
        .from('pages')
        .insert({
          title,
          slug,
          status: 'draft' as PageStatus,
          content_json: [] as unknown as Json,
          meta_json: {} as unknown as Json,
          created_by: user?.id,
          updated_by: user?.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: 'create_page',
        entity_type: 'page',
        entity_id: data.id,
        user_id: user?.id,
        metadata: { title, slug } as unknown as Json,
      });
      
      return parsePage(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      toast({
        title: 'Sida skapad',
        description: 'En ny sida har skapats.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      title, 
      content_json, 
      meta_json 
    }: { 
      id: string; 
      title?: string;
      content_json?: ContentBlock[];
      meta_json?: PageMeta;
    }) => {
      const updates: Record<string, unknown> = {
        updated_by: user?.id,
      };
      
      if (title !== undefined) updates.title = title;
      if (content_json !== undefined) updates.content_json = content_json as unknown as Json;
      if (meta_json !== undefined) updates.meta_json = meta_json as unknown as Json;
      
      const { data, error } = await supabase
        .from('pages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Create audit log for page update
      await supabase.from('audit_logs').insert({
        action: 'update_page',
        entity_type: 'page',
        entity_id: id,
        user_id: user?.id,
        metadata: { 
          updated_fields: Object.keys(updates).filter(k => k !== 'updated_by'),
        } as unknown as Json,
      });
      
      return parsePage(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.setQueryData(['page', data.id], data);
    },
    onError: (error: Error) => {
      toast({
        title: 'Fel vid sparande',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdatePageStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status,
      feedback,
      scheduledAt
    }: { 
      id: string; 
      status: PageStatus;
      feedback?: string;
      scheduledAt?: Date | null;
    }) => {
      const updates: Record<string, unknown> = {
        status,
        updated_by: user?.id,
      };
      
      // Handle scheduling
      if (scheduledAt !== undefined) {
        updates.scheduled_at = scheduledAt ? scheduledAt.toISOString() : null;
      }
      
      const { data, error } = await supabase
        .from('pages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: `status_change_${status}`,
        entity_type: 'page',
        entity_id: id,
        user_id: user?.id,
        metadata: { 
          new_status: status,
          feedback: feedback || null,
        } as unknown as Json,
      });
      
      // If publishing, create a version snapshot
      if (status === 'published' && data) {
        await supabase.from('page_versions').insert({
          page_id: id,
          title: data.title,
          content_json: data.content_json,
          meta_json: data.meta_json,
          created_by: user?.id,
        });
      }
      
      return parsePage(data);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['page', data.id] });
      
      const messages: Record<PageStatus, string> = {
        draft: 'Sidan har återförvisats till utkast.',
        reviewing: 'Sidan har skickats för granskning.',
        published: 'Sidan har publicerats!',
        archived: 'Sidan har arkiverats.',
      };
      
      toast({
        title: 'Status uppdaterad',
        description: messages[variables.status],
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Create audit log
      await supabase.from('audit_logs').insert({
        action: 'delete_page',
        entity_type: 'page',
        entity_id: id,
        user_id: user?.id,
        metadata: {} as unknown as Json,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      toast({
        title: 'Sida raderad',
        description: 'Sidan har raderats permanent.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function usePageVersions(pageId: string | undefined) {
  return useQuery({
    queryKey: ['page-versions', pageId],
    queryFn: async () => {
      if (!pageId) return [];
      
      const { data, error } = await supabase
        .from('page_versions')
        .select('*')
        .eq('page_id', pageId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      
      return data;
    },
    enabled: !!pageId,
  });
}
