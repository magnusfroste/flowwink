import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaLibraryPicker } from './MediaLibraryPicker';
import { ImageIcon, Trash2 } from 'lucide-react';

interface ImagePickerFieldProps {
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}

export function ImagePickerField({ value, onChange, placeholder = 'Image URL' }: ImagePickerFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setPickerOpen(true)}
          title="Select from library"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onChange('')}
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {value && (
        <div className="rounded-lg border overflow-hidden bg-muted/30 p-2">
          <img 
            src={value} 
            alt="Preview" 
            className="max-h-24 rounded object-contain mx-auto"
          />
        </div>
      )}

      <MediaLibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={onChange}
      />
    </div>
  );
}
