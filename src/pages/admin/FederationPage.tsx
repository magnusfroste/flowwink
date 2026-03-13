import { useState } from 'react';
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
import { Globe, Plus, RefreshCw, Copy, Check, ArrowDownLeft, ArrowUpRight, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useA2APeers, useCreateA2APeer, useUpdateA2APeer, useRegenerateToken, useA2AActivity } from '@/hooks/useA2A';
import { formatDistanceToNow } from 'date-fns';

export default function FederationPage() {
  const { toast } = useToast();
  const { data: peers, isLoading: peersLoading } = useA2APeers();
  const { data: activity, isLoading: activityLoading } = useA2AActivity();
  const createPeer = useCreateA2APeer();
  const updatePeer = useUpdateA2APeer();
  const regenerateToken = useRegenerateToken();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newPeerName, setNewPeerName] = useState('');
  const [newPeerUrl, setNewPeerUrl] = useState('');
  const [newPeerToken, setNewPeerToken] = useState('');
  const [showToken, setShowToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleCreatePeer = async () => {
    if (!newPeerName || !newPeerUrl) return;

    const result = await createPeer.mutateAsync({
      name: newPeerName,
      url: newPeerUrl,
      inbound_token_hash: newPeerToken || undefined,
    });

    if (result) {
      setShowToken(result.outbound_token);
      setDialogOpen(false);
      setNewPeerName('');
      setNewPeerUrl('');
      setNewPeerToken('');
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
    const result = await regenerateToken.mutateAsync(peerId);
    if (result) {
      setShowToken(result.outbound_token);
    }
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

        {/* Token reveal dialog */}
        <Dialog open={!!showToken} onOpenChange={() => setShowToken(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Outbound Token Generated</DialogTitle>
              <DialogDescription>
                Share this token with the peer so they can authenticate requests from your instance.
                This is shown only once.
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

        {/* Add Peer */}
        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Connect Peer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Connect New Peer</DialogTitle>
                <DialogDescription>
                  Add another FlowWink instance or A2A-compatible agent to your federation network.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. SoundSpace"
                    value={newPeerName}
                    onChange={e => setNewPeerName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    placeholder="https://soundspace.app"
                    value={newPeerUrl}
                    onChange={e => setNewPeerUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Their Token (optional)</Label>
                  <Input
                    placeholder="Paste the token they gave you"
                    value={newPeerToken}
                    onChange={e => setNewPeerToken(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    If the peer has already generated a token for you, paste it here.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreatePeer} disabled={!newPeerName || !newPeerUrl || createPeer.isPending}>
                  {createPeer.isPending ? 'Creating...' : 'Create'}
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
                        <CardTitle className="text-base">{peer.name}</CardTitle>
                        <CardDescription className="font-mono text-xs">{peer.url}</CardDescription>
                      </div>
                    </div>
                    <Badge variant={statusColor(peer.status)}>{peer.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <span>{peer.request_count} requests</span>
                      {peer.last_seen_at && (
                        <span>Last seen {formatDistanceToNow(new Date(peer.last_seen_at), { addSuffix: true })}</span>
                      )}
                      <span>Created {formatDistanceToNow(new Date(peer.created_at), { addSuffix: true })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {peer.status !== 'revoked' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRegenerate(peer.id)}
                            disabled={regenerateToken.isPending}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Regenerate
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
                            <ArrowDownLeft className="h-4 w-4 text-blue-500" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
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
