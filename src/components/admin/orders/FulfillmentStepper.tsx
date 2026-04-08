import { Check, PackageCheck, PackageOpen, Truck, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const STEPS = [
  { key: 'unfulfilled', label: 'Unfulfilled', icon: PackageOpen, tsField: null },
  { key: 'picked', label: 'Picked', icon: Check, tsField: 'picked_at' },
  { key: 'packed', label: 'Packed', icon: PackageCheck, tsField: 'packed_at' },
  { key: 'shipped', label: 'Shipped', icon: Truck, tsField: 'shipped_at' },
  { key: 'delivered', label: 'Delivered', icon: MapPin, tsField: 'delivered_at' },
] as const;

interface FulfillmentStepperProps {
  status: string;
  pickedAt?: string | null;
  packedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  compact?: boolean;
}

export function FulfillmentStepper({
  status,
  pickedAt,
  packedAt,
  shippedAt,
  deliveredAt,
  compact = false,
}: FulfillmentStepperProps) {
  const timestamps: Record<string, string | null | undefined> = {
    picked_at: pickedAt,
    packed_at: packedAt,
    shipped_at: shippedAt,
    delivered_at: deliveredAt,
  };

  const currentIdx = STEPS.findIndex(s => s.key === status);

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {STEPS.map((step, i) => (
          <div
            key={step.key}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              i <= currentIdx ? 'bg-primary' : 'bg-muted'
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-0 w-full">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const isCompleted = i <= currentIdx;
        const isCurrent = i === currentIdx;
        const ts = step.tsField ? timestamps[step.tsField] : null;

        return (
          <div key={step.key} className="flex flex-col items-center flex-1 relative">
            {/* Connector line */}
            {i > 0 && (
              <div
                className={cn(
                  'absolute top-4 -left-1/2 w-full h-0.5',
                  isCompleted ? 'bg-primary' : 'bg-muted'
                )}
                style={{ zIndex: 0 }}
              />
            )}
            {/* Icon circle */}
            <div
              className={cn(
                'relative z-10 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                isCompleted
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-background border-muted text-muted-foreground',
                isCurrent && 'ring-2 ring-primary/30'
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            {/* Label */}
            <p className={cn(
              'text-xs mt-1.5 font-medium',
              isCompleted ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {step.label}
            </p>
            {/* Timestamp */}
            {ts && (
              <p className="text-[10px] text-muted-foreground">
                {format(new Date(ts), 'MMM d, HH:mm')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const FULFILLMENT_STEPS = STEPS;
