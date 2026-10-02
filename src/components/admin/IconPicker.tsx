import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, icons, LucideIcon } from 'lucide-react';
import { ALL_ICON_NAMES, SEARCH_LIMIT, STARTER_ICONS, searchIcons } from '@/components/admin/icon-search';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * The icon picker searches the whole library.
 *
 * Until 2026-10-02 this component offered a hand-written list of 56 icons in
 * eight groups — one of them a sector group of ten medical icons, the first
 * template's inheritance. Our own templates use 137 distinct icon names and 108 of them
 * were not in the list, so an operator editing a Features block on a shop, a
 * law firm or a workshop saw stethoscopes and could not even find the icon the
 * page already had. The admin bundle imports lucide's full map regardless (the
 * `icons` import below is what renders the chosen one), so searching all 1 541
 * costs no bytes. The public side keeps loading the set lazily (BlockIcon).
 *
 * Behaviour: an empty query shows a short, business-neutral starter set plus
 * the current value; typing searches every icon by name and by word
 * ("truck", "heart pulse", "chart"), ranked word-start first, capped so the list
 * stays quick. The library's names are the only vocabulary — no groups to
 * maintain, nothing to add when a new business shows up.
 */

function renderIcon(iconName: string, className?: string) {
  if (!iconName) return null;
  const LucideIconComponent = icons[iconName as keyof typeof icons] as LucideIcon | undefined;
  return LucideIconComponent ? <LucideIconComponent className={className} /> : null;
}

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchIcons(query), [query]);
  const searching = query.trim().length > 0;
  const starter = useMemo(
    () => (value && !STARTER_ICONS.includes(value) ? [value, ...STARTER_ICONS] : [...STARTER_ICONS]),
    [value],
  );
  const shown = searching ? results : starter;

  const pick = (iconName: string) => {
    onChange(iconName);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            {renderIcon(value, "h-4 w-4")}
            <span>{value || 'Select icon...'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        {/* shouldFilter={false}: we rank and cap ourselves — cmdk must not re-filter
            (or render) the whole library on every keystroke. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${ALL_ICON_NAMES.length.toLocaleString('en')} icons…`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No icon found.</CommandEmpty>
            <CommandGroup
              heading={
                searching
                  ? results.length >= SEARCH_LIMIT
                    ? `First ${SEARCH_LIMIT} matches — keep typing`
                    : `${results.length} match${results.length === 1 ? '' : 'es'}`
                  : 'Suggested — type to search the whole library'
              }
            >
              {shown.map((iconName) => (
                <CommandItem key={iconName} value={iconName} onSelect={() => pick(iconName)}>
                  <div className="flex items-center gap-2">
                    {renderIcon(iconName, "h-4 w-4")}
                    <span>{iconName}</span>
                  </div>
                  <Check className={cn("ml-auto h-4 w-4", value === iconName ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
