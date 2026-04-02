import { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Copy, ArrowUpDown, Clock, LayoutTemplate, Home, GripVertical, Eye, Save, Loader2, FileText, Navigation, Palette } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PagesTrashTab from '@/components/admin/pages/PagesTrashTab';
import GlobalElementsTab from '@/components/admin/pages/GlobalElementsTab';
import BrandingTab from '@/components/admin/pages/BrandingTab';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from '@/components/StatusBadge';
import { MigratePageDialog } from '@/components/admin/MigratePageDialog';
import { usePages, useDeletePage, useCreatePage } from '@/hooks/usePages';
import { useAuth } from '@/hooks/useAuth';
import { useGeneralSettings, useUpdateGeneralSettings } from '@/hooks/useSiteSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { PageStatus, Page } from '@/types/cms';

type SortField = 'title' | 'updated_at' | 'status' | 'menu_order';
type SortDirection = 'asc' | 'desc';

const STATUS_ORDER: Record<PageStatus, number> = {
  draft: 1,
  reviewing: 2,
  published: 3,
  archived: 4,
};

interface SortablePageRowProps {
  page: Page;
  homepageSlug: string;
  isAdmin: boolean;
  isDragMode: boolean;
  menuOverrides: Map<string, boolean>;
  onToggleMenu: (id: string, visible: boolean) => void;
  onDuplicate: (page: { title: string; slug: string }) => void;
  onDelete: (id: string) => void;
  onSetHomepage: (slug: string) => void;
}

function SortablePageRow({ page, homepageSlug, isAdmin, isDragMode, menuOverrides, onToggleMenu, onDuplicate, onDelete, onSetHomepage }: SortablePageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const showInMenu = menuOverrides.has(page.id) ? menuOverrides.get(page.id)! : (page as any).show_in_menu;

  const style = isDragMode ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : undefined;

  return (
    <div
      ref={isDragMode ? setNodeRef : undefined}
      style={style}
      className={cn(
        "flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors group",
        isDragMode && isDragging && "opacity-50 shadow-lg z-10",
      )}
    >
      {isDragMode && (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mr-3 shrink-0"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      )}

      <Link
        to={`/admin/pages/${page.id}`}
        className="flex-1 min-w-0"
      >
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{page.title}</p>
              {page.slug === homepageSlug && (
                <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  <Home className="h-3 w-3" />
                  Home
                </span>
              )}
              {showInMenu && (
                <span className="inline-flex items-center gap-1 text-xs bg-accent text-accent-foreground px-1.5 py-0.5 rounded">
                  <Eye className="h-3 w-3" />
                  In menu
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate">/{page.slug}</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline text-xs">
                {formatDistanceToNow(new Date(page.updated_at), { addSuffix: true, locale: enUS })}
              </span>
            </div>
          </div>
          {page.scheduled_at && page.status === 'reviewing' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-md">
              <Clock className="h-3 w-3" />
              <span>{format(new Date(page.scheduled_at), "MMM d HH:mm", { locale: enUS })}</span>
            </div>
          )}
          <StatusBadge status={page.status} />
        </div>
      </Link>

      {isDragMode ? (
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
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/admin/pages/${page.id}`}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(page)}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            {page.slug !== homepageSlug && (
              <DropdownMenuItem onClick={() => onSetHomepage(page.slug)}>
                <Home className="h-4 w-4 mr-2" />
                Set as Homepage
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(page.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default function PagesListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PageStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDragMode, setIsDragMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [menuOverrides, setMenuOverrides] = useState<Map<string, boolean>>(new Map());
  const [hasOrderChanges, setHasOrderChanges] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: pages, isLoading } = usePages();
  const deletePage = useDeletePage();
  const createPage = useCreatePage();
  const { isAdmin } = useAuth();
  const { data: generalSettings } = useGeneralSettings();
  const updateGeneralSettings = useUpdateGeneralSettings();

  const homepageSlug = generalSettings?.homepageSlug || 'home';

  // When entering drag mode, sort by menu_order and snapshot the order
  useEffect(() => {
    if (isDragMode && pages) {
      const sorted = [...pages].sort((a, b) => ((a as any).menu_order ?? 999) - ((b as any).menu_order ?? 999));
      setOrderedIds(sorted.map(p => p.id));
      setMenuOverrides(new Map());
      setHasOrderChanges(false);
    }
  }, [isDragMode, pages]);

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
      setHasOrderChanges(true);
    }
  };

  const handleToggleMenu = (id: string, visible: boolean) => {
    setMenuOverrides(prev => new Map(prev).set(id, visible));
    setHasOrderChanges(true);
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
      setHasOrderChanges(false);
      setIsDragMode(false);
      toast.success('Menu order saved');
    },
    onError: () => {
      toast.error('Failed to save menu order');
    },
  });

  const handleSetAsHomepage = async (slug: string) => {
    try {
      await updateGeneralSettings.mutateAsync({ homepageSlug: slug });
      toast.success(`"/${slug}" is now the homepage`);
    } catch {
      toast.error('Failed to set homepage');
    }
  };

  // In drag mode, use orderedIds to determine display order
  const displayPages = useMemo(() => {
    if (!pages) return [];

    if (isDragMode) {
      const pageMap = new Map(pages.map(p => [p.id, p]));
      return orderedIds.map(id => pageMap.get(id)).filter(Boolean) as Page[];
    }

    const filtered = pages.filter(page => {
      const matchesSearch = page.title.toLowerCase().includes(search.toLowerCase()) ||
        page.slug.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title, 'en');
          break;
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case 'status':
          comparison = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        case 'menu_order':
          comparison = ((a as any).menu_order ?? 999) - ((b as any).menu_order ?? 999);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [pages, isDragMode, orderedIds, search, statusFilter, sortField, sortDirection]);

  const handleDuplicate = async (page: { title: string; slug: string }) => {
    const newSlug = `${page.slug}-copy-${Date.now()}`;
    const result = await createPage.mutateAsync({
      title: `${page.title} (copy)`,
      slug: newSlug,
    });
    navigate(`/admin/pages/${result.id}`);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deletePage.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const pagesList = (
    <div className="space-y-2">
      {displayPages.map((page) => (
        <SortablePageRow
          key={page.id}
          page={page}
          homepageSlug={homepageSlug}
          isAdmin={isAdmin}
          isDragMode={isDragMode}
          menuOverrides={menuOverrides}
          onToggleMenu={handleToggleMenu}
          onDuplicate={handleDuplicate}
          onDelete={setDeleteId}
          onSetHomepage={handleSetAsHomepage}
        />
      ))}
    </div>
  );

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tabFromUrl = searchParams.get('tab');
  const initialTab = tabFromUrl || (location.pathname === '/admin/pages/trash' ? 'trash' : 'pages');
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab from URL when navigating via redirect
  useEffect(() => {
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Compact header row */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pages</h1>
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="pages" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Pages
                </TabsTrigger>
                <TabsTrigger value="global" className="gap-1.5">
                  <Navigation className="h-3.5 w-3.5" />
                  Header & Footer
                </TabsTrigger>
                <TabsTrigger value="branding" className="gap-1.5">
                  <Palette className="h-3.5 w-3.5" />
                  Branding
                </TabsTrigger>
                <TabsTrigger value="trash" className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                  Trash
                </TabsTrigger>
              </TabsList>
              {activeTab === 'pages' && !isDragMode && (
                <>
                  <MigratePageDialog />
                  <Button variant="outline" size="sm" onClick={() => setIsDragMode(true)}>
                    <GripVertical className="h-4 w-4 mr-2" />
                    Menu Order
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/admin/templates">
                      <LayoutTemplate className="h-4 w-4 mr-2" />
                      Templates
                    </Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/admin/pages/new">
                      <Plus className="h-4 w-4 mr-2" />
                      New Page
                    </Link>
                  </Button>
                </>
              )}
              {activeTab === 'pages' && isDragMode && (
                <>
                  <Button variant="outline" size="sm" onClick={() => { setIsDragMode(false); setHasOrderChanges(false); }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => saveOrderMutation.mutate()} disabled={!hasOrderChanges || saveOrderMutation.isPending}>
                    {saveOrderMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Order
                  </Button>
                </>
              )}
            </div>
          </div>

          <TabsContent value="pages" className="mt-0">
            {/* Filters — hidden in drag mode */}
            {!isDragMode && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by title or slug..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Select
                      value={statusFilter}
                      onValueChange={(value) => setStatusFilter(value as PageStatus | 'all')}
                    >
                      <SelectTrigger className="w-full sm:w-[180px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Filter status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="reviewing">Review</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={`${sortField}-${sortDirection}`}
                      onValueChange={(value) => {
                        const [field, dir] = value.split('-') as [SortField, SortDirection];
                        setSortField(field);
                        setSortDirection(dir);
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <ArrowUpDown className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="updated_at-desc">Recently updated</SelectItem>
                        <SelectItem value="updated_at-asc">Oldest updated</SelectItem>
                        <SelectItem value="title-asc">Title A-Z</SelectItem>
                        <SelectItem value="title-desc">Title Z-A</SelectItem>
                        <SelectItem value="status-asc">Status (draft first)</SelectItem>
                        <SelectItem value="status-desc">Status (published first)</SelectItem>
                        <SelectItem value="menu_order-asc">Menu order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pages List */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">
                  {isDragMode ? 'Menu Order' : `${displayPages.length} ${displayPages.length === 1 ? 'page' : 'pages'}`}
                </CardTitle>
                <CardDescription>
                  {isDragMode
                    ? 'Drag pages to set their navigation order. Only pages with the toggle ON appear in the header menu.'
                    : 'Click on a page to edit it'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : displayPages.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">
                      {search || statusFilter !== 'all'
                        ? 'No pages match your search'
                        : 'No pages yet. Create your first page!'}
                    </p>
                    {!search && statusFilter === 'all' && (
                      <Button asChild>
                        <Link to="/admin/pages/new">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Page
                        </Link>
                      </Button>
                    )}
                  </div>
                ) : isDragMode ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
                      {pagesList}
                    </SortableContext>
                  </DndContext>
                ) : (
                  pagesList
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="global" className="mt-0">
            <GlobalElementsTab />
          </TabsContent>

          <TabsContent value="branding" className="mt-0">
            <BrandingTab />
          </TabsContent>

          <TabsContent value="trash" className="mt-0">
            <PagesTrashTab />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              The page will be moved to trash. You can restore it later from the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}