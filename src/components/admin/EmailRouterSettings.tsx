import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIntegrations, useUpdateIntegrations, useIsIntegrationActive } from "@/hooks/useIntegrations";
import { Mail, Inbox, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { InboundMailboxesSection } from "@/components/admin/email/InboundMailboxesSection";
import { OutboundGuardPanel } from "@/components/admin/email/OutboundGuardPanel";

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
      {/* The guard goes FIRST: an instance that is holding mail should say so
          before it explains how mail flows, because everything below is about
          sends that may not be leaving. */}
      <OutboundGuardPanel />

      {/* Flow map — how transport, router and use cases connect */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4" /> How email flows
          </CardTitle>
          <CardDescription>
            The router is the control plane. Transports plug in from the left,
            use cases plug out on the right. Configure each in its own place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Transport
              </p>
              <p className="text-xs text-muted-foreground">
                <em>How</em> mail is sent/received. Configured in{" "}
                <Link to="/admin/integrations" className="underline">Integrations</Link>.
              </p>
              <ul className="text-xs space-y-1">
                <li><strong>Resend</strong> — transactional, newsletters, no reply expected.</li>
                <li><strong>SMTP</strong> — self-hosted server.</li>
                <li><strong>Composio / Gmail</strong> — outbound + <em>inbound</em> replies.</li>
              </ul>
            </div>
            <div className="rounded-md border bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                2. Router (this page)
              </p>
              <p className="text-xs text-muted-foreground">
                Chooses transport per send, sets default From, registers inbound
                mailboxes and decides where replies land (CRM / Tickets).
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                3. Use cases
              </p>
              <ul className="text-xs space-y-1">
                <li><strong>Newsletter</strong> → Resend (bulk, tracking).</li>
                <li><strong>Outreach</strong> (cold email to leads) → Composio/Gmail so replies thread.</li>
                <li><strong>Inbound reply</strong> → attached to contact/lead (CRM), optionally opens a ticket.</li>
                <li><strong>System</strong> (receipts, auth) → Resend.</li>
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Rule of thumb: leave the default on Resend. Callers that need a
            two-way conversation (like <code>send_email_to_lead</code>) opt into
            Composio per send so the reply lands in the same mailbox.
          </p>
        </CardContent>
      </Card>


      {/* Provider routing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default outbound provider</CardTitle>
          <CardDescription>
            Used only when a caller does <em>not</em> specify a provider.
            Agent-driven lead replies always override this and use Composio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default provider</Label>
            <Select
              value={local.provider ?? "auto"}
              onValueChange={(v) => update("provider", v === "auto" ? undefined : (v as "resend" | "composio" | "smtp"))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto — Resend, then SMTP, then Composio (recommended)</SelectItem>
                <SelectItem value="resend">Resend — transactional / newsletter</SelectItem>
                <SelectItem value="smtp">SMTP — self-hosted server</SelectItem>
                <SelectItem value="composio">Composio / Gmail — force all mail through personal account</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Composio as default is unusual — it routes <em>every</em> system
              mail through one Gmail account and can hit sending limits.
            </p>
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

      {/* Inbound mailboxes — routing owner lives here */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Inbound mailboxes
          </CardTitle>
          <CardDescription>
            The addresses FlowWink reads. Each one is a door into FlowBox: mail arrives with FlowPilot's reply
            waiting, is attached to the sender's contact or lead, and can become a ticket when nobody is known.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InboundMailboxesSection emphasis="crm" isGmailConnected={composioStatus.isActive} />
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
