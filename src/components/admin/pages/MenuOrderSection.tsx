import { useState, useEffect, useMemo } from 'react';
import { GripVertical, Eye, Home, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { usePages } from '@/hooks/usePages';
import { useGeneralSettings } from '@/hooks/useSiteSettings';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { Page } from '@/types/cms';

function SortableMenuRow({ page, homepageSlug, menuOverrides, onToggleMenu }: {
  page: Page;
  homepageSlug: string;
  menuOverrides: Map<string, boolean>;
  onToggleMenu: (id: string, visible: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const showInMenu = menuOverrides.has(page.id) ? menuOverrides.get(page.id)! : page.show_in_menu;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors",
        isDragging && "opacity-50 shadow-lg z-10",
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{page.title}</p>
            {page.slug === homepageSlug && (
              <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                <Home className="h-3 w-3" />
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">/{page.slug}</p>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="ml-3">
            <Switch
              checked={showInMenu}
              onCheckedChange={(checked) => onToggleMenu(page.id, checked)}
              aria-label={showInMenu ? 'Hide from menu' : 'Show in menu'}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {showInMenu ? 'Visible in navigation' : 'Hidden from navigation'}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function MenuOrderSection() {
  const queryClient = useQueryClient();
  const { data: pages, isLoading } = usePages();
  const { data: generalSettings } = useGeneralSettings();
  const homepageSlug = generalSettings?.homepageSlug || 'home';

  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [menuOverrides, setMenuOverrides] = useState<Map<string, boolean>>(new Map());
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize order from pages
  useEffect(() => {
    if (pages) {
      const sorted = [...pages].sort((a, b) => (a.menu_order ?? 999) - (b.menu_order ?? 999));
      setOrderedIds(sorted.map(p => p.id));
      setMenuOverrides(new Map());
      setHasChanges(false);
    }
  }, [pages]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedIds((ids) => {
        const oldIndex = ids.indexOf(active.id as string);
        const newIndex = ids.indexOf(over.id as string);
        return arrayMove(ids, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  };

  const handleToggleMenu = (id: string, visible: boolean) => {
    setMenuOverrides(prev => new Map(prev).set(id, visible));
    setHasChanges(true);
  };

  const saveOrderMutation = useMutation({
    mutationFn: async () => {
      const updates = orderedIds.map((id, index) => {
        const menuVisible = menuOverrides.has(id) ? menuOverrides.get(id)! : (pages?.find(p => p.id === id) as any)?.show_in_menu ?? false;
        return supabase
          .from('pages')
          .update({ menu_order: index, show_in_menu: menuVisible })
          .eq('id', id);
      });

      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) throw new Error('Failed to update some pages');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['public-nav-pages'] });
      setHasChanges(false);
      toast.success('Menu order saved');
    },
    onError: () => {
      toast.error('Failed to save menu order');
    },
  });

  const orderedPages = useMemo(() => {
    if (!pages) return [];
    const pageMap = new Map(pages.map(p => [p.id, p]));
    return orderedIds.map(id => pageMap.get(id)).filter(Boolean) as Page[];
  }, [pages, orderedIds]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif">Navigation Menu</CardTitle>
            <CardDescription>
              Drag to reorder. Toggle which pages appear in the header menu.
            </CardDescription>
          </div>
          {hasChanges && (
            <Button onClick={() => saveOrderMutation.mutate()} disabled={saveOrderMutation.isPending} size="sm">
              {saveOrderMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Order
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {orderedPages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No pages yet</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {orderedPages.map((page) => (
                  <SortableMenuRow
                    key={page.id}
                    page={page}
                    homepageSlug={homepageSlug}
                    menuOverrides={menuOverrides}
                    onToggleMenu={handleToggleMenu}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
