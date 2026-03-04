import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Unplug,
  Settings,
  ChevronDown,
  Inbox,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface GmailStatus {
  connected: boolean;
  email: string | null;
  connected_at: string | null;
  filter_senders: string[];
  filter_labels: string[];
  max_messages: number;
  scan_days: number;
  last_scan: {
    scanned_at: string;
    signal_count: number;
    suggested_topics: string[];
  } | null;
}

export function GmailIntegrationCard() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [filterSenders, setFilterSenders] = useState('');
  const [maxMessages, setMaxMessages] = useState(20);
  const [scanDays, setScanDays] = useState(7);
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('gmail-oauth-callback', {
        body: { action: 'status' },
      });
      if (!error && data) {
        setStatus(data as GmailStatus);
        setFilterSenders((data as GmailStatus).filter_senders?.join(', ') || '');
        setMaxMessages((data as GmailStatus).max_messages || 20);
        setScanDays((data as GmailStatus).scan_days || 7);
      }
    } catch (e) {
      console.error('Failed to fetch Gmail status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Listen for OAuth popup callback
    const handler = (event: MessageEvent) => {
      if (event.data === 'gmail_connected') {
        fetchStatus();
        toast.success('Gmail connected successfully');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchStatus]);

  const handleConnect = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const authUrl = `${supabaseUrl}/functions/v1/gmail-oauth-callback?action=authorize`;
    window.open(authUrl, 'gmail_oauth', 'width=600,height=700');
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await supabase.functions.invoke('gmail-oauth-callback', {
        body: { action: 'disconnect' },
      });
      await fetchStatus();
      toast.success('Gmail disconnected');
    } catch {
      toast.error('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-inbox-scan');
      if (error) throw error;
      toast.success(`Scanned ${data?.signal_count || 0} emails`);
      await fetchStatus();
    } catch (e) {
      toast.error('Scan failed');
      console.error('Scan error:', e);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await supabase.functions.invoke('gmail-oauth-callback', {
        body: {
          action: 'update_settings',
          filter_senders: filterSenders.split(',').map(s => s.trim()).filter(Boolean),
          max_messages: maxMessages,
          scan_days: scanDays,
        },
      });
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        </CardHeader>
      </Card>
    );
  }

  const isConnected = status?.connected;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <Mail className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <CardTitle className="text-base">Gmail Signals</CardTitle>
              <CardDescription>Inbound email as automation trigger</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Badge variant="default" className="bg-primary/10 text-primary">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setExpanded(!expanded)}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </Button>
              </>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" />
                Not connected
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Connect a Gmail account to scan incoming emails for signals — topics, leads, and opportunities
              that can trigger automations.
            </p>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Requires: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET</span>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Google Cloud Console <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all select-all">
                <span className="text-muted-foreground font-sans font-medium mr-1.5">Redirect URI:</span>
                {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-oauth-callback`}
              </div>
            </div>
            <Button onClick={handleConnect} className="gap-2">
              <Mail className="h-4 w-4" />
              Connect Gmail
            </Button>
          </div>
        ) : (
          <>
            {/* Connected summary */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">{status?.email}</p>
                {status?.last_scan && (
                  <p className="text-xs text-muted-foreground">
                    Last scan: {new Date(status.last_scan.scanned_at).toLocaleString()} · {status.last_scan.signal_count} signals
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleScan}
                  disabled={scanning}
                  className="gap-1.5"
                >
                  {scanning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Inbox className="h-3.5 w-3.5" />
                  )}
                  Scan Now
                </Button>
              </div>
            </div>

            {/* Last scan topics */}
            {status?.last_scan?.suggested_topics && status.last_scan.suggested_topics.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Suggested Topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {status.last_scan.suggested_topics.map((topic, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Expanded settings */}
            {expanded && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="filter-senders" className="text-sm">
                      Filter Senders
                    </Label>
                    <Input
                      id="filter-senders"
                      value={filterSenders}
                      onChange={(e) => setFilterSenders(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated. Leave empty to scan all senders.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="max-messages" className="text-sm">Max Messages</Label>
                      <Input
                        id="max-messages"
                        type="number"
                        value={maxMessages}
                        onChange={(e) => setMaxMessages(Number(e.target.value))}
                        min={1}
                        max={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scan-days" className="text-sm">Scan Window (days)</Label>
                      <Input
                        id="scan-days"
                        type="number"
                        value={scanDays}
                        onChange={(e) => setScanDays(Number(e.target.value))}
                        min={1}
                        max={30}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="gap-1.5"
                    >
                      {disconnecting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Unplug className="h-3.5 w-3.5" />
                      )}
                      Disconnect
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveSettings}
                      disabled={savingSettings}
                      className="gap-1.5"
                    >
                      {savingSettings ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Settings className="h-3.5 w-3.5" />
                      )}
                      Save Settings
                    </Button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
