import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { audienceReach, normalizeListName, useNewsletterLists } from '@/hooks/useNewsletterLists';

/**
 * Mailing lists for the newsletter — the admin half of the same model the
 * skills use (newsletter_subscribers.lists, newsletters.audience_lists).
 * Names are normalised by the table trigger (lower-case, trimmed, deduped);
 * the UI lower-cases too so what you type is what you see after saving.
 */

/** Choose the lists a newsletter goes to. Empty = everyone confirmed. */
export function AudienceListsField({
  value,
  onChange,
  totalConfirmed,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  totalConfirmed: number;
}) {
  const { data: lists = [] } = useNewsletterLists();
  const toggle = (name: string) =>
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Audience</label>
      {lists.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No lists yet — this goes to everyone confirmed ({totalConfirmed}). Put subscribers on lists in the Subscribers tab to target a segment.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => {
            const on = value.includes(l.list);
            return (
              <button
                key={l.list}
                type="button"
                onClick={() => toggle(l.list)}
                aria-pressed={on}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted',
                )}
              >
                {l.list} <span className="opacity-70">({l.confirmed})</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{audienceReach(value, lists, totalConfirmed)}</p>
    </div>
  );
}

/** A subscriber's lists, editable in place. */
export function SubscriberListsCell({ subscriberId, lists }: { subscriberId: string; lists: string[] | null | undefined }) {
  const queryClient = useQueryClient();
  const current = lists ?? [];
  const [draft, setDraft] = useState('');
  const save = useMutation({
    mutationFn: async (next: string[]) => {
      const { data, error } = await supabase
        .from('newsletter_subscribers')
        .update({ lists: next } as never)
        .eq('id', subscriberId)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Nothing was updated — you may not have permission.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['newsletter-subscribers'] });
      await queryClient.invalidateQueries({ queryKey: ['newsletter-lists'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = () => {
    const name = normalizeListName(draft);
    if (!name || current.includes(name)) { setDraft(''); return; }
    save.mutate([...current, name]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {current.map((l) => (
        <Badge key={l} variant="secondary" className="gap-1 pr-1">
          {l}
          <button
            type="button"
            aria-label={`Remove from ${l}`}
            onClick={() => save.mutate(current.filter((x) => x !== l))}
            className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Add to a list">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 space-y-2" align="start">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="List name, e.g. customers"
            className="h-8 text-sm"
          />
          <Button size="sm" className="w-full" onClick={add} disabled={!draft.trim() || save.isPending}>
            Add to list
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
