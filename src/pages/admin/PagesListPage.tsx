import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, MoreHorizontal, Edit, Trash2, Copy, ArrowUpDown, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import type { PageStatus } from '@/types/cms';

type SortField = 'title' | 'updated_at' | 'status';
type SortDirection = 'asc' | 'desc';

const STATUS_ORDER: Record<PageStatus, number> = {
  draft: 1,
  reviewing: 2,
  published: 3,
  archived: 4,
};

export default function PagesListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PageStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { data: pages, isLoading } = usePages();
  const deletePage = useDeletePage();
  const createPage = useCreatePage();
  const { isAdmin } = useAuth();

  const filteredAndSortedPages = useMemo(() => {
    const filtered = pages?.filter(page => {
      const matchesSearch = page.title.toLowerCase().includes(search.toLowerCase()) ||
        page.slug.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
      return matchesSearch && matchesStatus;
    }) || [];

    return [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title, 'sv');
          break;
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case 'status':
          comparison = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [pages, search, statusFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'title' ? 'asc' : 'desc');
    }
  };

  const handleDuplicate = async (page: { title: string; slug: string }) => {
    const newSlug = `${page.slug}-copy-${Date.now()}`;
    const result = await createPage.mutateAsync({
      title: `${page.title} (kopia)`,
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

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-serif text-3xl font-bold text-foreground">Sidor</h1>
            <p className="text-muted-foreground mt-1">
              Hantera och redigera dina sidor
            </p>
          </div>
          <div className="flex gap-2">
            <MigratePageDialog />
            <Button asChild>
              <Link to="/admin/pages/new">
                <Plus className="h-4 w-4 mr-2" />
                Ny sida
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Sök efter titel eller slug..."
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
                  <SelectValue placeholder="Filtrera status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  <SelectItem value="draft">Utkast</SelectItem>
                  <SelectItem value="reviewing">Granskning</SelectItem>
                  <SelectItem value="published">Publicerad</SelectItem>
                  <SelectItem value="archived">Arkiverad</SelectItem>
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
                  <SelectValue placeholder="Sortera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated_at-desc">Senast uppdaterad</SelectItem>
                  <SelectItem value="updated_at-asc">Äldst uppdaterad</SelectItem>
                  <SelectItem value="title-asc">Titel A-Ö</SelectItem>
                  <SelectItem value="title-desc">Titel Ö-A</SelectItem>
                  <SelectItem value="status-asc">Status (utkast först)</SelectItem>
                  <SelectItem value="status-desc">Status (publicerad först)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Pages List */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">
              {filteredAndSortedPages.length} {filteredAndSortedPages.length === 1 ? 'sida' : 'sidor'}
            </CardTitle>
            <CardDescription>
              Klicka på en sida för att redigera den
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredAndSortedPages.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {search || statusFilter !== 'all' 
                    ? 'Inga sidor matchar din sökning'
                    : 'Inga sidor ännu. Skapa din första sida!'}
                </p>
                {!search && statusFilter === 'all' && (
                  <Button asChild>
                    <Link to="/admin/pages/new">
                      <Plus className="h-4 w-4 mr-2" />
                      Skapa sida
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAndSortedPages.map((page) => (
                  <div
                    key={page.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors group"
                  >
                    <Link 
                      to={`/admin/pages/${page.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{page.title}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="truncate">/{page.slug}</span>
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline text-xs">
                              {formatDistanceToNow(new Date(page.updated_at), { addSuffix: true, locale: sv })}
                            </span>
                          </div>
                        </div>
                        {page.scheduled_at && page.status === 'reviewing' && (
                          <div className="hidden sm:flex items-center gap-1.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-md">
                            <Clock className="h-3 w-3" />
                            <span>{format(new Date(page.scheduled_at), "d MMM HH:mm", { locale: sv })}</span>
                          </div>
                        )}
                        <StatusBadge status={page.status} />
                      </div>
                    </Link>
                    
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
                            Redigera
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(page)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicera
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => setDeleteId(page.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Radera
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Är du säker?</AlertDialogTitle>
            <AlertDialogDescription>
              Denna åtgärd kan inte ångras. Sidan kommer att raderas permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Radera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
