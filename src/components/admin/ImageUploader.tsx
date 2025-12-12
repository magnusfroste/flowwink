import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Link, Loader2, X, ImageIcon, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MediaLibraryPicker } from './MediaLibraryPicker';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspectRatio?: 'video' | 'square' | 'auto';
}

export function ImageUploader({ 
  value, 
  onChange, 
  label = 'Bild',
  aspectRatio = 'video'
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState(value || '');
  const [activeTab, setActiveTab] = useState<string>(value ? 'preview' : 'upload');
  const [showLibrary, setShowLibrary] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleLibrarySelect = (url: string) => {
    onChange(url);
    setUrlInput(url);
    setActiveTab('preview');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Ogiltig filtyp',
        description: 'Välj en bildfil (JPG, PNG, GIF, WebP)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Filen är för stor',
        description: 'Maximal filstorlek är 5MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `pages/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('cms-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('cms-images')
        .getPublicUrl(filePath);

      onChange(publicUrl);
      setUrlInput(publicUrl);
      setActiveTab('preview');
      
      toast({
        title: 'Bild uppladdad',
        description: 'Bilden har laddats upp',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Uppladdning misslyckades',
        description: 'Kunde inte ladda upp bilden. Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setActiveTab('preview');
    }
  };

  const handleClear = () => {
    onChange('');
    setUrlInput('');
    setActiveTab('upload');
  };

  const aspectClass = {
    video: 'aspect-video',
    square: 'aspect-square',
    auto: 'min-h-[120px]',
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload" className="text-xs">
            <Upload className="h-3 w-3 mr-1" />
            Ladda upp
          </TabsTrigger>
          <TabsTrigger value="library" className="text-xs">
            <FolderOpen className="h-3 w-3 mr-1" />
            Bibliotek
          </TabsTrigger>
          <TabsTrigger value="url" className="text-xs">
            <Link className="h-3 w-3 mr-1" />
            URL
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs" disabled={!value}>
            <ImageIcon className="h-3 w-3 mr-1" />
            Förhandsv.
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-3">
          <div 
            className={`${aspectClass[aspectRatio]} border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer`}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Laddar upp...</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Klicka för att välja bild
                </span>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG, GIF, WebP (max 5MB)
                </span>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </TabsContent>

        <TabsContent value="library" className="mt-3">
          <div 
            className={`${aspectClass[aspectRatio]} border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer`}
            onClick={() => setShowLibrary(true)}
          >
            <FolderOpen className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Klicka för att välja från biblioteket
            </span>
          </div>
        </TabsContent>

        <TabsContent value="url" className="mt-3 space-y-3">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/bild.jpg"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim()}
            className="w-full"
          >
            Använd URL
          </Button>
        </TabsContent>

        <TabsContent value="preview" className="mt-3">
          {value ? (
            <div className="relative group">
              <div className={`${aspectClass[aspectRatio]} rounded-lg overflow-hidden bg-muted`}>
                <img 
                  src={value} 
                  alt="Förhandsgranskning" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '';
                    e.currentTarget.alt = 'Kunde inte ladda bilden';
                  }}
                />
              </div>
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleClear}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className={`${aspectClass[aspectRatio]} rounded-lg bg-muted flex items-center justify-center`}>
              <span className="text-sm text-muted-foreground">Ingen bild vald</span>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MediaLibraryPicker
        open={showLibrary}
        onOpenChange={setShowLibrary}
        onSelect={handleLibrarySelect}
      />
    </div>
  );
}
