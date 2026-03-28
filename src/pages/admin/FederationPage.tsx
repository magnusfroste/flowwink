import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Globe, Plus, RefreshCw, Copy, Check, ArrowDownLeft, ArrowUpRight, AlertCircle, Pencil, Zap, Loader2, Search, Shield, Cpu } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useA2APeers, useCreateA2APeer, useUpdateA2APeer, useRegenerateInboundToken, useA2AActivity } from '@/hooks/useA2A';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

export default function FederationPage() {
  const { toast } = useToast();
  const { data: peers, isLoading: peersLoading } = useA2APeers();
  const { data: activity, isLoading: activityLoading } = useA2AActivity();
  const createPeer = useCreateA2APeer();
  const updatePeer = useUpdateA2APeer();
  const regenerateToken = useRegenerateInboundToken();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPeerName, setNewPeerName] = useState('');
  const [newPeerUrl, setNewPeerUrl] = useState('');
  const [newPeerOutboundToken, setNewPeerOutboundToken] = useState('');
  const [newPeerInboundToken, setNewPeerInboundToken] = useState('');
  const [newPeerGatewayToken, setNewPeerGatewayToken] = useState('');
  const [showToken, setShowToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const [editingPeer, setEditingPeer] = useState<typeof peers extends (infer T)[] | undefined ? T | null : null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editOutboundToken, setEditOutboundToken] = useState('');

  const [generatedInboundToken, setGeneratedInboundToken] = useState<string | null>(null);
   const [testingPeerId, setTestingPeerId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ peerId: string; success: boolean; message: string } | null>(null);

  const [discoveringPeerId, setDiscoveringPeerId] = useState<string | null>(null);
  const [auditingPeerId, setAuditingPeerId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<{ peerId: string; success: boolean; text: string } | null>(null);

  // Auto-discover state for Add Peer dialog
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<{ success: boolean; agent_card?: any; found_at?: string; error?: string } | null>(null);
  const [probeTimeoutRef, setProbeTimeoutRef] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Auto-probe when URL changes (debounced)
  const handleUrlChange = (url: string) => {
    setNewPeerUrl(url);
    setProbeResult(null);

    if (probeTimeoutRef) clearTimeout(probeTimeoutRef);

    // Strip known agent card paths so users can paste the full URL
    const knownPaths = [
      '/.well-known/agent-card.json', '/.well-known/agent.json',
      '/agent-card.json', '/agent-card',
      '/a2a/agent-card', '/functions/v1/agent-card',
    ];
    let trimmed = url.trim().replace(/\/$/, '');
    for (const p of knownPaths) {
      if (trimmed.endsWith(p)) {
        trimmed = trimmed.slice(0, -p.length);
        break;
      }
    }
    if (!trimmed || !trimmed.startsWith('http')) return;

    const timeoutId = setTimeout(async () => {
      setProbeLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/a2a-discover`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ action: 'probe', peer_url: trimmed }),
          }
        );
        const data = await res.json();
        setProbeResult(data);

        // Auto-fill name from discovered card
        if (data.success && data.agent_card?.name && !newPeerName) {
          setNewPeerName(data.agent_card.name);
        }
      } catch {
        setProbeResult({ success: false, error: 'Probe request failed' });
      } finally {
        setProbeLoading(false);
      }
    }, 800);
    setProbeTimeoutRef(timeoutId);
  };

  const handleTestConnection = async (peer: { id: string; name: string; url: string; capabilities?: unknown }) => {
    if (!peer.url) {
      toast({ title: 'No URL', description: 'This peer has no outbound URL configured.', variant: 'destructive' });
      return;
    }
    setTestingPeerId(peer.id);
    setTestResult(null);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const caps = (peer.capabilities && typeof peer.capabilities === 'object' && !Array.isArray(peer.capabilities))
        ? peer.capabilities as Record<string, unknown>
        : {};
      const skills = Array.isArray(caps.skills) ? caps.skills as Array<Record<string, unknown>> : [];
      const skillIds = skills
        .map((skill) => typeof skill.id === 'string' ? skill.id : null)
        .filter((id): id is string => Boolean(id));

      const preferredSkill = skillIds.includes('healthcheck')
        ? 'healthcheck'
        : skillIds[0] ?? null;

      const requestBody = preferredSkill
        ? { peer_name: peer.name, skill: preferredSkill, arguments: {} }
        : { peer_name: peer.name, message: 'ping' };

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/a2a-outbound`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(requestBody),
        }
      );
      const data = await res.json();
      const errorMsg = data.error
        ? (typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : String(data.error))
        : null;
      if (res.ok && !errorMsg) {
        const successLabel = preferredSkill ? `Skill \"${preferredSkill}\" responded.` : 'Peer responded successfully.';
        setTestResult({ peerId: peer.id, success: true, message: `Connected! Response: ${JSON.stringify(data).slice(0, 120)}` });
        toast({ title: 'Connection OK', description: `${peer.name}: ${successLabel}` });
      } else {
        const displayError = errorMsg || `HTTP ${res.status}`;
        setTestResult({ peerId: peer.id, success: false, message: displayError });
        toast({ title: 'Connection failed', description: displayError, variant: 'destructive' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setTestResult({ peerId: peer.id, success: false, message: msg });
      toast({ title: 'Connection error', description: msg, variant: 'destructive' });
    } finally {
      setTestingPeerId(null);
    }
  };

  const handleDiscover = async (peer: { id: string; name: string; url: string; capabilities?: unknown }) => {
    if (!peer.url) return;
    setDiscoveringPeerId(peer.id);
    try {
      // Use edge function to discover (avoids CORS issues with direct browser fetch)
      const { data, error } = await supabase.functions.invoke('a2a-discover', {
        body: { peer_id: peer.id, action: 'discover' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const card = data?.agent_card;
      toast({
        title: 'Skills discovered',
        description: `Found ${card?.skills?.length || 0} skills from ${card?.name || peer.name}`,
      });
      queryClient.invalidateQueries({ queryKey: ['a2a-peers'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast({ title: 'Discovery failed', description: msg, variant: 'destructive' });
    } finally {
      setDiscoveringPeerId(null);
    }
  };

  const handleRunAudit = async (peer: { id: string; name: string; url: string }) => {
    if (!peer.url) return;
    setAuditingPeerId(peer.id);
    setAuditResult(null);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      toast({ title: 'Audit started', description: `Asking ${peer.name} to audit your site...` });

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/a2a-discover`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            peer_id: peer.id,
            action: 'audit',
            site_url: window.location.origin,
          }),
        }
      );
      const data = await res.json();
      
      // Extract readable text from the result
      let auditText = '';
      const taskResult = data.result?.result;
      if (taskResult?.artifacts?.length) {
        for (const artifact of taskResult.artifacts) {
          for (const part of artifact.parts || []) {
            if (part.kind === 'text' || part.type === 'text') {
              auditText += (part.text || '') + '\n';
            }
          }
        }
      }
      if (!auditText && taskResult?.status?.message?.parts) {
        for (const part of taskResult.status.message.parts) {
          if (part.kind === 'text' || part.type === 'text') {
            auditText += (part.text || '') + '\n';
          }
        }
      }

      if (data.success) {
        setAuditResult({ peerId: peer.id, success: true, text: auditText || 'Audit completed — check objectives for findings.' });
        toast({ title: 'Audit complete', description: 'Findings have been saved as objectives.' });
      } else {
        const errMsg = data.error
          ? (typeof data.error === 'object' ? data.error.message || JSON.stringify(data.error) : String(data.error))
          : 'Audit failed';
        setAuditResult({ peerId: peer.id, success: false, text: errMsg });
        toast({ title: 'Audit failed', description: errMsg, variant: 'destructive' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setAuditResult({ peerId: peer.id, success: false, text: msg });
      toast({ title: 'Audit error', description: msg, variant: 'destructive' });
    } finally {
      setAuditingPeerId(null);
    }
  };

  const handleCreatePeer = async () => {
    if (!newPeerName) return;

    // Auto-generate inbound token if not provided
    let inboundToken = newPeerInboundToken;
    if (!inboundToken) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      inboundToken = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const result = await createPeer.mutateAsync({
      name: newPeerName,
      url: newPeerUrl || undefined,
      outbound_token: newPeerOutboundToken || undefined,
      inbound_token: inboundToken,
      gateway_token: newPeerGatewayToken || undefined,
    });

    if (result) {
      // Show the inbound token so user can share it with the peer
      setGeneratedInboundToken(inboundToken);
      if (!newPeerOutboundToken && newPeerUrl) {
        setShowToken(result.outbound_token);
      }
      setDialogOpen(false);
      setNewPeerName('');
      setNewPeerUrl('');
      setNewPeerOutboundToken('');
      setNewPeerInboundToken('');
    }
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
    toast({ title: 'Copied', description: 'Token copied to clipboard' });
  };

  const handleToggleStatus = async (peerId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    await updatePeer.mutateAsync({ id: peerId, status: newStatus });
  };

  const handleRevoke = async (peerId: string) => {
    await updatePeer.mutateAsync({ id: peerId, status: 'revoked' });
  };

  const handleRegenerate = async (peerId: string) => {
    const rawToken = await regenerateToken.mutateAsync(peerId);
    if (rawToken) {
      setShowToken(rawToken);
    }
  };

  const openEditDialog = (peer: any) => {
    setEditingPeer(peer);
    setEditName(peer.name);
    setEditUrl(peer.url || '');
    setEditOutboundToken('');
  };

  const handleSaveEdit = async () => {
    if (!editingPeer) return;
    const updates: Record<string, string> = { id: (editingPeer as any).id };
    if (editName !== (editingPeer as any).name) updates.name = editName;
    if (editUrl !== ((editingPeer as any).url || '')) updates.url = editUrl;
    await updatePeer.mutateAsync(updates as any);

    if (editOutboundToken) {
      // Update outbound token separately via the raw supabase call
      const { supabase } = await import('@/integrations/supabase/client');
      await (supabase.from('a2a_peers') as any)
        .update({ outbound_token: editOutboundToken })
        .eq('id', (editingPeer as any).id);
    }

    setEditingPeer(null);
    toast({ title: 'Peer updated', description: `${editName} has been updated.` });
  };

  const activePeers = peers?.filter(p => p.status !== 'revoked') || [];
  const totalRequests = peers?.reduce((sum, p) => sum + (p.request_count || 0), 0) || 0;

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'paused': return 'secondary';
      case 'revoked': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <AdminPageHeader
          title="Federation"
          description="Connect your FlowWink instance with other agents via A2A protocol"
        />

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activePeers.length}</p>
                  <p className="text-sm text-muted-foreground">connected peers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <ArrowDownLeft className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalRequests}</p>
                  <p className="text-sm text-muted-foreground">total requests</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <ArrowUpRight className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {activity?.filter(a => a.status === 'success').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">successful today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inbound token reveal dialog — post-creation wizard */}
        <Dialog open={!!generatedInboundToken} onOpenChange={() => setGeneratedInboundToken(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-500" />
                Peer Created — Share These Details
              </DialogTitle>
              <DialogDescription>
                Give the peer these two pieces of information so they can connect to you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</span>
                  A2A Endpoint
                </Label>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-xs break-all">
                  <span className="flex-1">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/a2a-ingest</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => handleCopyToken(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/a2a-ingest`)}
                  >
                    {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">2</span>
                  Bearer Token <span className="text-destructive text-[10px]">(shown once)</span>
                </Label>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-xs break-all">
                  <span className="flex-1">{generatedInboundToken}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => generatedInboundToken && handleCopyToken(generatedInboundToken)}
                  >
                    {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-muted/30 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">The peer should use:</p>
                <code className="block bg-background rounded px-2 py-1.5 text-[11px]">
                  Authorization: Bearer &lt;token&gt;
                </code>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setGeneratedInboundToken(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Outbound token reveal dialog */}
        <Dialog open={!!showToken} onOpenChange={() => setShowToken(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Outbound Token Generated</DialogTitle>
              <DialogDescription>
                This token is used when your instance calls the peer's API.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm break-all">
              <span className="flex-1">{showToken}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => showToken && handleCopyToken(showToken)}
              >
                {copiedToken ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowToken(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Edit Peer Dialog */}
        <Dialog open={!!editingPeer} onOpenChange={(open) => !open && setEditingPeer(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Peer</DialogTitle>
              <DialogDescription>
                Update the connection details for {editName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  placeholder="https://peer.example.com"
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The peer's A2A endpoint or Agent Card URL.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Outbound Token (leave empty to keep current)</Label>
                <Input
                  placeholder="Paste new token to update"
                  value={editOutboundToken}
                  onChange={e => setEditOutboundToken(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Token FlowPilot sends when calling this peer. Only updates if you enter a new value.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPeer(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={!editName || updatePeer.isPending}>
                {updatePeer.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Peer */}
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Connect Peer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect New Peer</DialogTitle>
                <DialogDescription>
                  Register an A2A-compatible agent. We'll auto-detect their capabilities.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5">
                {/* Step 1: URL */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
                    <Label className="font-medium">Peer URL</Label>
                  </div>
                  <div className="relative">
                    <Input
                      placeholder="https://peer.example.com"
                      value={newPeerUrl}
                      onChange={e => handleUrlChange(e.target.value)}
                    />
                    {probeLoading && (
                      <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave empty for inbound-only peers that only call your endpoint.
                  </p>
                  {/* Probe result */}
                  {probeResult && (
                    <div className={`rounded-lg border p-3 text-sm ${probeResult.success ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
                      {probeResult.success ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                            <Check className="h-4 w-4" />
                            <span className="font-medium">Agent found: {probeResult.agent_card?.name}</span>
                          </div>
                          {probeResult.agent_card?.description && (
                            <p className="text-xs text-muted-foreground">{probeResult.agent_card.description}</p>
                          )}
                          {probeResult.agent_card?.skills?.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {probeResult.agent_card.skills.slice(0, 8).map((s: any) => (
                                <Badge key={s.id} variant="secondary" className="text-[10px]">
                                  {s.name || s.id}
                                </Badge>
                              ))}
                              {probeResult.agent_card.skills.length > 8 && (
                                <Badge variant="outline" className="text-[10px]">
                                  +{probeResult.agent_card.skills.length - 8} more
                                </Badge>
                              )}
                            </div>
                          )}
                          {probeResult.found_at && (
                            <p className="text-[10px] text-muted-foreground font-mono">Card at: {probeResult.found_at}</p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                          <AlertCircle className="h-4 w-4" />
                          <span>No agent card found — you can still add manually</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Step 2: Name */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
                    <Label className="font-medium">Peer Name</Label>
                  </div>
                  <Input
                    placeholder="e.g. OpenClaw"
                    value={newPeerName}
                    onChange={e => setNewPeerName(e.target.value)}
                  />
                </div>

                {/* Step 3: Tokens */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
                    <Label className="font-medium">Authentication</Label>
                  </div>

                  <div className="rounded-lg border border-border/50 p-3 space-y-3 bg-muted/30">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5">
                        <ArrowDownLeft className="h-3 w-3 text-blue-500" />
                        Inbound Token <span className="text-muted-foreground">(they → you)</span>
                      </Label>
                      <Input
                        placeholder="Auto-generated if empty"
                        value={newPeerInboundToken}
                        onChange={e => setNewPeerInboundToken(e.target.value)}
                        className="text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        You'll share this token with the peer after creation.
                      </p>
                    </div>

                    {newPeerUrl && (
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          <ArrowUpRight className="h-3 w-3 text-green-500" />
                          Outbound Token <span className="text-muted-foreground">(you → them)</span>
                        </Label>
                        <Input
                          placeholder="Paste the token they gave you"
                          value={newPeerOutboundToken}
                          onChange={e => setNewPeerOutboundToken(e.target.value)}
                          className="text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          The token you received from the peer for calling their API.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); setProbeResult(null); }}>Cancel</Button>
                <Button onClick={handleCreatePeer} disabled={!newPeerName || createPeer.isPending}>
                  {createPeer.isPending ? 'Creating...' : 'Create Peer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Peers List */}
        {peersLoading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : peers?.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Globe className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No peers connected yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Connect your first A2A peer to start federating
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {peers?.map(peer => (
              <Card key={peer.id} className={peer.status === 'revoked' ? 'opacity-50' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {((peer.capabilities as any)?.agent_name) || peer.name}
                        </CardTitle>
                        <CardDescription className="font-mono text-xs">{peer.url}</CardDescription>
                        {(peer.capabilities as any)?.agent_description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(peer.capabilities as any).agent_description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(peer.capabilities as any)?.protocol_version && (
                        <Badge variant="outline" className="text-[10px]">
                          A2A v{(peer.capabilities as any).protocol_version}
                        </Badge>
                      )}
                      <Badge variant={statusColor(peer.status)}>{peer.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Discovered Skills */}
                  {(() => {
                    const skills = (peer.capabilities as any)?.skills;
                    if (!skills?.length) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {skills.map((skill: any) => (
                          <Badge key={skill.id} variant="secondary" className="text-[11px] font-normal gap-1">
                            <Cpu className="h-3 w-3" />
                            {skill.name || skill.id}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span>{peer.request_count} requests</span>
                      {peer.last_seen_at && (
                        <span>Last seen {formatDistanceToNow(new Date(peer.last_seen_at), { addSuffix: true })}</span>
                      )}
                      {(peer.capabilities as any)?.discovered_at && (
                        <span className="text-xs">Skills discovered {formatDistanceToNow(new Date((peer.capabilities as any).discovered_at), { addSuffix: true })}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {peer.status !== 'revoked' && (
                         <>
                          {peer.url && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDiscover(peer)}
                                disabled={discoveringPeerId === peer.id}
                              >
                                {discoveringPeerId === peer.id ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Search className="h-3 w-3 mr-1" />
                                )}
                                Discover
                              </Button>
                              {(peer.capabilities as any)?.skills?.some((s: any) => s.id === 'openclaw_audit') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRunAudit(peer)}
                                  disabled={auditingPeerId === peer.id}
                                  className="border-primary/30 text-primary hover:bg-primary/5"
                                >
                                  {auditingPeerId === peer.id ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Shield className="h-3 w-3 mr-1" />
                                  )}
                                  Audit
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTestConnection(peer)}
                                disabled={testingPeerId === peer.id}
                              >
                                {testingPeerId === peer.id ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Zap className="h-3 w-3 mr-1" />
                                )}
                                Test
                              </Button>
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(peer)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRegenerate(peer.id)}
                            disabled={regenerateToken.isPending}
                            title="Generate a new inbound token for this peer to authenticate with"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            New Inbound Token
                          </Button>
                          <Switch
                            checked={peer.status === 'active'}
                            onCheckedChange={() => handleToggleStatus(peer.id, peer.status)}
                          />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive">
                                Revoke
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke peer?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently disable the connection with {peer.name}. They will no longer be able to send requests.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleRevoke(peer.id)}>
                                  Revoke
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      )}
                    </div>
                  </div>
                  {testResult && testResult.peerId === peer.id && (
                    <div className={`p-2 rounded text-xs font-mono ${
                      testResult.success 
                        ? 'bg-green-500/10 text-green-600 border border-green-500/20' 
                        : 'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      {testResult.message}
                    </div>
                  )}
                  {auditResult && auditResult.peerId === peer.id && (
                    <div className={`p-3 rounded text-xs ${
                      auditResult.success 
                        ? 'bg-green-500/10 text-foreground border border-green-500/20' 
                        : 'bg-destructive/10 text-destructive border border-destructive/20'
                    }`}>
                      <p className="font-medium mb-1">{auditResult.success ? '✓ Audit Complete' : '✗ Audit Failed'}</p>
                      <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground max-h-60 overflow-auto">
                        {auditResult.text}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Activity Log */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
            Recent Activity
          </h2>
          {activityLoading ? (
            <Skeleton className="h-48" />
          ) : !activity?.length ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                No federation activity yet
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {activity.map(item => {
                    const peer = peers?.find(p => p.id === item.peer_id);
                    return (
                      <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="shrink-0">
                          {item.direction === 'inbound' ? (
                            <ArrowDownLeft className="h-4 w-4 text-primary" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-accent-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{peer?.name || 'Unknown'}</span>
                            <span className="text-muted-foreground text-sm">→</span>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.skill_name || 'unknown'}</code>
                          </div>
                          {item.error_message && (
                            <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              {item.error_message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant={item.status === 'success' ? 'default' : item.status === 'error' ? 'destructive' : 'secondary'}>
                            {item.status}
                          </Badge>
                          {item.duration_ms && (
                            <span className="text-xs text-muted-foreground">{item.duration_ms}ms</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
