import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Globe, Plus, Trash2, Clock, KeyRound } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useFederationConnections,
  useDeleteFederationConnection,
  useCreateFederationConnection,
  type ConnectionDirection,
  type ConnectionTransport,
} from '@/hooks/useFederationConnections';
import { useA2APeers } from '@/hooks/useA2A';
import { useApiKeys } from '@/hooks/useApiKeys';
import { ConnectionBadge } from './ConnectionBadges';

export function PeerConnectionsTab() {
  const { data: connections, isLoading } = useFederationConnections();
  const { data: peers } = useA2APeers();
  const { data: apiKeys } = useApiKeys();
  const deleteConn = useDeleteFederationConnection();
  const createConn = useCreateFederationConnection();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formPeerId, setFormPeerId] = useState('');
  const [formDirection, setFormDirection] = useState<ConnectionDirection>('inbound');
  const [formTransport, setFormTransport] = useState<ConnectionTransport>('mcp');
  const [formApiKeyId, setFormApiKeyId] = useState<string>('');
  const [formUrl, setFormUrl] = useState('');
  const [formToken, setFormToken] = useState('');

  const reset = () => {
    setFormPeerId('');
    setFormDirection('inbound');
    setFormTransport('mcp');
    setFormApiKeyId('');
    setFormUrl('');
    setFormToken('');
  };

  const handleSubmit = async () => {
    if (!formPeerId) return;
    await createConn.mutateAsync({
      peer_id: formPeerId,
      direction: formDirection,
      transport: formTransport,
      endpoint_url: formDirection !== 'inbound' ? formUrl || null : null,
      outbound_token: formDirection !== 'inbound' ? formToken || null : null,
      api_key_id: formDirection === 'inbound' ? formApiKeyId || null : null,
    });
    setDialogOpen(false);
    reset();
  };

  // Group connections by peer
  const byPeer = new Map<string, typeof connections>();
  for (const c of connections ?? []) {
    const list = byPeer.get(c.peer_id) ?? [];
    list.push(c);
    byPeer.set(c.peer_id, list);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header + Add */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Each row = one directional channel. <strong>↔</strong> two-way A2A,{' '}
            <strong>→</strong> we call them, <strong>←</strong> they call us. A peer can have several.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) reset(); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Connection
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Connection</DialogTitle>
              <DialogDescription>
                Wire a directional channel to an existing peer.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Peer</Label>
                <Select value={formPeerId} onValueChange={setFormPeerId}>
                  <SelectTrigger><SelectValue placeholder="Select peer" /></SelectTrigger>
                  <SelectContent>
                    {peers?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Direction</Label>
                  <Select value={formDirection} onValueChange={(v: ConnectionDirection) => setFormDirection(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bidirectional">↔ Bidirectional</SelectItem>
                      <SelectItem value="outbound">→ Outbound (we call them)</SelectItem>
                      <SelectItem value="inbound">← Inbound (they call us)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Transport</Label>
                  <Select value={formTransport} onValueChange={(v: ConnectionTransport) => setFormTransport(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a2a">A2A (JSON-RPC)</SelectItem>
                      <SelectItem value="openresponses">/v1/responses</SelectItem>
                      <SelectItem value="mcp">MCP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formDirection === 'inbound' ? (
                <div className="space-y-1.5">
                  <Label>API Key (theirs to call us)</Label>
                  <Select value={formApiKeyId} onValueChange={setFormApiKeyId}>
                    <SelectTrigger><SelectValue placeholder="Select API key" /></SelectTrigger>
                    <SelectContent>
                      {apiKeys?.map(k => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.name} ({k.key_prefix}…)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Endpoint URL</Label>
                    <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://peer.example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Outbound Token</Label>
                    <Input value={formToken} onChange={e => setFormToken(e.target.value)} placeholder="bearer token" type="password" />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!formPeerId || createConn.isPending}>
                {createConn.isPending ? 'Adding…' : 'Add'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {byPeer.size === 0 ? (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <Globe className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No connections yet. Add a peer first under <strong>A2A Peers</strong>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...byPeer.entries()].map(([peerId, conns]) => {
            const peer = conns[0].peer;
            return (
              <Card key={peerId}>
                <CardContent className="pt-5 pb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Globe className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{peer.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {conns.length} channel{conns.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <Badge variant={peer.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                      {peer.status}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 pt-1 border-t">
                    {conns.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-3 py-1.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <ConnectionBadge direction={c.direction} transport={c.transport} />
                          <div className="text-xs text-muted-foreground min-w-0 flex items-center gap-3">
                            {c.endpoint_url && (
                              <code className="bg-muted px-1.5 py-0.5 rounded truncate max-w-[280px]">
                                {c.endpoint_url}
                              </code>
                            )}
                            {c.api_key && (
                              <span className="flex items-center gap-1">
                                <KeyRound className="h-3 w-3" />
                                <code className="bg-muted px-1 rounded">{c.api_key.key_prefix}…</code>
                                <span className="text-foreground/70">{c.api_key.name}</span>
                              </span>
                            )}
                            {c.last_activity_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(c.last_activity_at), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive/70 hover:text-destructive"
                          onClick={() => deleteConn.mutate(c.id)}
                          title="Remove connection"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
