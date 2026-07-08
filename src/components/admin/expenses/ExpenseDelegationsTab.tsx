import { useMemo, useState } from 'react';
import {
  useApprovalDelegations,
  useCreateApprovalDelegation,
  useRevokeApprovalDelegation,
  isDelegationActive,
  type ApprovalDelegation,
} from '@/hooks/useApprovalDelegations';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, UserCog, X } from 'lucide-react';
import { format } from 'date-fns';

interface ProfileRow { id: string; email: string | null; full_name: string | null }

function useProfilesForDelegation() {
  return useQuery({
    queryKey: ['profiles', 'delegation-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .order('full_name', { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });
}

function displayUser(profiles: ProfileRow[] | undefined, userId: string): string {
  const p = profiles?.find((x) => x.id === userId);
  if (!p) return userId.slice(0, 8) + '…';
  return p.full_name || p.email || userId.slice(0, 8) + '…';
}

export function ExpenseDelegationsTab() {
  const { data: delegations, isLoading } = useApprovalDelegations();
  const { data: profiles } = useProfilesForDelegation();
  const create = useCreateApprovalDelegation();
  const revoke = useRevokeApprovalDelegation();

  const [open, setOpen] = useState(false);
  const [fromUser, setFromUser] = useState('');
  const [toUser, setToUser] = useState('');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState<string>('');

  const sorted = useMemo(() => {
    if (!delegations) return [];
    return [...delegations].sort((a, b) => {
      const aActive = isDelegationActive(a) ? 0 : 1;
      const bActive = isDelegationActive(b) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return b.starts_at.localeCompare(a.starts_at);
    });
  }, [delegations]);

  function reset() {
    setFromUser('');
    setToUser('');
    setStartsAt(new Date().toISOString().slice(0, 10));
    setEndsAt('');
  }

  async function handleCreate() {
    if (!fromUser || !toUser || fromUser === toUser) return;
    await create.mutateAsync({
      from_user: fromUser,
      to_user: toUser,
      starts_at: new Date(startsAt + 'T00:00:00').toISOString(),
      ends_at: endsAt ? new Date(endsAt + 'T23:59:59').toISOString() : null,
    });
    reset();
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Approval delegations</h3>
          <p className="text-xs text-muted-foreground">
            Route approval requests to a delegate while an approver is away. Applies to
            expense reports and every other approval chain.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New delegation
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Delegate</TableHead>
                <TableHead>Valid from</TableHead>
                <TableHead>Valid to</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : !sorted.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <UserCog className="h-8 w-8 text-muted-foreground/50" />
                      <p>No delegations configured</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((d: ApprovalDelegation) => {
                  const active = isDelegationActive(d);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{displayUser(profiles, d.from_user)}</TableCell>
                      <TableCell>{displayUser(profiles, d.to_user)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(d.starts_at), 'yyyy-MM-dd')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {d.ends_at ? format(new Date(d.ends_at), 'yyyy-MM-dd') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
                        >
                          {active ? 'Active' : 'Expired'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {active && (
                          <Button size="sm" variant="ghost" onClick={() => revoke.mutate(d.id)}>
                            <X className="h-3.5 w-3.5 mr-1" /> Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New delegation</DialogTitle>
            <DialogDescription>
              While active, approvals routed to <strong>From</strong> will also be
              actionable by <strong>Delegate</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>From (approver)</Label>
              <Select value={fromUser} onValueChange={setFromUser}>
                <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id.slice(0, 8) + '…'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Delegate</Label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                <SelectContent>
                  {(profiles ?? []).filter((p) => p.id !== fromUser).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email || p.id.slice(0, 8) + '…'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valid from</Label>
                <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid to (optional)</Label>
                <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!fromUser || !toUser || fromUser === toUser || create.isPending}
            >
              {create.isPending ? 'Saving…' : 'Create delegation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
