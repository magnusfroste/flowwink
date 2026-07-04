import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { X, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getConsent, setConsent, acceptAll, rejectAll } from '@/lib/visitor-consent';

interface ConsentCategoryConfig {
  label: string;
  description: string;
  required?: boolean;
}

interface CookieConsentV2Settings {
  enabled: boolean;
  categories: {
    essential: ConsentCategoryConfig;
    analytics: ConsentCategoryConfig;
    marketing: ConsentCategoryConfig;
  };
}

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

  const { data } = useQuery({
    queryKey: ['site-settings', 'cookie_consent_v2'],
    queryFn: async () => {
      const { data } = await supabase
        .from('site_settings').select('value').eq('key', 'cookie_consent_v2').maybeSingle();
      return (data?.value as unknown as CookieConsentV2Settings) || defaults;
    },
    staleTime: 5 * 60 * 1000,
  });

  const settings = data ?? defaults;

  useEffect(() => {
    if (getConsent()) return; // already decided
    const t = setTimeout(() => setIsVisible(true), 500);
    return () => clearTimeout(t);
  }, []);

  if (!settings.enabled || !isVisible) return null;

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
              <h3 className="font-serif font-semibold text-lg">We use cookies</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                We use cookies for essential site functions, anonymous analytics, and — when you allow it —
                to help our sales team understand your interests. You choose what to allow.
              </p>
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <Settings2 className="h-3.5 w-3.5" /> Customize
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
              <Button variant="outline" onClick={handleReject} className="w-full sm:w-auto">
                Essential only
              </Button>
              <Button onClick={handleAcceptAll} className="w-full sm:w-auto">
                Accept all
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
              <h3 className="font-serif font-semibold text-lg">Cookie preferences</h3>
              <button onClick={() => setShowDetails(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Back
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
                Essential only
              </Button>
              <Button variant="outline" onClick={handleSave} className="w-full sm:w-auto">
                Save selection
              </Button>
              <Button onClick={handleAcceptAll} className="w-full sm:w-auto sm:ml-auto">
                Accept all
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
