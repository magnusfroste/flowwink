import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search, ImageIcon, Check, FolderOpen, Camera, ExternalLink, Crop } from 'lucide-react';
import { ImageCropper } from './ImageCropper';
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

interface UnsplashPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

interface MediaLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}

export function MediaLibraryPicker({ open, onOpenChange, onSelect }: MediaLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ folder: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'library' | 'unsplash'>('library');
  
  // Unsplash state
  const [unsplashQuery, setUnsplashQuery] = useState('');
  const [debouncedUnsplashQuery, setDebouncedUnsplashQuery] = useState('');
  const [selectedUnsplashPhoto, setSelectedUnsplashPhoto] = useState<UnsplashPhoto | null>(null);
  
  // Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const { data: files, isLoading: isLoadingFiles } = useQuery({
    queryKey: ['media-library-picker'],
    queryFn: async () => {
      // Fetch from all folders like useMediaLibrary does
      const [pagesResult, importsResult, templatesResult] = await Promise.all([
        supabase.storage.from('cms-images').list('pages', {
          sortBy: { column: 'created_at', order: 'desc' },
        }),
        supabase.storage.from('cms-images').list('imports', {
          sortBy: { column: 'created_at', order: 'desc' },
        }),
        supabase.storage.from('cms-images').list('templates', {
          sortBy: { column: 'created_at', order: 'desc' },
        }),
      ]);

      const pagesFiles = (pagesResult.data || []).map(f => ({ ...f, folder: 'pages' }));
      const importsFiles = (importsResult.data || []).map(f => ({ ...f, folder: 'imports' }));
      const templatesFiles = (templatesResult.data || []).map(f => ({ ...f, folder: 'templates' }));
      
      const allFiles = [...pagesFiles, ...importsFiles, ...templatesFiles].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return allFiles as StorageFile[];
    },
    enabled: open && activeTab === 'library',
  });

  const { data: unsplashData, isLoading: isLoadingUnsplash, isFetching: isFetchingUnsplash } = useQuery({
    queryKey: ['unsplash-search', debouncedUnsplashQuery],
    queryFn: async () => {
      if (!debouncedUnsplashQuery.trim()) return null;
      
      const { data, error } = await supabase.functions.invoke('unsplash-search', {
        body: { query: debouncedUnsplashQuery, perPage: 24 },
      });

      if (error) throw error;
      return data as { photos: UnsplashPhoto[]; total: number };
    },
    enabled: open && activeTab === 'unsplash' && debouncedUnsplashQuery.length > 0,
  });

  const getPublicUrl = (folder: string, fileName: string) => {
    const { data } = supabase.storage
      .from('cms-images')
      .getPublicUrl(`${folder}/${fileName}`);
    return data.publicUrl;
  };

  const uploadToStorage = async (blob: Blob): Promise<string> => {
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-cropped.webp`;
    const filePath = `pages/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('cms-images')
      .upload(filePath, blob, {
        contentType: 'image/webp',
      });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('cms-images')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSelect = () => {
    if (activeTab === 'library' && selectedFile) {
      onSelect(getPublicUrl(selectedFile.folder, selectedFile.name));
      setSelectedFile(null);
      onOpenChange(false);
    } else if (activeTab === 'unsplash' && selectedUnsplashPhoto) {
      onSelect(selectedUnsplashPhoto.url);
      handleClose();
    }
  };

  const handleSelectAndCrop = () => {
    if (selectedUnsplashPhoto) {
      setShowCropper(true);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setIsUploading(true);
    try {
      const publicUrl = await uploadToStorage(croppedBlob);
      onSelect(publicUrl);
      toast({
        title: 'Image saved',
        description: 'Cropped image has been uploaded to library',
      });
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not upload image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setShowCropper(false);
    }
  };

  const handleUnsplashSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedUnsplashQuery(unsplashQuery);
  };

  const handleClose = () => {
    setSelectedFile(null);
    setSelectedUnsplashPhoto(null);
    setSearchQuery('');
    setUnsplashQuery('');
    setDebouncedUnsplashQuery('');
    setShowCropper(false);
    onOpenChange(false);
  };

  const filteredFiles = files?.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <>
      <Dialog open={open && !showCropper} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden z-[100]">
          <DialogHeader>
            <DialogTitle>Select image</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'library' | 'unsplash')} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="library" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Library
              </TabsTrigger>
              <TabsTrigger value="unsplash" className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Stock images
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library" className="flex-1 flex flex-col mt-4 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search images..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[50vh]">
                {isLoadingFiles ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredFiles.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-1">
                      {searchQuery ? 'No images found' : 'No images uploaded'}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {searchQuery 
                        ? 'Try a different search term'
                        : 'Upload images via the "Upload" tab'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
                    {filteredFiles.map((file) => {
                      const isSelected = selectedFile?.folder === file.folder && selectedFile?.name === file.name;
                      return (
                        <button
                          key={`${file.folder}/${file.id}`}
                          onClick={() => setSelectedFile({ folder: file.folder, name: file.name })}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                            isSelected 
                              ? 'border-primary ring-2 ring-primary/20' 
                              : 'border-transparent hover:border-muted-foreground/30'
                          }`}
                        >
                          <img
                            src={getPublicUrl(file.folder, file.name)}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <div className="bg-primary text-primary-foreground rounded-full p-1">
                                <Check className="h-4 w-4" />
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="unsplash" className="flex-1 flex flex-col mt-4 space-y-4">
              {/* Search */}
              <form onSubmit={handleUnsplashSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search images, e.g. 'nature', 'office', 'medicine'..."
                    value={unsplashQuery}
                    onChange={(e) => setUnsplashQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button type="submit" disabled={!unsplashQuery.trim() || isFetchingUnsplash}>
                  {isFetchingUnsplash ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </Button>
              </form>

              {/* Content */}
              <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[50vh]">
                {isLoadingUnsplash || isFetchingUnsplash ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !debouncedUnsplashQuery ? (
                  <div className="text-center py-12">
                    <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-1">
                      Search for images
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Enter a search term to find free stock images
                    </p>
                  </div>
                ) : unsplashData?.photos.length === 0 ? (
                  <div className="text-center py-12">
                    <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-1">
                      No images found
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Try a different search term
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
                    {unsplashData?.photos.map((photo) => (
                      <button
                        key={photo.id}
                        onClick={() => setSelectedUnsplashPhoto(photo)}
                        className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all group ${
                          selectedUnsplashPhoto?.id === photo.id
                            ? 'border-primary ring-2 ring-primary/20'
                            : 'border-transparent hover:border-muted-foreground/30'
                        }`}
                      >
                        <img
                          src={photo.thumbUrl}
                          alt={photo.alt}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {selectedUnsplashPhoto?.id === photo.id && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-4 w-4" />
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-white text-xs truncate">
                            Foto: {photo.photographer}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Unsplash attribution */}
              <a
                href="https://unsplash.com/?utm_source=cms&utm_medium=referral"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Powered by Unsplash
                <ExternalLink className="h-3 w-3" />
              </a>
            </TabsContent>
          </Tabs>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {activeTab === 'library' ? (
              <Button onClick={handleSelect} disabled={!selectedFile}>
                Select image
              </Button>
            ) : (
              <>
                <Button 
                  variant="secondary" 
                  onClick={handleSelect} 
                  disabled={!selectedUnsplashPhoto}
                >
                  Use original
                </Button>
                <Button 
                  onClick={handleSelectAndCrop} 
                  disabled={!selectedUnsplashPhoto || isUploading}
                >
                  <Crop className="h-4 w-4 mr-2" />
                  Crop & save
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedUnsplashPhoto && (
        <ImageCropper
          open={showCropper}
          onOpenChange={setShowCropper}
          imageUrl={selectedUnsplashPhoto.url}
          onCropComplete={handleCropComplete}
          onSkip={handleSelect}
        />
      )}
    </>
  );
}
