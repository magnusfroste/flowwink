import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProductCategoryManager } from '@/components/admin/ProductCategoryManager';
import { DiscountCodesManager } from '@/components/admin/DiscountCodesManager';
import { StoreSettingsPanel } from '@/components/admin/StoreSettingsPanel';
import { StorePoliciesManager } from '@/components/admin/StorePoliciesManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Package, Pencil, Trash2, Upload, Download } from 'lucide-react';
import { useProducts, useUpdateProduct, useDeleteProduct, type Product } from '@/hooks/useProducts';
import { useExportProducts, useImportProducts } from '@/hooks/useCsvImportExport';
import { ProductDialog } from '@/components/admin/ProductDialog';
import { CsvImportDialog } from '@/components/admin/CsvImportDialog';
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
import { EmptyState } from '@/components/ui/empty-state';
import { LoadDemoDataButton } from '@/components/admin/LoadDemoDataButton';
import { useOpenOnQueryParam } from '@/hooks/useOpenOnQueryParam';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

export default function ProductsPage() {
  // Admin view: the business's format and its decimals setting.
  const { formatCurrency: formatPrice } = usePlatformFormat();
  const { data: products = [], isLoading } = useProducts();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const exportProducts = useExportProducts();
  const importProducts = useImportProducts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  useOpenOnQueryParam('new', '1', () => { setEditingProduct(null); setDialogOpen(true); });
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

  const handleImport = async (file: File) => {
    return importProducts.mutateAsync(file);
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="Products">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportProducts(products)} disabled={products.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => { setEditingProduct(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              New Product
            </Button>
          </div>
        </AdminPageHeader>

        {isStripeConfigured === false && (
          <IntegrationWarning integration="stripe" />
        )}

        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="discounts">Discounts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="mt-6">
            <ProductCategoryManager />
          </TabsContent>

          <TabsContent value="discounts" className="mt-6">
            <DiscountCodesManager />
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <StoreSettingsPanel />
            <StorePoliciesManager />
          </TabsContent>

          <TabsContent value="products" className="mt-6">

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Create your first product, import from CSV, or seed a demo catalog to explore the storefront."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Product
            </Button>
          }
          secondaryAction={
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              <LoadDemoDataButton moduleId="ecommerce" invalidateKeys={[['products']]} />
            </>
          }
        />
      ) : (
        <div className="grid gap-4">
          {products.map((product) => (
            <Card key={product.id} className={!product.is_active ? 'opacity-60' : ''}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-12 w-12 rounded-lg object-cover border border-border flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium truncate">{product.name}</h3>
                      <Badge variant={product.type === 'recurring' ? 'secondary' : 'outline'}>
                        {product.type === 'recurring' ? 'Recurring' : 'One-time'}
                      </Badge>
                      {!product.is_active && (
                        <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                      )}
                    </div>
                    {/* Master-language descriptions are full sentences now —
                        wrap two lines and clamp, instead of one truncated line
                        that pushed the row off the page (min-w-0 on the column
                        is what lets the clamp actually bite). */}
                    {product.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2 break-words">{product.description}</p>
                    )}
                  </div>
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

          </TabsContent>
        </Tabs>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
      />

      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="Import Products"
        description="Upload a CSV file with your product catalog. Price can be in dollars (e.g. 49.99) or cents (e.g. 4999)."
        expectedColumns={['Name', 'Description', 'Price', 'Currency', 'Type', 'Image URL']}
        onImport={handleImport}
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