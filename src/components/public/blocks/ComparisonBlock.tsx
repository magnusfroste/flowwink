import { ComparisonBlockData } from '@/types/cms';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComparisonBlockProps {
  data: ComparisonBlockData;
}

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="h-5 w-5 text-success mx-auto" />
    ) : (
      <X className="h-5 w-5 text-muted-foreground/40 mx-auto" />
    );
  }
  return <span className="text-sm">{value}</span>;
}

export function ComparisonBlock({ data }: ComparisonBlockProps) {
  const {
    title,
    subtitle,
    products = [],
    features = [],
    variant = 'default',
    showPrices = true,
    showButtons = true,
    stickyHeader = false,
  } = data;

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="py-12 md:py-16">
      <div className="container max-w-6xl mx-auto px-4">
        {(title || subtitle) && (
          <div className="text-center mb-10 md:mb-12">
            {title && <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>}
            {subtitle && (
              <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className={cn(
            'w-full border-collapse',
            variant === 'bordered' && 'border border-border rounded-lg overflow-hidden'
          )}>
            {/* Header */}
            <thead className={cn(stickyHeader && 'sticky top-0 z-10')}>
              <tr className="bg-muted/50">
                <th className="p-4 text-left font-medium text-muted-foreground w-1/4">
                  Features
                </th>
                {products.map((product) => (
                  <th
                    key={product.id}
                    className={cn(
                      'p-4 text-center',
                      product.highlighted && 'bg-primary/5 border-x-2 border-t-2 border-primary'
                    )}
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-lg">{product.name}</div>
                      {showPrices && product.price && (
                        <div className="text-2xl font-bold">
                          {product.price}
                          {product.period && (
                            <span className="text-sm font-normal text-muted-foreground">
                              {product.period}
                            </span>
                          )}
                        </div>
                      )}
                      {product.description && (
                        <p className="text-sm text-muted-foreground">{product.description}</p>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Features */}
            <tbody>
              {features.map((feature, featureIdx) => (
                <tr
                  key={feature.id}
                  className={cn(
                    'border-t border-border',
                    variant === 'striped' && featureIdx % 2 === 0 && 'bg-muted/30'
                  )}
                >
                  <td className="p-4 font-medium">{feature.name}</td>
                  {products.map((product, productIdx) => (
                    <td
                      key={product.id}
                      className={cn(
                        'p-4 text-center',
                        product.highlighted && 'bg-primary/5 border-x-2 border-primary'
                      )}
                    >
                      <CellValue value={feature.values[productIdx]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>

            {/* Buttons */}
            {showButtons && (
              <tfoot>
                <tr className="border-t border-border">
                  <td className="p-4"></td>
                  {products.map((product) => (
                    <td
                      key={product.id}
                      className={cn(
                        'p-4 text-center',
                        product.highlighted && 'bg-primary/5 border-x-2 border-b-2 border-primary rounded-b-lg'
                      )}
                    >
                      {product.buttonText && product.buttonUrl && (
                        <Button
                          asChild
                          variant={product.highlighted ? 'default' : 'outline'}
                          className="w-full max-w-[200px]"
                        >
                          <a href={product.buttonUrl}>{product.buttonText}</a>
                        </Button>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </section>
  );
}
