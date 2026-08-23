import { useState, useEffect } from 'react';
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
  const text: BannerText = { ...defaultText, ...(settings.text ?? {}) };

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
        'fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 bg-card border-t shadow-lg animate-fade-in'
      )}
      role="dialog"
      aria-label="Cookie consent"
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
              label={settings.categories.essential.label}
              description={settings.categories.essential.description}
              checked={true}
              disabled
              onChange={() => {}}
            />
            <CategoryRow
              id="analytics"
              label={settings.categories.analytics.label}
              description={settings.categories.analytics.description}
              checked={analytics}
              onChange={setAnalytics}
            />
            <CategoryRow
              id="marketing"
              label={settings.categories.marketing.label}
              description={settings.categories.marketing.description}
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
