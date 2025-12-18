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
import { Loader2, Search, ImageIcon, Check } from 'lucide-react';

interface StorageFile {
  name: string;
  id: string;
  created_at: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  } | null;
}

interface MediaLibraryPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}

export function MediaLibraryPicker({ open, onOpenChange, onSelect }: MediaLibraryPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ['media-library-picker'],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('cms-images')
        .list('pages', {
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;
      return data as StorageFile[];
    },
    enabled: open,
  });

  const getPublicUrl = (fileName: string) => {
    const { data } = supabase.storage
      .from('cms-images')
      .getPublicUrl(`pages/${fileName}`);
    return data.publicUrl;
  };

  const handleSelect = () => {
    if (selectedFile) {
      onSelect(getPublicUrl(selectedFile));
      setSelectedFile(null);
      onOpenChange(false);
    }
  };

  const filteredFiles = files?.filter(file => 
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select image from library</DialogTitle>
        </DialogHeader>

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
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {isLoading ? (
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
                  ? 'Try a different search'
                  : 'Upload images via the "Upload" tab'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
              {filteredFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file.name)}
                  className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                    selectedFile === file.name 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                >
                  <img
                    src={getPublicUrl(file.name)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selectedFile === file.name && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="bg-primary text-primary-foreground rounded-full p-1">
                        <Check className="h-4 w-4" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={!selectedFile}>
            Select image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
