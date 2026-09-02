import { useMemo, useState } from 'react';
import { Languages, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useUiTextSettings, useUpdateUiTextSettings, useSiteLanguages } from '@/hooks/useSiteSettings';
import catalogue from '@/data/ui-text-catalog.json';

type Layer = Record<string, string>;
type Pack = Record<string, string | Record<string, string>>;

const OVERLAY = '@';
const BASE = '__base__';

const GROUP_LABELS: Record<string, string> = {
  blog: 'Blog', booking: 'Booking', chat: 'Chat', comments: 'Comments',
  common: 'Common', faq: 'FAQ', footer: 'Footer', kb: 'Knowledge base',
  language: 'Language', nav: 'Navigation', page: 'Pages', pagination: 'Pagination',
  shop: 'Shop',
};

/**
 * Editor for the strings around block content — buttons, empty states, "Back
 * to homepage" — the text a page editor cannot reach.
 *
 * The key list comes from src/data/ui-text-catalog.json, generated from the
 * call sites in the code. That is the whole point: `site_settings.ui_text`
 * only holds what someone has ALREADY translated, so an editor built on the
 * stored map can never show the keys nobody has touched — which are exactly
 * the ones still showing English on a Swedish site.
 *
 * One layer is edited at a time, because that is how translating actually
 * happens. Saving MERGES: every other layer, and every key not in the
 * catalogue, is carried through untouched.
 */
export function VisitorTextSettings() {
  const { data: pack } = useUiTextSettings();
  const updatePack = useUpdateUiTextSettings();

  const [layer, setLayer] = useState<string>(BASE);
  const [draft, setDraft] = useState<Layer | null>(null);
  const [newLocale, setNewLocale] = useState('');

  // The DECLARED site language names the base layer — not platform_locale,
  // which is a FORMAT setting and was missing on nordbrygg (the same
  // dual-truth bug that inverted the visitor side in #430).
  const { defaultLanguage: siteLang } = useSiteLanguages();
  const stored: Pack = useMemo(() => (pack ?? {}) as Pack, [pack]);

  const existingLocales = useMemo(
    () => Object.keys(stored).filter((k) => k.startsWith(OVERLAY)).map((k) => k.slice(1)).sort(),
    [stored],
  );

  /** What is stored in the layer being edited, before any local edits. */
  const layerValues: Layer = useMemo(() => {
    if (layer === BASE) {
      return Object.fromEntries(
        Object.entries(stored).filter(([k, v]) => !k.startsWith(OVERLAY) && typeof v === 'string'),
      ) as Layer;
    }
    const overlay = stored[OVERLAY + layer];
    return (overlay && typeof overlay === 'object' ? overlay : {}) as Layer;
  }, [stored, layer]);

  const values = draft ?? layerValues;
  const dirty = draft !== null;

  const baseValues: Layer = useMemo(
    () => Object.fromEntries(
      Object.entries(stored).filter(([k, v]) => !k.startsWith(OVERLAY) && typeof v === 'string'),
    ) as Layer,
    [stored],
  );

  const groups = useMemo(() => {
    const out = new Map<string, Array<{ key: string; fallback: string }>>();
    for (const entry of catalogue.keys) {
      if (!out.has(entry.group)) out.set(entry.group, []);
      out.get(entry.group)!.push({ key: entry.key, fallback: entry.fallback });
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, []);

  const translated = catalogue.keys.filter((k) => (values[k.key] ?? '').trim()).length;

  const setValue = (key: string, value: string) =>
    setDraft({ ...(draft ?? layerValues), [key]: value });

  const save = async () => {
    if (!draft) return;
    // An empty box means "not translated", which the resolver already answers
    // by falling through. Storing "" would only be noise that looks like data.
    const cleaned = Object.fromEntries(
      Object.entries(draft).filter(([, v]) => (v ?? '').trim() !== ''),
    ) as Layer;

    let next: Pack;
    if (layer === BASE) {
      // Keep every overlay, and any base key the catalogue does not know about
      // — this editor owns the catalogue's keys, not the whole pack.
      const overlays = Object.fromEntries(Object.entries(stored).filter(([k]) => k.startsWith(OVERLAY)));
      const unknown = Object.fromEntries(
        Object.entries(stored).filter(
          ([k, v]) => !k.startsWith(OVERLAY) && typeof v === 'string' && !(k in draft),
        ),
      );
      next = { ...unknown, ...cleaned, ...overlays };
    } else {
      next = { ...stored, [OVERLAY + layer]: cleaned };
      if (Object.keys(cleaned).length === 0) delete next[OVERLAY + layer];
    }
    await updatePack.mutateAsync(next);
    setDraft(null);
  };

  const addLocale = () => {
    const tag = newLocale.trim().toLowerCase();
    if (!tag || !/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(tag)) return;
    setNewLocale('');
    setLayer(tag);
    setDraft({});
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Visitor text
        </CardTitle>
        <CardDescription>
          The strings around your page content — buttons, empty states, search placeholders.
          Anything left blank shows the English written into the product, so a partial
          translation is safe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="ui-text-layer">Editing</Label>
            <Select value={layer} onValueChange={(v) => { setLayer(v); setDraft(null); }}>
              <SelectTrigger id="ui-text-layer" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BASE}>Site language ({siteLang})</SelectItem>
                {existingLocales.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ui-text-new-locale">Add a language</Label>
            <div className="flex gap-2">
              <Input
                id="ui-text-new-locale"
                value={newLocale}
                onChange={(e) => setNewLocale(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLocale(); } }}
                placeholder="en, de, en-GB"
                className="w-32"
              />
              <Button type="button" variant="outline" onClick={addLocale} disabled={!newLocale.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Badge variant="secondary">{translated} of {catalogue.keys.length} filled in</Badge>
            {dirty && (
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Discard
              </Button>
            )}
            <Button type="button" onClick={save} disabled={!dirty || updatePack.isPending}>
              {updatePack.isPending ? 'Saving…' : 'Save visitor text'}
            </Button>
          </div>
        </div>

        {layer !== BASE && (
          <p className="text-sm text-muted-foreground">
            Shown to visitors reading a page in <strong>{layer}</strong>. A blank box falls back to
            the English in the product — never to your {siteLang} text, so an untranslated string
            never appears in the wrong language.
          </p>
        )}

        <div className="space-y-8">
          {groups.map(([group, entries]) => (
            <div key={group} className="space-y-4">
              <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                {GROUP_LABELS[group] ?? group}
              </h3>
              <div className="space-y-4">
                {entries.map(({ key, fallback }) => (
                  <div key={key} className="grid gap-1.5 md:grid-cols-[16rem_1fr] md:items-start md:gap-4">
                    <div className="space-y-0.5">
                      <Label htmlFor={`ui-${key}`} className="font-mono text-xs">{key}</Label>
                      <p className="text-xs text-muted-foreground">{fallback}</p>
                    </div>
                    <div className="space-y-1">
                      <Input
                        id={`ui-${key}`}
                        value={values[key] ?? ''}
                        placeholder={fallback}
                        onChange={(e) => setValue(key, e.target.value)}
                      />
                      {layer !== BASE && baseValues[key] && (
                        <p className="text-xs text-muted-foreground">
                          {siteLang}: {baseValues[key]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
