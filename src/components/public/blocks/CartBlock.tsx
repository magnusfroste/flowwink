import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCart } from '@/contexts/CartContext';
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CartBlockData {
  title?: string;
  emptyMessage?: string;
  checkoutButtonText?: string;
  checkoutUrl?: string;
  showContinueShopping?: boolean;
  continueShoppingUrl?: string;
  variant?: 'default' | 'compact' | 'minimal';
}

interface CartBlockProps {
  data: CartBlockData;
}

export function CartBlock({ data }: CartBlockProps) {
  const { items, removeItem, updateQuantity, totalPriceCents, currency, totalItems } = useCart();

  const formatPrice = (cents: number, curr: string) => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const title = data.title || 'Din varukorg';
  const emptyMessage = data.emptyMessage || 'Din varukorg är tom';
  const checkoutButtonText = data.checkoutButtonText || 'Gå till kassan';
  const checkoutUrl = data.checkoutUrl || '/checkout';
  const variant = data.variant || 'default';

  if (items.length === 0) {
    return (
      <section className="py-12 md:py-16">
        <div className="max-w-2xl mx-auto px-4">
          <Card className="p-8 text-center">
            <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">{emptyMessage}</h2>
            {data.showContinueShopping !== false && (
              <Link to={data.continueShoppingUrl || '/'}>
                <Button variant="outline" className="mt-4">
                  Fortsätt handla
                </Button>
              </Link>
            )}
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 md:py-16">
      <div className="max-w-3xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl md:text-3xl font-semibold">
            {title}
            <span className="text-muted-foreground text-lg ml-2">({totalItems})</span>
          </h2>
        </div>

        {/* Cart Items */}
        <Card className={cn(variant === 'minimal' && 'border-0 shadow-none')}>
          <div className="divide-y">
            {items.map(item => (
              <div
                key={item.productId}
                className={cn(
                  'flex items-center gap-4 p-4',
                  variant === 'compact' && 'py-3'
                )}
              >
                {/* Product Image */}
                {item.imageUrl ? (
                  <div className="w-16 h-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{item.productName}</h3>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(item.priceCents, item.currency)} st
                  </p>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-medium">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Line Total */}
                <div className="w-24 text-right font-semibold">
                  {formatPrice(item.priceCents * item.quantity, item.currency)}
                </div>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeItem(item.productId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-4">
              <span className="text-lg font-medium">Totalt</span>
              <span className="text-2xl font-bold">
                {formatPrice(totalPriceCents, currency)}
              </span>
            </div>

            <div className="flex gap-3">
              {data.showContinueShopping !== false && (
                <Link to={data.continueShoppingUrl || '/'} className="flex-1">
                  <Button variant="outline" className="w-full">
                    Fortsätt handla
                  </Button>
                </Link>
              )}
              <Link to={checkoutUrl} className="flex-1">
                <Button className="w-full">
                  {checkoutButtonText}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
