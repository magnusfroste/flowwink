import { useMemo, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BlockSection, SectionHeading } from './_shared';
import { cn } from '@/lib/utils';
import { useCustomerFormat } from '@/hooks/useCustomerFormat';
import { homeCurrency } from '@/lib/platform-fallbacks';

export interface PricingCalculatorVariable {
  id: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Price added per unit above min. */
  unitPrice: number;
  defaultValue?: number;
}

export interface PricingCalculatorBlockData {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  basePrice?: number;
  currencySymbol?: string;
  billingLabel?: string;
  variables?: PricingCalculatorVariable[];
  primaryButton?: { text: string; url: string };
  secondaryNote?: string;
}

interface Props {
  data: PricingCalculatorBlockData;
}

export function PricingCalculatorBlock({ data }: Props) {
  // Numbers in the page's language, written the business's way.
  const { locale, formatNumber } = useCustomerFormat();
  const {
    title = 'Estimate your price',
    subtitle,
    eyebrow,
    basePrice = 0,
    currencySymbol,
    billingLabel = 'per month',
    variables = [],
    primaryButton,
    secondaryNote,
  } = data;

  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    variables.forEach((v) => {
      init[v.id] = v.defaultValue ?? v.min;
    });
    return init;
  });

  const total = useMemo(() => {
    let sum = basePrice;
    for (const v of variables) {
      const val = values[v.id] ?? v.min;
      sum += Math.max(0, val - v.min) * v.unitPrice;
    }
    return sum;
  }, [values, variables, basePrice]);

  // An editor-set symbol is a prefix by choice; without one the amount is the
  // business's currency, written the reader's way ("1 234 kr", not "$1,234").
  const formatMoney = (n: number) => currencySymbol
    ? `${currencySymbol}${n.toLocaleString(locale, {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`
    : formatNumber(n, {
      style: 'currency',
      currency: homeCurrency(),
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });

  return (
    <BlockSection>
      <div className="max-w-4xl mx-auto">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          lead={subtitle}
          align="center"
        />

        <Card className="mt-10 p-6 md:p-8 border-border/60 shadow-sm">
          <div className="grid md:grid-cols-[1fr_auto] gap-8 items-start">
            <div className="space-y-8">
              {variables.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add variables in the editor to enable the calculator.
                </p>
              ) : (
                variables.map((v) => {
                  const val = values[v.id] ?? v.min;
                  return (
                    <div key={v.id} className="space-y-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <div>
                          <div className="font-medium text-sm">{v.label}</div>
                          {v.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {v.description}
                            </div>
                          )}
                        </div>
                        <div className="text-lg font-semibold tabular-nums">
                          {val.toLocaleString(locale)}
                          {v.unit && (
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              {v.unit}
                            </span>
                          )}
                        </div>
                      </div>
                      <Slider
                        min={v.min}
                        max={v.max}
                        step={v.step ?? 1}
                        value={[val]}
                        onValueChange={(next) =>
                          setValues((prev) => ({ ...prev, [v.id]: next[0] }))
                        }
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{v.min.toLocaleString(locale)}{v.unit ? ` ${v.unit}` : ''}</span>
                        <span>{v.max.toLocaleString(locale)}{v.unit ? ` ${v.unit}` : ''}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sticky price panel */}
            <div className="md:w-64 md:sticky md:top-24">
              <div className="rounded-[var(--radius-block,1rem)] bg-primary text-primary-foreground p-6 space-y-3">
                <div className="text-xs uppercase tracking-wider opacity-80">
                  Your estimate
                </div>
                <div className="text-4xl font-bold tabular-nums leading-none">
                  {formatMoney(total)}
                </div>
                <div className="text-xs opacity-80">{billingLabel}</div>
                {primaryButton && primaryButton.text && (
                  <Button
                    asChild
                    variant="secondary"
                    className={cn('w-full mt-3 bg-background text-foreground hover:bg-background/90')}
                  >
                    <a href={primaryButton.url || '#'}>{primaryButton.text}</a>
                  </Button>
                )}
              </div>
              {secondaryNote && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {secondaryNote}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </BlockSection>
  );
}
