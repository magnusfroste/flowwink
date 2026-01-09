import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
  folder: string;
}

export function useMediaLibrary() {
  const { data: files, isLoading, refetch } = useQuery({
    queryKey: ['media-library'],
    queryFn: async () => {
      const [pagesResult, importsResult] = await Promise.all([
        supabase.storage.from('cms-images').list('pages', {
          sortBy: { column: 'created_at', order: 'desc' },
        }),
        supabase.storage.from('cms-images').list('imports', {
          sortBy: { column: 'created_at', order: 'desc' },
        }),
      ]);

      const pagesFiles = (pagesResult.data || []).map(f => ({ ...f, folder: 'pages' }));
      const importsFiles = (importsResult.data || []).map(f => ({ ...f, folder: 'imports' }));
      
      const allFiles = [...pagesFiles, ...importsFiles].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return allFiles as StorageFile[];
    },
  });

  return { files, isLoading, refetch };
}

export function useMediaLibraryCount() {
  const { data: count, isLoading } = useQuery({
    queryKey: ['media-library-count'],
    queryFn: async () => {
      const [pagesResult, importsResult] = await Promise.all([
        supabase.storage.from('cms-images').list('pages'),
        supabase.storage.from('cms-images').list('imports'),
      ]);

      const pagesCount = pagesResult.data?.length || 0;
      const importsCount = importsResult.data?.length || 0;
      
      return pagesCount + importsCount;
    },
  });

  return { count: count || 0, isLoading };
}

export function useClearMediaLibrary() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (onProgress?: (current: number, total: number, step: string) => void) => {
      // Get all files from both folders
      const [pagesResult, importsResult] = await Promise.all([
        supabase.storage.from('cms-images').list('pages'),
        supabase.storage.from('cms-images').list('imports'),
      ]);

      const pagesFiles = (pagesResult.data || []).map(f => `pages/${f.name}`);
      const importsFiles = (importsResult.data || []).map(f => `imports/${f.name}`);
      const allFiles = [...pagesFiles, ...importsFiles];

      if (allFiles.length === 0) {
        return { deleted: 0 };
      }

      // Delete in batches of 100 (Supabase limit)
      const batchSize = 100;
      let deleted = 0;

      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);
        
        if (onProgress) {
          onProgress(deleted, allFiles.length, `Deleting media files...`);
        }

        const { error } = await supabase.storage
          .from('cms-images')
          .remove(batch);

        if (error) {
          console.error('Error deleting batch:', error);
          throw error;
        }

        deleted += batch.length;
      }

      return { deleted };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['media-library'] });
      queryClient.invalidateQueries({ queryKey: ['media-library-count'] });
      toast({
        title: 'Media library cleared',
        description: `${result.deleted} files deleted successfully.`,
      });
    },
    onError: (error) => {
      console.error('Error clearing media library:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear media library. Please try again.',
        variant: 'destructive',
      });
    },
  });
}
