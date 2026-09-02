import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Plug, 
  RefreshCw, 
  ExternalLink, 
  Zap, 
  Network,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mail,
  Send,
  Inbox,
  Unplug,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { ComposioAccountsList } from "@/components/admin/integrations/ComposioAccountsList";


interface ComposioApp {
  name?: string;
  appName?: string;
  id?: string;
  status?: string;
  toolkit?: { slug?: string };
}

interface ComposioDiagnostic {
  api_key_configured: boolean;
  api_key_valid: boolean;
  api_key_fingerprint?: {
    prefix?: string;
    suffix?: string;
    length?: number;
  } | null;
  auth_configs_ok: boolean;
  auth_configs_count: number;
  gmail_auth_config_found: boolean;
  gmail_auth_config?: {
    id?: string;
    name?: string;
  } | null;
  connected_accounts_ok: boolean;
  connected_accounts_count: number;
  errors?: string[];
}


interface ComposioTool {
  name?: string;
  display_name?: string;
  description?: string;
  appName?: string;
}

export function ComposioPanel() {
  const [searchIntent, setSearchIntent] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ComposioTool[]>([]);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ComposioDiagnostic | null>(null);

  const getFunctionErrorMessage = async (error: unknown) => {
    const maybeError = error as any;
    try {
      const ctx = await maybeError?.context;
      const text = await ctx?.json?.();
      return text?.error || text?.message || maybeError?.message || 'Request failed';
    } catch {
      return maybeError?.message || 'Request failed';
    }
  };

  // Connected-account actions
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);


  // Fetch connected apps
  const { data: connectedApps, isLoading: appsLoading, refetch: refetchApps } = useQuery({
    queryKey: ['composio-connected-apps'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { action: 'list_apps', entity_id: 'default' },
      });
      if (error) throw new Error(typeof error === 'object' ? (error as any)?.message || JSON.stringify(error) : String(error));
      const items = data?.result;
      const list = Array.isArray(items) ? items : items?.items || [];
      return list.filter((a: any) => a.status === 'ACTIVE') as ComposioApp[];
    },
    staleTime: 30 * 1000,
    retry: 1,
  });

  const gmailAccount = Array.isArray(connectedApps)
    ? connectedApps.find(
        app => (app.toolkit?.slug || app.appName || app.name || '').toLowerCase().includes('gmail')
      )
    : null;

  const isGmailConnected = Boolean(gmailAccount);

  const handleSearch = async () => {
    if (!searchIntent.trim()) return;
    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { action: 'search_tools', intent: searchIntent },
      });
      if (error) throw error;
      const items = data?.result?.items || data?.result || [];
      setSearchResults(Array.isArray(items) ? items : []);
      if (Array.isArray(items) && items.length === 0) {
        toast.info('No tools found for that intent');
      }
    } catch (err) {
      logger.error('[ComposioPanel] Search failed:', err);
      toast.error('Failed to search tools');
    } finally {
      setIsSearching(false);
    }
  };

  const handleConnectApp = async (appName: string) => {
    try {
      const redirectBack = `${window.location.origin}/admin/modules`;
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { 
          action: 'connect_app', 
          params: { app_name: appName, redirect_uri: redirectBack },
          entity_id: 'default',
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      
      const result = data?.result;
      const oauthUrl = result?.redirect_url || result?.redirect_uri || result?.redirectUrl 
        || result?.connectionData?.val?.redirectUrl;
      
      if (result?.error) {
        logger.error('[ComposioPanel] Composio error:', result);
        toast.error(result.error || 'Composio returned an error');
      } else if (oauthUrl) {
        toast.success('Opening OAuth — complete login in the new tab');
        window.open(oauthUrl, '_blank', 'noopener');
      } else {
        logger.warn('[ComposioPanel] No redirect URL in response:', JSON.stringify(result));
        toast.error('No OAuth URL returned — check Composio integration setup');
      }
    } catch (err) {
      logger.error('[ComposioPanel] Connect failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to connect app');
    }
  };

  const handleDiagnose = async () => {
    setIsDiagnosing(true);
    try {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { action: 'diagnose', entity_id: 'default' },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      setDiagnostic((data?.result || null) as ComposioDiagnostic | null);
      toast.success('Composio diagnostic complete');
    } catch (err) {
      logger.error('[ComposioPanel] Diagnose failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to run diagnostic');
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleDisconnectAccount = async (account: ComposioApp) => {
    if (!account?.id) {
      toast.error('No account id to disconnect');
      return;
    }
    setDisconnectingId(account.id);
    try {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: {
          action: 'disconnect_account',
          params: { account_id: account.id },
          entity_id: (account as any).user_id || 'default',
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.result?.disconnected) {
        toast.success('Account disconnected from Composio');
        await refetchApps();
      } else {
        throw new Error(data?.result?.error || data?.error || 'Disconnect failed');
      }
    } catch (err) {
      logger.error('[ComposioPanel] Disconnect failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to disconnect account');
    } finally {
      setDisconnectingId(null);
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Network className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Composio Apps</h3>
          <p className="text-xs text-muted-foreground">
            Connect external apps for FlowPilot automation
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/admin/integrations#composio"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Manage integration
            <ExternalLink className="h-3 w-3" />
          </a>
          <Button variant="outline" size="sm" onClick={handleDiagnose} disabled={isDiagnosing} className="text-xs">
            {isDiagnosing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5 mr-1" />}
            Check connection
          </Button>

        </div>
      </div>

      {diagnostic && (
        <Card className="border-muted">
          <CardContent className="py-4 px-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium">Connection diagnostic</p>
              <div className="flex gap-2 flex-wrap">
                <Badge variant={diagnostic.api_key_valid ? 'default' : 'destructive'}>
                  API key {diagnostic.api_key_valid ? 'valid' : 'failing'}
                </Badge>
                <Badge variant={diagnostic.gmail_auth_config_found ? 'default' : 'secondary'}>
                  Gmail auth config {diagnostic.gmail_auth_config_found ? 'found' : 'missing'}
                </Badge>
                <Badge variant={diagnostic.connected_accounts_ok ? 'default' : 'secondary'}>
                  Connections {diagnostic.connected_accounts_ok ? 'reachable' : 'unreachable'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground">
              <div>Auth configs: <span className="text-foreground font-medium">{diagnostic.auth_configs_count}</span></div>
              <div>Connected accounts: <span className="text-foreground font-medium">{diagnostic.connected_accounts_count}</span></div>
              <div>Matched Gmail config: <span className="text-foreground font-medium">{diagnostic.gmail_auth_config?.name || '—'}</span></div>
              <div className="md:col-span-3">
                API key fingerprint:{' '}
                <span className="text-foreground font-mono">
                  {diagnostic.api_key_fingerprint?.prefix
                    ? `${diagnostic.api_key_fingerprint.prefix}…${diagnostic.api_key_fingerprint.suffix ?? ''}`
                    : '—'}
                </span>
                {diagnostic.api_key_fingerprint?.length ? (
                  <span className="ml-1">({diagnostic.api_key_fingerprint.length} chars)</span>
                ) : null}
                <span className="ml-1">— compare with the key in the Composio dashboard.</span>
              </div>
            </div>



            {diagnostic.errors && diagnostic.errors.length > 0 && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
                {diagnostic.errors.map((item, index) => (
                  <p key={`${item}-${index}`} className="text-xs text-destructive">{item}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Webhook URL — project-level Composio setting, shared by all triggers/accounts */}
      <Card className="border-muted">
        <CardContent className="py-3 px-4 space-y-2">
          <p className="text-xs font-medium">Composio webhook URL</p>
          <p className="text-[11px] text-muted-foreground">
            Paste this into Composio dashboard → Project Settings → Webhooks. One URL per project — shared by every trigger and connected account below.
          </p>
          <div className="flex gap-1">
            <Input
              value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/composio-webhook`}
              readOnly
              className="h-8 text-xs font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-8"
              onClick={() => {
                navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/composio-webhook`);
                toast.success("Copied");
              }}
            >
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>


      <Tabs defaultValue="gmail" className="w-full">
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="gmail" className="text-xs">
            <Mail className="h-3.5 w-3.5 mr-1" />
            Gmail
          </TabsTrigger>
          <TabsTrigger value="connections" className="text-xs">
            <Plug className="h-3.5 w-3.5 mr-1" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">
            <Search className="h-3.5 w-3.5 mr-1" />
            Tools
          </TabsTrigger>
        </TabsList>




        {/* Gmail Tab */}
        <TabsContent value="gmail" className="space-y-4 mt-4">
          {/* Connected accounts (list — supports multiple mailboxes later) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Connected accounts
              </h4>
              {isGmailConnected && (
                <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => handleConnectApp('gmail')}>
                  <Plug className="h-3 w-3 mr-1" />
                  Connect another
                </Button>
              )}
            </div>
            <ComposioAccountsList
              accounts={(connectedApps || []).filter(a =>
                `${a.toolkit?.slug || a.appName || a.name || ''}`.toLowerCase().includes('gmail'),
              )}
              isLoading={appsLoading}
              disconnectingId={disconnectingId}
              onDisconnect={acc => handleDisconnectAccount(acc as ComposioApp)}
              onConnect={() => handleConnectApp('gmail')}
            />
          </div>

          {/* Capabilities */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              FlowPilot Capabilities
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <Card className="border-muted">
                <CardContent className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <Send className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-xs font-medium">Send Email</p>
                      <p className="text-[10px] text-muted-foreground">Follow-ups, confirmations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-muted">
                <CardContent className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-3.5 w-3.5 text-primary" />
                    <div>
                      <p className="text-xs font-medium">Read Email</p>
                      <p className="text-[10px] text-muted-foreground">Context, replies</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Per-user From / Reply-To addresses (set on a profile) are honoured by the Resend
              transport only. Gmail via Composio always sends as the connected account.
            </p>
            <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-medium">Inbound routing lives in the Email Router</p>
              <p className="text-muted-foreground">
                This panel manages the <em>Gmail transport</em> only (connect / disconnect / diagnose).
                Which mailboxes are watched, and whether replies land on the contact card or open a
                ticket, is configured in the Email Router.
              </p>
              <a
                href="/admin/email?tab=sending"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Open Email Router settings
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

        </TabsContent>


        {/* Connections Tab */}
        <TabsContent value="connections" className="space-y-4 mt-4">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Active Connections
            </h4>
            <Button variant="ghost" size="sm" onClick={() => refetchApps()} disabled={appsLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${appsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {appsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : connectedApps && connectedApps.length > 0 ? (
            <div className="space-y-2">
              {connectedApps.map((app: any, i) => {
                const toolkitSlug = app.toolkit?.slug || app.toolkit_slug || '';
                const displayName =
                  app.appName ||
                  app.name ||
                  (toolkitSlug ? toolkitSlug.charAt(0).toUpperCase() + toolkitSlug.slice(1) : 'Unknown');
                const identity =
                  app.identity?.email ||
                  app.user?.email ||
                  app.data?.email ||
                  app.entity_id ||
                  app.user_id ||
                  app.word_id ||
                  null;
                return (
                  <Card key={app.id || i} className="border-muted">
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          {identity && (
                            <p className="text-xs text-muted-foreground truncate">{identity}</p>
                          )}
                          {app.status && (
                            <div className="flex items-center gap-1 mt-0.5">
                              {String(app.status).toLowerCase() === 'active' ? (
                                <CheckCircle2 className="h-3 w-3 text-primary" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className="text-xs text-muted-foreground capitalize">{app.status}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

            </div>
          ) : (
            <Card className="border-dashed border-muted-foreground/30">
              <CardContent className="py-6 text-center">
                <Plug className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No apps connected yet</p>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Quick Connect */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Quick Connect
            </h4>
            <div className="flex flex-wrap gap-2">
              {/* linkedin/x: the social-post publisher rail — connecting here
                  creates the account under entity 'default', which is the one
                  composio-proxy's execute path looks up. A connection made in
                  Composio's own dashboard can land under another entity and
                  stays invisible to the proxy (found live 2026-08-14). */}
              {['gmail', 'linkedin', 'x', 'slack', 'google_sheets', 'hubspot', 'notion', 'calendar'].map(app => (
                <Button
                  key={app}
                  variant="outline"
                  size="sm"
                  onClick={() => handleConnectApp(app)}
                  className="text-xs capitalize"
                >
                  <Plug className="h-3 w-3 mr-1" />
                  {app.replace('_', ' ')}
                </Button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="e.g. send email via Gmail..."
              value={searchIntent}
              onChange={e => setSearchIntent(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleSearch} disabled={isSearching || !searchIntent.trim()}>
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <ScrollArea className="max-h-[280px]">
              <div className="space-y-2">
                {searchResults.map((tool, i) => (
                  <Card key={tool.name || i} className="border-muted">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                            <p className="text-sm font-medium truncate">
                              {tool.display_name || tool.name}
                            </p>
                          </div>
                          {tool.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {tool.description}
                            </p>
                          )}
                          {tool.appName && (
                            <Badge variant="secondary" className="mt-1.5 text-[10px]">
                              {tool.appName}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}

          {searchResults.length === 0 && (
            <Card className="border-dashed border-muted-foreground/30">
              <CardContent className="py-6 text-center">
                <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Search for tools by intent</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  e.g. "create spreadsheet", "post to slack"
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Link to Composio dashboard */}
      <div className="pt-2">
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" asChild>
          <a href="https://app.composio.dev" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3 mr-1" />
            Open Composio Dashboard
          </a>
        </Button>
      </div>
    </div>
  );
}

