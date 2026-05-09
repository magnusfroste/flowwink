import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CookieBannerSettings } from '@/hooks/useSiteSettings';

type CookieConsent = 'accepted' | 'rejected' | 'pending';

const COOKIE_CONSENT_KEY = 'cookie-consent';

const defaultSettings: CookieBannerSettings = {
  enabled: true,
  title: 'We use cookies',
  description: 'We use cookies to improve your experience on the website, analyze traffic and personalize content. By clicking "Accept all" you consent to our use of cookies.',
  policyLinkText: 'Read more about our privacy policy',
  policyLinkUrl: '/privacy-policy',
  acceptButtonText: 'Accept all',
  rejectButtonText: 'Essential only',
};

export function CookieBanner() {
  const [consent, setConsent] = useState<CookieConsent>('pending');
  const [isVisible, setIsVisible] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['site-settings', 'cookie_banner'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'cookie_banner')
        .maybeSingle();

      if (error) throw error;
      return (data?.value as unknown as CookieBannerSettings) || defaultSettings;
    },
    staleTime: 1000 * 60 * 5,
  });

  const bannerSettings = settings || defaultSettings;

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored === 'accepted' || stored === 'rejected') {
      setConsent(stored);
    } else {
      // Small delay to prevent flash on page load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setConsent('accepted');
    setIsVisible(false);
    window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: 'accepted' }));
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'rejected');
    setConsent('rejected');
    setIsVisible(false);
    window.dispatchEvent(new CustomEvent('cookie-consent-changed', { detail: 'rejected' }));
  };

  // Don't show if disabled in settings
  if (!bannerSettings.enabled) {
    return null;
  }

  if (consent !== 'pending' || !isVisible) {
    return null;
  }

  return (
    <div 
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6',
        'bg-card border-t shadow-lg',
        'animate-fade-in'
      )}
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="container mx-auto max-w-4xl">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1 space-y-2">
            <h3 className="font-serif font-semibold text-lg">{bannerSettings.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {bannerSettings.description}
            </p>
            {bannerSettings.policyLinkUrl && bannerSettings.policyLinkText && (
              <a 
                href={bannerSettings.policyLinkUrl} 
                className="text-sm text-primary hover:underline inline-block"
              >
                {bannerSettings.policyLinkText}
              </a>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <Button
              variant="outline"
              onClick={handleReject}
              className="w-full sm:w-auto"
            >
              {bannerSettings.rejectButtonText}
            </Button>
            <Button
              onClick={handleAccept}
              className="w-full sm:w-auto"
            >
              {bannerSettings.acceptButtonText}
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
      </div>
    </div>
  );
}

// Hook to check cookie consent status (reactive across the app)
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent>('pending');

  useEffect(() => {
    const read = () => {
      const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
      setConsent(stored === 'accepted' || stored === 'rejected' ? stored : 'pending');
    };
    read();
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === 'accepted' || detail === 'rejected') setConsent(detail);
      else read();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === COOKIE_CONSENT_KEY) read();
    };
    window.addEventListener('cookie-consent-changed', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('cookie-consent-changed', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return consent;
}
