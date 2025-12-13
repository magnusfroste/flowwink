import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type CookieConsent = 'accepted' | 'rejected' | 'pending';

const COOKIE_CONSENT_KEY = 'cookie-consent';

export function CookieBanner() {
  const [consent, setConsent] = useState<CookieConsent>('pending');
  const [isVisible, setIsVisible] = useState(false);

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
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'rejected');
    setConsent('rejected');
    setIsVisible(false);
  };

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
      aria-label="Cookie-samtycke"
    >
      <div className="container mx-auto max-w-4xl">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex-1 space-y-2">
            <h3 className="font-serif font-semibold text-lg">Vi använder cookies</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vi använder cookies för att förbättra din upplevelse på webbplatsen, analysera trafik 
              och anpassa innehåll. Genom att klicka på "Acceptera alla" samtycker du till vår 
              användning av cookies. Du kan också välja att avvisa icke-nödvändiga cookies.
            </p>
            <a 
              href="/integritetspolicy" 
              className="text-sm text-primary hover:underline inline-block"
            >
              Läs mer om vår integritetspolicy
            </a>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <Button
              variant="outline"
              onClick={handleReject}
              className="w-full sm:w-auto"
            >
              Endast nödvändiga
            </Button>
            <Button
              onClick={handleAccept}
              className="w-full sm:w-auto"
            >
              Acceptera alla
            </Button>
          </div>
          
          <button
            onClick={handleReject}
            className="absolute top-4 right-4 md:relative md:top-0 md:right-0 p-2 rounded-md hover:bg-muted transition-colors"
            aria-label="Stäng"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook to check cookie consent status
export function useCookieConsent() {
  const [consent, setConsent] = useState<CookieConsent>('pending');

  useEffect(() => {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (stored === 'accepted' || stored === 'rejected') {
      setConsent(stored);
    }
  }, []);

  return consent;
}
