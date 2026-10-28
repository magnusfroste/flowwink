import { Input } from '@/components/ui/input';
import { useSiteLanguages } from '@/hooks/useSiteSettings';

/**
 * A short operator label in the site's OTHER languages — a menu link, the
 * header button, a footer link. A label is not a document, so its versions ride
 * on it as `labels: { en: "Contact" }` (language.md) and the public side reads
 * them through `localizedLabel` (src/lib/operator-text.ts). Renders nothing on a
 * one-language site.
 */
export function TranslatedLabels({
  value,
  onChange,
  placeholder,
}: {
  value: Record<string, string> | undefined;
  onChange: (next: Record<string, string> | undefined) => void;
  placeholder?: string;
}) {
  const { languages, defaultLanguage, isMultilingual } = useSiteLanguages();
  if (!isMultilingual) return null;
  const others = languages.filter((l) => l.split('-')[0] !== defaultLanguage.split('-')[0]);
  if (others.length === 0) return null;
  const set = (lang: string, text: string) => {
    const next = { ...(value ?? {}) };
    if (text.trim()) next[lang] = text;
    else delete next[lang];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {others.map((lang) => (
        <div key={lang} className="flex items-center gap-1.5 min-w-[160px] flex-1">
          <span className="text-[10px] font-medium uppercase text-muted-foreground w-6 shrink-0">{lang}</span>
          <Input
            className="h-8 text-sm"
            value={value?.[lang] ?? ''}
            placeholder={placeholder}
            aria-label={`Label in ${lang.toUpperCase()}`}
            onChange={(e) => set(lang, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
