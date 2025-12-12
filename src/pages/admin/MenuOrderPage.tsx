import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

interface PageItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  menu_order: number;
}

function SortablePageItem({ page }: { page: PageItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-4 bg-card border border-border rounded-lg",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1">
        <p className="font-medium">{page.title}</p>
        <p className="text-sm text-muted-foreground">/{page.slug}</p>
      </div>
      <span className={cn(
        "text-xs px-2 py-1 rounded-full",
        page.status === 'published' ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
      )}>
        {page.status === 'published' ? 'Publicerad' : page.status}
      </span>
    </div>
  );
}

export default function MenuOrderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: pages = [], isLoading } = useQuery({
    queryKey: ['pages-menu-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, slug, status, menu_order')
        .order('menu_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return (data || []) as PageItem[];
    },
  });

  const [orderedPages, setOrderedPages] = useState<PageItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (pages.length > 0) {
      setOrderedPages(pages);
    }
  }, [pages]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrderedPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setHasChanges(true);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (orderedItems: PageItem[]) => {
      const updates = orderedItems.map((page, index) => 
        supabase
          .from('pages')
          .update({ menu_order: index })
          .eq('id', page.id)
      );
      
      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error('Failed to update some pages');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages-menu-order'] });
      queryClient.invalidateQueries({ queryKey: ['public-nav-pages'] });
      setHasChanges(false);
      toast({
        title: 'Sparat',
        description: 'Menyordningen har uppdaterats.',
      });
    },
    onError: () => {
      toast({
        title: 'Fel',
        description: 'Kunde inte spara menyordningen.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(orderedPages);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold text-foreground">Menyordning</h1>
            <p className="text-muted-foreground mt-1">Dra och släpp för att ändra ordningen i navigationsmenyn</p>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Spara ordning
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Sidor</CardTitle>
            <CardDescription>Ordningen här bestämmer hur sidorna visas i navigationsmenyn</CardDescription>
          </CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedPages.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {orderedPages.map((page) => (
                    <SortablePageItem key={page.id} page={page} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {orderedPages.length === 0 && (
              <p className="text-center text-muted-foreground py-8">Inga sidor skapade ännu</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
