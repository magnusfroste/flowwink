import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, GripVertical, ExternalLink, Sparkles, Pin, LayoutGrid } from 'lucide-react';
import { HeaderBlockData, HeaderNavItem, HeaderVariant } from '@/types/cms';
import { headerVariantPresets } from '@/hooks/useGlobalBlocks';
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

  const applyVariantPreset = (variant: HeaderVariant) => {
    const preset = headerVariantPresets[variant];
    if (preset) {
      onChange({ ...data, ...preset });
    }
  };

  const variantDescriptions: Record<HeaderVariant, string> = {
    clean: 'Minimalistisk transparent header för kreativa sidor',
    sticky: 'Fast header med blur-effekt som följer vid scroll',
    'mega-menu': 'Kraftfull header med dropdown mega-menyer',
  };

  const variantIcons: Record<HeaderVariant, React.ReactNode> = {
    clean: <Sparkles className="h-5 w-5" />,
    sticky: <Pin className="h-5 w-5" />,
    'mega-menu': <LayoutGrid className="h-5 w-5" />,
  };

  return (
    <Tabs defaultValue="variant" className="space-y-6">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="variant">Variant</TabsTrigger>
        <TabsTrigger value="branding">Logo</TabsTrigger>
        <TabsTrigger value="appearance">Utseende</TabsTrigger>
        <TabsTrigger value="navigation">Navigation</TabsTrigger>
      </TabsList>

      {/* Variant Selection */}
      <TabsContent value="variant" className="space-y-4">
        <div className="grid gap-3">
          {(['clean', 'sticky', 'mega-menu'] as HeaderVariant[]).map((variant) => (
            <Card
              key={variant}
              className={`cursor-pointer transition-all hover:border-primary/50 ${
                data.variant === variant ? 'border-primary ring-2 ring-primary/20' : ''
              }`}
              onClick={() => applyVariantPreset(variant)}
            >
              <CardContent className="p-4 flex items-start gap-4">
                <div className={`p-2 rounded-lg ${
                  data.variant === variant ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {variantIcons[variant]}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium capitalize">{variant.replace('-', ' ')}</h4>
                  <p className="text-sm text-muted-foreground">{variantDescriptions[variant]}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      {/* Logo & Branding */}
      <TabsContent value="branding" className="space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Visa logotyp</Label>
                <p className="text-sm text-muted-foreground">Visa logotyp i header</p>
              </div>
              <Switch
                checked={data.showLogo !== false}
                onCheckedChange={(checked) => onChange({ ...data, showLogo: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Visa namn med logotyp</Label>
                <p className="text-sm text-muted-foreground">Visa organisationsnamn bredvid logotyp</p>
              </div>
              <Switch
                checked={data.showNameWithLogo === true}
                onCheckedChange={(checked) => onChange({ ...data, showNameWithLogo: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label>Logotypstorlek</Label>
              <Select
                value={data.logoSize || 'md'}
                onValueChange={(value: 'sm' | 'md' | 'lg') => onChange({ ...data, logoSize: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Liten</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Stor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Header-höjd</Label>
              <Select
                value={data.headerHeight || 'default'}
                onValueChange={(value: 'compact' | 'default' | 'tall') => onChange({ ...data, headerHeight: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Kompakt (48px)</SelectItem>
                  <SelectItem value="default">Standard (64px)</SelectItem>
                  <SelectItem value="tall">Hög (80px)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Appearance */}
      <TabsContent value="appearance" className="space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Bakgrundsstil</Label>
              <Select
                value={data.backgroundStyle || 'solid'}
                onValueChange={(value: 'solid' | 'transparent' | 'blur') => onChange({ ...data, backgroundStyle: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid bakgrund</SelectItem>
                  <SelectItem value="transparent">Transparent</SelectItem>
                  <SelectItem value="blur">Blur (glaseffekt)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Skugga</Label>
              <Select
                value={data.headerShadow || 'none'}
                onValueChange={(value: 'none' | 'sm' | 'md' | 'lg') => onChange({ ...data, headerShadow: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen</SelectItem>
                  <SelectItem value="sm">Liten</SelectItem>
                  <SelectItem value="md">Medium</SelectItem>
                  <SelectItem value="lg">Stor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Länkfärg</Label>
              <Select
                value={data.linkColorScheme || 'default'}
                onValueChange={(value: 'default' | 'primary' | 'muted' | 'contrast') => onChange({ ...data, linkColorScheme: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Standard</SelectItem>
                  <SelectItem value="primary">Primärfärg</SelectItem>
                  <SelectItem value="muted">Subtil</SelectItem>
                  <SelectItem value="contrast">Hög kontrast</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Visa kant</Label>
                <p className="text-sm text-muted-foreground">Visa en nedre kant på headern</p>
              </div>
              <Switch
                checked={data.showBorder !== false}
                onCheckedChange={(checked) => onChange({ ...data, showBorder: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Sticky header</Label>
                <p className="text-sm text-muted-foreground">Header följer med vid scroll</p>
              </div>
              <Switch
                checked={data.stickyHeader !== false}
                onCheckedChange={(checked) => onChange({ ...data, stickyHeader: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Visa tema-växlare</Label>
                <p className="text-sm text-muted-foreground">Låt besökare byta mellan mörkt/ljust läge</p>
              </div>
              <Switch
                checked={data.showThemeToggle !== false}
                onCheckedChange={(checked) => onChange({ ...data, showThemeToggle: checked })}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Navigation */}
      <TabsContent value="navigation" className="space-y-4">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label>Navigeringsjustering</Label>
              <Select
                value={data.navAlignment || 'right'}
                onValueChange={(value: 'left' | 'center' | 'right') => onChange({ ...data, navAlignment: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Vänster (efter logotyp)</SelectItem>
                  <SelectItem value="center">Centrerad</SelectItem>
                  <SelectItem value="right">Höger</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mobilmeny-stil</Label>
              <Select
                value={data.mobileMenuStyle || 'default'}
                onValueChange={(value: 'default' | 'fullscreen' | 'slide') => onChange({ ...data, mobileMenuStyle: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Dropdown</SelectItem>
                  <SelectItem value="fullscreen">Helskärm</SelectItem>
                  <SelectItem value="slide">Slide från höger</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mobilmeny-animation</Label>
              <Select
                value={data.mobileMenuAnimation || 'fade'}
                onValueChange={(value: 'fade' | 'slide-down' | 'slide-up') => onChange({ ...data, mobileMenuAnimation: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fade">Fade in</SelectItem>
                  <SelectItem value="slide-down">Slide ner</SelectItem>
                  <SelectItem value="slide-up">Slide upp</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Custom Navigation Items */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Egna navigeringslänkar</h3>
                <p className="text-sm text-muted-foreground">
                  Lägg till externa länkar utöver CMS-sidor
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={addNavItem}>
                <Plus className="h-4 w-4 mr-2" />
                Lägg till
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
                Inga egna navigeringslänkar. CMS-sidor visas automatiskt.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
