import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PricingBlockData } from '@/types/cms';

interface PricingBlockProps {
  data: PricingBlockData;
}

export function PricingBlock({ data }: PricingBlockProps) {
  const tiers = data.tiers || [];
  const columns = data.columns || 3;

  if (tiers.length === 0) {
    return null;
  }

  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
  };

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

        {/* Pricing Grid */}
        <div className={cn(
          'grid gap-6',
          gridCols[columns],
          tiers.length === 1 && 'max-w-md mx-auto',
          tiers.length === 2 && 'max-w-2xl mx-auto'
        )}>
          {tiers.map((tier) => (
            <Card
              key={tier.id}
              className={cn(
                'relative flex flex-col p-6 transition-all duration-300',
                data.variant === 'cards' && 'shadow-lg hover:shadow-xl',
                data.variant === 'compact' && 'p-4',
                tier.highlighted && 'ring-2 ring-primary scale-[1.02] shadow-xl z-10'
              )}
            >
              {/* Badge */}
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-primary text-primary-foreground">
                    {tier.badge}
                  </span>
                </div>
              )}

              {/* Plan Header */}
              <div className={cn('text-center', tier.badge && 'mt-2')}>
                <h3 className="text-xl font-semibold mb-2">{tier.name}</h3>
                {tier.description && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {tier.description}
                  </p>
                )}
                <div className="mb-6">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.period && (
                    <span className="text-muted-foreground">{tier.period}</span>
                  )}
                </div>
              </div>

              {/* Features */}
              {tier.features && tier.features.length > 0 && (
                <ul className="space-y-3 mb-6 flex-1">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* CTA Button */}
              {tier.buttonText && (
                <div className="mt-auto pt-4">
                  {tier.buttonUrl?.startsWith('http') ? (
                    <a href={tier.buttonUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <Button
                        className="w-full"
                        variant={tier.highlighted ? 'default' : 'outline'}
                      >
                        {tier.buttonText}
                      </Button>
                    </a>
                  ) : (
                    <Link to={tier.buttonUrl || '#'}>
                      <Button
                        className="w-full"
                        variant={tier.highlighted ? 'default' : 'outline'}
                      >
                        {tier.buttonText}
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
