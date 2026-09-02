import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Sparkles, ChevronDown, Mail } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useIsModuleEnabled } from "@/hooks/useModules";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";

/**
 * Inbound mailbox registry.
 *
 * Conceptually this is Email Router territory — it describes WHICH incoming
 * addresses FlowWink should watch and WHAT to do with replies. It survives
 * Composio OAuth rotations because it's routing config, not a live token.
 *
 * The primary route mode is CRM: an outbound cold email to a lead comes back
 * as a reply and lands on the contact/lead card via `outbound_communications`
 * + `inbound_communications`. Tickets are an optional second path, gated by
 * the tickets module.
 */
type RouteMode = "crm_only" | "crm_then_ticket" | "ticket_only";

interface Props {
  /**
   * Which surface is rendering this section — used only to reorder the
   * default route-mode explanation. Both surfaces show the same controls.
   */
  emphasis?: "crm" | "tickets";
  isGmailConnected: boolean;
}

export function InboundMailboxesSection({ emphasis = "crm", isGmailConnected }: Props) {
  const ticketsEnabled = useIsModuleEnabled("tickets");
  const [email, setEmail] = useState("");
  const [composioAccountId, setComposioAccountId] = useState("");
  const [registering, setRegistering] = useState(false);
  const [activatingWatch, setActivatingWatch] = useState<string | null>(null);
  const [enablingTrigger, setEnablingTrigger] = useState<string | null>(null);
  const [autoRegistering, setAutoRegistering] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  

  const { data: accounts, isLoading, refetch } = useQuery({
    queryKey: ["inbound-email-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inbound_email_accounts")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    staleTime: 15 * 1000,
  });

  const handleRegister = async () => {
    if (!email.trim()) {
      toast.error("Enter an email address");
      return;
    }
    setRegistering(true);
    try {
      const { error } = await supabase.from("inbound_email_accounts").insert({
        provider: "composio_gmail",
        email_address: email.trim(),
        composio_account_id: composioAccountId.trim() || null,
        is_shared: true,
        enabled: true,
        // Default: land replies on the CRM record (contact/lead card).
        route_mode: emphasis === "tickets" && ticketsEnabled ? "crm_then_ticket" : "crm_only",
      } as any);
      if (error) throw error;
      toast.success("Mailbox registered");
      setEmail("");
      setComposioAccountId("");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to register");
    } finally {
      setRegistering(false);
    }
  };

  /**
   * One-click: read the first ACTIVE Composio Gmail connection, resolve its
   * mailbox via GMAIL_GET_PROFILE, register it as the company inbox, then
   * enable the webhook subscription + trigger and activate Gmail Watch.
   * This is the happy path — the manual "Register company inbox" form below
   * remains for advanced setups (multiple accounts, non-Gmail providers).
   */
  const handleAutoRegisterConnectedGmail = async () => {
    setAutoRegistering(true);
    try {
      // 1. Discover the connected Gmail account
      const listRes = await supabase.functions.invoke("composio-proxy", {
        body: { action: "list_apps", entity_id: "default" },
      });
      if (listRes.error) throw listRes.error;
      const items = listRes.data?.result;
      const apps = Array.isArray(items) ? items : items?.items || [];
      const gmail = apps.find((a: any) => {
        const slug = (a.toolkit?.slug || a.appName || a.name || "").toLowerCase();
        const status = (a.status || "").toUpperCase();
        return slug.includes("gmail") && status === "ACTIVE";
      });
      if (!gmail?.id) throw new Error("No active Gmail connection found in Composio");

      // 2. Resolve the actual mailbox address
      const profRes = await supabase.functions.invoke("composio-proxy", {
        body: {
          action: "execute",
          entity_id: gmail.user_id || "default",
          params: { action_name: "GMAIL_GET_PROFILE", toolkit: "gmail", input: {} },
        },
      });
      if (profRes.error) throw profRes.error;
      const payload = profRes.data?.result?.data?.response_data
        || profRes.data?.result?.data
        || profRes.data?.result
        || {};
      const mailbox = payload.emailAddress || payload.email_address || payload.email;
      if (!mailbox) throw new Error("Could not read the Gmail profile — try again in a moment");

      // 3. Register (or update) the inbound mailbox row
      const { data: existing } = await supabase
        .from("inbound_email_accounts")
        .select("id")
        .eq("email_address", mailbox)
        .maybeSingle();
      let accountId = existing?.id as string | undefined;
      if (accountId) {
        const { error: updErr } = await supabase
          .from("inbound_email_accounts")
          .update({
            provider: "composio_gmail",
            composio_account_id: gmail.id,
            is_shared: true,
            enabled: true,
          } as any)
          .eq("id", accountId);
        if (updErr) throw updErr;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("inbound_email_accounts")
          .insert({
            provider: "composio_gmail",
            email_address: mailbox,
            composio_account_id: gmail.id,
            is_shared: true,
            enabled: true,
            route_mode: emphasis === "tickets" && ticketsEnabled ? "crm_then_ticket" : "crm_only",
          } as any)
          .select("id")
          .single();
        if (insErr) throw insErr;
        accountId = inserted?.id;
      }

      // 4. Enable webhook subscription + Gmail trigger so replies land here
      try {
        const subRes = await supabase.functions.invoke("composio-proxy", {
          body: { action: "ensure_webhook_subscription", params: {}, entity_id: "default" },
        });
        if (subRes.error) throw subRes.error;
        const trigRes = await supabase.functions.invoke("composio-proxy", {
          body: {
            action: "enable_trigger",
            params: { trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE", account_id: gmail.id, toolkit: "gmail" },
            entity_id: "default",
          },
        });
        if (trigRes.error) throw trigRes.error;
      } catch (trigErr) {
        logger.warn("[InboundMailboxes] Trigger enable warning:", trigErr);
        toast.warning("Inbox registered, but enabling the trigger failed — try the Enable trigger button on the mailbox row");
      }

      toast.success(`${mailbox} is now your company inbox`);
      refetch();
    } catch (err) {
      logger.error("[InboundMailboxes] Auto-register failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to register connected Gmail");
    } finally {
      setAutoRegistering(false);
    }
  };

  const handleActivateWatch = async (accountId: string, composioAccId: string | null) => {
    setActivatingWatch(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("composio-proxy", {
        body: { action: "gmail_watch", params: { account_id: composioAccId }, entity_id: "default" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("inbound_email_accounts").update({ watch_expires_at: expiresAt }).eq("id", accountId);
      toast.success("Gmail Watch activated — push events will start arriving");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate watch");
    } finally {
      setActivatingWatch(null);
    }
  };

  const handleEnableTrigger = async (accountId: string, composioAccId: string | null) => {
    setEnablingTrigger(accountId);
    try {
      // Step 1: ensure Composio has a webhook subscription pointing at our composio-webhook
      // function. Without this, trigger instances produce events but Composio has nowhere
      // to POST them to — the trigger looks "enabled" but nothing ever arrives.
      const subRes = await supabase.functions.invoke("composio-proxy", {
        body: { action: "ensure_webhook_subscription", params: {}, entity_id: "default" },
      });
      if (subRes.error) throw subRes.error;
      if (subRes.data?.error) throw new Error(subRes.data.error);

      // Step 2: create/refresh the Gmail trigger instance for this account.
      const { data, error } = await supabase.functions.invoke("composio-proxy", {
        body: {
          action: "enable_trigger",
          params: { trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE", account_id: composioAccId, toolkit: "gmail" },
          entity_id: "default",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Webhook subscription + trigger enabled — replies will now arrive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enable trigger");
    } finally {
      setEnablingTrigger(null);
    }
  };

  const handleToggleEnabled = async (accountId: string, enabled: boolean) => {
    await supabase.from("inbound_email_accounts").update({ enabled }).eq("id", accountId);
    refetch();
  };

  const handleRouteChange = async (accountId: string, mode: RouteMode) => {
    const { error } = await supabase
      .from("inbound_email_accounts")
      .update({ route_mode: mode } as any)
      .eq("id", accountId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Route updated");
    refetch();
  };

  const handleRemove = async (accountId: string, emailAddress: string) => {
    if (!confirm(`Remove inbound mailbox "${emailAddress}"? Routing rules for this address will be lost.`)) return;
    const { error } = await supabase.from("inbound_email_accounts").delete().eq("id", accountId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mailbox removed");
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {emphasis === "crm" ? (
          <>
            Primary use case: a cold outbound email is sent to a lead — the reply lands on the
            contact/lead card and in <Link to="/admin/flowbox?tab=log" className="underline">FlowBox → Message log</Link>.
            Optionally, unmatched replies can create a ticket if the Tickets module is enabled.
          </>
        ) : (
          <>
            Inbound mailboxes route replies to tickets. The default routing sends replies to the
            CRM record (contact/lead card) first — switch a mailbox to <em>Ticket only</em> or
            <em> CRM then ticket</em> if unmatched mail should escalate here.
          </>
        )}
      </div>

      {/* Webhook URL lives on the Composio integration card — it's a project-level setting,
          not per-inbox. Kept out of this router to avoid conflating "how Composio reaches us"
          with "which inboxes we listen to". */}


      {!isGmailConnected && (
        <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 px-4 text-xs">
            Connect Gmail in <Link to="/admin/integrations" className="underline">Integrations</Link> first
            so Composio knows which account this mailbox lives in.
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="space-y-2">
          {accounts.map((acc: any) => {
            const watchActive = acc.watch_expires_at && new Date(acc.watch_expires_at) > new Date();
            const routeMode: RouteMode = (acc.route_mode as RouteMode) || "crm_only";
            return (
              <Card key={acc.id} className="border-muted">
                <CardContent className="py-3 px-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{acc.email_address}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge variant={acc.enabled ? "default" : "secondary"} className="text-[10px]">
                          {acc.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                        <Badge variant={watchActive ? "default" : "outline"} className="text-[10px]">
                          {watchActive ? "Watch active" : "No watch"}
                        </Badge>
                        {acc.is_shared && <Badge variant="outline" className="text-[10px]">Shared</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => handleEnableTrigger(acc.id, acc.composio_account_id)}
                        disabled={enablingTrigger === acc.id || !isGmailConnected}
                        title="Enable Composio GMAIL_NEW_GMAIL_MESSAGE trigger so replies are pushed to FlowWink"
                      >
                        {enablingTrigger === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Enable trigger"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => handleActivateWatch(acc.id, acc.composio_account_id)}
                        disabled={activatingWatch === acc.id || !isGmailConnected}
                      >
                        {activatingWatch === acc.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : watchActive ? "Renew watch" : "Activate watch"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7"
                        onClick={() => handleToggleEnabled(acc.id, !acc.enabled)}
                      >
                        {acc.enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs h-7 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(acc.id, acc.email_address)}
                        title="Remove this inbound mailbox"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Route mode selector */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Route replies to</Label>
                    <Select
                      value={routeMode}
                      onValueChange={(v) => handleRouteChange(acc.id, v as RouteMode)}
                    >
                      <SelectTrigger className="h-7 text-xs w-full max-w-[280px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="crm_only">
                          CRM only — attach to contact/lead
                        </SelectItem>
                        <SelectItem value="crm_then_ticket" disabled={!ticketsEnabled}>
                          CRM, else ticket {ticketsEnabled ? "" : "(enable Tickets module)"}
                        </SelectItem>
                        <SelectItem value="ticket_only" disabled={!ticketsEnabled}>
                          Ticket only {ticketsEnabled ? "" : "(enable Tickets module)"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    {acc.last_received_at && <div>Last received: {new Date(acc.last_received_at).toLocaleString()}</div>}
                    {acc.watch_expires_at && <div>Watch expires: {new Date(acc.watch_expires_at).toLocaleString()}</div>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : isGmailConnected ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Use the connected Gmail as your company inbox</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We'll read the mailbox address from the connected account, register it as the
                  shared inbox, and enable the Gmail trigger so replies arrive automatically.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full text-xs"
              onClick={handleAutoRegisterConnectedGmail}
              disabled={autoRegistering}
            >
              {autoRegistering ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              Register connected Gmail as company inbox
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-muted-foreground/30">
          <CardContent className="py-4 text-center text-xs text-muted-foreground">
            No inbound mailbox registered yet.
          </CardContent>
        </Card>
      )}

      {/* Advanced: manual registration for extra mailboxes or non-Gmail providers */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-xs w-full justify-between">
            <span>Advanced — register another mailbox manually</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="border-muted mt-2">
            <CardContent className="py-3 px-4 space-y-2">
              <p className="text-[10px] text-muted-foreground">
                Only needed for a second brand/region mailbox or a non-Gmail provider.
                For your primary Gmail, use the one-click button above.
              </p>
              <Input
                placeholder="info@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Composio connected_account_id (optional)"
                value={composioAccountId}
                onChange={(e) => setComposioAccountId(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              <Button size="sm" className="w-full text-xs" onClick={handleRegister} disabled={registering || !email.trim()}>
                {registering && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Register mailbox
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Leave account id empty to let the webhook auto-match by the inbound message.
              </p>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
