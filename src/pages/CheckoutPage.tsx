import { logger } from '@/lib/logger';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { useVatDisplay } from '@/hooks/useVatDisplay';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Loader2, ShoppingBag, ArrowLeft, Tag, X, Truck } from 'lucide-react';

interface AppliedDiscount {
  code: string;
  discountCents: number;
}

interface ShippingOption {
  carrier_id: string;
  carrier_code: string;
  carrier_name: string;
  rate_id: string;
  rate_name: string;
  price_cents: number;
  currency: string;
}

export default function CheckoutPage() {
  const { items, totalPriceCents, currency, clearCart } = useCart();
  const { user, profile } = useAuth();
  const vat = useVatDisplay();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });
  const [address, setAddress] = useState({
    line1: '',
    line2: '',
    postalCode: '',
    city: '',
    country: 'SE',
    phone: '',
  });
  const [discountInput, setDiscountInput] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);

  // Auto-fill for logged-in users
  useEffect(() => {
    if (user && profile) {
      setFormData({
        name: profile.full_name || '',
        email: user.email || '',
      });
    }
  }, [user, profile]);

  // Product weights come from the DB, not the localStorage cart — carts
  // persisted before weights shipped (and every add-to-cart surface) stay
  // valid without carrying weight themselves. Anon-safe: public SELECT
  // policy on active products, read via PostgREST with the publishable key.
  const productIds = useMemo(() => [...new Set(items.map((i) => i.productId))], [items]);
  const { data: productWeights } = useQuery({
    queryKey: ['checkout-product-weights', productIds],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, weight_grams')
        .in('id', productIds);
      if (error) throw error;
      const map = new Map<string, number | null>();
      for (const row of (data ?? []) as unknown as { id: string; weight_grams: number | null }[]) {
        map.set(row.id, row.weight_grams ?? null);
      }
      return map;
    },
  });

  // A cart is shippable when any product has a weight (NULL = service/digital).
  const { hasShippable, totalWeightGrams } = useMemo(() => {
    if (!productWeights) return { hasShippable: false, totalWeightGrams: 0 };
    let shippable = false;
    let grams = 0;
    for (const item of items) {
      const w = productWeights.get(item.productId);
      if (w !== null && w !== undefined) {
        shippable = true;
        grams += w * item.quantity;
      }
    }
    return { hasShippable: shippable, totalWeightGrams: grams };
  }, [items, productWeights]);

  // Delivery options for the cart weight. Anonymous-safe SECURITY DEFINER RPC
  // (same pattern as validate_discount_code). Empty options = shipping not
  // configured on this instance → degrade gracefully: no delivery section.
  const { data: shippingOptions = [] } = useQuery({
    queryKey: ['shipping-options', totalWeightGrams, currency],
    enabled: hasShippable,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_shipping_options' as never, {
        p_weight_grams: totalWeightGrams,
        p_currency: currency,
      } as never);
      if (error) throw error;
      const result = data as unknown as { success: boolean; options?: ShippingOption[] };
      return result?.options ?? [];
    },
  });

  // Pre-select the cheapest option (first — the RPC sorts by price).
  useEffect(() => {
    if (shippingOptions.length > 0 && !shippingOptions.some((o) => o.rate_id === selectedRateId)) {
      setSelectedRateId(shippingOptions[0].rate_id);
    }
    if (shippingOptions.length === 0 && selectedRateId) {
      setSelectedRateId(null);
    }
  }, [shippingOptions, selectedRateId]);

  const selectedOption = shippingOptions.find((o) => o.rate_id === selectedRateId) ?? null;
  const shippingCostCents = selectedOption?.price_cents ?? 0;

  const payableCents =
    Math.max(0, totalPriceCents - (appliedDiscount?.discountCents ?? 0)) + shippingCostCents;

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

  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAddress(prev => ({ ...prev, [name]: value }));
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

    if (hasShippable && (!address.line1.trim() || !address.postalCode.trim() || !address.city.trim())) {
      toast.error('Please enter your delivery address');
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
          shippingAddress: hasShippable
            ? {
                name: formData.name,
                line1: address.line1.trim(),
                line2: address.line2.trim() || null,
                postalCode: address.postalCode.trim(),
                city: address.city.trim(),
                country: address.country.trim().toUpperCase() || 'SE',
                phone: address.phone.trim() || null,
              }
            : null,
          shippingRateId: selectedOption?.rate_id ?? null,
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

                {/* Delivery address — only when the cart contains a shippable product */}
                {hasShippable && (
                  <div className="space-y-4 pt-2">
                    <Separator />
                    <h3 className="text-sm font-semibold">Delivery address</h3>
                    <div className="space-y-2">
                      <Label htmlFor="line1">Address *</Label>
                      <Input
                        id="line1"
                        name="line1"
                        value={address.line1}
                        onChange={handleAddressChange}
                        placeholder="Street and number"
                        required
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="line2">Address line 2</Label>
                      <Input
                        id="line2"
                        name="line2"
                        value={address.line2}
                        onChange={handleAddressChange}
                        placeholder="Apartment, c/o (optional)"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="postalCode">Postal code *</Label>
                        <Input
                          id="postalCode"
                          name="postalCode"
                          value={address.postalCode}
                          onChange={handleAddressChange}
                          placeholder="123 45"
                          required
                          disabled={isLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">City *</Label>
                        <Input
                          id="city"
                          name="city"
                          value={address.city}
                          onChange={handleAddressChange}
                          placeholder="Stockholm"
                          required
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country *</Label>
                        <Input
                          id="country"
                          name="country"
                          value={address.country}
                          onChange={handleAddressChange}
                          placeholder="SE"
                          maxLength={2}
                          required
                          disabled={isLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={address.phone}
                          onChange={handleAddressChange}
                          placeholder="+46 70 …"
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Delivery method — only when carriers/rates are configured */}
                {hasShippable && shippingOptions.length > 0 && (
                  <div className="space-y-3 pt-2">
                    <Separator />
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Truck className="h-4 w-4" />
                      Delivery method
                    </h3>
                    <RadioGroup
                      value={selectedRateId ?? undefined}
                      onValueChange={(v) => setSelectedRateId(v)}
                      className="gap-2"
                    >
                      {shippingOptions.map((option) => (
                        <label
                          key={option.rate_id}
                          htmlFor={`rate-${option.rate_id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:border-primary/50"
                        >
                          <span className="flex items-center gap-3">
                            <RadioGroupItem value={option.rate_id} id={`rate-${option.rate_id}`} />
                            <span>
                              <span className="text-sm font-medium block">{option.carrier_name}</span>
                              <span className="text-xs text-muted-foreground">{option.rate_name}</span>
                            </span>
                          </span>
                          <span className="text-sm font-medium">{formatPrice(option.price_cents)}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>
                )}

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

              {/* Shipping cost */}
              {selectedOption && (
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Truck className="h-3.5 w-3.5" />
                    Shipping ({selectedOption.carrier_name})
                  </span>
                  <span className="font-medium">{formatPrice(selectedOption.price_cents)}</span>
                </div>
              )}

              <Separator />
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total</span>
                <span>{formatPrice(payableCents)}</span>
              </div>
              {vat.label && (
                <p className="text-xs text-muted-foreground text-right -mt-2">
                  {vat.label}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
