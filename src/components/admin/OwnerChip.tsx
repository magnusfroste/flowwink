/**
 * The owner chip IS the transparency mechanism.
 *
 * "Vänstra handen skall kunna se vad den högra gör" — the left hand sees the
 * right one because every list row SHOWS who owns the record, not because
 * anything is hidden. A filter conceals; this column informs. It also carries
 * the whole permanent handover: click the chip, pick a colleague, done — one
 * write, no admin screen, because salespeople do not do admin.
 *
 * Self-contained on purpose: the chip owns its mutation and goes through the
 * ownership map (src/lib/ownership.ts), so a call site cannot write the wrong
 * column and the three entities cannot drift apart.
 */
import { useState } from 'react';
import { UserCircle2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTeamProfiles, type TeamProfile } from '@/hooks/useFlowtable';
import { OWNERSHIP, type OwnedEntity } from '@/lib/ownership';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OwnerChipProps {
  entity: OwnedEntity;
  recordId: string;
  ownerId: string | null | undefined;
  /** Compact = initials only (kanban cards); default shows the name. */
  compact?: boolean;
  className?: string;
}

const initials = (p: TeamProfile) =>
  (p.full_name || p.email)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

export function OwnerChip({ entity, recordId, ownerId, compact, className }: OwnerChipProps) {
  const [open, setOpen] = useState(false);
  const { data: team } = useTeamProfiles();
  const qc = useQueryClient();

  const owner = team?.find((p) => p.id === ownerId) ?? null;

  const reassign = useMutation({
    mutationFn: async (newOwner: string | null) => {
      const { column } = OWNERSHIP[entity];
      const { error } = await supabase
        .from(entity as never)
        .update({ [column]: newOwner } as never)
        .eq('id', recordId);
      if (error) throw error;
    },
    onSuccess: (_d, newOwner) => {
      for (const key of OWNERSHIP[entity].invalidate) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      const name = team?.find((p) => p.id === newOwner);
      toast.success(newOwner ? `Owner: ${name?.full_name || name?.email || 'colleague'}` : 'Owner cleared');
    },
    onError: (e: Error) => toast.error(`Could not reassign: ${e.message}`),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // Rows and kanban cards are clickable/draggable — the chip must not
          // open the record it sits on.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          title={owner ? `Owner: ${owner.full_name || owner.email}` : 'Unassigned — click to assign'}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
            owner
              ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
              : 'border-dashed text-muted-foreground hover:bg-muted',
            className,
          )}
        >
          {owner ? (
            <>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold">
                {initials(owner)}
              </span>
              {!compact && <span className="max-w-[110px] truncate">{owner.full_name || owner.email}</span>}
            </>
          ) : (
            <>
              <UserCircle2 className="h-3.5 w-3.5" />
              {!compact && <span>Unassigned</span>}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="max-h-64 overflow-y-auto">
          {(team ?? []).map((p) => (
            <Button
              key={p.id}
              variant="ghost"
              size="sm"
              className={cn('w-full justify-start gap-2 font-normal', p.id === ownerId && 'bg-muted')}
              disabled={reassign.isPending}
              onClick={() => {
                setOpen(false);
                if (p.id !== ownerId) reassign.mutate(p.id);
              }}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold">
                {initials(p)}
              </span>
              <span className="truncate">{p.full_name || p.email}</span>
            </Button>
          ))}
          {ownerId && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 font-normal text-muted-foreground"
              disabled={reassign.isPending}
              onClick={() => {
                setOpen(false);
                reassign.mutate(null);
              }}
            >
              <UserCircle2 className="h-4 w-4" />
              Clear owner
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
