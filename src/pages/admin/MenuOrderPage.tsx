import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUnsavedChanges, UnsavedChangesDialog } from '@/hooks/useUnsavedChanges';
import { useBlogSettings, useUpdateBlogSettings } from '@/hooks/useSiteSettings';
import { Loader2, Save, GripVertical, Eye, EyeOff, FileText, BookOpen } from 'lucide-react';
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
  show_in_menu: boolean;
}

interface SortablePageItemProps {
  page: PageItem;
  onToggleVisibility: (id: string, visible: boolean) => void;
}

function SortablePageItem({ page, onToggleVisibility }: SortablePageItemProps) {
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
        isDragging && "opacity-50 shadow-lg",
        !page.show_in_menu && "opacity-60"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <FileText className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{page.title}</p>
          {!page.show_in_menu && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <EyeOff className="h-3 w-3" />
              Hidden
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">/{page.slug}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <Switch
            checked={page.show_in_menu}
            onCheckedChange={(checked) => onToggleVisibility(page.id, checked)}
            aria-label={page.show_in_menu ? 'Hide from menu' : 'Show in menu'}
          />
        </div>
        <span className={cn(
          "text-xs px-2 py-1 rounded-full",
          page.status === 'published' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
        )}>
          {page.status === 'published' ? 'Published' : page.status}
        </span>
      </div>
    </div>
  );
}

export default function MenuOrderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['pages-menu-order'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, slug, status, menu_order, show_in_menu')
        .order('menu_order', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      return (data || []) as PageItem[];
    },
  });

  const { data: blogSettings, isLoading: blogLoading } = useBlogSettings();
  const updateBlogSettings = useUpdateBlogSettings();

  const [orderedPages, setOrderedPages] = useState<PageItem[]>([]);
  const [blogTitle, setBlogTitle] = useState('');
  const [blogSlug, setBlogSlug] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize pages
  useEffect(() => {
    if (pages.length > 0) {
      setOrderedPages(pages);
    }
  }, [pages]);

  // Initialize blog settings
  useEffect(() => {
    if (blogSettings) {
      setBlogTitle(blogSettings.archiveTitle || 'Blogg');
      setBlogSlug(blogSettings.archiveSlug || 'blogg');
    }
  }, [blogSettings]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handlePageDragEnd = (event: DragEndEvent) => {
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

  const handleTogglePageVisibility = (id: string, visible: boolean) => {
    setOrderedPages((items) =>
      items.map((item) =>
        item.id === id ? { ...item, show_in_menu: visible } : item
      )
    );
    setHasChanges(true);
  };

  const handleBlogTitleChange = (title: string) => {
    setBlogTitle(title);
    setHasChanges(true);
  };

  const handleBlogSlugChange = (slug: string) => {
    setBlogSlug(slug);
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Save page order
      const pageUpdates = orderedPages.map((page, index) => 
        supabase
          .from('pages')
          .update({ menu_order: index, show_in_menu: page.show_in_menu })
          .eq('id', page.id)
      );
      
      const results = await Promise.all(pageUpdates);
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        throw new Error('Failed to update some pages');
      }

      // Save blog settings
      if (blogSettings) {
        await updateBlogSettings.mutateAsync({
          ...blogSettings,
          archiveTitle: blogTitle,
          archiveSlug: blogSlug,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages-menu-order'] });
      queryClient.invalidateQueries({ queryKey: ['public-nav-pages'] });
      queryClient.invalidateQueries({ queryKey: ['site-settings', 'blog'] });
      setHasChanges(false);
      toast({
        title: 'Saved',
        description: 'Menu settings have been updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Could not save menu settings.',
        variant: 'destructive',
      });
    },
  });

  const { blocker } = useUnsavedChanges({ hasChanges });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const isLoading = pagesLoading || blogLoading;

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
        <AdminPageHeader 
          title="Menu Order"
          description="Drag and drop to change the order, use the toggle to hide items from navigation"
        >
          <Button onClick={handleSave} disabled={!hasChanges || saveMutation.isPending} className="relative">
            {hasChanges && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive" />}
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </AdminPageHeader>

        {/* Pages Section */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Pages</CardTitle>
            <CardDescription>
              The order and visibility determines how pages appear in the navigation menu. Hidden pages are still accessible via direct link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePageDragEnd}>
              <SortableContext items={orderedPages.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {orderedPages.map((page) => (
                    <SortablePageItem 
                      key={page.id} 
                      page={page} 
                      onToggleVisibility={handleTogglePageVisibility}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {orderedPages.length === 0 && (
              <p className="text-center text-muted-foreground py-8">No pages created yet</p>
            )}
          </CardContent>
        </Card>

        {/* Blog Module Section */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Blog</CardTitle>
            <CardDescription>
              Configure how the blog appears in the navigation. Enable/disable the blog module in Blog Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "flex items-center gap-3 p-4 bg-card border border-border rounded-lg",
              !blogSettings?.enabled && "opacity-60"
            )}>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Menu Title</Label>
                  <Input
                    value={blogTitle}
                    onChange={(e) => handleBlogTitleChange(e.target.value)}
                    className="h-8 text-sm"
                    disabled={!blogSettings?.enabled}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Slug</Label>
                  <Input
                    value={blogSlug}
                    onChange={(e) => handleBlogSlugChange(e.target.value)}
                    className="h-8 text-sm"
                    disabled={!blogSettings?.enabled}
                  />
                </div>
              </div>
              <span className={cn(
                "text-xs px-2 py-1 rounded-full min-w-[60px] text-center",
                blogSettings?.enabled ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
              )}>
                {blogSettings?.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <UnsavedChangesDialog blocker={blocker} />
    </AdminLayout>
  );
}
