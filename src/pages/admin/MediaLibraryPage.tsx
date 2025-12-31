import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Search, 
  Trash2, 
  Copy, 
  Check,
  ImageIcon,
  Upload
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
}

export default function MediaLibraryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deleteFile, setDeleteFile] = useState<(StorageFile & { folder: string }) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const { data: files, isLoading, refetch } = useQuery({
    queryKey: ['media-library'],
    queryFn: async () => {
      // Fetch from both pages/ and imports/ folders
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
      
      // Combine and sort by created_at
      const allFiles = [...pagesFiles, ...importsFiles].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return allFiles as (StorageFile & { folder: string })[];
    },
  });

  const getPublicUrl = (file: StorageFile & { folder: string }) => {
    const { data } = supabase.storage
      .from('cms-images')
      .getPublicUrl(`${file.folder}/${file.name}`);
    return data.publicUrl;
  };

  const handleCopyUrl = async (file: StorageFile & { folder: string }) => {
    const url = getPublicUrl(file);
    await navigator.clipboard.writeText(url);
    setCopiedUrl(file.name);
    setTimeout(() => setCopiedUrl(null), 2000);
    toast({
      title: 'URL Copied',
      description: 'Image URL has been copied to clipboard',
    });
  };

  const handleDelete = async () => {
    if (!deleteFile) return;
    
    setIsDeleting(true);
    try {
      const folder = (deleteFile as StorageFile & { folder: string }).folder || 'pages';
      const { error } = await supabase.storage
        .from('cms-images')
        .remove([`${folder}/${deleteFile.name}`]);

      if (error) throw error;

      toast({
        title: 'Image Deleted',
        description: 'Image has been removed from the media library',
      });
      refetch();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Could not delete image',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteFile(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredFiles = files?.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader 
          title="Media Library"
          description="Manage uploaded images"
        >
          <Button asChild>
            <a href="/admin/pages">
              <Upload className="h-4 w-4 mr-2" />
              Upload via page editor
            </a>
          </Button>
        </AdminPageHeader>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search images..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed">
            <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No images found' : 'No images uploaded'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery 
                ? 'Try a different search'
                : 'Upload images via the page editor to see them here'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredFiles.map((file) => (
              <div 
                key={file.id} 
                className="group relative bg-card rounded-lg border overflow-hidden"
              >
                <div className="aspect-square bg-muted">
                  <img
                    src={getPublicUrl(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                
                {/* Overlay with actions */}
                <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => handleCopyUrl(file)}
                  >
                    {copiedUrl === file.name ? (
                      <Check className="h-3 w-3 mr-1" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Copy URL
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => setDeleteFile(file)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>

                {/* File info */}
                <div className="p-2 border-t">
                  <p className="text-xs text-foreground truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.metadata?.size ?? 0)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteFile} onOpenChange={() => setDeleteFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteFile?.name}"? 
              This cannot be undone and the image will no longer display on pages where it's used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
