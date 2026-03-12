import { Link } from 'react-router-dom';
import { useWishlist, useToggleWishlist } from '@/hooks/useCustomerData';
import { useProducts, formatPrice } from '@/hooks/useProducts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { Heart, ShoppingCart, Trash2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

export default function WishlistPage() {
  const { data: wishlistItems = [], isLoading: wlLoading } = useWishlist();
  const { data: products = [], isLoading: pLoading } = useProducts({ activeOnly: true });
  const toggleWishlist = useToggleWishlist();
  const { addItem, items: cartItems } = useCart();

  const isLoading = wlLoading || pLoading;

  // Map wishlist items to products
  const wishlistProducts = wishlistItems
    .map(wi => products.find(p => p.id === wi.product_id))
    .filter(Boolean) as typeof products;

  const handleAddToCart = (product: typeof products[0]) => {
    const isInCart = cartItems.some(i => i.productId === product.id);
    if (isInCart) {
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

  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  if (wishlistProducts.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <Heart className="h-16 w-16 mx-auto text-muted-foreground/30" />
        <h2 className="text-xl font-semibold">Your wishlist is empty</h2>
        <p className="text-muted-foreground">Save products you love for later.</p>
        <Button asChild>
          <Link to="/shop">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Wishlist ({wishlistProducts.length})</h2>
      <div className="space-y-3">
        {wishlistProducts.map((product) => (
          <Card key={product.id}>
            <CardContent className="p-4">
              <div className="flex gap-4 items-center">
                <Link to={`/shop/${product.id}`} className="shrink-0">
                  <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/20">
                        <ShoppingBag className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/shop/${product.id}`} className="font-medium hover:text-primary transition-colors">
                    {product.name}
                  </Link>
                  <p className="text-sm font-bold mt-0.5">{formatPrice(product.price_cents, product.currency)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => handleAddToCart(product)}>
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    Add to cart
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => toggleWishlist.mutate(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
