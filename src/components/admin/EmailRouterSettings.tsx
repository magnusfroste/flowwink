import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIntegrations, useUpdateIntegrations, useIsIntegrationActive } from "@/hooks/useIntegrations";
import { Mail, Inbox, MessageSquare, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Email Router control plane. Owns provider selection, default From identity,
 * and newsletter tracking. The underlying values are persisted on the
 * Resend integration config (`integrations.resend.config.emailConfig` /
 * `.newsletterTracking`) because `email-send` already reads them there —
 * this UI just lifts them to where they conceptually belong: the router.
 */
export function EmailRouterSettings() {
  const { data: settings, isLoading } = useIntegrations();
  const updateIntegrations = useUpdateIntegrations();

  const resendStatus = useIsIntegrationActive("resend");
  const composioStatus = useIsIntegrationActive("composio");
  const smtpStatus = useIsIntegrationActive("smtp");

  const cfg = settings?.resend?.config;
  const emailConfig = cfg?.emailConfig ?? { fromEmail: "", fromName: "Newsletter" };
  const tracking = cfg?.newsletterTracking ?? { enableOpenTracking: false, enableClickTracking: false };

  const [local, setLocal] = useState(emailConfig);
  const [trackLocal, setTrackLocal] = useState(tracking);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal(emailConfig);
    setTrackLocal(tracking);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.resend?.config]);

  const save = () => {
    updateIntegrations.mutate(
      {
        resend: {
          config: {
            ...(cfg ?? {}),
            emailConfig: local,
            newsletterTracking: trackLocal,
          },
        },
      } as any,
      { onSuccess: () => setDirty(false) },
    );
  };

  const update = <K extends keyof typeof local>(k: K, v: (typeof local)[K]) => {
    setLocal((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading router settings…</div>;
  }

  return (
    <div className="space-y-6">
      {/* What the router does */}
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertTitle>Email Router — the control plane</AlertTitle>
        <AlertDescription>
          All outbound mail flows through <code>email-send</code>. The router decides
          which connected provider actually delivers each message: Resend for
          transactional/newsletter (no reply expected), Composio/Gmail when a thread is
          expected (lead replies, agent follow-ups), SMTP for self-hosted servers.
        </AlertDescription>
      </Alert>

      {/* Provider routing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outbound provider</CardTitle>
          <CardDescription>
            Default delivery channel for system mail. Individual senders (e.g. agent
            replying to a lead) may override per call.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={local.provider ?? "auto"}
              onValueChange={(v) => update("provider", v === "auto" ? undefined : (v as "resend" | "composio" | "smtp"))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Resend → SMTP → Composio)</SelectItem>
                <SelectItem value="resend">Resend — transactional / newsletter</SelectItem>
                <SelectItem value="composio">Composio / Gmail — personal sender (replies expected)</SelectItem>
                <SelectItem value="smtp">SMTP — self-hosted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <ProviderChip name="Resend" active={resendStatus.isActive} hasKey={resendStatus.hasKey} />
            <ProviderChip name="Composio / Gmail" active={composioStatus.isActive} hasKey={composioStatus.hasKey} />
            <ProviderChip name="SMTP" active={smtpStatus.isActive} hasKey={smtpStatus.hasKey} />
          </div>
          <p className="text-xs text-muted-foreground">
            Connect providers in <Link to="/admin/integrations" className="underline">Integrations</Link>.
          </p>
        </CardContent>
      </Card>

      {/* Default From identity (Resend / SMTP branch) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default From identity</CardTitle>
          <CardDescription>
            Used by Resend and SMTP branches. Composio sends from the connected Gmail
            account and ignores these fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="from-name">From Name</Label>
              <Input
                id="from-name"
                value={local.fromName ?? ""}
                onChange={(e) => update("fromName", e.target.value)}
                placeholder="FlowWink"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="from-email">From Email *</Label>
              <Input
                id="from-email"
                value={local.fromEmail ?? ""}
                onChange={(e) => update("fromEmail", e.target.value)}
                placeholder="hello@yourdomain.com"
              />
              <p className="text-xs text-muted-foreground">
                Must be a verified sender on the active provider.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Newsletter tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Newsletter tracking</CardTitle>
          <CardDescription>
            Tracking may impact deliverability. Disable if newsletter mail hits spam.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Open tracking</Label>
              <p className="text-xs text-muted-foreground">Inserts a 1×1 pixel.</p>
            </div>
            <Switch
              checked={trackLocal.enableOpenTracking}
              onCheckedChange={(c) => { setTrackLocal((s) => ({ ...s, enableOpenTracking: c })); setDirty(true); }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Click tracking</Label>
              <p className="text-xs text-muted-foreground">Rewrites links via tracking URL.</p>
            </div>
            <Switch
              checked={trackLocal.enableClickTracking}
              onCheckedChange={(c) => { setTrackLocal((s) => ({ ...s, enableClickTracking: c })); setDirty(true); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Inbound pipeline (read-only summary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Inbound → Ticket
          </CardTitle>
          <CardDescription>
            The router also owns inbound mail. Messages arriving via Composio/Gmail
            webhooks are converted into support tickets (or appended as comments on
            existing threads) by the <code>email_to_ticket</code> skill.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">Gmail webhook</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">email_to_ticket</Badge>
            <ArrowRight className="h-3 w-3" />
            <Badge variant="outline">tickets</Badge>
          </div>
          <p>
            Configure inbox accounts under{" "}
            <Link to="/admin/live-support" className="underline">Live Support</Link>.
            Replies sent from a ticket route back through this same router.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={!dirty || updateIntegrations.isPending}>
          {updateIntegrations.isPending ? "Saving…" : "Save router settings"}
        </Button>
      </div>
    </div>
  );
}

function ProviderChip({ name, active, hasKey }: { name: string; active: boolean; hasKey: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-sm">
      <span className="font-medium">{name}</span>
      {active ? (
        <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-800">
          <CheckCircle2 className="h-3 w-3" /> Ready
        </Badge>
      ) : hasKey ? (
        <Badge variant="outline">Disabled</Badge>
      ) : (
        <Badge variant="outline" className="gap-1 text-muted-foreground">
          <XCircle className="h-3 w-3" /> Not connected
        </Badge>
      )}
    </div>
  );
}
