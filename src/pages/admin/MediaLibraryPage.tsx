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
  const [deleteFile, setDeleteFile] = useState<StorageFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const { data: files, isLoading, refetch } = useQuery({
    queryKey: ['media-library'],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('cms-images')
        .list('pages', {
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;
      return data as StorageFile[];
    },
  });

  const getPublicUrl = (fileName: string) => {
    const { data } = supabase.storage
      .from('cms-images')
      .getPublicUrl(`pages/${fileName}`);
    return data.publicUrl;
  };

  const handleCopyUrl = async (fileName: string) => {
    const url = getPublicUrl(fileName);
    await navigator.clipboard.writeText(url);
    setCopiedUrl(fileName);
    setTimeout(() => setCopiedUrl(null), 2000);
    toast({
      title: 'URL kopierad',
      description: 'Bildens URL har kopierats till urklipp',
    });
  };

  const handleDelete = async () => {
    if (!deleteFile) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase.storage
        .from('cms-images')
        .remove([`pages/${deleteFile.name}`]);

      if (error) throw error;

      toast({
        title: 'Bild borttagen',
        description: 'Bilden har tagits bort från mediabiblioteket',
      });
      refetch();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: 'Kunde inte ta bort bild',
        description: 'Ett fel uppstod. Försök igen.',
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
          title="Mediabibliotek"
          description="Hantera uppladdade bilder"
        >
          <Button asChild>
            <a href="/admin/pages">
              <Upload className="h-4 w-4 mr-2" />
              Ladda upp via sideditor
            </a>
          </Button>
        </AdminPageHeader>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök bilder..."
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
              {searchQuery ? 'Inga bilder hittades' : 'Inga bilder uppladdade'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery 
                ? 'Försök med en annan sökning'
                : 'Ladda upp bilder via sideditorn för att se dem här'
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
                    src={getPublicUrl(file.name)}
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
                    onClick={() => handleCopyUrl(file.name)}
                  >
                    {copiedUrl === file.name ? (
                      <Check className="h-3 w-3 mr-1" />
                    ) : (
                      <Copy className="h-3 w-3 mr-1" />
                    )}
                    Kopiera URL
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="w-full"
                    onClick={() => setDeleteFile(file)}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Ta bort
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
            <AlertDialogTitle>Ta bort bild?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort "{deleteFile?.name}"? 
              Detta kan inte ångras och bilden kommer inte längre visas på sidor där den används.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
