import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, ExternalLink } from 'lucide-react';
import { HeaderBlockData, HeaderNavItem } from '@/types/cms';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { arrayMove } from '@dnd-kit/sortable';

interface HeaderBlockEditorProps {
  data: HeaderBlockData;
  onChange: (data: HeaderBlockData) => void;
}

function SortableNavItem({
  item,
  onUpdate,
  onRemove,
}: {
  item: HeaderNavItem;
  onUpdate: (item: HeaderNavItem) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
    >
      <div {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <div className="flex-1 grid grid-cols-2 gap-3">
        <Input
          value={item.label}
          onChange={(e) => onUpdate({ ...item, label: e.target.value })}
          placeholder="Label"
        />
        <Input
          value={item.url}
          onChange={(e) => onUpdate({ ...item, url: e.target.value })}
          placeholder="URL"
        />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={item.openInNewTab}
          onCheckedChange={(checked) => onUpdate({ ...item, openInNewTab: checked })}
        />
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>

      <Switch
        checked={item.enabled}
        onCheckedChange={(checked) => onUpdate({ ...item, enabled: checked })}
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function HeaderBlockEditor({ data, onChange }: HeaderBlockEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const items = data.customNavItems || [];
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      onChange({
        ...data,
        customNavItems: arrayMove(items, oldIndex, newIndex),
      });
    }
  };

  const addNavItem = () => {
    const newItem: HeaderNavItem = {
      id: crypto.randomUUID(),
      label: '',
      url: '',
      openInNewTab: false,
      enabled: true,
    };
    onChange({
      ...data,
      customNavItems: [...(data.customNavItems || []), newItem],
    });
  };

  const updateNavItem = (id: string, updatedItem: HeaderNavItem) => {
    onChange({
      ...data,
      customNavItems: (data.customNavItems || []).map((item) =>
        item.id === id ? updatedItem : item
      ),
    });
  };

  const removeNavItem = (id: string) => {
    onChange({
      ...data,
      customNavItems: (data.customNavItems || []).filter((item) => item.id !== id),
    });
  };

  return (
    <div className="space-y-6">
      {/* Logo & Branding */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Logo & Branding
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <Label>Show Logo</Label>
              <p className="text-sm text-muted-foreground">Display logo in header</p>
            </div>
            <Switch
              checked={data.showLogo !== false}
              onCheckedChange={(checked) => onChange({ ...data, showLogo: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Show Name with Logo</Label>
              <p className="text-sm text-muted-foreground">Display organization name next to logo</p>
            </div>
            <Switch
              checked={data.showNameWithLogo === true}
              onCheckedChange={(checked) => onChange({ ...data, showNameWithLogo: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label>Logo Size</Label>
            <Select
              value={data.logoSize || 'md'}
              onValueChange={(value: 'sm' | 'md' | 'lg') => onChange({ ...data, logoSize: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Appearance
          </h3>

          <div className="space-y-2">
            <Label>Background Style</Label>
            <Select
              value={data.backgroundStyle || 'solid'}
              onValueChange={(value: 'solid' | 'transparent' | 'blur') => onChange({ ...data, backgroundStyle: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid Background</SelectItem>
                <SelectItem value="transparent">Transparent</SelectItem>
                <SelectItem value="blur">Blur (Glass Effect)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {data.backgroundStyle === 'blur' && 'Creates a frosted glass effect when scrolling over content'}
              {data.backgroundStyle === 'transparent' && 'Header has no background, content shows through'}
              {(!data.backgroundStyle || data.backgroundStyle === 'solid') && 'Standard opaque background'}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Show Border</Label>
              <p className="text-sm text-muted-foreground">Display a bottom border on the header</p>
            </div>
            <Switch
              checked={data.showBorder !== false}
              onCheckedChange={(checked) => onChange({ ...data, showBorder: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Behavior */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Behavior
          </h3>

          <div className="flex items-center justify-between">
            <div>
              <Label>Sticky Header</Label>
              <p className="text-sm text-muted-foreground">Header stays visible when scrolling</p>
            </div>
            <Switch
              checked={data.stickyHeader !== false}
              onCheckedChange={(checked) => onChange({ ...data, stickyHeader: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Show Theme Toggle</Label>
              <p className="text-sm text-muted-foreground">Allow visitors to switch dark/light mode</p>
            </div>
            <Switch
              checked={data.showThemeToggle !== false}
              onCheckedChange={(checked) => onChange({ ...data, showThemeToggle: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Custom Navigation Items */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Custom Navigation Items
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add external links beyond CMS pages
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addNavItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Link
            </Button>
          </div>

          {(data.customNavItems || []).length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={(data.customNavItems || []).map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {(data.customNavItems || []).map((item) => (
                    <SortableNavItem
                      key={item.id}
                      item={item}
                      onUpdate={(updated) => updateNavItem(item.id, updated)}
                      onRemove={() => removeNavItem(item.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {(data.customNavItems || []).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No custom navigation items. CMS pages will be shown automatically.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
