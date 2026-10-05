import { Link } from 'react-router-dom';
import { AlertTriangle, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { useEmailRoute } from '@/hooks/useEmailRoute';
import { EMAIL_PROVIDER_LABEL, type EmailProvider } from '../../../supabase/functions/_shared/email/provider-choice';

/**
 * Says which way this kind of mail actually goes, from the same rule email-send
 * runs. Replaces a Resend-only warning that told instances sending through
 * Composio/Gmail or SMTP that email was "not configured" while it was being
 * delivered. Warns only when nothing can carry the mail, or when the chosen
 * provider is off and another one is carrying it instead.
 *
 * The diagnosis is for everyone; the doors are for admins. Integrations and
 * Email → Sending live in the admin-only System group, so a marketing role
 * following a "Configure" link lands on Access Denied — say who can fix it
 * instead (the IntegrationWarning rule from rollsvepet #102).
 *
 * Two different doors, because they fix two different things: WHICH provider
 * sends is chosen in Email → Sending; whether a provider is CONNECTED is its
 * card in Integrations — linked straight to that card (?open=<key>), not to
 * the top of a long page.
 */
export function EmailRouteNotice({ purpose }: { purpose: string }) {
  const route = useEmailRoute();
  const { isAdmin } = useAuth();
  if (!route) return null;

  const routerDoor = isAdmin
    ? <Link to="/admin/email?tab=sending" className="underline">Email → Sending</Link>
    : <>Email → Sending</>;
  const cardDoor = (p: EmailProvider) => isAdmin
    ? <Link to={`/admin/integrations?open=${p}`} className="underline">{EMAIL_PROVIDER_LABEL[p]}</Link>
    : <>{EMAIL_PROVIDER_LABEL[p]}</>;
  const whoFixes = isAdmin ? null : <> An administrator does this under Integrations.</>;

  if (!route.provider) {
    return (
      <Alert variant="destructive" data-email-route="none">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No email provider is active</AlertTitle>
        <AlertDescription>
          {purpose} will be logged as simulated and reach nobody. Connect {cardDoor('resend')}, {cardDoor('smtp')} or {cardDoor('composio')},
          then choose which one sends in {routerDoor}.{whoFixes}
        </AlertDescription>
      </Alert>
    );
  }

  const via = EMAIL_PROVIDER_LABEL[route.provider];
  if (route.preferredInactive && route.preferred) {
    return (
      <Alert data-email-route={route.provider}>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{purpose} go out via {via}, not {EMAIL_PROVIDER_LABEL[route.preferred]}</AlertTitle>
        <AlertDescription>
          {EMAIL_PROVIDER_LABEL[route.preferred]} is chosen in {routerDoor} but is not active, so {via} carries the mail.
          Turn on {cardDoor(route.preferred)}, or choose {via} instead.{whoFixes}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-email-route={route.provider}>
      <Send className="h-4 w-4" />
      <span>
        {purpose} go out via <span className="font-medium text-foreground">{via}</span>
        {route.preferred ? <> (chosen in {routerDoor}).</> : <> (automatic — change in {routerDoor}).</>}
      </span>
    </p>
  );
}
