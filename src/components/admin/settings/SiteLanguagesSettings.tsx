import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Languages, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { languageCoverage, pagesToTranslate, type PageHead } from '@/lib/page-translation-state';
import { runTranslationSkill, usePageOverlays } from '@/hooks/usePageTranslations';
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
 * Names for the tags people actually type, so "sv" reads as Svenska next to
 * the input and the trap has a sign on it: "se" is Northern Sami — on
 * www.flowwink.com (2026-09-04) it was typed for Swedish, sixteen pages were
 * copied into a language nobody speaks, and every later step went wrong.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English', sv: 'Svenska', da: 'Dansk', nb: 'Norsk bokmål', no: 'Norsk', fi: 'Suomi', de: 'Deutsch',
  nl: 'Nederlands', fr: 'Français', es: 'Español', it: 'Italiano', pt: 'Português', pl: 'Polski',
  cs: 'Čeština', et: 'Eesti', lv: 'Latviešu', lt: 'Lietuvių', is: 'Íslenska', ga: 'Gaeilge',
  ru: 'Русский', uk: 'Українська', tr: 'Türkçe', el: 'Ελληνικά', ar: 'العربية', he: 'עברית',
  ja: '日本語', zh: '中文', ko: '한국어', hi: 'हिन्दी', se: 'Northern Sami',
};
const LOOKS_LIKE_A_MISTAKE: Record<string, string> = {
  se: 'se is Northern Sami. Swedish is sv.',
  dk: 'dk is not a language tag. Danish is da.',
  jp: 'jp is not a language tag. Japanese is ja.',
  cn: 'cn is not a language tag. Chinese is zh.',
  gb: 'gb is not a language tag. British English is en-GB.',
  us: 'us is not a language tag. American English is en-US.',
};
function languageLabel(tag: string): string {
  const base = tag.toLowerCase().split('-')[0];
  const name = LANGUAGE_NAMES[base];
  return name ? `${tag.toUpperCase()} · ${name}` : tag.toUpperCase();
}

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

  // Adding a language copies nothing: a language with no translations is an
  // empty overlay (page-translations.md §5.1). "Translate what is missing" runs
  // translate_page per page that lacks a published version — one call per
  // page keeps each inside the edge wall clock — then publishes the overlay.
  const { data: pageHeads = [] } = useQuery({
    queryKey: ['pages', 'heads-for-languages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, slug, status, locale, translation_group_id')
        .is('deleted_at', null);
      if (error) throw error;
      return (data ?? []) as PageHead[];
    },
    staleTime: 30 * 1000,
  });
  const { data: overlays = [] } = usePageOverlays(languages.length > 1);
  const coverage = useMemo(
    () => languageCoverage(pageHeads, overlays, defaultLanguage, languages),
    [pageHeads, overlays, defaultLanguage, languages],
  );
  const [translating, setTranslating] = useState<{ locale: string; done: number; total: number } | null>(null);
  const translateMissing = async (locale: string) => {
    const todo = pagesToTranslate(pageHeads, overlays, defaultLanguage, locale);
    if (!todo.length) { toast.success(`Every page already has a published ${locale.toUpperCase()} version.`); return; }
    setTranslating({ locale, done: 0, total: todo.length });
    let failed = 0;
    for (const [i, page] of todo.entries()) {
      try {
        await runTranslationSkill('translate_page', { slug: page.slug, locale, publish: true });
      } catch (err) {
        failed += 1;
        toast.error(`${page.slug}: ${(err as Error).message}`);
      }
      setTranslating({ locale, done: i + 1, total: todo.length });
    }
    setTranslating(null);
    queryClient.invalidateQueries({ queryKey: ['page-translations'] });
    queryClient.invalidateQueries({ queryKey: ['pages'] });
    if (failed) toast.warning(`${todo.length - failed} of ${todo.length} page(s) translated into ${locale.toUpperCase()}; ${failed} failed — see the pages list.`);
    else toast.success(`${todo.length} page(s) translated into ${locale.toUpperCase()} and published.`);
  };

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
                  {tag === defaultLanguage
                    ? 'default'
                    : (() => {
                        const c = coverage.find((x) => x.locale === tag);
                        if (!c) return `${pagesPerLanguage[tag] ?? 0} pages`;
                        return `${c.published} of ${c.pages} pages published${c.draft ? ` · ${c.draft} draft` : ''}`;
                      })()}
                </span>
                {tag !== defaultLanguage && (coverage.find((x) => x.locale === tag)?.published ?? 0) < (coverage.find((x) => x.locale === tag)?.pages ?? 0) && (
                  <button
                    type="button"
                    onClick={() => translateMissing(tag)}
                    disabled={translating !== null}
                    title={`Translate every ${defaultLanguage.toUpperCase()} page that has no published ${tag.toUpperCase()} version, and publish it. Nothing is copied.`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {translating?.locale === tag
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {translating.done}/{translating.total}</>
                      : <><Sparkles className="h-3.5 w-3.5" /> Translate what is missing</>}
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
            {(() => {
              const typed = adding.trim().toLowerCase();
              if (!typed) return null;
              const trap = LOOKS_LIKE_A_MISTAKE[typed];
              if (trap) return <p className="text-xs text-warning">{trap}</p>;
              const name = LANGUAGE_NAMES[typed.split('-')[0]];
              return <p className="text-xs text-muted-foreground">{name ?? (TAG.test(typed) ? 'A language tag; no name on file.' : 'Use a tag like sv, de or en-GB.')}</p>;
            })()}
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
                  <SelectItem key={tag} value={tag}>{languageLabel(tag)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Adding a language copies nothing. A page is designed once; every other language is a
          layer of text on top of it. <strong>Translate what is missing</strong> translates and
          publishes every page that has no version in that language — only strings that are
          missing or whose source changed are ever retranslated, so a translation you polished by
          hand stays until its source changes. Each page's <em>Translations</em> view in the editor
          shows the strings side by side.
        </p>
        <p className="text-sm text-muted-foreground">
          Changing the default decides which version a visitor lands on, and which language
          owns the root addresses: the default lives at <code>/about</code>, every other
          language under its prefix (<code>/en/about</code>). Links to page slugs keep
          working after a change; old <code>/xx/…</code> prefix links for the new default
          stop resolving — so treat changing the default as a launch decision, not a toggle.
        </p>
        <p className="text-sm text-muted-foreground">
          Pages are one of three places language lives. Visitor-facing interface strings
          (buttons, empty states) are translated per language in the <strong>Translations</strong>{' '}
          table below, and outbound email has one template per language under{' '}
          <strong>Email → Templates</strong>. Removing a language here never deletes any of
          them — it only closes the visitor-facing door; re-adding the language brings
          everything back.
        </p>
      </CardContent>
    </Card>
  );
}
