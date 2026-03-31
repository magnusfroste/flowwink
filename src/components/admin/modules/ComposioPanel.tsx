import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface ComposioApp {
  name?: string;
  appName?: string;
  id?: string;
  status?: string;
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

  // Fetch connected apps
  const { data: connectedApps, isLoading: appsLoading, refetch: refetchApps } = useQuery({
    queryKey: ['composio-connected-apps'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { action: 'list_apps', entity_id: 'default' },
      });
      if (error) throw error;
      return (data?.result?.items || data?.result || []) as ComposioApp[];
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

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
      const { data, error } = await supabase.functions.invoke('composio-proxy', {
        body: { 
          action: 'connect_app', 
          params: { app_name: appName },
          entity_id: 'default',
        },
      });
      if (error) throw error;
      
      const redirectUrl = data?.result?.redirectUrl || data?.result?.connectionUrl;
      if (redirectUrl) {
        window.open(redirectUrl, '_blank');
        toast.success('OAuth window opened — complete the connection there');
      } else {
        toast.info('Connection initiated');
        refetchApps();
      }
    } catch (err) {
      logger.error('[ComposioPanel] Connect failed:', err);
      toast.error('Failed to connect app');
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
          <h3 className="font-semibold">Connected Apps</h3>
          <p className="text-xs text-muted-foreground">
            Manage external app connections via Composio
          </p>
        </div>
      </div>

      {/* Connected Apps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
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
              <p className="text-xs text-muted-foreground/60 mt-1">
                Use tool search below or ask FlowPilot to connect an app
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Separator />

      {/* Quick Connect */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
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

      <Separator />

      {/* Tool Search */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Search Tools
        </h4>
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
          <ScrollArea className="mt-3 max-h-[240px]">
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
      </div>

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
