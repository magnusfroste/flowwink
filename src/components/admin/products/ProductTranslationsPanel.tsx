import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { useEntityOverlayRows, useTranslationSkill } from '@/hooks/usePageTranslations';
import { UnitRow } from '@/components/admin/pages/PageTranslationsSheet';
import { collectProductUnits, diffOverlay } from '../../../../supabase/functions/_shared/i18n/translation-units';

interface ProductTranslationsPanelProps {
  product: { id: string; name: string; description?: string | null; locale?: string | null; is_active?: boolean };
  /** A product (default) or a product category — the same two units, the same skills, a different id argument. */
  entity?: 'product' | 'product_category';
}

type UnitState = 'fresh' | 'stale' | 'missing';

/**
 * A product's (or a category's) text in the shop's other languages — name and
 * description as overlays, the page/post model (page-translations.md §10).
 * Writes go through the same skills FlowPilot and an external agent use
 * (translate_content, set_translation, publish_translation), so a hand edit is
 * stamped with the current source hash exactly as theirs would be.
 */
export function ProductTranslationsPanel({ product, entity = 'product' }: ProductTranslationsPanelProps) {
  const noun = entity === 'product' ? 'product' : 'category';
  const idArg = entity === 'product' ? { product_id: product.id } : { category_id: product.id };
  const { defaultLanguage, languages, isMultilingual } = useSiteLanguages();
  const own = String(product.locale ?? defaultLanguage).toLowerCase();
  const others = languages.filter((l) => l !== own);
  const [locale, setLocale] = useState<string>(others[0] ?? '');
  useEffect(() => {
    if (locale && others.includes(locale)) return;
    if (others[0]) setLocale(others[0]);
  }, [others.join(','), locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: overlays = [], isLoading } = useEntityOverlayRows(entity, product.id);
  const skill = useTranslationSkill();

  const units = useMemo(() => collectProductUnits({ name: product.name, description: product.description }, noun), [product.name, product.description, noun]);
  const overlay = overlays.find((o) => o.locale === locale) ?? null;
  const diff = useMemo(() => diffOverlay(units, overlay?.strings ?? null), [units, overlay]);
  const stateOf = new Map<string, UnitState>();
  diff.fresh.forEach((u) => stateOf.set(u.unit, 'fresh'));
  diff.stale.forEach((u) => stateOf.set(u.unit, 'stale'));
  diff.missing.forEach((u) => stateOf.set(u.unit, 'missing'));
  const coverage = units.length ? Math.round((diff.fresh.length / units.length) * 100) : 100;

  const run = (name: string, args: Record<string, unknown>, done: string) =>
    skill.mutateAsync({ skill: name, args })
      .then(() => toast.success(done))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));

  if (!isMultilingual || others.length === 0) {
    return <p className="text-sm text-muted-foreground">One language — enable another under Site settings → Language &amp; text, and the {noun} can be translated here.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Written in <span className="font-medium uppercase">{own}</span>. Other languages are overlays of the name and description{entity === 'product' ? '; price, stock and images are facts and stay the same everywhere' : ''}. A language without a translation shows the source text — the {noun} is never hidden.
      </p>
      <Tabs value={locale} onValueChange={setLocale}>
        <TabsList>
          {others.map((l) => <TabsTrigger key={l} value={l}>{l.toUpperCase()}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-32 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{overlay ? `${coverage}% translated` : 'No overlay yet'}</span>
            {overlay && <Badge variant={overlay.status === 'published' ? 'default' : 'outline'} className="text-[10px]">{overlay.status}</Badge>}
          </div>
          <Progress value={overlay ? coverage : 0} className="h-1.5" />
        </div>
        <Button size="sm" disabled={skill.isPending || !locale} onClick={() => run('translate_content', { entity, ...idArg, locale }, `Translated into ${locale.toUpperCase()}`)}>
          {skill.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
          Translate missing
        </Button>
        {overlay && (
          <Button size="sm" variant="outline" disabled={skill.isPending} onClick={() => run('translate_content', { entity, ...idArg, locale, force: true }, `Retranslated into ${locale.toUpperCase()}`)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retranslate all
          </Button>
        )}
        {overlay && (
          <Button size="sm" variant={overlay.status === 'published' ? 'ghost' : 'default'} disabled={skill.isPending}
            onClick={() => run('publish_translation', { entity, ...idArg, locale, status: overlay.status === 'published' ? 'draft' : 'published' }, overlay.status === 'published' ? 'Unpublished' : `Published in ${locale.toUpperCase()}`)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> {overlay.status === 'published' ? 'Unpublish' : 'Publish'}
          </Button>
        )}
      </div>
      {product.is_active === false && (
        <p className="text-xs text-muted-foreground">The {noun} is archived — visitors see no language version until it is active again.</p>
      )}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {units.map((u) => (
          <UnitRow
            key={u.unit}
            unit={u}
            state={stateOf.get(u.unit) ?? 'missing'}
            entry={overlay?.strings?.[u.unit]}
            busy={skill.isPending}
            onSave={(text) => run('set_translation', { entity, ...idArg, locale, unit: u.unit, text }, 'Saved')}
            onReset={() => run('set_translation', { entity, ...idArg, locale, unit: u.unit, remove: true }, 'Reset to source')}
          />
        ))}
      </div>
    </div>
  );
}
