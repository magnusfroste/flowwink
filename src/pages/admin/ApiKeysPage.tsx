import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/hooks/useApiKeys';
import { Plus, Copy, Key, Trash2, Shield, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export default function ApiKeysPage() {
  const { data: keys = [], isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    const raw = await createKey.mutateAsync({ name: newKeyName.trim() });
    setCreatedKey(raw);
    setNewKeyName('');
  };

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      toast.success('API key copied to clipboard');
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setCreatedKey(null);
    setNewKeyName('');
  };

  const mcpUrl = `${window.location.origin.replace('://', '://').split('/')[0]}//${import.meta.env.VITE_SUPABASE_PROJECT_ID ? `${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co` : 'your-project.supabase.co'}/functions/v1/mcp-server`;

  return <ApiKeysContent keys={keys} isLoading={isLoading} mcpUrl={mcpUrl} dialogOpen={dialogOpen} setDialogOpen={setDialogOpen} handleCloseDialog={handleCloseDialog} newKeyName={newKeyName} setNewKeyName={setNewKeyName} handleCreate={handleCreate} createKey={createKey} createdKey={createdKey} handleCopy={handleCopy} revokeKey={revokeKey} />;
}

export function ApiKeysContent({ keys, isLoading, mcpUrl, dialogOpen, setDialogOpen, handleCloseDialog, newKeyName, setNewKeyName, handleCreate, createKey, createdKey, handleCopy, revokeKey }: any) {
  return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage API keys for MCP server access. External AI clients use these to connect.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) handleCloseDialog(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              {!createdKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                      This key will be used to authenticate MCP client connections.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-3">
                    <div>
                      <Label htmlFor="key-name">Name</Label>
                      <Input
                        id="key-name"
                        placeholder="e.g. Cursor IDE, Claude Desktop"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreate} disabled={!newKeyName.trim() || createKey.isPending}>
                      {createKey.isPending ? 'Creating…' : 'Create'}
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>API Key Created</DialogTitle>
                    <DialogDescription>
                      Copy this key now — it won't be shown again.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-3">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted p-3 rounded-md font-mono break-all select-all">
                        {createdKey}
                      </code>
                      <Button variant="outline" size="icon" onClick={handleCopy}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseDialog}>Done</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* MCP Connection Info */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-4 w-4 text-primary" />
              MCP Server Endpoint
            </div>
            <code className="text-xs bg-background/80 p-2 rounded block font-mono break-all">
              {mcpUrl}
            </code>
            <p className="text-xs text-muted-foreground">
              Use this URL in Cursor, Claude Desktop, or any MCP-compatible client with a Bearer token from the keys below.
            </p>
          </CardContent>
        </Card>

        {/* Keys List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Active Keys</CardTitle>
            <CardDescription>
              {keys.length} key{keys.length !== 1 ? 's' : ''} created
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : keys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No API keys yet. Create one to connect external AI clients.</p>
              </div>
            ) : (
              <div className="divide-y">
                {keys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{key.name}</span>
                        <code className="text-xs text-muted-foreground font-mono">{key.key_prefix}…</code>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Created {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}</span>
                        {key.last_used_at && (
                          <span>Last used {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}</span>
                        )}
                        {key.expires_at && (
                          <Badge variant="outline" className="text-[10px]">
                            Expires {formatDistanceToNow(new Date(key.expires_at), { addSuffix: true })}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will immediately disable access for any client using the key "{key.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeKey.mutate(key.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Revoke
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
