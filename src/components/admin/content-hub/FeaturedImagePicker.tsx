import { useState } from 'react';
import { Image, Upload, X, Info, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';
import { cn } from '@/lib/utils';

interface FeaturedImagePickerProps {
  value: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  inheritedChannelCount?: number;
  className?: string;
}

export function FeaturedImagePicker({
  value,
  onChange,
  disabled = false,
  inheritedChannelCount = 0,
  className,
}: FeaturedImagePickerProps) {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const handleMediaSelect = (url: string) => {
    onChange(url);
    setShowMediaLibrary(false);
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setUrlInput('');
      setShowUrlInput(false);
    }
  };

  const handleRemove = () => {
    onChange(null);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Image className="h-4 w-4" />
          Featured Image
        </Label>
        {inheritedChannelCount > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" />
            Inherited by {inheritedChannelCount} channel{inheritedChannelCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {value ? (
        <div className="relative group rounded-lg overflow-hidden border bg-muted/30">
          <img
            src={value}
            alt="Featured"
            className="w-full h-40 object-cover"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowMediaLibrary(true)}
              disabled={disabled}
            >
              <Upload className="h-4 w-4 mr-1" />
              Replace
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRemove}
              disabled={disabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setShowMediaLibrary(true)}
              disabled={disabled}
            >
              <Upload className="h-4 w-4" />
              Media Library
            </Button>
            <Popover open={showUrlInput} onOpenChange={setShowUrlInput}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                >
                  <Link2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-2">
                  <Label htmlFor="image-url">Image URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="image-url"
                      placeholder="https://..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                    />
                    <Button size="sm" onClick={handleUrlSubmit}>
                      Add
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            This image will be used across all channels by default
          </p>
        </div>
      )}

      <MediaLibraryPicker
        open={showMediaLibrary}
        onOpenChange={setShowMediaLibrary}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}

interface ChannelImageOverrideProps {
  featuredImage: string | null;
  overrideImage: string | undefined;
  onOverrideChange: (url: string | undefined) => void;
  disabled?: boolean;
}

export function ChannelImageOverride({
  featuredImage,
  overrideImage,
  onOverrideChange,
  disabled = false,
}: ChannelImageOverrideProps) {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const currentImage = overrideImage || featuredImage;
  const isOverridden = !!overrideImage;

  const handleMediaSelect = (url: string) => {
    onOverrideChange(url);
    setShowMediaLibrary(false);
  };

  const handleUseDefault = () => {
    onOverrideChange(undefined);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Channel Image</Label>
        {isOverridden && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-xs"
            onClick={handleUseDefault}
            disabled={disabled}
          >
            Use default
          </Button>
        )}
      </div>

      {currentImage ? (
        <div className="relative group rounded-lg overflow-hidden border bg-muted/30">
          <img
            src={currentImage}
            alt="Channel"
            className="w-full h-32 object-cover"
          />
          <div className="absolute top-2 right-2">
            {isOverridden ? (
              <span className="text-[10px] bg-amber-500/90 text-white px-1.5 py-0.5 rounded">
                Custom
              </span>
            ) : (
              <span className="text-[10px] bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded">
                Inherited
              </span>
            )}
          </div>
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowMediaLibrary(true)}
              disabled={disabled}
            >
              <Upload className="h-4 w-4 mr-1" />
              Override
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full h-24 flex-col gap-2"
          onClick={() => setShowMediaLibrary(true)}
          disabled={disabled}
        >
          <Image className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Add custom image</span>
        </Button>
      )}

      <MediaLibraryPicker
        open={showMediaLibrary}
        onOpenChange={setShowMediaLibrary}
        onSelect={handleMediaSelect}
      />
    </div>
  );
}
