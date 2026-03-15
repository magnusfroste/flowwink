import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, ArrowLeft, Check, Heart, ChevronRight } from 'lucide-react';
import { StockStatusBadge, BackInStockForm } from '@/components/public/StockStatus';
import { getStockStatus, isProductPurchasable } from '@/hooks/useProducts';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useProduct, useProducts, formatPrice } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useWishlist, useToggleWishlist } from '@/hooks/useCustomerData';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function RelatedProducts({ currentId, currentType }: { currentId: string; currentType: string }) {
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { addItem, items } = useCart();

  const related = products
    .filter(p => p.id !== currentId && p.type === currentType)
    .slice(0, 4);

  if (related.length === 0) return null;

  return (
    <section className="border-t border-border/50 bg-muted/30">
      <div className="container mx-auto px-6 py-16 md:py-20">
        <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-8">
          You might also like
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {related.map(product => {
            const inCart = items.some(i => i.productId === product.id);
            return (
              <Link
                key={product.id}
                to={`/shop/${product.id}`}
                className="group"
              >
                <div className="aspect-square bg-muted rounded-xl overflow-hidden mb-3">
                  {product.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingCart className="h-8 w-8 text-muted-foreground/20" />
                    </div>
                  )}
                </div>
                <h3 className="font-medium text-sm group-hover:text-primary transition-colors line-clamp-1">
                  {product.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatPrice(product.price_cents, product.currency)}
                  {product.type === 'recurring' && <span> /mo</span>}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProduct(id);
  const { addItem, items } = useCart();
  const { user } = useAuth();
  const { data: wishlistItems = [] } = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const isInCart = product ? items.some((i) => i.productId === product.id) : false;
  const isInWishlist = product ? wishlistItems.some((w) => w.product_id === product.id) : false;

  const handleAdd = () => {
    if (!product || isInCart) return;
    addItem({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      imageUrl: product.image_url,
    });
    toast.success(`${product.name} added to cart`);
  };

  if (isLoading) {
    return (
      <>
        <PublicNavigation />
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <PublicNavigation />
        <div className="min-h-screen flex flex-col items-center justify-center gap-4">
          <h1 className="text-2xl font-bold">Product not found</h1>
          <Button asChild variant="outline">
            <Link to="/shop">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to shop
            </Link>
          </Button>
        </div>
        <PublicFooter />
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>{product.name} | Shop</title>
        <meta name="description" content={product.description || `Buy ${product.name}`} />
      </Helmet>

      <PublicNavigation />

      <main className="min-h-screen bg-background">
        {/* Breadcrumb — minimal, Apple-style */}
        <div className="container mx-auto px-6 pt-6 pb-2">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/shop" className="hover:text-foreground transition-colors">
              Shop
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium truncate max-w-[200px]">
              {product.name}
            </span>
          </nav>
        </div>

        {/* Product hero — full-width feel */}
        <div className="container mx-auto px-6 py-8 md:py-12">
          <div className="grid md:grid-cols-2 gap-8 md:gap-16 max-w-6xl">
            {/* Image — large, clean */}
            <div className="aspect-[4/5] md:aspect-square bg-muted rounded-2xl overflow-hidden sticky top-24">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/15">
                  <ShoppingCart className="h-28 w-28" />
                </div>
              )}
            </div>

            {/* Details — clean hierarchy */}
            <div className="flex flex-col justify-center py-4 md:py-8">
              <div className="space-y-6">
                {/* Type badge */}
                <Badge
                  variant="secondary"
                  className="rounded-full text-xs px-3 py-1 font-medium"
                >
                  {product.type === 'recurring' ? 'Subscription' : 'One-time purchase'}
                </Badge>

                {/* Title */}
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold tracking-tight leading-tight">
                  {product.name}
                </h1>

                {/* Price — prominent */}
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl md:text-3xl font-semibold tracking-tight">
                    {formatPrice(product.price_cents, product.currency)}
                  </span>
                  {product.type === 'recurring' && (
                    <span className="text-base text-muted-foreground">/month</span>
                  )}
                </div>

                {/* Description */}
                {product.description && (
                  <>
                    <Separator className="opacity-50" />
                    <p className="text-muted-foreground text-base md:text-lg leading-relaxed max-w-lg">
                      {product.description}
                    </p>
                  </>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4">
                  <Button
                    size="lg"
                    className={cn(
                      'flex-1 h-12 rounded-xl text-base font-medium transition-all',
                      isInCart && 'bg-muted text-foreground hover:bg-muted/80'
                    )}
                    variant={isInCart ? 'secondary' : 'default'}
                    onClick={handleAdd}
                    disabled={isInCart}
                  >
                    {isInCart ? (
                      <>
                        <Check className="h-5 w-5 mr-2" />
                        Added to cart
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        Add to cart
                      </>
                    )}
                  </Button>

                  {user && (
                    <Button
                      size="lg"
                      variant="outline"
                      className={cn(
                        'h-12 w-12 rounded-xl shrink-0 transition-all',
                        isInWishlist && 'border-destructive/40 text-destructive hover:text-destructive'
                      )}
                      onClick={() => toggleWishlist.mutate(product.id)}
                    >
                      <Heart className={cn('h-5 w-5', isInWishlist && 'fill-current')} />
                    </Button>
                  )}
                </div>

                {/* View cart link */}
                {isInCart && (
                  <Button
                    variant="link"
                    asChild
                    className="px-0 text-primary"
                  >
                    <Link to="/cart">
                      View cart
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Related products */}
        <RelatedProducts currentId={product.id} currentType={product.type} />
      </main>

      <PublicFooter />
    </>
  );
}
