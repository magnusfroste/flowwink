import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { AccordionBlockData } from '@/types/cms';

interface AccordionBlockEditorProps {
  data: AccordionBlockData;
  onChange: (data: AccordionBlockData) => void;
  canEdit: boolean;
}

export function AccordionBlockEditor({ data, onChange, canEdit }: AccordionBlockEditorProps) {
  const updateItem = (index: number, field: 'question' | 'answer', value: string) => {
    const newItems = [...data.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...data, items: newItems });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [...data.items, { question: '', answer: '' }]
    });
  };

  const removeItem = (index: number) => {
    onChange({
      ...data,
      items: data.items.filter((_, i) => i !== index)
    });
  };

  if (!canEdit) {
    return (
      <div className="space-y-3">
        {data.title && <h3 className="font-semibold text-lg">{data.title}</h3>}
        {data.items.map((item, index) => (
          <div key={index} className="border border-border rounded-lg p-4">
            <p className="font-medium">{item.question || 'Ingen fråga'}</p>
            <p className="text-sm text-muted-foreground mt-1">{item.answer || 'Inget svar'}</p>
          </div>
        ))}
        {data.items.length === 0 && (
          <p className="text-muted-foreground text-sm">Inga frågor tillagda</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="accordion-title">Rubrik (valfritt)</Label>
        <Input
          id="accordion-title"
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="T.ex. Vanliga frågor"
        />
      </div>

      <div className="space-y-3">
        <Label>Frågor & Svar</Label>
        {data.items.map((item, index) => (
          <div key={index} className="border border-border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Fråga {index + 1}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeItem(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={item.question}
              onChange={(e) => updateItem(index, 'question', e.target.value)}
              placeholder="Skriv frågan här..."
            />
            <Textarea
              value={item.answer}
              onChange={(e) => updateItem(index, 'answer', e.target.value)}
              placeholder="Skriv svaret här..."
              rows={3}
            />
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addItem} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Lägg till fråga
      </Button>
    </div>
  );
}
