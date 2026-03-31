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
} from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface ComposioApp {
  name?: string;
  appName?: string;
  id?: string;
  status?: string;
  toolkit?: { slug?: string };
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

  // Test Gmail state
  const [testTo, setTestTo] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testBody, setTestBody] = useState("");
  const [isSending, setIsSending] = useState(false);

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

  const isGmailConnected = Array.isArray(connectedApps) && connectedApps.some(
    app => (app.toolkit?.slug || app.appName || app.name || '').toLowerCase().includes('gmail')
  );

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
      if (error) throw error;
      
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
      toast.error('Failed to connect app');
    }
  };

  const handleTestSend = async () => {
    if (!testTo || !testSubject || !testBody) {
      toast.error('Fill in all fields');
      return;
    }
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: {
          action: 'gmail_send',
          params: { to: testTo, subject: testSubject, body: testBody },
          entity_id: 'default',
        },
      });
      if (error) throw new Error(typeof error === 'object' ? (error as any)?.message || JSON.stringify(error) : String(error));
      const result = data?.result;
      if (result?.successful || result?.successfull || result?.success) {
        toast.success('Email sent via Gmail!');
        setTestTo('');
        setTestSubject('');
        setTestBody('');
      } else {
        const errMsg = typeof result?.error === 'string' ? result.error : 'Send failed — check Gmail connection';
        toast.error(errMsg);
      }
    } catch (err) {
      logger.error('[ComposioPanel] Gmail send failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsSending(false);
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
      </div>

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
          {/* Connection Status */}
          <Card className={isGmailConnected ? "border-primary/30 bg-primary/5" : "border-dashed border-muted-foreground/30"}>
            <CardContent className="py-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isGmailConnected ? 'bg-primary/10' : 'bg-muted'}`}>
                    <Mail className={`h-4 w-4 ${isGmailConnected ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Gmail</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {isGmailConnected ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          <span className="text-xs text-primary">Connected</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Not connected</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {!isGmailConnected && (
                  <Button size="sm" onClick={() => handleConnectApp('gmail')} className="text-xs">
                    <Plug className="h-3 w-3 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

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
          </div>

          {/* Test Send */}
          {isGmailConnected && (
            <>
              <Separator />
              <div className="space-y-3">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Test Send
                </h4>
                <Input
                  placeholder="To (email)"
                  value={testTo}
                  onChange={e => setTestTo(e.target.value)}
                  className="text-xs h-8"
                />
                <Input
                  placeholder="Subject"
                  value={testSubject}
                  onChange={e => setTestSubject(e.target.value)}
                  className="text-xs h-8"
                />
                <textarea
                  placeholder="Body..."
                  value={testBody}
                  onChange={e => setTestBody(e.target.value)}
                  className="w-full text-xs p-2 rounded-md border border-input bg-background min-h-[60px] resize-none"
                />
                <Button
                  size="sm"
                  onClick={handleTestSend}
                  disabled={isSending || !testTo || !testSubject || !testBody}
                  className="w-full text-xs"
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1" />
                  )}
                  Send Test Email
                </Button>
              </div>
            </>
          )}
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
              {connectedApps.map((app, i) => (
                <Card key={app.id || i} className="border-muted">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Plug className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{app.appName || app.name || 'Unknown'}</p>
                        {app.status && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {app.status === 'active' ? (
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
              ))}
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
              {['gmail', 'slack', 'google_sheets', 'hubspot', 'notion', 'calendar'].map(app => (
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
