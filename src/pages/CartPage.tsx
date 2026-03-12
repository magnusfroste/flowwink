import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShoppingBag, Trash2, Plus, Minus, ArrowLeft, ArrowRight } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCart } from '@/contexts/CartContext';
import { formatPrice } from '@/hooks/useProducts';

export default function CartPage() {
  const { items, removeItem, updateQuantity, totalPriceCents, currency, totalItems } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <>
        <Helmet><title>Cart</title></Helmet>
        <PublicNavigation />
        <main className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30" />
            <h1 className="text-2xl font-bold">Your cart is empty</h1>
            <p className="text-muted-foreground">Browse products and add them to your cart.</p>
            <Button asChild>
              <Link to="/shop">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Continue shopping
              </Link>
            </Button>
          </div>
        </main>
        <PublicFooter />
      </>
    );
  }

  return (
    <>
      <Helmet><title>Cart ({totalItems})</title></Helmet>
      <PublicNavigation />

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-8 max-w-4xl">
          <h1 className="text-3xl font-serif font-bold tracking-tight mb-8">Your Cart</h1>

          <div className="grid gap-8 lg:grid-cols-3">
            {/* Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <Card key={item.productId} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <Link to={`/shop/${item.productId}`} className="shrink-0">
                        <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.productName}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                              <ShoppingBag className="h-8 w-8" />
                            </div>
                          )}
                        </div>
                      </Link>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <Link to={`/shop/${item.productId}`}>
                          <h3 className="font-medium hover:text-primary transition-colors">
                            {item.productName}
                          </h3>
                        </Link>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {formatPrice(item.priceCents, item.currency)} each
                        </p>

                        <div className="flex items-center justify-between mt-3">
                          {/* Quantity controls */}
                          <div className="flex items-center gap-1 border rounded-lg">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-bold">
                              {formatPrice(item.priceCents * item.quantity, item.currency)}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeItem(item.productId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button variant="ghost" asChild className="gap-2">
                <Link to="/shop">
                  <ArrowLeft className="h-4 w-4" />
                  Continue shopping
                </Link>
              </Button>
            </div>

            {/* Summary */}
            <div>
              <Card className="sticky top-8">
                <CardHeader>
                  <CardTitle className="text-lg">Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {totalItems} item{totalItems !== 1 ? 's' : ''}
                    </span>
                    <span>{formatPrice(totalPriceCents, currency)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatPrice(totalPriceCents, currency)}</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => navigate('/checkout')}
                  >
                    Checkout
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </>
  );
}
