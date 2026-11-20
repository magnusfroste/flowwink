import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cable, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { callSkill } from '@/lib/call-skill';
import { logger } from '@/lib/logger';
import { slugify } from '@/lib/slugify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ToolMode = 'read' | 'write';

interface McpSource {
  id: string;
  slug: string;
  name: string;
  url: string;
  enabled: boolean;
  read_only: boolean;
  has_key: boolean;
  server_name: string | null;
  tools: Array<{ name: string; mode: ToolMode }>;
  last_checked_at: string | null;
  last_error: string | null;
}

interface OfferedTool {
  name: string;
  description: string;
  says_read_only: boolean;
  can_be_a_read: boolean;
}

// The table is newer than the generated types; the page reads it as itself.
type Res = Promise<{ data: unknown; error: { message: string } | null }>;
interface LooseTable {
  select: (columns: string) => { order: (column: string) => Res };
  insert: (row: Record<string, unknown>) => { select: (columns: string) => { single: () => Res } };
  update: (patch: Record<string, unknown>) => { eq: (column: string, value: string) => Res };
  delete: () => { eq: (column: string, value: string) => Res };
}
const sources = () => (supabase as unknown as { from: (table: string) => LooseTable }).from('mcp_sources');
const setKey = (sourceId: string, key: string) =>
  (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: { success?: boolean; error?: string } | null; error: { message: string } | null }> })
    .rpc('set_mcp_source_key', { p_source_id: sourceId, p_key: key });

/** The handle goes into skill names: letters and digits only, starting with a letter. */
const slugFrom = (name: string) => slugify(name, { separator: '_' }).split('_').join('').replace(/^[0-9]+/, '').slice(0, 16);

/**
 * Integrations → Connected MCP servers (#862). An external system — the books
 * in another product, an ERP — reached through its own MCP server. The page
 * holds the address, sends the key to the vault, and lets an admin choose
 * which of the server's tools the agent may use. Nothing here knows which
 * system it is.
 */
export function McpSourcesCard() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [choosing, setChoosing] = useState<McpSource | null>(null);
  const [removing, setRemoving] = useState<McpSource | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['mcp-sources'],
    queryFn: async () => {
      const { data, error } = await sources().select('id, slug, name, url, enabled, read_only, has_key, server_name, tools, last_checked_at, last_error').order('name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as McpSource[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['mcp-sources'] });

  const toggle = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<McpSource, 'enabled' | 'read_only'>> }) => {
      const { error } = await sources().update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sources().delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success('Disconnected — its key and its skills are gone'); setRemoving(null); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card data-testid="mcp-sources-card">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg"><Cable className="h-5 w-5" /> Connected MCP servers</CardTitle>
            <CardDescription className="mt-1">
              Another system — the books in a bookkeeping product, an ERP — reached through its own MCP server.
              You choose which of its tools the agent may use; each becomes a skill. The key is kept in the vault and is never shown again.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1" /> Connect a server</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground">No external server is connected. The agent answers from what FlowWink keeps.</p>
        )}
        {list.map((s) => (
          <div key={s.id} className="rounded-lg border p-4 space-y-3" data-testid="mcp-source" data-slug={s.slug}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="outline" className="font-mono text-xs">{s.slug}</Badge>
                  <Badge variant={s.read_only ? 'secondary' : 'destructive'}>{s.read_only ? 'Read only' : 'May write'}</Badge>
                  {!s.has_key && <Badge variant="outline">No key</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-1">{s.url}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`mcp-on-${s.id}`}
                    checked={s.enabled}
                    onCheckedChange={(enabled) => toggle.mutate({ id: s.id, patch: { enabled } })}
                  />
                  <Label htmlFor={`mcp-on-${s.id}`} className="text-xs">{s.enabled ? 'On' : 'Off'}</Label>
                </div>
                <Button variant="outline" size="sm" onClick={() => setChoosing(s)}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Choose tools
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Disconnect ${s.name}`} onClick={() => setRemoving(s)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm">
              {s.tools.length === 0
                ? <span className="text-muted-foreground">No tool is chosen — the agent has nothing from this server yet.</span>
                : <>The agent may use <strong>{s.tools.length}</strong> tool{s.tools.length === 1 ? '' : 's'}: <span className="text-muted-foreground">{s.tools.map((t) => t.name).join(', ')}</span></>}
            </p>
            {s.last_error && <p className="text-sm text-destructive">Last look failed: {s.last_error}</p>}
          </div>
        ))}
      </CardContent>

      {adding && <ConnectDialog onClose={() => setAdding(false)} onConnected={(s) => { setAdding(false); refresh(); setChoosing(s); }} taken={list.map((s) => s.slug)} />}
      {choosing && <ChooseToolsDialog source={choosing} onClose={() => { setChoosing(null); refresh(); }} />}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its key is deleted from the vault and the skills its tools became are removed. Nothing in the other system changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove.mutate(removing.id)}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ConnectDialog({ onClose, onConnected, taken }: { onClose: () => void; onConnected: (source: McpSource) => void; taken: string[] }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [url, setUrl] = useState('');
  const [key, setKeyValue] = useState('');
  const handle = slug || slugFrom(name);
  const problem = !name.trim() ? 'Give it a name'
    : !/^[a-z][a-z0-9]{1,15}$/.test(handle) ? 'The short handle is 2–16 lowercase letters and digits, starting with a letter'
    : taken.includes(handle) ? 'That handle is already used'
    : !/^https:\/\//i.test(url.trim()) ? 'The address starts with https://'
    : null;

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await sources()
        .insert({ slug: handle, name: name.trim(), url: url.trim() })
        .select('id, slug, name, url, enabled, read_only, has_key, server_name, tools, last_checked_at, last_error')
        .single();
      if (error) throw new Error(error.message);
      const source = data as unknown as McpSource;
      if (key.trim()) {
        // Straight to the vault: a key never rides in a skill's arguments, which are journalled.
        const res = await setKey(source.id, key.trim());
        if (res.error) throw new Error(res.error.message);
        if (res.data && res.data.success === false) throw new Error(res.data.error ?? 'The key could not be saved');
        source.has_key = true;
      }
      return source;
    },
    onSuccess: (source) => { toast.success(`${source.name} is connected — now choose its tools`); onConnected(source); },
    onError: (e: Error) => { logger.error('[mcp-sources] connect failed', e); toast.error(e.message); },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect an MCP server</DialogTitle>
          <DialogDescription>
            The address of the server's MCP endpoint and the key it gave you. Ask for a read-only key where the other system offers one.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mcp-name">Name</Label>
            <Input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="The bookkeeping system" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-slug">Short handle</Label>
            <Input id="mcp-slug" value={handle} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="books" className="font-mono" />
            <p className="text-xs text-muted-foreground">Goes into the skill names: query_{handle || 'books'}__…</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-url">Address</Label>
            <Input id="mcp-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://bridge.example.com/mcp" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mcp-key">Key</Label>
            <Input id="mcp-key" type="password" autoComplete="off" value={key} onChange={(e) => setKeyValue(e.target.value)} placeholder="Sent as Authorization: Bearer …" />
            <p className="text-xs text-muted-foreground">Kept in the vault. It cannot be read back here — to change it, disconnect and connect again.</p>
          </div>
          {problem && (name || url) && <p className="text-sm text-muted-foreground">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => connect.mutate()} disabled={!!problem || connect.isPending}>
            {connect.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChooseToolsDialog({ source, onClose }: { source: McpSource; onClose: () => void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, ToolMode>>(() => Object.fromEntries(source.tools.map((t) => [t.name, t.mode])));
  const [writable, setWritable] = useState(!source.read_only);

  const offered = useQuery({
    queryKey: ['mcp-source-tools', source.id],
    queryFn: () => callSkill<{ offered: OfferedTool[]; server_name: string | null }>('manage_mcp_sources', { action: 'check', source_id: source.id }),
    retry: false,
    staleTime: 0,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (writable === source.read_only) {
        const { error } = await sources().update({ read_only: !writable }).eq('id', source.id);
        if (error) throw new Error(error.message);
      }
      return callSkill<{ skills: Array<{ skill: string }>; refused: Array<{ tool: string; reason: string }> }>('manage_mcp_sources', {
        action: 'set_tools',
        source_id: source.id,
        tools: Object.entries(picked).map(([name, mode]) => ({ name, mode })),
      });
    },
    onSuccess: (res) => {
      if (res.refused.length) toast.warning(`Not taken: ${res.refused.map((r) => `${r.tool} (${r.reason})`).join('; ')}`);
      toast.success(`${res.skills.length} tool${res.skills.length === 1 ? '' : 's'} the agent may use`);
      qc.invalidateQueries({ queryKey: ['mcp-sources'] });
      onClose();
    },
    onError: (e: Error) => { logger.error('[mcp-sources] set_tools failed', e); toast.error(e.message); },
  });

  const tools = offered.data?.offered ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tools of {source.name}</DialogTitle>
          <DialogDescription>
            What the server offers right now. Tick the tools the agent may use. A tool that only reads runs by itself; a tool that writes waits for a person to approve every call.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label htmlFor="mcp-writable" className="text-sm">Let this server be written to</Label>
            <p className="text-xs text-muted-foreground">Off: only tools chosen as reads can be used. Leave it off unless the agent is meant to change things there.</p>
          </div>
          <Switch id="mcp-writable" checked={writable} onCheckedChange={setWritable} />
        </div>

        {offered.isLoading && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Asking the server…</p>}
        {offered.isError && <p className="text-sm text-destructive">The server could not be asked: {(offered.error as Error).message}</p>}

        {tools.length > 0 && (
          <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1" data-testid="mcp-offered-tools">
            {tools.map((tool) => {
              const mode = picked[tool.name];
              const asRead = mode === 'read';
              return (
                <div key={tool.name} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`mcp-tool-${tool.name}`}
                      checked={!!mode}
                      onCheckedChange={(on) => setPicked((prev) => {
                        const next = { ...prev };
                        if (on) next[tool.name] = tool.says_read_only ? 'read' : 'write';
                        else delete next[tool.name];
                        return next;
                      })}
                    />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`mcp-tool-${tool.name}`} className="font-mono text-sm">{tool.name}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{tool.description || 'The server gives no description.'}</p>
                    </div>
                    <Badge variant={tool.says_read_only ? 'secondary' : 'outline'} className="shrink-0">
                      {tool.says_read_only ? 'Says it only reads' : 'May write'}
                    </Badge>
                  </div>
                  {mode && !tool.says_read_only && tool.can_be_a_read && (
                    <div className="flex items-start gap-2 pl-7">
                      <Checkbox
                        id={`mcp-read-${tool.name}`}
                        checked={asRead}
                        onCheckedChange={(on) => setPicked((prev) => ({ ...prev, [tool.name]: on ? 'read' : 'write' }))}
                      />
                      <Label htmlFor={`mcp-read-${tool.name}`} className="text-xs font-normal">
                        I know this tool only reads. The server does not say so — ticked, the agent runs it without asking anyone.
                      </Label>
                    </div>
                  )}
                  {mode === 'write' && !writable && (
                    <p className="text-xs text-destructive pl-7">It writes, and this server is read-only: it will not be taken.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={offered.isLoading || offered.isError || save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save the choice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
