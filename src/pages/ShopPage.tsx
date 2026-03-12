import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, Search, Filter } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useProducts, formatPrice } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useSeoSettings } from '@/hooks/useSiteSettings';
import { toast } from 'sonner';

export default function ShopPage() {
  const { data: products = [], isLoading } = useProducts({ activeOnly: true });
  const { addItem, items } = useCart();
  const { data: seoSettings } = useSeoSettings();
  const [search, setSearch] = useState('');

  const siteTitle = seoSettings?.siteTitle || 'Shop';

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const isInCart = (id: string) => items.some((i) => i.productId === id);

  const handleAdd = (product: typeof products[0]) => {
    if (isInCart(product.id)) {
      toast.info('Already in cart');
      return;
    }
    addItem({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      imageUrl: product.image_url,
    });
    toast.success(`${product.name} added to cart`);
  };

  return (
    <>
      <Helmet>
        <title>Shop | {siteTitle}</title>
        <meta name="description" content={`Browse products from ${siteTitle}`} />
      </Helmet>

      <PublicNavigation />

      <main className="min-h-screen bg-background">
        {/* Hero */}
        <section className="border-b bg-muted/30">
          <div className="container mx-auto px-6 py-16 text-center">
            <h1 className="text-4xl md:text-5xl font-serif font-bold tracking-tight mb-4">
              Shop
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Browse our products and add what you need to your cart.
            </p>
          </div>
        </section>

        {/* Toolbar */}
        <section className="container mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="secondary" className="text-xs">
              {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </section>

        {/* Product Grid */}
        <section className="container mx-auto px-6 pb-20">
          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <div className="aspect-square bg-muted" />
                  <CardContent className="p-4 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium">No products found</p>
              {search && (
                <Button variant="ghost" className="mt-2" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => (
                <Card
                  key={product.id}
                  className="group overflow-hidden hover:shadow-lg transition-all duration-300"
                >
                  <Link to={`/shop/${product.id}`}>
                    <div className="aspect-square bg-muted overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                          <ShoppingCart className="h-16 w-16" />
                        </div>
                      )}
                    </div>
                  </Link>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <Link to={`/shop/${product.id}`}>
                        <h3 className="font-medium leading-tight hover:text-primary transition-colors line-clamp-2">
                          {product.name}
                        </h3>
                      </Link>
                      {product.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {product.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-lg font-bold">
                        {formatPrice(product.price_cents, product.currency)}
                      </span>
                      <Button
                        size="sm"
                        variant={isInCart(product.id) ? 'secondary' : 'default'}
                        onClick={(e) => {
                          e.preventDefault();
                          handleAdd(product);
                        }}
                        disabled={isInCart(product.id)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-1.5" />
                        {isInCart(product.id) ? 'In cart' : 'Add'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      <PublicFooter />
    </>
  );
}
