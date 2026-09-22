import { useMemo, useState } from 'react';
import { Hash, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { normalizeTag } from '@/lib/wiki-tags';

/**
 * The page's tags, editable in place — no edit mode needed for a label.
 *
 * Two kinds of pill: a tag set through the field (removable with ×) and a
 * #tag written in the body (shown with a hash, not removable — the text is
 * the truth, so it goes when the text changes). The picker offers the tags
 * already in use first: a new spelling of an existing tag is how a label
 * system rots.
 */
export function WikiTagEditor({
  tags, allTags, inUse, disabled, onChange,
}: {
  /** Set through the field. */
  tags: string[];
  /** What the page bears (field ∪ body) — the database's answer. */
  allTags: string[];
  /** Tags in use across the wiki, most used first. */
  inUse: { tag: string; count: number }[];
  disabled?: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const fieldSet = useMemo(() => new Set(tags), [tags]);
  const bodyOnly = allTags.filter((t) => !fieldSet.has(t));
  const typed = normalizeTag(query);
  const offer = inUse.filter((c) => !allTags.includes(c.tag) && (!typed || c.tag.includes(typed)));
  const canCreate = typed.length > 0 && !allTags.includes(typed) && !offer.some((c) => c.tag === typed);

  const add = (tag: string) => {
    const t = normalizeTag(tag);
    if (!t || allTags.includes(t)) return;
    onChange([...tags, t].sort());
    setQuery('');
    setOpen(false);
  };
  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]">
          {t}
          {!disabled && (
            <button type="button" onClick={() => remove(t)} aria-label={`Remove tag ${t}`} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {bodyOnly.map((t) => (
        <span
          key={`body-${t}`}
          title="Written in the page — edit the text to remove it"
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <Hash className="h-3 w-3" />{t}
        </span>
      ))}
      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] text-muted-foreground" aria-label="Add tag">
              <Plus className="mr-0.5 h-3 w-3" /> tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Tag…"
                value={query}
                onValueChange={setQuery}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) { e.preventDefault(); add(typed); } }}
              />
              <CommandList>
                <CommandEmpty>{typed ? 'Press Enter to add it' : 'Type a tag'}</CommandEmpty>
                {offer.length > 0 && (
                  <CommandGroup heading="In use">
                    {offer.slice(0, 12).map((c) => (
                      <CommandItem key={c.tag} value={c.tag} onSelect={() => add(c.tag)}>
                        {c.tag} <span className="ml-auto text-[10px] text-muted-foreground">{c.count}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {canCreate && (
                  <CommandGroup heading="New">
                    <CommandItem value={`new:${typed}`} onSelect={() => add(typed)}>Add "{typed}"</CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
