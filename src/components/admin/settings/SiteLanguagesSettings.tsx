import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Languages, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useSiteLanguages, useUpdateSiteLanguages } from '@/hooks/useSiteSettings';
import { toast } from 'sonner';

const TAG = /^[a-z]{2}(-[a-z0-9]{2,8})?$/;

/**
 * Which languages the site publishes in, and which one a visitor gets first.
 *
 * This is the dial that did not exist. The set used to be computed by scanning
 * which pages happened to carry a locale, so adding a language was a side
 * effect of creating a page and the default could not be changed at all.
 *
 * English is not added for free. For the product's own chrome it genuinely is
 * the floor — every string in the code carries English and it cannot be
 * removed — but a page has no English version unless somebody wrote one, and
 * listing a language nobody has published would put a door in the visitor's
 * switcher that opens onto nothing.
 */
export function SiteLanguagesSettings() {
  const { defaultLanguage, languages } = useSiteLanguages();
  const update = useUpdateSiteLanguages();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState('');

  // Adding a language is only half the job. A site installed from a template
  // has ten pages in one language; without this, "add Swedish" means ten
  // separate copies and remembering which are done.
  const copyPages = useMutation({
    mutationFn: async (locale: string) => {
      const { data, error } = await supabase.rpc('translate_site_into' as never, {
        p_locale: locale, p_dry_run: false,
      } as never);
      if (error) throw error;
      return data as { copied?: unknown[]; failed?: unknown[]; note?: string };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['pages-per-language'] });
      queryClient.invalidateQueries({ queryKey: ['site-settings', 'site_languages'] });
      const failed = (result?.failed ?? []).length;
      if (failed > 0) toast.warning(`${failed} page(s) could not be copied — see the pages list.`);
      toast.success(result?.note ?? 'Pages copied.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // What removing a language would actually cost. A count is the difference
  // between "are you sure?" and "this would hide 7 published pages".
  const { data: pagesPerLanguage = {} } = useQuery({
    queryKey: ['pages-per-language'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('locale')
        .is('deleted_at', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        const code = String(row.locale ?? '').toLowerCase();
        if (code) counts[code] = (counts[code] ?? 0) + 1;
      }
      return counts;
    },
    staleTime: 1000 * 60,
  });

  const sorted = useMemo(
    () => [...languages].sort((a, b) => (a === defaultLanguage ? -1 : b === defaultLanguage ? 1 : a.localeCompare(b))),
    [languages, defaultLanguage],
  );

  const save = (next: { default: string; enabled: string[] }) => update.mutate(next);

  const add = () => {
    const tag = adding.trim().toLowerCase();
    if (!TAG.test(tag)) {
      toast.error('Use a language tag like "en", "de" or "en-GB".');
      return;
    }
    if (languages.includes(tag)) { setAdding(''); return; }
    setAdding('');
    save({ default: defaultLanguage, enabled: [...languages, tag] });
  };

  const remove = (tag: string) => {
    if (tag === defaultLanguage) {
      toast.error('This is the default language. Make another language the default first.');
      return;
    }
    const count = pagesPerLanguage[tag] ?? 0;
    if (count > 0) {
      toast.error(
        `${count} page${count === 1 ? '' : 's'} are written in ${tag}. They would stay live but disappear from the language switcher — move or delete them first.`,
      );
      return;
    }
    save({ default: defaultLanguage, enabled: languages.filter((l) => l !== tag) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Languages
        </CardTitle>
        <CardDescription>
          The languages this site publishes content in. Visitors get the default unless they
          choose another; the product's own interface is always English.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Published languages</Label>
          <div className="flex flex-wrap items-center gap-2">
            {sorted.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <span className="font-medium uppercase">{tag}</span>
                <span className="text-xs text-muted-foreground">
                  {tag === defaultLanguage ? 'default' : `${pagesPerLanguage[tag] ?? 0} pages`}
                </span>
                {tag !== defaultLanguage && (pagesPerLanguage[tag] ?? 0) < (pagesPerLanguage[defaultLanguage] ?? 0) && (
                  <button
                    type="button"
                    onClick={() => copyPages.mutate(tag)}
                    disabled={copyPages.isPending}
                    title={`Copy the remaining ${defaultLanguage.toUpperCase()} pages into ${tag.toUpperCase()} as drafts`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {copyPages.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Copy className="h-3.5 w-3.5" />}
                    Copy pages
                  </button>
                )}
                {tag !== defaultLanguage && (
                  <button
                    type="button"
                    onClick={() => remove(tag)}
                    aria-label={`Remove ${tag}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="add-language">Add a language</Label>
            <div className="flex gap-2">
              <Input
                id="add-language"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder="en, de, en-GB"
                className="w-36"
              />
              <Button type="button" variant="outline" onClick={add} disabled={!adding.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-language">Visitors get</Label>
            <Select
              value={defaultLanguage}
              onValueChange={(value) => save({ default: value, enabled: languages })}
            >
              <SelectTrigger id="default-language" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          <strong>Copy pages</strong> duplicates every published page into that language as a
          draft, with the original text still in it. Translate the drafts, then publish them —
          nothing appears to visitors until you do.
        </p>
        <p className="text-sm text-muted-foreground">
          Changing the default decides which version a visitor lands on. It does not move any
          page — every language keeps its own address, so existing links go on working.
        </p>
      </CardContent>
    </Card>
  );
}
