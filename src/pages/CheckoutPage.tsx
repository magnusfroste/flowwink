import { logger } from '@/lib/logger';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, ShoppingBag, ArrowLeft, Tag, X } from 'lucide-react';

interface AppliedDiscount {
  code: string;
  discountCents: number;
}

export default function CheckoutPage() {
  const { items, totalPriceCents, currency, clearCart } = useCart();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);

  // Auto-fill for logged-in users
  useEffect(() => {
    if (user && profile) {
      setFormData({
        name: profile.full_name || '',
        email: user.email || '',
      });
    }
  }, [user, profile]);

  const payableCents = Math.max(0, totalPriceCents - (appliedDiscount?.discountCents ?? 0));

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(cents / 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Anonymous-safe: validate_discount_code is a SECURITY DEFINER RPC granted
  // to anon, called via PostgREST with the publishable key — no user JWT needed.
  const handleApplyDiscount = async () => {
    const code = discountInput.trim();
    if (!code) return;
    setIsValidatingCode(true);
    try {
      const { data, error } = await supabase.rpc('validate_discount_code' as never, {
        p_code: code,
        p_order_cents: totalPriceCents,
        p_currency: currency,
      } as never);

      if (error) throw error;

      const result = data as unknown as {
        valid: boolean;
        reason?: string;
        code?: string;
        discount_cents?: number;
      };

      if (!result?.valid) {
        toast.error(result?.reason || 'This code is not valid');
        return;
      }

      setAppliedDiscount({
        code: result.code || code,
        discountCents: result.discount_cents ?? 0,
      });
      setDiscountInput('');
      toast.success(`Discount code ${result.code || code} applied`);
    } catch (error: unknown) {
      logger.error('Discount validation error:', error);
      toast.error('Could not validate discount code');
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }

    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Please enter name and email');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          items: items.map(item => ({
            productId: item.productId,
            productName: item.variantLabel
              ? `${item.productName} (${item.variantLabel})`
              : item.productName,
            priceCents: item.priceCents,
            quantity: item.quantity,
            variantId: item.variantId ?? null,
          })),
          customerName: formData.name,
          customerEmail: formData.email,
          userId: user?.id || null,
          currency: currency,
          discountCode: appliedDiscount?.code ?? null,
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}/checkout`,
        }
      });

      if (error) throw error;

      // Server rejected the discount code (expired/used up between apply and pay)
      if (data?.error) {
        throw new Error(data.error);
      }

      // Sandbox mode — order created without payment
      if (data?.sandbox) {
        clearCart();
        toast.success(
          data.status === 'paid'
            ? 'Order placed successfully!'
            : `Order created — payment pending`
        );
        navigate(`/checkout/success?order_id=${data.orderId}&sandbox=true`);
        return;
      }

      // Live mode — redirect to Stripe
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: unknown) {
      logger.error('Checkout error:', error);
      const message = error instanceof Error ? error.message : null;
      toast.error(message || 'Could not initiate payment');
    } finally {
      setIsLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground" />
            <CardTitle>Your cart is empty</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Add products to continue to checkout.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Continue shopping
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Customer Form */}
          <Card>
            <CardHeader>
              <CardTitle>Your Details</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCheckout} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Your name"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="your@email.com"
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing payment...
                    </>
                  ) : (
                    <>Pay {formatPrice(payableCents)}</>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Your order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item) => (
                <div
                  key={`${item.productId}:${item.variantId ?? ''}`}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    {item.variantLabel && (
                      <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} × {formatPrice(item.priceCents)}
                    </p>
                  </div>
                  <p className="font-medium">
                    {formatPrice(item.priceCents * item.quantity)}
                  </p>
                </div>
              ))}
              <Separator />

              {/* Discount code */}
              {appliedDiscount ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Tag className="h-3.5 w-3.5" />
                    Discount ({appliedDiscount.code})
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground hover:text-destructive"
                      onClick={() => setAppliedDiscount(null)}
                      disabled={isLoading}
                      aria-label="Remove discount code"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </span>
                  <span className="text-primary font-medium">
                    −{formatPrice(appliedDiscount.discountCents)}
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Discount code"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyDiscount();
                      }
                    }}
                    disabled={isValidatingCode || isLoading}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={handleApplyDiscount}
                    disabled={!discountInput.trim() || isValidatingCode || isLoading}
                  >
                    {isValidatingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Apply'
                    )}
                  </Button>
                </div>
              )}

              <Separator />
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total</span>
                <span>{formatPrice(payableCents)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
