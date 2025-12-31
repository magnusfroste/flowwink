import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle } from 'lucide-react';

export default function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // Clear cart after successful payment
    clearCart();
  }, [clearCart]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
          <CardTitle className="text-2xl">Tack för din beställning!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Din betalning har genomförts och du kommer snart få en bekräftelse via e-post.
          </p>
          {sessionId && (
            <p className="text-xs text-muted-foreground">
              Referens: {sessionId.slice(0, 20)}...
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={() => navigate('/')} className="w-full">
            Tillbaka till startsidan
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
