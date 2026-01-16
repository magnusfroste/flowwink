import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Package, Pencil, Trash2 } from 'lucide-react';
import { useProducts, useUpdateProduct, useDeleteProduct, formatPrice, type Product } from '@/hooks/useProducts';
import { ProductDialog } from '@/components/admin/ProductDialog';
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
import { useIsStripeConfigured } from '@/hooks/useIntegrationStatus';
import { IntegrationWarning } from '@/components/admin/IntegrationWarning';

export default function ProductsPage() {
  const { data: products = [], isLoading } = useProducts();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const isStripeConfigured = useIsStripeConfigured();

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleDelete = (product: Product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (productToDelete) {
      deleteProduct.mutate(productToDelete.id);
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  const toggleActive = (product: Product) => {
    updateProduct.mutate({ id: product.id, is_active: !product.is_active });
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Products"
          description="Manage products and services for your deals"
        >
          <Button onClick={() => { setEditingProduct(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            New Product
          </Button>
        </AdminPageHeader>

        {isStripeConfigured === false && (
          <IntegrationWarning integration="stripe" />
        )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">Create your first product to get started</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Product
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {products.map((product) => (
            <Card key={product.id} className={!product.is_active ? 'opacity-60' : ''}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex-1">
                <div className="flex items-center gap-3">
                    <h3 className="font-medium">{product.name}</h3>
                    <Badge variant={product.type === 'recurring' ? 'secondary' : 'outline'}>
                      {product.type === 'recurring' ? 'Recurring' : 'One-time'}
                    </Badge>
                    {!product.is_active && (
                      <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
                  )}
                </div>
                
                <div className="flex items-center gap-6">
                <div className="text-right">
                    <p className="font-semibold">{formatPrice(product.price_cents, product.currency)}</p>
                    {product.type === 'recurring' && (
                      <p className="text-xs text-muted-foreground">/month</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={product.is_active}
                      onCheckedChange={() => toggleActive(product)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(product)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{productToDelete?.name}"? 
              Existing deals will keep their value but lose the product link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}
