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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatsBlockData } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, GripVertical, Trash2, TrendingUp } from 'lucide-react';
import { IconPicker } from '../IconPicker';
import { cn } from '@/lib/utils';

interface StatsBlockEditorProps {
  data: StatsBlockData;
  onChange: (data: StatsBlockData) => void;
  canEdit: boolean;
}

interface SortableStatProps {
  stat: { value: string; label: string; icon?: string };
  index: number;
  onUpdate: (index: number, updates: Partial<{ value: string; label: string; icon: string }>) => void;
  onDelete: (index: number) => void;
}

function SortableStat({ stat, index, onUpdate, onDelete }: SortableStatProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `stat-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 border rounded-lg bg-card',
        isDragging && 'opacity-50'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 grid grid-cols-3 gap-3">
        <Input
          value={stat.value}
          onChange={(e) => onUpdate(index, { value: e.target.value })}
          placeholder="500+"
        />
        <Input
          value={stat.label}
          onChange={(e) => onUpdate(index, { label: e.target.value })}
          placeholder="Label"
        />
        <IconPicker
          value={stat.icon || ''}
          onChange={(icon) => onUpdate(index, { icon })}
        />
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:bg-destructive/10"
        onClick={() => onDelete(index)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function StatsBlockEditor({ data, onChange, canEdit }: StatsBlockEditorProps) {
  const stats = data.stats || [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = parseInt(String(active.id).replace('stat-', ''));
      const newIndex = parseInt(String(over.id).replace('stat-', ''));
      onChange({ ...data, stats: arrayMove(stats, oldIndex, newIndex) });
    }
  };

  const handleAddStat = () => {
    onChange({
      ...data,
      stats: [...stats, { value: '', label: '' }],
    });
  };

  const handleUpdateStat = (index: number, updates: Partial<{ value: string; label: string; icon: string }>) => {
    const newStats = [...stats];
    newStats[index] = { ...newStats[index], ...updates };
    onChange({ ...data, stats: newStats });
  };

  const handleDeleteStat = (index: number) => {
    onChange({ ...data, stats: stats.filter((_, i) => i !== index) });
  };

  if (!canEdit) {
    return (
      <div className="p-6">
        {data.title && (
          <h3 className="text-lg font-semibold mb-4 text-center">{data.title}</h3>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-3xl font-bold text-primary">{stat.value || '—'}</div>
              <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-2">
        <Label>Title (optional)</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Statistics"
        />
      </div>

      <div className="space-y-2">
        <Label>Key metrics</Label>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stats.map((_, i) => `stat-${i}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {stats.map((stat, index) => (
                <SortableStat
                  key={`stat-${index}`}
                  stat={stat}
                  index={index}
                  onUpdate={handleUpdateStat}
                  onDelete={handleDeleteStat}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <Button variant="outline" onClick={handleAddStat} className="w-full">
        <Plus className="h-4 w-4 mr-2" />
        Add metric
      </Button>
    </div>
  );
}
