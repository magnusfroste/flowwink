import { QuoteBlockData } from '@/types/cms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Quote } from 'lucide-react';
import { AITextAssistant } from '../AITextAssistant';

interface QuoteBlockEditorProps {
  data: QuoteBlockData;
  onChange: (data: QuoteBlockData) => void;
  isEditing: boolean;
}

export function QuoteBlockEditor({ data, onChange, isEditing }: QuoteBlockEditorProps) {
  if (!isEditing) {
    return (
      <div className="p-6 bg-muted/30 rounded-lg">
        <div className="flex gap-3">
          <Quote className="h-8 w-8 text-primary/40 flex-shrink-0" />
          <div>
            <p className="text-lg italic text-foreground/80">
              {data.text || 'Write a quote...'}
            </p>
            {data.author && (
              <p className="mt-2 text-sm text-muted-foreground">
                — {data.author}
                {data.source && <span className="text-muted-foreground/70">, {data.source}</span>}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Quote</Label>
          <AITextAssistant
            value={data.text || ''}
            onChange={(text) => onChange({ ...data, text })}
            actions={['improve', 'expand']}
            compact
          />
        </div>
        <Textarea
          value={data.text || ''}
          onChange={(e) => onChange({ ...data, text: e.target.value })}
          placeholder="Write the quote here..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Author</Label>
          <Input
            value={data.author || ''}
            onChange={(e) => onChange({ ...data, author: e.target.value })}
            placeholder="Name"
          />
        </div>

        <div className="space-y-2">
          <Label>Source</Label>
          <Input
            value={data.source || ''}
            onChange={(e) => onChange({ ...data, source: e.target.value })}
            placeholder="Book, article, etc."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Style</Label>
        <Select
          value={data.variant || 'simple'}
          onValueChange={(value: 'simple' | 'styled') => onChange({ ...data, variant: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="simple">Simple</SelectItem>
            <SelectItem value="styled">Decorative</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
