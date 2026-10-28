import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSiteLanguages } from '@/hooks/useSiteSettings';
import { useEntityOverlayRows, useEntityOverlayRowsMany, useTranslationSkill, type EntityOverlayRow } from '@/hooks/usePageTranslations';
import { useProductVariants } from '@/hooks/useProductVariants';
import { UnitRow } from '@/components/admin/pages/PageTranslationsSheet';
import { collectAttributeUnits, collectProductUnits, diffOverlay, type TranslationUnit } from '../../../../supabase/functions/_shared/i18n/translation-units';

interface ProductTranslationsPanelProps {
  product: { id: string; name: string; description?: string | null; locale?: string | null; is_active?: boolean };
  /** A product (default) or a product category — the same two units, the same skills, a different id argument. */
  entity?: 'product' | 'product_category';
}

type UnitState = 'fresh' | 'stale' | 'missing';

/** One translatable thing on the tab: the product itself, or one variant attribute its variants use. */
interface Section {
  entity: 'product' | 'product_category' | 'product_attribute';
  id: string;
  title: string | null;
  idArg: Record<string, string>;
  units: TranslationUnit[];
  overlay: EntityOverlayRow | null;
}

/**
 * A product's (or a category's) text in the shop's other languages — name and
 * description as overlays, the page/post model (page-translations.md §10).
 * A product's tab also carries its variant labels: the attributes its variants
 * use (name and values), which are site-wide, so a label translated here
 * follows every product with that option. Writes go through the same skills
 * FlowPilot and an external agent use (translate_content, set_translation,
 * publish_translation), so a hand edit is stamped with the current source
 * hash exactly as theirs would be.
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
  const { data: variantData } = useProductVariants(entity === 'product' ? product.id : undefined);
  const attributes = useMemo(() => variantData?.attributes ?? [], [variantData]);
  const { data: attrOverlays = [] } = useEntityOverlayRowsMany('product_attribute', attributes.map((a) => a.id));
  const skill = useTranslationSkill();

  const sections = useMemo<Section[]>(() => {
    const units = collectProductUnits({ name: product.name, description: product.description }, noun);
    const own: Section = { entity, id: product.id, title: null, idArg, units, overlay: overlays.find((o) => o.locale === locale) ?? null };
    const attrs: Section[] = attributes.map((a) => ({
      entity: 'product_attribute',
      id: a.id,
      title: `Variant labels: ${a.name}`,
      idArg: { attribute_id: a.id },
      units: collectAttributeUnits({ name: a.name, product_attribute_values: a.values.map((v) => ({ id: v.id, value: v.value })) }),
      overlay: attrOverlays.find((o) => o.entity_id === a.id && o.locale === locale) ?? null,
    }));
    return [own, ...attrs];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, product.name, product.description, noun, entity, overlays, attributes, attrOverlays, locale]);

  const diffs = sections.map((s) => diffOverlay(s.units, s.overlay?.strings ?? null));
  const unitsTotal = sections.reduce((n, s) => n + s.units.length, 0);
  const fresh = diffs.reduce((n, d) => n + d.fresh.length, 0);
  const coverage = unitsTotal ? Math.round((fresh / unitsTotal) * 100) : 100;
  const main = sections[0];
  const anyOverlay = sections.some((s) => s.overlay);
  const allPublished = sections.filter((s) => s.overlay).every((s) => s.overlay?.status === 'published');

  const run = (name: string, args: Record<string, unknown>, done: string) =>
    skill.mutateAsync({ skill: name, args })
      .then(() => toast.success(done))
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));

  /** Publish (or unpublish) every overlay on this tab in this language. */
  const publishAll = async () => {
    const status = allPublished ? 'draft' : 'published';
    for (const s of sections) {
      if (!s.overlay) continue;
      try {
        await skill.mutateAsync({ skill: 'publish_translation', args: { entity: s.entity, ...s.idArg, locale, status } });
      } catch (e) {
        toast.error(`${s.title ?? noun}: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    toast.success(status === 'published' ? `Published in ${locale.toUpperCase()}` : 'Unpublished');
  };

  if (!isMultilingual || others.length === 0) {
    return <p className="text-sm text-muted-foreground">One language — enable another under Site settings → Language &amp; text, and the {noun} can be translated here.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Written in <span className="font-medium uppercase">{own}</span>. Other languages are overlays of the name and description{entity === 'product' ? ', and of the variant labels; price, stock and images are facts and stay the same everywhere' : ''}. A language without a translation shows the source text — the {noun} is never hidden.
      </p>
      <Tabs value={locale} onValueChange={setLocale}>
        <TabsList>
          {others.map((l) => <TabsTrigger key={l} value={l}>{l.toUpperCase()}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-32 flex-1">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{anyOverlay ? `${coverage}% translated` : 'No overlay yet'}</span>
            {main.overlay && <Badge variant={main.overlay.status === 'published' ? 'default' : 'outline'} className="text-[10px]">{main.overlay.status}</Badge>}
          </div>
          <Progress value={anyOverlay ? coverage : 0} className="h-1.5" />
        </div>
        {/* translate_content on the product carries its variant labels (§10). */}
        <Button size="sm" disabled={skill.isPending || !locale} onClick={() => run('translate_content', { entity, ...idArg, locale }, `Translated into ${locale.toUpperCase()}`)}>
          {skill.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
          Translate missing
        </Button>
        {anyOverlay && (
          <Button size="sm" variant="outline" disabled={skill.isPending} onClick={() => run('translate_content', { entity, ...idArg, locale, force: true }, `Retranslated into ${locale.toUpperCase()}`)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retranslate all
          </Button>
        )}
        {anyOverlay && (
          <Button size="sm" variant={allPublished ? 'ghost' : 'default'} disabled={skill.isPending} onClick={publishAll}>
            <Upload className="h-3.5 w-3.5 mr-1" /> {allPublished ? 'Unpublish' : 'Publish'}
          </Button>
        )}
      </div>
      {entity === 'product_category' && main.overlay && (
        <CategorySlugRow
          key={`${locale}:${main.overlay.slug ?? ''}`}
          locale={locale}
          current={main.overlay.slug ?? ''}
          sourceSlug={(product as { slug?: string }).slug ?? ''}
          busy={skill.isPending}
          onSave={(slug) => run('publish_translation', { entity, ...idArg, locale, status: main.overlay?.status ?? 'draft', translated_slug: slug || null }, slug ? `Address in ${locale.toUpperCase()}: ?category=${slug}` : 'Address reset to the source slug')}
        />
      )}
      {product.is_active === false && (
        <p className="text-xs text-muted-foreground">The {noun} is archived — visitors see no language version until it is active again.</p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {sections.map((s, si) => {
        const d = diffs[si];
        const stateOf = new Map<string, UnitState>();
        d.fresh.forEach((u) => stateOf.set(u.unit, 'fresh'));
        d.stale.forEach((u) => stateOf.set(u.unit, 'stale'));
        d.missing.forEach((u) => stateOf.set(u.unit, 'missing'));
        return (
          <div key={`${s.entity}:${s.id}`} className="space-y-2">
            {s.title && (
              <div className="flex items-center gap-2 pt-2">
                <h4 className="text-sm font-medium">{s.title}</h4>
                <span className="text-xs text-muted-foreground">shared by every product with this option</span>
                {s.overlay && <Badge variant={s.overlay.status === 'published' ? 'default' : 'outline'} className="text-[10px]">{s.overlay.status}</Badge>}
              </div>
            )}
            {s.units.map((u) => (
              <UnitRow
                key={u.unit}
                unit={u}
                state={stateOf.get(u.unit) ?? 'missing'}
                entry={s.overlay?.strings?.[u.unit]}
                busy={skill.isPending}
                onSave={(text) => run('set_translation', { entity: s.entity, ...s.idArg, locale, unit: u.unit, text }, 'Saved')}
                onReset={() => run('set_translation', { entity: s.entity, ...s.idArg, locale, unit: u.unit, remove: true }, 'Reset to source')}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A category's address key in one language — the `?category=<slug>` a shop
 * link carries. The first translation of the name sets it; here it is edited
 * by hand (publish_translation translated_slug). Empty = the source slug.
 */
function CategorySlugRow({ locale, current, sourceSlug, busy, onSave }: {
  locale: string;
  current: string;
  sourceSlug: string;
  busy: boolean;
  onSave: (slug: string) => void;
}) {
  const [draft, setDraft] = useState(current);
  const clean = draft.trim().toLowerCase();
  return (
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-1 text-xs text-muted-foreground"><code>?category=</code> in {locale.toUpperCase()}</div>
        <p className="text-sm">Source: <code>{sourceSlug}</code> — both resolve, so an old link keeps working.</p>
      </div>
      <div className="flex items-start gap-2">
        <Input value={draft} placeholder={sourceSlug} onChange={(e) => setDraft(e.target.value)} className="text-sm" />
        <Button size="sm" disabled={busy || clean === current} onClick={() => onSave(clean)}>Save</Button>
      </div>
    </div>
  );
}
