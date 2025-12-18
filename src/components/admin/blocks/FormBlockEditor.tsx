import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FormBlockData, FormField, FormFieldType } from '@/types/cms';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  Type, 
  Mail, 
  Phone, 
  AlignLeft, 
  CheckSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormBlockEditorProps {
  data: FormBlockData;
  onChange: (data: FormBlockData) => void;
  isEditing: boolean;
}

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { value: 'text', label: 'Text', icon: <Type className="h-4 w-4" /> },
  { value: 'email', label: 'Email', icon: <Mail className="h-4 w-4" /> },
  { value: 'phone', label: 'Phone', icon: <Phone className="h-4 w-4" /> },
  { value: 'textarea', label: 'Text Area', icon: <AlignLeft className="h-4 w-4" /> },
  { value: 'checkbox', label: 'Checkbox', icon: <CheckSquare className="h-4 w-4" /> },
];

interface SortableFieldItemProps {
  field: FormField;
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function SortableFieldItem({ field, onUpdate, onDelete, isExpanded, onToggleExpand }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const fieldTypeOption = FIELD_TYPE_OPTIONS.find(opt => opt.value === field.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border rounded-lg bg-card',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-muted-foreground">{fieldTypeOption?.icon}</span>
          <span className="font-medium truncate">{field.label || 'Untitled Field'}</span>
          {field.required && (
            <span className="text-xs text-destructive">*</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Field Type</Label>
              <Select
                value={field.type}
                onValueChange={(value: FormFieldType) => onUpdate({ type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        {opt.icon}
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Width</Label>
              <Select
                value={field.width}
                onValueChange={(value: 'full' | 'half') => onUpdate({ width: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Width</SelectItem>
                  <SelectItem value="half">Half Width</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Field label"
            />
          </div>

          {field.type !== 'checkbox' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={field.placeholder || ''}
                onChange={(e) => onUpdate({ placeholder: e.target.value })}
                placeholder="Placeholder text"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id={`required-${field.id}`}
              checked={field.required}
              onCheckedChange={(checked) => onUpdate({ required: checked })}
            />
            <Label htmlFor={`required-${field.id}`} className="text-sm">
              Required field
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

export function FormBlockEditor({ data, onChange, isEditing }: FormBlockEditorProps) {
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateField = (key: keyof FormBlockData, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.fields.findIndex(f => f.id === active.id);
      const newIndex = data.fields.findIndex(f => f.id === over.id);
      updateField('fields', arrayMove(data.fields, oldIndex, newIndex));
    }
  };

  const addField = (type: FormFieldType) => {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      type,
      label: type === 'checkbox' ? 'I agree to the terms' : `New ${type} field`,
      placeholder: type === 'email' ? 'email@example.com' : type === 'phone' ? '+46 70 123 4567' : '',
      required: type !== 'checkbox',
      width: type === 'textarea' ? 'full' : 'half',
    };
    updateField('fields', [...data.fields, newField]);
    setExpandedFieldId(newField.id);
  };

  const updateFieldItem = (fieldId: string, updates: Partial<FormField>) => {
    updateField(
      'fields',
      data.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f)
    );
  };

  const deleteField = (fieldId: string) => {
    updateField('fields', data.fields.filter(f => f.id !== fieldId));
    if (expandedFieldId === fieldId) setExpandedFieldId(null);
  };

  if (!isEditing) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">
          <strong>{data.title || 'Contact Form'}</strong>
          <span className="mx-2">•</span>
          {data.fields.length} fields
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Form Settings */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Form Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="Contact Us"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            value={data.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="Fill out the form below and we'll get back to you."
            rows={2}
          />
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Form Fields</Label>
          <span className="text-xs text-muted-foreground">{data.fields.length} fields</span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={data.fields.map(f => f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {data.fields.map(field => (
                <SortableFieldItem
                  key={field.id}
                  field={field}
                  onUpdate={(updates) => updateFieldItem(field.id, updates)}
                  onDelete={() => deleteField(field.id)}
                  isExpanded={expandedFieldId === field.id}
                  onToggleExpand={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Field Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          {FIELD_TYPE_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant="outline"
              size="sm"
              onClick={() => addField(opt.value)}
              className="gap-1.5"
            >
              <Plus className="h-3 w-3" />
              {opt.icon}
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Submit Settings */}
      <div className="space-y-4 pt-4 border-t">
        <div className="space-y-2">
          <Label>Submit Button Text</Label>
          <Input
            value={data.submitButtonText}
            onChange={(e) => updateField('submitButtonText', e.target.value)}
            placeholder="Send Message"
          />
        </div>

        <div className="space-y-2">
          <Label>Success Message</Label>
          <Textarea
            value={data.successMessage}
            onChange={(e) => updateField('successMessage', e.target.value)}
            placeholder="Thank you! We'll be in touch soon."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Style Variant</Label>
          <Select
            value={data.variant}
            onValueChange={(value: 'default' | 'card' | 'minimal') => updateField('variant', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
