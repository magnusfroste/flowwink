import { logger } from '@/lib/logger';
import { useEffect, useRef } from 'react';

interface PageViewData {
  pageId?: string;
  pageSlug: string;
  pageTitle?: string;
}

// Generate or retrieve a persistent visitor ID
function getVisitorId(): string {
  const key = 'pez_visitor_id';
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

// Generate a session ID (persists for the browser session)
function getSessionId(): string {
  const key = 'pez_session_id';
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

// Detect device type from user agent
function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Detect browser from user agent
function getBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  return 'Other';
}

export function usePageViewTracker({ pageId, pageSlug, pageTitle }: PageViewData) {
  const tracked = useRef(false);

  useEffect(() => {
    // Only track once per component mount
    if (tracked.current) return;
    
    // Don't track in development or for authenticated admin users
    const isAdmin = window.location.pathname.startsWith('/admin');
    const isPreview = window.location.pathname.startsWith('/preview');
    
    if (isAdmin || isPreview) return;

    const trackPageView = async () => {
      try {
        tracked.current = true;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        
        await fetch(`${supabaseUrl}/functions/v1/track-page-view`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pageId: pageId || null,
            pageSlug: pageSlug,
            pageTitle: pageTitle || null,
            visitorId: getVisitorId(),
            sessionId: getSessionId(),
            referrer: document.referrer || null,
            userAgent: navigator.userAgent,
            deviceType: getDeviceType(),
            browser: getBrowser(),
          }),
        });
      } catch (error) {
        // Silently fail - don't disrupt user experience
        logger.error('Failed to track page view:', error);
      }
    };

    trackPageView();
  }, [pageId, pageSlug, pageTitle]);
}
