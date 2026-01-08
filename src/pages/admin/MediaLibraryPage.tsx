import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { convertToWebP } from '@/lib/image-utils';
import { cn } from '@/lib/utils';
import { UnsplashPicker } from '@/components/admin/UnsplashPicker';
import { ImageCropper } from '@/components/admin/ImageCropper';
import { 
  Loader2, 
  Search, 
  Trash2, 
  Copy, 
  Check,
  ImageIcon,
  Upload,
  Crop,
  Image as ImageIconLucide,
  X
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [folderFilter, setFolderFilter] = useState<'all' | 'pages' | 'imports'>('all');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [deleteFile, setDeleteFile] = useState<(StorageFile & { folder: string }) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showUnsplash, setShowUnsplash] = useState(false);
  const [editingImage, setEditingImage] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

      return allFiles as (StorageFile & { folder: string })[];
    },
  });

  const getPublicUrl = (file: StorageFile & { folder: string }) => {
    const { data } = supabase.storage
      .from('cms-images')
      .getPublicUrl(`${file.folder}/${file.name}`);
    return data.publicUrl;
  };

  const handleUpload = useCallback(async (filesToUpload: FileList | File[]) => {
    const imageFiles = Array.from(filesToUpload).filter(f => f.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      toast({
        title: 'No images selected',
        description: 'Please select image files to upload',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress({ current: 0, total: imageFiles.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      setUploadProgress({ current: i + 1, total: imageFiles.length });

      try {
        // Convert to WebP for optimization
        const webpBlob = await convertToWebP(file);
        const fileName = `${Date.now()}-${file.name.replace(/\.[^/.]+$/, '')}.webp`;

        const { error } = await supabase.storage
          .from('cms-images')
          .upload(`pages/${fileName}`, webpBlob, {
            contentType: 'image/webp',
            cacheControl: '31536000',
          });

        if (error) throw error;
        successCount++;
      } catch (error) {
        console.error('Upload error:', error);
        failCount++;
      }
    }

    setIsUploading(false);
    setUploadProgress(null);

    if (successCount > 0) {
      toast({
        title: `${successCount} image${successCount > 1 ? 's' : ''} uploaded`,
        description: failCount > 0 ? `${failCount} failed` : 'Images are now available in your library',
      });
      refetch();
    } else {
      toast({
        title: 'Upload failed',
        description: 'Could not upload images. Please try again.',
        variant: 'destructive',
      });
    }
  }, [toast, refetch]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files?.length) {
      handleUpload(e.dataTransfer.files);
    }
  }, [handleUpload]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleUpload(e.target.files);
    }
  }, [handleUpload]);

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
      const folder = deleteFile.folder || 'pages';
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

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    
    setIsDeleting(true);
    try {
      const filesToDelete = files?.filter(f => selectedFiles.has(f.id)) || [];
      const paths = filesToDelete.map(f => `${f.folder}/${f.name}`);
      
      const { error } = await supabase.storage
        .from('cms-images')
        .remove(paths);

      if (error) throw error;

      toast({
        title: `${selectedFiles.size} image${selectedFiles.size > 1 ? 's' : ''} deleted`,
        description: 'Images have been removed from the media library',
      });
      setSelectedFiles(new Set());
      refetch();
    } catch (error) {
      console.error('Bulk delete error:', error);
      toast({
        title: 'Could not delete images',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setShowBulkDelete(false);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
    }
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredFiles = files?.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = folderFilter === 'all' || file.folder === folderFilter;
    return matchesSearch && matchesFolder;
  }) || [];

  return (
    <AdminLayout>
      <div 
        className="space-y-6"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <AdminPageHeader 
          title="Media Library"
          description="Manage uploaded images"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInput}
            className="hidden"
          />
          <Button variant="outline" onClick={() => setShowUnsplash(true)} disabled={isUploading}>
            <ImageIconLucide className="h-4 w-4 mr-2" />
            Unsplash
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isUploading && uploadProgress 
              ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
              : 'Upload Images'
            }
          </Button>
        </AdminPageHeader>

        {/* Drag overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-card border-2 border-dashed border-primary rounded-xl p-12 text-center">
              <Upload className="h-16 w-16 mx-auto text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Drop images here</h3>
              <p className="text-muted-foreground">Release to upload your images</p>
            </div>
          </div>
        )}

        {/* Filter tabs and Search */}
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
            {(['all', 'pages', 'imports'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFolderFilter(tab)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  folderFilter === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === 'all' ? 'All' : tab === 'pages' ? 'Pages' : 'Imports'}
              </button>
            ))}
          </div>
          <div className="relative max-w-md w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Bulk selection bar */}
        {selectedFiles.size > 0 && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedFiles.size === filteredFiles.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm font-medium">
                {selectedFiles.size} selected
              </span>
            </div>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => setShowBulkDelete(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete {selectedFiles.size}
            </Button>
          </div>
        )}

        {/* Drop zone when empty */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredFiles.length === 0 ? (
          <div 
            className={cn(
              "text-center py-16 bg-muted/30 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
              "hover:border-primary/50 hover:bg-muted/50"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No images found' : 'Drop images here or click to upload'}
            </h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery 
                ? 'Try a different search'
                : 'Supports JPG, PNG, GIF, WebP • Automatically optimized'
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {/* Upload tile */}
            <div 
              className={cn(
                "aspect-square bg-muted/30 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
                "hover:border-primary/50 hover:bg-muted/50 flex flex-col items-center justify-center"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground">Upload</span>
            </div>

            {filteredFiles.map((file) => (
              <div 
                key={file.id} 
                className={cn(
                  "group relative bg-card rounded-lg border overflow-hidden",
                  selectedFiles.has(file.id) && "ring-2 ring-primary"
                )}
              >
                {/* Selection checkbox */}
                <div 
                  className={cn(
                    "absolute top-2 left-2 z-10 transition-opacity",
                    selectedFiles.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selectedFiles.has(file.id)}
                    onCheckedChange={() => toggleFileSelection(file.id)}
                    className="bg-background/80 backdrop-blur-sm"
                  />
                </div>

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
                    onClick={() => setEditingImage({ url: getPublicUrl(file), name: file.name })}
                  >
                    <Crop className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFiles.size} images?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete these images? 
              This cannot be undone and the images will no longer display on pages where they're used.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete {selectedFiles.size} images
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsplash Picker */}
      <UnsplashPicker
        open={showUnsplash}
        onOpenChange={setShowUnsplash}
        onSelect={(url) => {
          setShowUnsplash(false);
          toast({
            title: 'Image added',
            description: 'Unsplash image has been added to your library',
          });
          refetch();
        }}
      />

      {/* Image Editor */}
      <ImageCropper
        open={!!editingImage}
        onOpenChange={(open) => !open && setEditingImage(null)}
        imageUrl={editingImage?.url || ''}
        onCropComplete={async (blob) => {
          if (!editingImage) return;
          try {
            const fileName = `edited-${Date.now()}-${editingImage.name}`;
            const { error } = await supabase.storage
              .from('cms-images')
              .upload(`pages/${fileName}`, blob, {
                contentType: 'image/webp',
                cacheControl: '31536000',
              });

            if (error) throw error;

            toast({
              title: 'Image saved',
              description: 'Edited image has been saved to your library',
            });
            refetch();
          } catch (error) {
            console.error('Save error:', error);
            toast({
              title: 'Save failed',
              description: 'Could not save edited image',
              variant: 'destructive',
            });
          }
          setEditingImage(null);
        }}
      />
    </AdminLayout>
  );
}
