import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  useCustomerPortalSettings,
  useUpdateCustomerPortalSettings,
  defaultCustomerPortalSettings,
  type CustomerPortalSettings,
} from '@/hooks/useSiteSettings';
import { Users } from 'lucide-react';

/**
 * Admin toggle for customer-facing self-signup.
 *
 * Independent of the global `auth.disable_signup` flag, which governs staff.
 * E-commerce / bookings / webinars all read this policy via
 * `useCustomerPortalSettings` and gate their account-create flows accordingly.
 */
export function CustomerPortalCard() {
  const { data, isLoading } = useCustomerPortalSettings();
  const update = useUpdateCustomerPortalSettings();
  const settings: CustomerPortalSettings = data ?? defaultCustomerPortalSettings;

  const set = (patch: Partial<CustomerPortalSettings>) => {
    update.mutate({ ...settings, ...patch });
  };

  const disabled = isLoading || update.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <Users className="h-5 w-5" />
          Customer Portal
        </CardTitle>
        <CardDescription>
          Controls self-signup for end-customers (e-commerce, bookings, webinars).
          Independent of staff signup — disabling this won't block your admin
          team from being invited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Row
          label="Customer accounts enabled"
          help="When off, the public /account/login page is hidden and customers cannot register or sign in."
          checked={settings.enabled}
          disabled={disabled}
          onChange={(v) => set({ enabled: v })}
        />
        <Row
          label="Allow self-signup"
          help="Visitors can create their own account from the website and at checkout. Turn off to make accounts invite-only."
          checked={settings.allowSelfSignup}
          disabled={disabled || !settings.enabled}
          onChange={(v) => set({ allowSelfSignup: v })}
        />
        <Row
          label="Require email verification"
          help="Customers must confirm their email before they can sign in. Recommended."
          checked={settings.requireEmailVerification}
          disabled={disabled || !settings.enabled}
          onChange={(v) => set({ requireEmailVerification: v })}
        />
        <Row
          label="Allow guest checkout"
          help="E-commerce visitors can complete an order without creating an account."
          checked={settings.guestCheckout}
          disabled={disabled}
          onChange={(v) => set({ guestCheckout: v })}
          badge="E-commerce"
        />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  help,
  checked,
  disabled,
  onChange,
  badge,
}: {
  label: string;
  help: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5 flex-1">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          {badge && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
