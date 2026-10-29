import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, Sparkles, ChevronDown, Mail, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useIsModuleEnabled } from "@/hooks/useModules";
import { Link } from "react-router-dom";
import { logger } from "@/lib/logger";
import { normalizeDomain, isPublicMailDomain } from "../../../../supabase/functions/_shared/email/sender-identity";
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

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
/** Who answers mail to this mailbox — the same dial shape as the chat's routingMode. */
type ReplyMode = "ai_first" | "human_first" | "human_only";

interface Props {
  /**
   * Which surface is rendering this section — used only to reorder the
   * default route-mode explanation. Both surfaces show the same controls.
   */
  emphasis?: "crm" | "tickets";
  isGmailConnected: boolean;
}

export function InboundMailboxesSection({ emphasis = "crm", isGmailConnected }: Props) {
  const { formatDateTime } = usePlatformFormat();
  const ticketsEnabled = useIsModuleEnabled("tickets");
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [composioAccountId, setComposioAccountId] = useState("");
  /** Who delivers mail for a manually registered mailbox — the provider under the router row. */
  const [mailboxProvider, setMailboxProvider] = useState<"composio_gmail" | "cloudflare_email_routing">("composio_gmail");
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
        provider: mailboxProvider,
        email_address: email.trim(),
        composio_account_id: mailboxProvider === "composio_gmail" ? composioAccountId.trim() || null : null,
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
   * One-click: the proxy's `ensure_inbound_mailbox` resolves the connected
   * Gmail's address, upserts the router row as the enabled company inbox and
   * enables the webhook subscription + Gmail trigger — one idempotent call,
   * the same one the reconcile cron and the Composio account list run. The
   * manual "Register company inbox" form below remains for advanced setups
   * (multiple accounts, non-Gmail providers).
   */
  const handleAutoRegisterConnectedGmail = async () => {
    setAutoRegistering(true);
    try {
      const { data, error } = await supabase.functions.invoke("composio-proxy", {
        body: {
          action: "ensure_inbound_mailbox",
          entity_id: "default",
          params: { route_mode: emphasis === "tickets" && ticketsEnabled ? "crm_then_ticket" : "crm_only" },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const result = data?.result || {};
      if (result.inbound !== "active") {
        const detail = result.trigger?.error || result.webhook?.error;
        toast.warning(
          `${result.mailbox} is registered, but inbound is not fully active yet${detail ? ` — ${detail}` : ""}. Try "Enable trigger" on the mailbox row.`,
        );
      } else {
        toast.success(`${result.mailbox} is now your company inbox`);
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ["company-mailbox"] });
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

  /**
   * The alias registry. `alias_domains` are the domains whose addresses ALL
   * deliver to this mailbox (an owned domain with catch-all or aliases). A
   * seller's profile From address is used as the sender only when it is on one
   * of them; otherwise their name goes on the mailbox address. Public mail
   * domains are refused — kalle@gmail.com never lands in the company Gmail.
   */
  const [aliasDraft, setAliasDraft] = useState<Record<string, string>>({});

  const saveAliasDomains = async (accountId: string, domains: string[]) => {
    const { error } = await supabase
      .from("inbound_email_accounts")
      .update({ alias_domains: domains })
      .eq("id", accountId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refetch();
    queryClient.invalidateQueries({ queryKey: ["company-mailboxes"] });
  };

  const handleAddAliasDomain = async (accountId: string, current: string[]) => {
    const domain = normalizeDomain(aliasDraft[accountId] || "");
    if (!domain) {
      toast.error("Enter a domain, like company.se");
      return;
    }
    if (isPublicMailDomain(domain)) {
      toast.error(`${domain} is a public mail provider — mail to an address there never reaches this mailbox`);
      return;
    }
    if (current.includes(domain)) {
      setAliasDraft((d) => ({ ...d, [accountId]: "" }));
      return;
    }
    await saveAliasDomains(accountId, [...current, domain]);
    setAliasDraft((d) => ({ ...d, [accountId]: "" }));
    toast.success(`Addresses on ${domain} now count as this mailbox`);
  };

  const handleRemoveAliasDomain = async (accountId: string, current: string[], domain: string) => {
    await saveAliasDomains(accountId, current.filter((d) => d !== domain));
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

  const handleReplyModeChange = async (accountId: string, mode: ReplyMode) => {
    const { error } = await supabase
      .from("inbound_email_accounts")
      .update({ reply_mode: mode } as any)
      .eq("id", accountId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(mode === "ai_first" ? "FlowPilot now answers this mailbox — drafts when unsure" : mode === "human_only" ? "FlowPilot writes nothing for this mailbox" : "FlowPilot drafts, a person sends");
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
            Every message to a mailbox here lands in <Link to="/admin/flowbox" className="underline">FlowBox</Link> with
            FlowPilot's reply waiting — the same responder as the website chat. <em>Route replies to</em> decides
            where it also lands: on the sender's contact/lead card, or as a ticket when the sender is unknown
            (Tickets module). <em>Who answers</em> decides whether FlowPilot's reply waits as a draft, goes out when
            it is grounded, or is not written at all.
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
            const replyMode: ReplyMode = (acc.reply_mode as ReplyMode) || "human_first";
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

                  {/* Who answers — the same dial shape the chat has. FlowPilot uses
                      the same responder as the widget; the mailbox decides whether
                      its answer waits as a draft or goes out. */}
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Who answers</Label>
                    <Select
                      value={replyMode}
                      onValueChange={(v) => handleReplyModeChange(acc.id, v as ReplyMode)}
                    >
                      <SelectTrigger className="h-7 text-xs w-full max-w-[280px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="human_first">FlowPilot drafts — a person sends</SelectItem>
                        <SelectItem value="ai_first">FlowPilot answers — drafts when unsure</SelectItem>
                        <SelectItem value="human_only">Person only — FlowPilot writes nothing</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Alias domains — the registry a seller's From address is checked
                      against. Empty is honest for a plain Gmail. */}
                  {acc.is_shared && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">Alias domains</Label>
                        {((acc.alias_domains as string[] | null) || []).map((domain) => (
                          <Badge key={domain} variant="outline" className="text-[10px] font-mono gap-1 pr-1">
                            {domain}
                            <button
                              type="button"
                              className="rounded-sm hover:bg-muted"
                              aria-label={`Remove ${domain}`}
                              onClick={() => handleRemoveAliasDomain(acc.id, (acc.alias_domains as string[] | null) || [], domain)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                        <div className="flex gap-1">
                          <Input
                            value={aliasDraft[acc.id] || ""}
                            onChange={(e) => setAliasDraft((d) => ({ ...d, [acc.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddAliasDomain(acc.id, (acc.alias_domains as string[] | null) || []);
                              }
                            }}
                            placeholder="company.se"
                            className="h-7 text-xs w-40"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            onClick={() => handleAddAliasDomain(acc.id, (acc.alias_domains as string[] | null) || [])}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Domains whose addresses all deliver here (catch-all or aliases). A person's profile From
                        address is used as the sender only when it is this mailbox or on one of these domains;
                        otherwise their name goes on {acc.email_address}.
                      </p>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    {acc.last_received_at && <div>Last received: {formatDateTime(acc.last_received_at)}</div>}
                    {acc.watch_expires_at && <div>Watch expires: {formatDateTime(acc.watch_expires_at)}</div>}
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
              <Label htmlFor="mailbox-provider" className="text-xs">Delivered by</Label>
              <Select value={mailboxProvider} onValueChange={(v) => setMailboxProvider(v as typeof mailboxProvider)}>
                <SelectTrigger id="mailbox-provider" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="composio_gmail">Gmail via Composio</SelectItem>
                  <SelectItem value="cloudflare_email_routing">Cloudflare Email Routing (DNS, no mailbox needed)</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="info@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-8 text-xs"
              />
              {mailboxProvider === "composio_gmail" ? (
                <Input
                  placeholder="Composio connected_account_id (optional)"
                  value={composioAccountId}
                  onChange={(e) => setComposioAccountId(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              ) : (
                <div className="space-y-1 text-[10px] text-muted-foreground">
                  <p>
                    Route the address to the FlowWink Worker in Cloudflare (Email → Email Routing). The Worker posts
                    each mail to:
                  </p>
                  <code className="block bg-muted px-2 py-1 rounded font-mono break-all">
                    {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-webhook/inbound`}
                  </code>
                  <p>
                    with the secret <code>EMAIL_INBOUND_SECRET</code> (set the same value in Supabase and as the Worker&apos;s
                    <code> FLOWWINK_INBOUND_SECRET</code>). Setup: Docs → Email guide → Receiving through Cloudflare.
                  </p>
                </div>
              )}
              <Button size="sm" className="w-full text-xs" onClick={handleRegister} disabled={registering || !email.trim()}>
                {registering && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Register mailbox
              </Button>
              {mailboxProvider === "composio_gmail" && (
                <p className="text-[10px] text-muted-foreground">
                  Leave account id empty to let the webhook auto-match by the inbound message.
                </p>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
