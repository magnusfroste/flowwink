import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PackageCheck, Truck, MapPin, Check, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const NEXT_STEP: Record<string, { key: string; label: string; icon: React.ElementType }> = {
  unfulfilled: { key: 'picked', label: 'Mark as Picked', icon: Check },
  picked: { key: 'packed', label: 'Mark as Packed', icon: PackageCheck },
  packed: { key: 'shipped', label: 'Mark as Shipped', icon: Truck },
  shipped: { key: 'delivered', label: 'Mark as Delivered', icon: MapPin },
};

interface FulfillmentActionsProps {
  orderId: string;
  currentStatus: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  fulfillmentNotes?: string | null;
  onUpdated?: () => void;
}

export function FulfillmentActions({
  orderId,
  currentStatus,
  trackingNumber: initialTracking,
  trackingUrl: initialUrl,
  fulfillmentNotes: initialNotes,
  onUpdated,
}: FulfillmentActionsProps) {
  const qc = useQueryClient();
  const next = NEXT_STEP[currentStatus];
  const [trackingNumber, setTrackingNumber] = useState(initialTracking || '');
  const [trackingUrl, setTrackingUrl] = useState(initialUrl || '');
  const [notes, setNotes] = useState(initialNotes || '');
  const showTracking = currentStatus === 'packed';

  const advanceMutation = useMutation({
    mutationFn: async () => {
      if (!next) return;
      const update: Record<string, unknown> = { fulfillment_status: next.key };
      if (trackingNumber) update.tracking_number = trackingNumber;
      if (trackingUrl) update.tracking_url = trackingUrl;
      if (notes) update.fulfillment_notes = notes;

      // Also update order status when shipping/delivering
      if (next.key === 'shipped') update.status = 'shipped';
      if (next.key === 'delivered') update.status = 'completed';

      const { error } = await supabase
        .from('orders')
        .update(update)
        .eq('id', orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success(`Order marked as ${next?.label?.replace('Mark as ', '')}`);
      onUpdated?.();
    },
    onError: () => toast.error('Failed to update fulfillment'),
  });

  if (!next) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-600">
        <Check className="h-4 w-4" />
        <span className="font-medium">Fully delivered</span>
      </div>
    );
  }

  const Icon = next.icon;

  return (
    <div className="space-y-3">
      {showTracking && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Tracking Number</Label>
            <Input
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value)}
              placeholder="e.g. 1Z999AA1..."
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Tracking URL</Label>
            <Input
              value={trackingUrl}
              onChange={e => setTrackingUrl(e.target.value)}
              placeholder="https://..."
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Internal fulfillment notes..."
          className="h-16 text-sm resize-none"
        />
      </div>
      <Button
        onClick={() => advanceMutation.mutate()}
        disabled={advanceMutation.isPending}
        className="gap-2"
      >
        {advanceMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        {next.label}
      </Button>
    </div>
  );
}
