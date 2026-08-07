/**
 * "Anna täcker för Björn, 1–15 aug" — said once, as a row, not as a thousand
 * reassignments.
 *
 * The list is visible to everyone (who covers whom is office-level truth), and
 * coverage is GIVEN, never taken: you set coverage for yourself — an admin for
 * anyone — and the covering colleague appears here without gaining a single
 * permission. It ends by itself on the end date; there is nothing to remember
 * to undo, which is the entire point.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTeamProfiles } from '@/hooks/useFlowtable';
import { useActiveDelegations } from '@/hooks/useOwnershipLens';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarClock, Trash2 } from 'lucide-react';

export function CoverageDialog() {
  const { user, isAdmin } = useAuth();
  const { data: team } = useTeamProfiles();
  const { data: delegations } = useActiveDelegations();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [fromUser, setFromUser] = useState<string>('');
  const [toUser, setToUser] = useState<string>('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const name = (id: string) => {
    const p = team?.find((t) => t.id === id);
    return p?.full_name || p?.email || id.slice(0, 8);
  };

  const create = useMutation({
    mutationFn: async () => {
      const from = isAdmin ? (fromUser || user?.id) : user?.id;
      if (!from || !toUser || !startsOn || !endsOn) throw new Error('All fields are required');
      const { error } = await supabase.from('ownership_delegations' as never).insert({
        from_user: from,
        to_user: toUser,
        starts_on: startsOn,
        ends_on: endsOn,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ownership-delegations'] });
      toast.success('Coverage set — it ends by itself on the end date');
      setToUser(''); setStartsOn(''); setEndsOn('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ownership_delegations' as never).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ownership-delegations'] });
      toast.success('Coverage ended');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Coverage — who acts for whom">
          <CalendarClock className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Coverage</DialogTitle>
          <DialogDescription>
            The covering colleague sees the covered person's records under "Mine"
            for the period. Nothing is reassigned, and it ends by itself.
          </DialogDescription>
        </DialogHeader>

        {(delegations ?? []).length > 0 && (
          <div className="space-y-1.5">
            {(delegations ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{name(d.to_user)}</span>
                  {' covers '}
                  <span className="font-medium">{name(d.from_user)}</span>
                  <span className="text-muted-foreground"> · {d.starts_on} → {d.ends_on}</span>
                </span>
                {(d.from_user === user?.id || isAdmin) && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                    onClick={() => remove.mutate(d.id)}
                    title="End this coverage now"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 border-t pt-3">
          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Covered person</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={fromUser}
                onChange={(e) => setFromUser(e.target.value)}
              >
                <option value="">Me ({name(user?.id ?? '')})</option>
                {(team ?? []).filter((p) => p.id !== user?.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Covered by</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={toUser}
              onChange={(e) => setToUser(e.target.value)}
            >
              <option value="">Choose a colleague…</option>
              {(team ?? [])
                .filter((p) => p.id !== (isAdmin ? (fromUser || user?.id) : user?.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To (inclusive)</Label>
              <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          <Button
            className="w-full"
            disabled={create.isPending || !toUser || !startsOn || !endsOn}
            onClick={() => create.mutate()}
          >
            Set coverage
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
