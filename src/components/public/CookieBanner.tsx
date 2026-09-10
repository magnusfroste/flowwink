import { useState, useEffect } from 'react';
import { useUiText, useUiTextLanguage } from '@/lib/ui-text';
import { operatorText } from '@/lib/operator-text';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getConsent, setConsent, acceptAll, rejectAll } from '@/lib/visitor-consent';
import {
  bannerIsEnabled,
  useCookieConsentSettings,
  type CookieConsentBannerText,
  type CookieConsentV2Settings,
} from '@/hooks/useVisitorConsent';

/**
 * Banner copy. The category labels were configurable from the start while the
 * title, body and buttons were hardcoded English — so a Swedish site whose
 * whole pitch is GDPR greeted visitors with "We use cookies". Text is data: an
 * operator (or an agent over the gateway) can translate the banner without a
 * code change. Every field is optional and falls back to the English below.
 *
 * The settings shape and the query itself live in `useVisitorConsent` — the
 * banner and the measurement gate read the same row through the same key, so
 * "is the banner on?" has exactly one answer and costs one request.
 */
type BannerText = CookieConsentBannerText;

const defaultText: BannerText = {
  title: 'We use cookies',
  description:
    'We use cookies for essential site functions, anonymous analytics, and — when you allow it — ' +
    'to help our sales team understand your interests. You choose what to allow.',
  customize: 'Customize',
  acceptAll: 'Accept all',
  essentialOnly: 'Essential only',
  preferencesTitle: 'Cookie preferences',
  back: 'Back',
  saveSelection: 'Save selection',
};

const defaults: CookieConsentV2Settings = {
  enabled: true,
  categories: {
    essential: { label: 'Essential', description: 'Required for the site to work.', required: true },
    analytics: { label: 'Analytics', description: 'Anonymous measurement of page visits.', required: false },
    marketing: { label: 'Marketing', description: 'Personalization and signals for the sales team.', required: false },
  },
};

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  const { settings: stored } = useCookieConsentSettings();

  const settings = stored ?? defaults;

  // Bannern renderas på VARJE sida, även de engelska — och operatörens text är
  // ett enda värde. Optics engelska sidor mötte alltså besökaren med en svensk
  // cookie-ruta, innan hen ens valt språk. Samma precedens som bloggänken:
  // operatörens ord gäller sajtens eget språk, packet svarar för de andra, och
  // koden bär engelskan längst ned.
  const t = useUiText();
  const { lang, siteLang } = useUiTextLanguage();
  // Raden läses rå (ingen merge med defaults), så ingen koddefault kan nå `own`.
  const own = settings.text ?? {};

  // t() anropas med LITERALER, inte genom en hjälpare — katalog-generatorn
  // läser anropsplatserna, så en nyckel bakom en variabel blir osynlig i
  // besökartext-editorn. Det gick jag på en gång redan med bloggänken.
  const text: BannerText = {
    title: operatorText(own.title, t('cookie.title', 'We use cookies'), lang, siteLang, null),
    description: operatorText(own.description, t('cookie.description', 'We use cookies for essential site functions, anonymous analytics, and — when you allow it — to help our sales team understand your interests. You choose what to allow.'), lang, siteLang, null),
    customize: operatorText(own.customize, t('cookie.customize', 'Customize'), lang, siteLang, null),
    acceptAll: operatorText(own.acceptAll, t('cookie.acceptAll', 'Accept all'), lang, siteLang, null),
    essentialOnly: operatorText(own.essentialOnly, t('cookie.essentialOnly', 'Essential only'), lang, siteLang, null),
    preferencesTitle: operatorText(own.preferencesTitle, t('cookie.preferencesTitle', 'Cookie preferences'), lang, siteLang, null),
    back: operatorText(own.back, t('cookie.back', 'Back'), lang, siteLang, null),
    saveSelection: operatorText(own.saveSelection, t('cookie.saveSelection', 'Save selection'), lang, siteLang, null),
  };

  /* Kategorierna är operatörsägda sedan starten och var de ENDA strängarna i
     filen som inte gick genom regeln — tio rader under de åtta som gör det.
     Raden läses rå, men `defaults` fyller i när den saknas helt, så kodens
     engelska måste räknas som frånvarande (samma klass som #513). */
  const cat = (
    own: string, packText: string, codeDefault: string,
  ) => operatorText(own, packText, lang, siteLang, codeDefault);
  const categoryText = {
    essential: {
      label: cat(settings.categories.essential.label, t('cookie.cat.essential', 'Essential'), defaults.categories.essential.label),
      description: cat(settings.categories.essential.description, t('cookie.cat.essentialDesc', 'Required for the site to work.'), defaults.categories.essential.description),
    },
    analytics: {
      label: cat(settings.categories.analytics.label, t('cookie.cat.analytics', 'Analytics'), defaults.categories.analytics.label),
      description: cat(settings.categories.analytics.description, t('cookie.cat.analyticsDesc', 'Anonymous measurement of page visits.'), defaults.categories.analytics.description),
    },
    marketing: {
      label: cat(settings.categories.marketing.label, t('cookie.cat.marketing', 'Marketing'), defaults.categories.marketing.label),
      description: cat(settings.categories.marketing.description, t('cookie.cat.marketingDesc', 'Personalization and signals for the sales team.'), defaults.categories.marketing.description),
    },
  };

  useEffect(() => {
    if (getConsent()) return; // already decided
    const t = setTimeout(() => setIsVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  // The same predicate the measurement gate uses. If this renders nothing,
  // nothing can ever be collected — and then measurement must not wait for it.
  if (!bannerIsEnabled(stored) || !isVisible) return null;

  const handleAcceptAll = () => { acceptAll(); setIsVisible(false); };
  const handleReject = () => { rejectAll(); setIsVisible(false); };
  const handleSave = () => { setConsent({ analytics, marketing }); setIsVisible(false); };

  return (
    <div
      className={cn(
        /* z-40, INTE z-50: allt annat fixerat på den publika ytan ligger på
           z-50 — headern, mobilmenyns paneler, chattwidgeten, popup-blocken —
           så ordningen avgjordes av DOM-ordning, och bannern renderas sist.
           På en telefon lade den sig därför över den meny besökaren just
           öppnat: halva menyn gick inte att nå förrän man svarat på kakrutan.
           En panel besökaren själv öppnat ska ligga överst. Bannern syns
           fortfarande — den ligger kvar över sidans innehåll. */
        'fixed bottom-0 left-0 right-0 z-40 p-4 md:p-6 bg-card border-t shadow-lg animate-fade-in'
      )}
      role="dialog"
      aria-label={t('cookie.consentLabel', 'Cookie consent')}
    >
      <div className="container mx-auto max-w-4xl">
        {!showDetails ? (
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1 space-y-2">
              <h3 className="font-serif font-semibold text-lg">{text.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {text.description}
              </p>
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <Settings2 className="h-3.5 w-3.5" /> {text.customize}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
              <Button variant="outline" onClick={handleReject} className="w-full sm:w-auto">
                {text.essentialOnly}
              </Button>
              <Button onClick={handleAcceptAll} className="w-full sm:w-auto">
                {text.acceptAll}
              </Button>
            </div>
            <button
              onClick={handleReject}
              className="absolute top-4 right-4 md:relative md:top-0 md:right-0 p-2 rounded-md hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-semibold text-lg">{text.preferencesTitle}</h3>
              <button onClick={() => setShowDetails(false)} className="text-sm text-muted-foreground hover:text-foreground">
                {text.back}
              </button>
            </div>

            <CategoryRow
              id="essential"
              label={categoryText.essential.label}
              description={categoryText.essential.description}
              checked={true}
              disabled
              onChange={() => {}}
            />
            <CategoryRow
              id="analytics"
              label={categoryText.analytics.label}
              description={categoryText.analytics.description}
              checked={analytics}
              onChange={setAnalytics}
            />
            <CategoryRow
              id="marketing"
              label={categoryText.marketing.label}
              description={categoryText.marketing.description}
              checked={marketing}
              onChange={setMarketing}
            />

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <Button variant="outline" onClick={handleReject} className="w-full sm:w-auto">
                {text.essentialOnly}
              </Button>
              <Button variant="outline" onClick={handleSave} className="w-full sm:w-auto">
                {text.saveSelection}
              </Button>
              <Button onClick={handleAcceptAll} className="w-full sm:w-auto sm:ml-auto">
                {text.acceptAll}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  id, label, description, checked, disabled, onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4 py-2">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="font-medium">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Legacy hook — kept so callers still work. Returns 'accepted' if any non-essential category is on. */
export function useCookieConsent() {
  const [status, setStatus] = useState<'accepted' | 'rejected' | 'pending'>('pending');
  useEffect(() => {
    const read = () => {
      const c = getConsent();
      if (!c) return setStatus('pending');
      setStatus(c.analytics || c.marketing ? 'accepted' : 'rejected');
    };
    read();
    const onChange = () => read();
    window.addEventListener('cookie-consent-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('cookie-consent-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return status;
}
