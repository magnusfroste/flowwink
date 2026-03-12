import { Truck, RotateCcw, Clock, MapPin, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShippingInfoItem {
  icon?: string;
  title: string;
  description: string;
}

export interface ShippingInfoBlockData {
  title?: string;
  items?: ShippingInfoItem[];
  variant?: 'list' | 'grid' | 'compact';
}

interface ShippingInfoBlockProps {
  data: ShippingInfoBlockData;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  truck: Truck,
  'rotate-ccw': RotateCcw,
  clock: Clock,
  'map-pin': MapPin,
  help: HelpCircle,
};

const DEFAULT_ITEMS: ShippingInfoItem[] = [
  { icon: 'truck', title: 'Standard Shipping', description: '3–5 business days. Free on orders over $50.' },
  { icon: 'clock', title: 'Express Shipping', description: '1–2 business days. $9.99 flat rate.' },
  { icon: 'rotate-ccw', title: 'Returns', description: 'Free returns within 30 days of purchase.' },
  { icon: 'map-pin', title: 'International', description: 'We ship worldwide. Duties may apply.' },
];

export function ShippingInfoBlock({ data }: ShippingInfoBlockProps) {
  const items = data.items?.length ? data.items : DEFAULT_ITEMS;
  const variant = data.variant || 'list';

  return (
    <section className="py-10 md:py-14">
      <div className="max-w-4xl mx-auto px-4">
        {data.title && (
          <h2 className="font-serif text-2xl font-semibold mb-6">{data.title}</h2>
        )}

        {variant === 'compact' ? (
          <div className="bg-muted/30 rounded-xl p-5 space-y-3">
            {items.map((item, i) => {
              const Icon = ICON_MAP[item.icon || ''] || Truck;
              return (
                <div key={i} className="flex items-start gap-3">
                  <Icon className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <div>
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-sm text-muted-foreground ml-1">— {item.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : variant === 'grid' ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {items.map((item, i) => {
              const Icon = ICON_MAP[item.icon || ''] || Truck;
              return (
                <div key={i} className="rounded-xl border border-border/50 p-5 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h3 className="font-medium text-sm">{item.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {items.map((item, i) => {
              const Icon = ICON_MAP[item.icon || ''] || Truck;
              return (
                <div key={i} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{item.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
