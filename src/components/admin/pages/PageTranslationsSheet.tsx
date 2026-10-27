import { useEffect, useMemo, useState } from 'react';
import { Languages, Loader2, RefreshCw, Sparkles, Upload, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { usePageOverlayRows, useTranslationSkill } from '@/hooks/usePageTranslations';
import { collectUnits, diffOverlay, type TranslationUnit } from '../../../../supabase/functions/_shared/i18n/translation-units';
import type { ContentBlock, PageMeta } from '@/types/cms';
import { cn } from '@/lib/utils';

interface PageTranslationsSheetProps {
  page: { id: string; slug: string; locale?: string | null; status: string };
  /** The editor's CURRENT text — what the overlay is measured against. */
  title: string;
  meta: PageMeta | Record<string, unknown>;
  blocks: ContentBlock[];
  /** Open on this language straight away (the pages list's chip). */
  initialLocale?: string | null;
}

export type UnitState = 'fresh' | 'stale' | 'missing';

/**
 * The translation view: the page's units in document order, source on the
 * left, the overlay's text on the right, stale marked. This is what editing a
 * page "in English" is — there is no second block canvas; design is edited
 * where the design lives (page-translations.md §2.4, §5.3).
 *
 * Writes go through the skills (set_translation, translate_page,
 * publish_translation) so a hand edit is stamped with the current source hash
 * exactly as FlowPilot's would be.
 */
export function PageTranslationsSheet({ page, title, meta, blocks, initialLocale }: PageTranslationsSheetProps) {
  const { defaultLanguage, languages, isMultilingual } = useSiteLanguages();
  const others = languages.filter((l) => l !== defaultLanguage && l !== String(page.locale ?? '').toLowerCase());
  const [open, setOpen] = useState(!!initialLocale);
  const [locale, setLocale] = useState<string>(initialLocale && others.includes(initialLocale) ? initialLocale : (others[0] ?? ''));
  // The site's languages load after the first render (the hook answers 'en'
  // meanwhile): a deep link ?translations=en opened on no tab and stayed there.
  useEffect(() => {
    if (locale && others.includes(locale)) return;
    const next = initialLocale && others.includes(initialLocale) ? initialLocale : others[0];
    if (next) setLocale(next);
  }, [others.join(','), initialLocale]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: overlays = [], isLoading } = usePageOverlayRows(open ? page.id : undefined);
  const skill = useTranslationSkill();

  const units = useMemo(() => collectUnits({ title, meta_json: meta, content_json: blocks }), [title, meta, blocks]);
  const overlay = overlays.find((o) => o.locale === locale) ?? null;
  const diff = useMemo(() => diffOverlay(units, overlay?.strings ?? null), [units, overlay]);
  const stateOf = new Map<string, UnitState>();
  diff.fresh.forEach((u) => stateOf.set(u.unit, 'fresh'));
  diff.stale.forEach((u) => stateOf.set(u.unit, 'stale'));
  diff.missing.forEach((u) => stateOf.set(u.unit, 'missing'));
  const coverage = units.length ? Math.round((diff.fresh.length / units.length) * 100) : 100;

  // Only on a site that declares another language, and never for a page that
  // is itself a legacy sibling row (it IS the translation).
  if (!isMultilingual || others.length === 0) return null;

  const run = (skillName: string, args: Record<string, unknown>, done: string) =>
    skill.mutateAsync({ skill: skillName, args }).then((r) => {
      const n = typeof r.units_translated === 'number' ? ` — ${r.units_translated} unit(s) translated` : '';
      toast.success(`${done}${n}`);
    }).catch((e: Error) => toast.error(e.message));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Languages className="h-4 w-4 mr-2" />
          Translations
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif">Translations · /{page.slug}</SheetTitle>
          <SheetDescription>
            One design, text per language. Only missing and changed strings are retranslated;
            a string you edit here stays until its source changes.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={locale} onValueChange={setLocale} className="mt-4">
          <TabsList>
            {others.map((l) => {
              const o = overlays.find((x) => x.locale === l);
              return (
                <TabsTrigger key={l} value={l} className="gap-1.5">
                  <span className="uppercase">{l}</span>
                  <span className="text-xs text-muted-foreground">
                    {o ? (o.status === 'published' ? '✓' : `${o.coverage ?? 0}%`) : '—'}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border p-3">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-sm">
              <span>
                <Badge variant={overlay?.status === 'published' ? 'default' : 'secondary'}>
                  {overlay ? overlay.status : 'not translated'}
                </Badge>
              </span>
              <span className="text-muted-foreground">
                {diff.fresh.length} of {units.length} units fresh
                {diff.stale.length ? ` · ${diff.stale.length} stale` : ''}
                {diff.missing.length ? ` · ${diff.missing.length} missing` : ''}
              </span>
            </div>
            <Progress value={coverage} className="mt-2 h-2" />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={skill.isPending || (diff.missing.length === 0 && diff.stale.length === 0)}
              onClick={() => run('translate_page', { slug: page.slug, locale }, `Translated into ${locale.toUpperCase()}`)}
            >
              {skill.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Translate missing
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm" variant="outline" disabled={skill.isPending || units.length === 0}
                  onClick={() => run('translate_page', { slug: page.slug, locale, force: true }, `Retranslated into ${locale.toUpperCase()}`)}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retranslate everything, hand edits included</TooltipContent>
            </Tooltip>
            {overlay && (
              <Button
                size="sm" variant={overlay.status === 'published' ? 'outline' : 'default'} disabled={skill.isPending}
                onClick={() => run('publish_translation', { slug: page.slug, locale, status: overlay.status === 'published' ? 'draft' : 'published' },
                  overlay.status === 'published' ? `${locale.toUpperCase()} unpublished` : `${locale.toUpperCase()} published`)}
              >
                <Upload className="h-4 w-4 mr-2" />
                {overlay.status === 'published' ? 'Unpublish' : 'Publish'}
              </Button>
            )}
          </div>
        </div>
        {page.status !== 'published' && (
          <p className="mt-2 text-xs text-muted-foreground">The page itself is not published — visitors see no language version until it is.</p>
        )}

        <div className="mt-4 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {units.map((u) => (
            <UnitRow
              key={u.unit}
              unit={u}
              state={stateOf.get(u.unit) ?? 'missing'}
              entry={overlay?.strings?.[u.unit]}
              busy={skill.isPending}
              onSave={(text) => run('set_translation', { slug: page.slug, locale, unit: u.unit, text }, 'Saved')}
              onReset={() => run('set_translation', { slug: page.slug, locale, unit: u.unit, remove: true }, 'Reset to source')}
            />
          ))}
          {units.length === 0 && <p className="text-sm text-muted-foreground">This page has no translatable text.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function UnitRow({ unit, state, entry, busy, onSave, onReset }: {
  unit: TranslationUnit;
  state: UnitState;
  entry?: { text?: string; doc?: unknown };
  busy: boolean;
  onSave: (text: string) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const current = typeof entry?.text === 'string' ? entry.text : '';
  const value = draft ?? current;
  const dirty = draft !== null && draft.trim() !== current.trim();

  return (
    <div className={cn('grid gap-2 rounded-md border p-3 sm:grid-cols-2', state === 'stale' && 'border-warning/60', state === 'missing' && 'border-dashed')}>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <code className="truncate">{unit.unit}</code>
          <Badge variant={state === 'fresh' ? 'secondary' : state === 'stale' ? 'outline' : 'outline'} className={cn('text-[10px]', state === 'stale' && 'border-warning text-warning')}>
            {state === 'fresh' ? 'translated' : state === 'stale' ? 'source changed' : 'source text shown'}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm">{unit.kind === 'doc' ? unit.text.split('\u001f').join(' ') : unit.text}</p>
      </div>
      <div className="min-w-0">
        {unit.kind === 'doc' ? (
          <div className="text-sm text-muted-foreground">
            {entry?.doc ? 'Rich text — translated as a whole.' : 'Rich text — not translated yet.'}
            <div className="mt-2 flex gap-2">
              {entry?.doc && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={onReset}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Reset, then "Translate missing"
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <Textarea
              value={value}
              placeholder="Not translated — the source text is shown to visitors"
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(6, Math.max(1, Math.ceil(unit.text.length / 60)))}
              className="text-sm"
            />
            <div className="mt-1 flex items-center gap-2">
              <Button size="sm" disabled={!dirty || busy || !value.trim()} onClick={() => { onSave(value.trim()); setDraft(null); }}>
                Save
              </Button>
              {current && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { onReset(); setDraft(null); }}>
                  <Undo2 className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
