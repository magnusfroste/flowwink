import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, Ban } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useConnectedAgents, useOwnerCandidates, useRevokeAgent, useSetAgentOwner, type ConnectedAgent } from '@/hooks/useAgents';
import { agentClient } from '@/lib/agent-clients';
import { idleDays } from '@/lib/agent-idle';

function lastActive(a: ConnectedAgent): string {
  const t = a.last_used_at ?? a.last_seen_at;
  return t ? formatDistanceToNow(new Date(t), { addSuffix: true }) : 'never';
}

function reachLabel(a: ConnectedAgent): string {
  if (a.owner_user_id) return a.toolset_groups.length ? `${a.owner_name ?? 'owner'}'s modules · ${a.toolset_groups.join(', ')}` : `${a.owner_name ?? 'owner'}'s modules`;
  return a.toolset_groups.length ? `${a.toolset_groups.join(', ')} — no owner to hold it to` : 'every enabled module — no owner to hold it to';
}

/**
 * An agent without an owner reaches everything: the gateway has no person to
 * check it against. Give it one here — the key stays, the reach shrinks to the
 * person's. Only shown to readers who can set it (the Agents module).
 */
function OwnerPicker({ agent }: { agent: ConnectedAgent }) {
  const { data: people } = useOwnerCandidates();
  const setOwner = useSetAgentOwner();
  return (
    <Select
      disabled={setOwner.isPending}
      onValueChange={async (ownerUserId) => {
        try {
          const r = await setOwner.mutateAsync({ peerId: agent.id, ownerUserId });
          toast.success(`${agent.name} now acts for ${r.owner_name ?? 'its owner'}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not set the owner');
        }
      }}
    >
      <SelectTrigger className="h-8 w-[12rem] text-xs" aria-label={`Set who ${agent.name} acts for`}>
        <SelectValue placeholder="Set owner…" />
      </SelectTrigger>
      <SelectContent>
        {(people ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.full_name || p.email || p.id.slice(0, 8)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Every connected agent as one row: who it is, who it acts for, what it is for,
 * how far it reaches, when it last did something. `mine` hides the owner column
 * for the portal, where RLS already narrows the list to the viewer's own.
 */
export function ConnectedAgentsTable({ mine = false }: { mine?: boolean }) {
  const { data: agents, isLoading } = useConnectedAgents();
  const revoke = useRevokeAgent();

  const onRevoke = async (a: ConnectedAgent) => {
    if (!confirm(`Revoke ${a.name}? Its key stops working immediately.`)) return;
    try {
      await revoke.mutateAsync(a.id);
      toast.success(`${a.name} revoked`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not revoke');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" /> {mine ? 'My agents' : 'Connected agents'}</CardTitle>
        <CardDescription>
          {mine
            ? 'Agents that act for you. Each has its own key and does only what you can do here.'
            : 'Everyone\'s agents, with the person each one acts for. An agent never reaches further than its owner.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !agents?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">No agent connected yet — connect one in the next tab.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                {!mine && <TableHead>Acts for</TableHead>}
                <TableHead>Mission</TableHead>
                <TableHead>Reach</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((a) => (
                <TableRow key={a.id} className={a.status === 'revoked' ? 'opacity-60' : undefined}>
                  <TableCell>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-muted-foreground">{agentClient(a.client_kind).label}{a.key_prefix ? ` · key ${a.key_prefix}…` : ''}</div>
                  </TableCell>
                  {!mine && (
                    <TableCell>
                      {a.owner_name ?? a.owner_email ?? (
                        <div className="space-y-1">
                          <Badge variant="destructive" className="font-normal">no owner — full reach</Badge>
                          {a.status !== 'revoked' && <OwnerPicker agent={a} />}
                        </div>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-sm">{a.mission_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[16rem]">{reachLabel(a)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{lastActive(a)}{a.request_count ? ` · ${a.request_count} calls` : ''}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={a.status === 'active' ? 'default' : a.status === 'paused' ? 'secondary' : 'destructive'}>{a.status}</Badge>
                      {idleDays(a) !== null && <Badge variant="outline" title={`No call for ${idleDays(a)} days — revoke it if nobody misses it`}>idle {idleDays(a)} d</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {a.status !== 'revoked' && (
                      <Button size="sm" variant="ghost" onClick={() => onRevoke(a)} disabled={revoke.isPending}>
                        <Ban className="h-3.5 w-3.5 mr-1.5" /> Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
