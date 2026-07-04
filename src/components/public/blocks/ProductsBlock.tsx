import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCart } from '@/contexts/CartContext';
import { useProducts } from '@/hooks/useProducts';
import { useVariantProductIds } from '@/hooks/useProductVariants';
import { useProductCategories } from '@/hooks/useProductCategories';
import { ShoppingCart, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

export interface ProductsBlockData {
  title?: string;
  subtitle?: string;
  columns?: 2 | 3 | 4;
  productType?: 'all' | 'one_time' | 'recurring';
  showDescription?: boolean;
  showCategoryFilter?: boolean;
  showImages?: boolean;
  buttonText?: string;
  buttonStyle?: 'default' | 'outline' | 'icon-only';
  layout?: 'grid' | 'list';
  linkToDetail?: boolean;
}

interface ProductsBlockProps {
  data: ProductsBlockData;
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function ProductsBlock({ data }: ProductsBlockProps) {
  const { data: products = [], isLoading } = useProducts({ activeOnly: true });
  const { data: variantProductIds } = useVariantProductIds();
  const { data: categories = [] } = useProductCategories({ activeOnly: true });
  const { addItem, items } = useCart();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const columns = data.columns || 3;
  const buttonText = data.buttonText || 'Add to cart';
  const showImages = data.showImages !== false;
  const showCategoryFilter = data.showCategoryFilter !== false && categories.length > 0;
  const linkToDetail = data.linkToDetail !== false;

  // Filter products
  const filteredProducts = products
    .filter(p => !data.productType || data.productType === 'all' || p.type === data.productType)
    .filter(p => !activeCategory || (p as any).category_id === activeCategory);

  const isInCart = (productId: string) => items.some(i => i.productId === productId);

  const handleAddToCart = (product: typeof products[0]) => {
    addItem({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      imageUrl: product.image_url,
    });
  };

  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  if (isLoading) {
    return (
      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="animate-pulse grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-80 bg-muted rounded-xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (filteredProducts.length === 0 && !showCategoryFilter) {
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

        {/* Category filter pills */}
        {showCategoryFilter && (
          <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
            <Button
              variant={activeCategory === null ? 'default' : 'outline'}
              size="sm"
              className="rounded-full"
              onClick={() => setActiveCategory(null)}
            >
              All
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => setActiveCategory(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        )}

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No products in this category</p>
          </div>
        ) : (
          <div className={cn('grid gap-6', gridCols[columns])}>
            {filteredProducts.map(product => {
              const inCart = isInCart(product.id);
              const hasVariants = variantProductIds?.has(product.id) ?? false;

              return (
                <Card
                  key={product.id}
                  className="group overflow-hidden flex flex-col transition-all duration-300 hover:shadow-lg border-border/50"
                >
                  {/* Product Image */}
                  {showImages && (
                    <div className="aspect-square bg-muted overflow-hidden relative">
                      {product.image_url ? (
                        linkToDetail ? (
                          <Link to={`/products/${product.id}`}>
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          </Link>
                        ) : (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        )
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingCart className="h-12 w-12 text-muted-foreground/30" />
                        </div>
                      )}

                      {/* Quick add button overlay */}
                      {data.buttonStyle === 'icon-only' && (
                        hasVariants ? (
                          <Button
                            size="icon"
                            asChild
                            className={cn(
                              'absolute bottom-3 right-3 rounded-full shadow-lg',
                              'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200'
                            )}
                          >
                            <Link to={`/shop/${product.id}`}>
                              <Plus className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            className={cn(
                              'absolute bottom-3 right-3 rounded-full shadow-lg',
                              'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-200',
                              inCart && 'bg-green-600 hover:bg-green-700'
                            )}
                            onClick={() => handleAddToCart(product)}
                          >
                            {inCart ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                          </Button>
                        )
                      )}
                    </div>
                  )}

                  {/* Product Info */}
                  <div className="p-4 flex-1 flex flex-col">
                    {linkToDetail ? (
                      <Link to={`/products/${product.id}`} className="hover:text-primary transition-colors">
                        <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
                      </Link>
                    ) : (
                      <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
                    )}
                    
                    {data.showDescription !== false && product.description && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2 flex-1">
                        {product.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-3">
                      <span className="text-xl font-bold">
                        {formatPrice(product.price_cents, product.currency)}
                        {product.type === 'recurring' && (
                          <span className="text-sm font-normal text-muted-foreground">/mo</span>
                        )}
                      </span>

                      {data.buttonStyle !== 'icon-only' && (
                        hasVariants ? (
                          <Button size="sm" asChild className="gap-1.5">
                            <Link to={`/shop/${product.id}`}>
                              Choose options
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant={inCart ? 'outline' : 'default'}
                            onClick={() => handleAddToCart(product)}
                            className="gap-1.5"
                          >
                            {inCart ? (
                              <>
                                <Check className="h-4 w-4" />
                                In cart
                              </>
                            ) : (
                              <>
                                <Plus className="h-4 w-4" />
                                {buttonText}
                              </>
                            )}
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
