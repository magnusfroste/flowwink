import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCart } from '@/contexts/CartContext';
import { useProducts } from '@/hooks/useProducts';
import { ShoppingCart, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export interface ProductsBlockData {
  title?: string;
  subtitle?: string;
  columns?: 2 | 3 | 4;
  productType?: 'all' | 'one_time' | 'recurring';
  showDescription?: boolean;
  buttonText?: string;
}

interface ProductsBlockProps {
  data: ProductsBlockData;
}

export function ProductsBlock({ data }: ProductsBlockProps) {
  const { data: products = [], isLoading } = useProducts();
  const { addItem } = useCart();
  const { toast } = useToast();

  const columns = data.columns || 3;
  const buttonText = data.buttonText || 'Lägg i varukorg';

  // Filter active products and optionally by type
  const filteredProducts = products
    .filter(p => p.is_active)
    .filter(p => !data.productType || data.productType === 'all' || p.type === data.productType);

  const handleAddToCart = (product: typeof products[0]) => {
    addItem({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      imageUrl: product.image_url,
    });
    toast({
      title: 'Tillagd i varukorgen',
      description: `${product.name} har lagts till`,
    });
  };

  const formatPrice = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  };

  if (isLoading) {
    return (
      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (filteredProducts.length === 0) {
    return null;
  }

  return (
    <section className="py-12 md:py-16">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        {(data.title || data.subtitle) && (
          <div className="text-center mb-10">
            {data.title && (
              <h2 className="font-serif text-3xl md:text-4xl font-semibold mb-3">
                {data.title}
              </h2>
            )}
            {data.subtitle && (
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        {/* Products Grid */}
        <div className={cn('grid gap-6', gridCols[columns])}>
          {filteredProducts.map(product => (
            <Card
              key={product.id}
              className="overflow-hidden flex flex-col transition-all duration-300 hover:shadow-lg"
            >
              {/* Product Image */}
              {product.image_url && (
                <div className="aspect-square bg-muted overflow-hidden">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                  />
                </div>
              )}
              {!product.image_url && (
                <div className="aspect-square bg-muted flex items-center justify-center">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground/50" />
                </div>
              )}

              {/* Product Info */}
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
                {data.showDescription !== false && product.description && (
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2 flex-1">
                    {product.description}
                  </p>
                )}
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-xl font-bold">
                    {formatPrice(product.price_cents, product.currency)}
                    {product.type === 'recurring' && (
                      <span className="text-sm font-normal text-muted-foreground">/mån</span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleAddToCart(product)}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" />
                    {buttonText}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
