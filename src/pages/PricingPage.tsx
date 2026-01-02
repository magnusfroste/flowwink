import { useProducts, formatPrice } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, ShoppingCart, Zap, Shield, Headphones } from 'lucide-react';
import { toast } from 'sonner';
import { Helmet } from 'react-helmet-async';
import { cn } from '@/lib/utils';

const features = {
  hosting: [
    'Cloud-based hosting',
    'Automatic backups',
    'SSL certificate included',
    'CDN for fast loading',
    'Email support',
    'Monthly billing',
  ],
  setup: [
    'Professional installation',
    'Domain configuration',
    'Basic SEO setup',
    'Content migration',
    'Training (1 hour)',
    'One-time cost',
  ],
};

export default function PricingPage() {
  const { data: products, isLoading } = useProducts({ activeOnly: true });
  const { addItem, items } = useCart();

  const hostingProduct = products?.find(p => p.type === 'recurring');
  const setupProduct = products?.find(p => p.type === 'one_time');

  const handleAddToCart = (product: typeof hostingProduct) => {
    if (!product) return;
    
    const alreadyInCart = items.some(item => item.productId === product.id);
    if (alreadyInCart) {
      toast.info('Product is already in your cart');
      return;
    }

    addItem({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      imageUrl: product.image_url,
    });
    toast.success(`${product.name} has been added to your cart`);
  };

  const isInCart = (productId: string) => items.some(item => item.productId === productId);

  return (
    <>
      <Helmet>
        <title>Pricing | PezCMS</title>
        <meta name="description" content="Simple and transparent pricing for the PezCMS platform. Choose between monthly hosting or get started with professional setup." />
      </Helmet>
      
      <PublicNavigation />
      
      <main className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        {/* Hero Section */}
        <section className="container mx-auto px-6 pt-20 pb-16 text-center">
          <Badge variant="secondary" className="mb-4">
            <Zap className="w-3 h-3 mr-1" />
            Simple pricing
          </Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold mb-6 tracking-tight">
            Choose the right plan for you
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transparent pricing with no hidden fees. Start with hosting and add setup if you want help getting started.
          </p>
        </section>

        {/* Pricing Cards */}
        <section className="container mx-auto px-6 pb-20">
          {isLoading ? (
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {[1, 2].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="space-y-4">
                    <div className="h-6 bg-muted rounded w-1/3" />
                    <div className="h-10 bg-muted rounded w-1/2" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[1, 2, 3, 4].map((j) => (
                      <div key={j} className="h-4 bg-muted rounded" />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Hosting Card - Recurring */}
              {hostingProduct && (
                <Card className={cn(
                  "relative overflow-hidden transition-all duration-300 hover:shadow-xl",
                  "border-2 border-primary/20 bg-card"
                )}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-5 h-5 text-primary" />
                      <Badge variant="outline">Subscription</Badge>
                    </div>
                    <CardTitle className="text-2xl font-serif">{hostingProduct.name}</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{formatPrice(hostingProduct.price_cents, hostingProduct.currency)}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <CardDescription className="text-base">
                      {hostingProduct.description || 'Everything you need to run your website'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {features.hosting.map((feature) => (
                        <li key={feature} className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      className="w-full" 
                      size="lg"
                      onClick={() => handleAddToCart(hostingProduct)}
                      disabled={isInCart(hostingProduct.id)}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {isInCart(hostingProduct.id) ? 'Already in cart' : 'Add to cart'}
                    </Button>
                  </CardFooter>
                </Card>
              )}

              {/* Setup Card - One Time */}
              {setupProduct && (
                <Card className={cn(
                  "relative overflow-hidden transition-all duration-300 hover:shadow-xl",
                  "border bg-card/50"
                )}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-muted/50 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <Headphones className="w-5 h-5 text-muted-foreground" />
                      <Badge variant="secondary">One-time cost</Badge>
                    </div>
                    <CardTitle className="text-2xl font-serif">{setupProduct.name}</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold">{formatPrice(setupProduct.price_cents, setupProduct.currency)}</span>
                      <span className="text-muted-foreground">one-time</span>
                    </div>
                    <CardDescription className="text-base">
                      {setupProduct.description || 'We help you get started quickly and easily'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {features.setup.map((feature) => (
                        <li key={feature} className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                            <Check className="w-3 h-3 text-muted-foreground" />
                          </div>
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      variant="outline"
                      className="w-full" 
                      size="lg"
                      onClick={() => handleAddToCart(setupProduct)}
                      disabled={isInCart(setupProduct.id)}
                    >
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      {isInCart(setupProduct.id) ? 'Already in cart' : 'Add to cart'}
                    </Button>
                  </CardFooter>
                </Card>
              )}
            </div>
          )}

          {/* FAQ / Additional Info */}
          <div className="mt-16 text-center max-w-2xl mx-auto">
            <h2 className="text-2xl font-serif font-bold mb-4">Frequently Asked Questions</h2>
            <div className="space-y-4 text-left">
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium mb-1">Can I cancel at any time?</h3>
                <p className="text-sm text-muted-foreground">
                  Yes, you can cancel your subscription at any time. You will retain access to the service until the end of your billing period.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium mb-1">Do I need to purchase setup?</h3>
                <p className="text-sm text-muted-foreground">
                  No, setup is optional. It's for those who want help getting started quickly with professional installation and training.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <h3 className="font-medium mb-1">What payment methods are accepted?</h3>
                <p className="text-sm text-muted-foreground">
                  We accept all major cards (Visa, Mastercard, etc.) through our secure payment solution Stripe.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      
      <PublicFooter />
    </>
  );
}
