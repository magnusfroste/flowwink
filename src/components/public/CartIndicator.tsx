import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function CartIndicator() {
  const { totalItems } = useCart();

  if (totalItems === 0) return null;

  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link to="/cart">
        <ShoppingCart className="h-5 w-5" />
        <Badge
          className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
        >
          {totalItems}
        </Badge>
      </Link>
    </Button>
  );
}
