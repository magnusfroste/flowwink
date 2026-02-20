import { logger } from '@/lib/logger';
import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Link, Loader2, X, ImageIcon, FolderOpen, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MediaLibraryPicker } from './MediaLibraryPicker';
import { UnsplashPicker } from './UnsplashPicker';
import { convertToWebP, getWebPFileName } from '@/lib/image-utils';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  aspectRatio?: 'video' | 'square' | 'auto';
}

export function ImageUploader({ 
  value, 
  onChange, 
  label = 'Image',
  aspectRatio = 'video'
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [urlInput, setUrlInput] = useState(value || '');
  const [activeTab, setActiveTab] = useState<string>(value ? 'preview' : 'upload');
  const [showLibrary, setShowLibrary] = useState(false);
  const [showUnsplash, setShowUnsplash] = useState(false);
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
        title: 'Invalid file type',
        description: 'Please select an image file (JPG, PNG, GIF, WebP)',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 10MB for original, will be compressed)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 10MB',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert to WebP for better performance (skip if already WebP)
      let uploadBlob: Blob = file;
      let fileName = file.name;
      let contentType = file.type;

      if (file.type !== 'image/webp' && file.type !== 'image/gif') {
        try {
          uploadBlob = await convertToWebP(file, 0.85);
          fileName = getWebPFileName(file.name);
          contentType = 'image/webp';
          logger.log(`Converted to WebP: ${file.size} → ${uploadBlob.size} bytes`);
        } catch (conversionError) {
          logger.warn('WebP conversion failed, using original:', conversionError);
          // Fall back to original if conversion fails
        }
      }

      const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${fileName}`;
      const filePath = `pages/${uniqueFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('cms-images')
        .upload(filePath, uploadBlob, {
          contentType,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('cms-images')
        .getPublicUrl(filePath);

      onChange(publicUrl);
      setUrlInput(publicUrl);
      setActiveTab('preview');
      
      toast({
        title: 'Image uploaded',
        description: contentType === 'image/webp' 
          ? 'Image has been converted to WebP and uploaded'
          : 'Image has been uploaded',
      });
    } catch (error) {
      logger.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Could not upload image. Please try again.',
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="upload" className="text-xs">
            <Upload className="h-3 w-3 mr-1" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="library" className="text-xs">
            <FolderOpen className="h-3 w-3 mr-1" />
            Library
          </TabsTrigger>
          <TabsTrigger value="unsplash" className="text-xs">
            <Camera className="h-3 w-3 mr-1" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="url" className="text-xs">
            <Link className="h-3 w-3 mr-1" />
            URL
          </TabsTrigger>
          <TabsTrigger value="preview" className="text-xs" disabled={!value}>
            <ImageIcon className="h-3 w-3 mr-1" />
            Preview
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
                <span className="text-sm text-muted-foreground">Converting & uploading...</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Click to select image
                </span>
                <span className="text-xs text-muted-foreground">
                  Automatically converted to WebP
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
              Click to select from library
            </span>
          </div>
        </TabsContent>

        <TabsContent value="unsplash" className="mt-3">
          <div 
            className={`${aspectClass[aspectRatio]} border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer`}
            onClick={() => setShowUnsplash(true)}
          >
            <Camera className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Click to search stock images
            </span>
            <span className="text-xs text-muted-foreground">
              Free images from Unsplash
            </span>
          </div>
        </TabsContent>

        <TabsContent value="url" className="mt-3 space-y-3">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://example.com/image.jpg"
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleUrlSubmit}
            disabled={!urlInput.trim()}
            className="w-full"
          >
            Use URL
          </Button>
        </TabsContent>

        <TabsContent value="preview" className="mt-3">
          {value ? (
            <div className="relative group">
              <div className={`${aspectClass[aspectRatio]} rounded-lg overflow-hidden bg-muted`}>
              <img 
                  src={value} 
                  alt="Preview" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src = '';
                    e.currentTarget.alt = 'Could not load image';
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
              <span className="text-sm text-muted-foreground">No image selected</span>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <MediaLibraryPicker
        open={showLibrary}
        onOpenChange={setShowLibrary}
        onSelect={handleLibrarySelect}
      />

      <UnsplashPicker
        open={showUnsplash}
        onOpenChange={setShowUnsplash}
        onSelect={handleLibrarySelect}
      />
    </div>
  );
}
