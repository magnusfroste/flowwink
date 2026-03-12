import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingCart, ArrowLeft, Check, Heart } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useProduct, formatPrice } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useWishlist, useToggleWishlist } from '@/hooks/useCustomerData';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
          <Button onClick={() => navigate('/shop')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to shop
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
        <div className="container mx-auto px-6 py-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
            <Link to="/shop" className="hover:text-foreground transition-colors">Shop</Link>
            <span>/</span>
            <span className="text-foreground">{product.name}</span>
          </nav>

          <div className="grid md:grid-cols-2 gap-12 max-w-5xl">
            {/* Image */}
            <div className="aspect-square bg-muted rounded-2xl overflow-hidden">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                  <ShoppingCart className="h-24 w-24" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center space-y-6">
              <div>
                <Badge variant="secondary" className="mb-3">
                  {product.type === 'recurring' ? 'Subscription' : 'One-time'}
                </Badge>
                <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">
                  {product.name}
                </h1>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">
                  {formatPrice(product.price_cents, product.currency)}
                </span>
                {product.type === 'recurring' && (
                  <span className="text-muted-foreground">/month</span>
                )}
              </div>

              {product.description && (
                <>
                  <Separator />
                  <p className="text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleAdd}
                  disabled={isInCart}
                >
                  {isInCart ? (
                    <>
                      <Check className="h-5 w-5 mr-2" />
                      In cart
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Add to cart
                    </>
                  )}
                </Button>
                {isInCart && (
                  <Button size="lg" variant="outline" asChild>
                    <Link to="/cart">View cart</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </>
  );
}
