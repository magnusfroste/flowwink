import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KbPageSlugFieldProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  description?: string;
}

export function KbPageSlugField({ 
  value, 
  onChange, 
  id = 'kbPageSlug',
  description = 'The slug of the KB page for article links (e.g., "help" → /help/article-slug)'
}: KbPageSlugFieldProps) {
  const [open, setOpen] = useState(false);

  const { data: pages = [] } = useQuery({
    queryKey: ['pages-slugs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('slug, title')
        .eq('status', 'published')
        .order('title');
      
      if (error) throw error;
      return data || [];
    },
  });

  const selectedPage = pages.find(p => p.slug === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>KB Page Slug</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value ? (
              <span className="truncate">
                {selectedPage ? `${selectedPage.title} (/${value})` : `/${value}`}
              </span>
            ) : (
              <span className="text-muted-foreground">Select a page...</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search pages..." />
            <CommandList>
              <CommandEmpty>No pages found.</CommandEmpty>
              <CommandGroup>
                {pages.map((page) => (
                  <CommandItem
                    key={page.slug}
                    value={`${page.title} ${page.slug}`}
                    onSelect={() => {
                      onChange(page.slug);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === page.slug ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{page.title}</span>
                      <span className="text-xs text-muted-foreground">/{page.slug}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <p className="text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
