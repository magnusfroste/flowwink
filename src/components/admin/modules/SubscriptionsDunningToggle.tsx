import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useDunningSettings, useUpdateDunningSettings } from '@/hooks/useDunningSettings';

/**
 * Feature-flag UI for the Dunning sub-feature inside the Subscriptions module.
 * Toggles `site_settings.dunning.enabled` — when off, the "Dunning" sidebar
 * item is hidden and the dunning-processor cron skips work.
 */
export function SubscriptionsDunningToggle() {
  const { data: settings, isLoading } = useDunningSettings();
  const update = useUpdateDunningSettings();
  const enabled = settings?.enabled ?? false;

  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">Features</h4>
      <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Label htmlFor="dunning-feature-flag" className="text-sm font-medium">
                Automated dunning
              </Label>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Optional
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Recovers failed subscription payments through a 5-step email
              sequence over 14 days. When off, the Dunning page is hidden from
              the sidebar and the processor cron is a no-op.
            </p>
          </div>
          <Switch
            id="dunning-feature-flag"
            checked={enabled}
            disabled={isLoading || update.isPending}
            onCheckedChange={(checked) =>
              update.mutate({
                ...(settings ?? { enabled: false, highValueThresholdCents: 50000 }),
                enabled: checked,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
