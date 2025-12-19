import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search, ImageIcon, Check, ExternalLink, Crop } from 'lucide-react';
import { ImageCropper } from './ImageCropper';
import { useToast } from '@/hooks/use-toast';
import { getWebPFileName } from '@/lib/image-utils';

interface UnsplashPhoto {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  width: number;
  height: number;
}

interface UnsplashPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string, alt?: string) => void;
}

export function UnsplashPicker({ open, onOpenChange, onSelect }: UnsplashPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<UnsplashPhoto | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['unsplash-search', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return null;
      
      const { data, error } = await supabase.functions.invoke('unsplash-search', {
        body: { query: debouncedQuery, perPage: 24 },
      });

      if (error) throw error;
      return data as { photos: UnsplashPhoto[]; total: number };
    },
    enabled: open && debouncedQuery.length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(searchQuery);
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

  const handleSelectAndCrop = () => {
    if (selectedPhoto) {
      setShowCropper(true);
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setIsUploading(true);
    try {
      const publicUrl = await uploadToStorage(croppedBlob);
      onSelect(publicUrl, selectedPhoto?.alt);
      toast({
        title: 'Bild sparad',
        description: 'Beskuren bild har laddats upp till biblioteket',
      });
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Uppladdning misslyckades',
        description: 'Kunde inte ladda upp bilden. Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      setShowCropper(false);
    }
  };

  const handleUseOriginal = () => {
    if (selectedPhoto) {
      onSelect(selectedPhoto.url, selectedPhoto.alt);
      handleClose();
    }
  };

  const handleClose = () => {
    setSelectedPhoto(null);
    setSearchQuery('');
    setDebouncedQuery('');
    setShowCropper(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open && !showCropper} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Sök stockbilder från Unsplash
            </DialogTitle>
          </DialogHeader>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök bilder, t.ex. 'natur', 'kontor', 'medicin'..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!searchQuery.trim() || isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sök'}
            </Button>
          </form>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-[300px]">
            {isLoading || isFetching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !debouncedQuery ? (
              <div className="text-center py-12">
                <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">
                  Sök efter bilder
                </h3>
                <p className="text-muted-foreground text-sm">
                  Skriv ett sökord för att hitta gratis stockbilder
                </p>
              </div>
            ) : data?.photos.length === 0 ? (
              <div className="text-center py-12">
                <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">
                  Inga bilder hittades
                </h3>
                <p className="text-muted-foreground text-sm">
                  Prova med ett annat sökord
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
                {data?.photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all group ${
                      selectedPhoto?.id === photo.id
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
                    {selectedPhoto?.id === photo.id && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-4 w-4" />
                        </div>
                      </div>
                    )}
                    {/* Photographer credit on hover */}
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

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            <a
              href="https://unsplash.com/?utm_source=cms&utm_medium=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Powered by Unsplash
              <ExternalLink className="h-3 w-3" />
            </a>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Avbryt
              </Button>
              <Button 
                variant="secondary" 
                onClick={handleUseOriginal} 
                disabled={!selectedPhoto}
              >
                Använd original
              </Button>
              <Button 
                onClick={handleSelectAndCrop} 
                disabled={!selectedPhoto || isUploading}
              >
                <Crop className="h-4 w-4 mr-2" />
                Beskär & spara
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedPhoto && (
        <ImageCropper
          open={showCropper}
          onOpenChange={setShowCropper}
          imageUrl={selectedPhoto.url}
          onCropComplete={handleCropComplete}
          onSkip={handleUseOriginal}
        />
      )}
    </>
  );
}
