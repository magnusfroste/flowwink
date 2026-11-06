import { useState } from 'react';
import { useMcpAddress } from '@/hooks/useMcpAddress';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useApiKeys, useCreateApiKey, useRevokeApiKey, useDeleteApiKey, type ApiKey } from '@/hooks/useApiKeys';
import { keyState, type KeyState } from '@/lib/key-state';
import { Plus, Copy, Key, Trash2, Shield, Ban, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export function ApiKeysContent() {
  const { data: keys = [], isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();
  const deleteKey = useDeleteApiKey();
  // One state per key, derived once and read by every surface that lists keys.
  const activeKeys = keys.filter((k) => keyState(k) === 'active');
  const inactiveKeys = keys.filter((k) => keyState(k) !== 'active');
  const [showInactive, setShowInactive] = useState(false);

  const [newKeyName, setNewKeyName] = useState('');
  // Read-only: reads run, writes with a dry_run parameter run as dry runs,
  // every other write is refused (READ_ONLY_KEY) — the key to hand an agent
  // you are still evaluating.
  const [readOnly, setReadOnly] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    const raw = await createKey.mutateAsync({ name: newKeyName.trim(), scopes: readOnly ? ['read_only'] : undefined });
    setCreatedKey(raw);
    setNewKeyName('');
    setReadOnly(false);
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

  // The site's own /mcp when this deployment serves it (the convention every
  // other integration uses), the functions URL otherwise — and always as the
  // fallback for jobs longer than the proxy's window.
  const mcp = useMcpAddress();
  const mcpUrl = mcp.url;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">MCP Keys</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every key the gateway accepts, whoever made it. A key runs as its owner, within the
            owner's roles; a read-only key refuses every write.
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
                  <label htmlFor="key-read-only" className="flex items-start gap-3 rounded-md border p-3 text-sm cursor-pointer">
                    <input
                      id="key-read-only"
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={readOnly}
                      onChange={(e) => setReadOnly(e.target.checked)}
                    />
                    <span>
                      <span className="font-medium">Read-only key</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        Reads real data; a write that supports dry runs runs as one; every other write is refused.
                        For an agent you are still evaluating — nothing it does lands in the books.
                      </span>
                    </span>
                  </label>
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
                    Key created successfully. You can always view it from the keys list.
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
            {mcp.via === 'site' && (
              <> The same gateway also answers at <code className="font-mono">{mcp.functions}</code>, with no 60-second proxy window — use that for jobs that run long.</>
            )}
            {mcp.via === 'functions' && mcp.site && !mcp.probing && (
              <> On a Vercel deployment the gateway is also <code className="font-mono">{mcp.site}</code>; this deployment did not answer there.</>
            )}
          </p>
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              How to discover available tools
            </summary>
            <pre className="text-[11px] bg-background/80 p-3 rounded mt-1.5 font-mono overflow-x-auto whitespace-pre text-muted-foreground select-all">
{`curl -X POST ${mcpUrl} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Authorization: Bearer fwk_your_key_here" \\
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`}
            </pre>
          </details>
        </CardContent>
      </Card>

      {/* Keys List — one state per key (src/lib/key-state.ts), the same the
          Agents page and the gateway read. Active keys first; revoked and
          expired ones under their own heading, where the row can be deleted. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Keys</CardTitle>
          <CardDescription>
            {activeKeys.length} active · {inactiveKeys.length} revoked or expired
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
            <div className="space-y-6">
              {activeKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active key — every key below is revoked or expired.</p>
              ) : (
                <div className="divide-y">
                  {activeKeys.map((key) => (
                    <KeyRow key={key.id} apiKey={key} state="active" onRevoke={() => revokeKey.mutate(key.id)} onDelete={() => deleteKey.mutate(key.id)} />
                  ))}
                </div>
              )}
              {inactiveKeys.length > 0 && (
                <Collapsible open={showInactive} onOpenChange={setShowInactive}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground">
                      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showInactive ? 'rotate-90' : ''}`} />
                      Revoked or expired ({inactiveKeys.length})
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Out of service — the gateway refuses them. Kept as history of who was connected; delete a row when that history is no longer needed.
                    </p>
                    <div className="divide-y opacity-70">
                      {inactiveKeys.map((key) => (
                        <KeyRow key={key.id} apiKey={key} state={keyState(key)} onRevoke={() => revokeKey.mutate(key.id)} onDelete={() => deleteKey.mutate(key.id)} />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * One key as a row. An active key offers Revoke (out of service, row kept —
 * the agents holding it are revoked with it); a revoked or expired key offers
 * Delete (row gone). The full key is shown ONCE at creation and never stored —
 * the list only ever knows the prefix.
 */
function KeyRow({ apiKey: key, state, onRevoke, onDelete }: { apiKey: ApiKey; state: KeyState; onRevoke: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between py-3 gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{key.name}</span>
          {state === 'revoked' && key.revoked_at && (
            <Badge variant="destructive" className="text-[10px]">Revoked {formatDistanceToNow(new Date(key.revoked_at), { addSuffix: true })}</Badge>
          )}
          {state === 'expired' && key.expires_at && (
            <Badge variant="outline" className="text-[10px]">Expired {formatDistanceToNow(new Date(key.expires_at), { addSuffix: true })}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded break-all select-all">
            {key.key_prefix}…
          </code>
          <span className="text-[11px] text-muted-foreground shrink-0" title="The full key is shown only once, at creation. Regenerate to rotate.">
            shown once at creation
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>Created {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}</span>
          {key.last_used_at && (
            <span>Last used {formatDistanceToNow(new Date(key.last_used_at), { addSuffix: true })}</span>
          )}
          {state === 'active' && key.expires_at && (
            <Badge variant="outline" className="text-[10px]">
              Expires {formatDistanceToNow(new Date(key.expires_at), { addSuffix: true })}
            </Badge>
          )}
          {key.scopes?.includes('read_only') && (
            <Badge variant="outline" className="text-[10px]">Read-only · writes run as dry runs or are refused</Badge>
          )}
          {key.scopes && key.scopes.length > 0 && key.scopes.filter((scope) => scope !== 'read_only').map(scope => (
            <Badge key={scope} variant="secondary" className="text-[10px] font-mono">{scope}</Badge>
          ))}
        </div>
      </div>
      {state === 'active' ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive shrink-0">
              <Ban className="h-3.5 w-3.5" />
              Revoke
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
              <AlertDialogDescription>
                This immediately disables access for any client using the key "{key.name}", and revokes every agent connected with it. The key stays listed under "Revoked or expired" until you delete it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Revoke Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground shrink-0">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete API Key</AlertDialogTitle>
              <AlertDialogDescription>
                Removes "{key.name}" from this list for good. It is already out of service; an agent that held it keeps its row and history. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default function ApiKeysPage() {
  return (
    <AdminLayout>
      <ApiKeysContent />
    </AdminLayout>
  );
}
