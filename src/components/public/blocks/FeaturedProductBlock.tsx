import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';
import { useProduct, formatPrice } from '@/hooks/useProducts';
import { ShoppingCart, Plus, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FeaturedProductBlockData {
  productId?: string;
  badge?: string;
  ctaText?: string;
  layout?: 'image-left' | 'image-right';
  showDescription?: boolean;
  backgroundStyle?: 'default' | 'muted' | 'gradient';
}

interface FeaturedProductBlockProps {
  data: FeaturedProductBlockData;
}

export function FeaturedProductBlock({ data }: FeaturedProductBlockProps) {
  const { data: product, isLoading } = useProduct(data.productId);
  const { addItem, items } = useCart();

  const layout = data.layout || 'image-left';
  const ctaText = data.ctaText || 'Add to cart';
  const inCart = product ? items.some(i => i.productId === product.id) : false;

  const handleAdd = () => {
    if (!product) return;
    addItem({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      imageUrl: product.image_url,
    });
  };

  if (isLoading) {
    return (
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse grid md:grid-cols-2 gap-12">
            <div className="aspect-square bg-muted rounded-2xl" />
            <div className="space-y-4 py-8">
              <div className="h-8 bg-muted rounded w-3/4" />
              <div className="h-4 bg-muted rounded w-1/2" />
              <div className="h-12 bg-muted rounded w-1/3 mt-8" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="py-16 md:py-24">
        <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Select a product to feature</p>
        </div>
      </section>
    );
  }

  const bgClasses = {
    default: '',
    muted: 'bg-muted/30',
    gradient: 'bg-gradient-to-br from-primary/5 via-background to-primary/10',
  };

  return (
    <section className={cn('py-16 md:py-24', bgClasses[data.backgroundStyle || 'default'])}>
      <div className="max-w-6xl mx-auto px-4">
        <div className={cn(
          'grid md:grid-cols-2 gap-8 md:gap-12 items-center',
          layout === 'image-right' && 'md:[&>*:first-child]:order-2'
        )}>
          {/* Image */}
          <div className="relative">
            {data.badge && (
              <Badge className="absolute top-4 left-4 z-10 text-sm px-3 py-1">
                {data.badge}
              </Badge>
            )}
            <div className="aspect-square rounded-2xl overflow-hidden bg-muted">
              {product.image_url ? (
                <Link to={`/products/${product.id}`}>
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                  />
                </Link>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingCart className="h-16 w-16 text-muted-foreground/30" />
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            <div>
              {product.type === 'recurring' && (
                <p className="text-sm font-medium text-primary mb-2 uppercase tracking-wider">
                  Subscription
                </p>
              )}
              <Link to={`/products/${product.id}`}>
                <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight hover:text-primary transition-colors">
                  {product.name}
                </h2>
              </Link>
            </div>

            {(data.showDescription !== false) && product.description && (
              <p className="text-lg text-muted-foreground leading-relaxed">
                {product.description}
              </p>
            )}

            <div className="flex items-baseline gap-2">
              <span className="text-3xl md:text-4xl font-bold">
                {formatPrice(product.price_cents, product.currency)}
              </span>
              {product.type === 'recurring' && (
                <span className="text-muted-foreground">/month</span>
              )}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                size="lg"
                variant={inCart ? 'outline' : 'default'}
                onClick={handleAdd}
                className="gap-2"
              >
                {inCart ? (
                  <>
                    <Check className="h-5 w-5" />
                    In cart
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    {ctaText}
                  </>
                )}
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link to={`/products/${product.id}`}>
                  View details
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
