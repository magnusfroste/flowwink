import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useUiText } from '@/lib/ui-text';

export interface PageTranslation {
  slug: string;
  locale: string;
  title: string;
}

interface LanguageSwitcherProps {
  /** Published sibling pages in this page's translation group, including this one. */
  translations?: PageTranslation[];
  /** The locale of the page currently being shown. */
  currentLocale?: string | null;
  className?: string;
}

/**
 * Lets a visitor move between the published language versions of a page.
 *
 * The translation rail (pages.locale + pages.translation_group_id, the
 * get_page_translations RPC, and PublicPage's ?lang= resolution) has existed
 * since July and was unreachable: nothing in the site ever put ?lang= in the
 * address, so a visitor could not find the other language even when it was
 * published. This is the missing control, not a new mechanism.
 *
 * Two deliberate choices:
 *
 * 1. It renders NOTHING unless this page actually has another published
 *    language. Every live instance is single-language today, so the switcher
 *    must be invisible there — a control that offers no choice is clutter, and
 *    shipping one to five running sites would be a visible regression.
 *
 * 2. The options are real <a> links carrying hrefLang, not router navigation.
 *    A crawler can follow them (the whole point of publishing translations is
 *    that they get indexed), and a full load is the honest behaviour for a
 *    language change: the chrome, the ui_text pack and the formatting all
 *    re-resolve instead of being half-swapped in place.
 */
export function LanguageSwitcher({ translations, currentLocale, className }: LanguageSwitcherProps) {
  const t = useUiText();

  const options = (translations ?? []).filter((x) => x.slug && x.locale);
  if (options.length < 2) return null;

  const current = options.find((x) => x.locale === currentLocale) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors',
          'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        aria-label={t('language.switch', 'Change language')}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="font-medium uppercase">{(current?.locale ?? options[0].locale).slice(0, 2)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {options.map((option) => {
          const isCurrent = option.locale === currentLocale;
          return (
            <DropdownMenuItem key={option.locale} asChild>
              <a
                href={`/${option.slug}`}
                hrefLang={option.locale}
                lang={option.locale}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn('w-full cursor-pointer', isCurrent && 'font-semibold')}
              >
                {languageName(option.locale)}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A language is named in its OWN language — "Svenska", not "Swedish". Someone
 * who cannot read the current page still has to recognise their own.
 * Intl.DisplayNames throws on a malformed tag, so an unknown locale falls back
 * to its uppercased code rather than taking the page down.
 */
function languageName(locale: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale);
    if (!name) return locale.toUpperCase();
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return locale.toUpperCase();
  }
}
