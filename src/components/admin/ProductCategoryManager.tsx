import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, LayoutGrid, GripVertical } from 'lucide-react';
import {
  useProductCategories,
  useCreateProductCategory,
  useUpdateProductCategory,
  useDeleteProductCategory,
  type ProductCategory,
} from '@/hooks/useProductCategories';

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
}

const emptyForm: CategoryForm = {
  name: '', slug: '', description: '', image_url: '', is_active: true, sort_order: 0,
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function ProductCategoryManager() {
  const { data: categories = [], isLoading } = useProductCategories();
  const createCategory = useCreateProductCategory();
  const updateCategory = useUpdateProductCategory();
  const deleteCategory = useDeleteProductCategory();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (cat: ProductCategory) => {
    setEditing(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      image_url: cat.image_url || '',
      is_active: cat.is_active,
      sort_order: cat.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = {
      name: form.name,
      slug: form.slug || slugify(form.name),
      description: form.description || null,
      image_url: form.image_url || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };

    if (editing) {
      updateCategory.mutate({ id: editing.id, ...payload }, {
        onSuccess: () => setDialogOpen(false),
      });
    } else {
      createCategory.mutate(payload, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteCategory.mutate(deleteTarget.id, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Product Categories</h3>
          <p className="text-sm text-muted-foreground">Organize products into browsable categories</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No categories yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:border-border transition-colors"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              {cat.image_url ? (
                <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                  <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <LayoutGrid className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{cat.name}</span>
                  <Badge variant={cat.is_active ? 'default' : 'secondary'} className="text-[10px]">
                    {cat.is_active ? 'Active' : 'Hidden'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">/{cat.slug}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(cat)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm(f => ({
                    ...f,
                    name,
                    slug: editing ? f.slug : slugify(name),
                  }));
                }}
                placeholder="e.g. Electronics"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="electronics"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Image URL</Label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm(f => ({ ...f, image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-center justify-between pt-6">
                <Label>Active</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, is_active: checked }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!form.name || createCategory.isPending || updateCategory.isPending}
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Products in this category will become uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
