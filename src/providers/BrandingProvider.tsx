import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import type { BrandingSettings } from '@/hooks/useSiteSettings';

interface BrandingContextValue {
  branding: BrandingSettings | null;
  isLoading: boolean;
}

export const BrandingContext = createContext<BrandingContextValue>({
  branding: null,
  isLoading: true,
});

const defaultBranding: BrandingSettings = {
  logo: '',
  logoDark: '',
  favicon: '',
  organizationName: '',
  primaryColor: '220 100% 26%',
  secondaryColor: '210 40% 96%',
  accentColor: '199 89% 48%',
  headingFont: 'PT Serif',
  bodyFont: 'Inter',
  borderRadius: 'md',
  shadowIntensity: 'subtle',
};

// Popular Google Fonts that work well for headings and body
const GOOGLE_FONTS_MAP: Record<string, string> = {
  'PT Serif': 'PT+Serif:wght@400;700',
  'Playfair Display': 'Playfair+Display:wght@400;700',
  'Merriweather': 'Merriweather:wght@400;700',
  'Lora': 'Lora:wght@400;700',
  'Libre Baskerville': 'Libre+Baskerville:wght@400;700',
  'Inter': 'Inter:wght@400;500;600;700',
  'Open Sans': 'Open+Sans:wght@400;500;600;700',
  'Roboto': 'Roboto:wght@400;500;700',
  'Source Sans 3': 'Source+Sans+3:wght@400;500;600;700',
  'Lato': 'Lato:wght@400;700',
  'Plus Jakarta Sans': 'Plus+Jakarta+Sans:wght@400;500;600;700',
};

function loadGoogleFont(fontName: string, doc: Document = document) {
  const fontParam = GOOGLE_FONTS_MAP[fontName];
  if (!fontParam) return;

  const existingLink = doc.querySelector(`link[data-font="${fontName}"]`);
  if (existingLink) return;

  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontParam}&display=swap`;
  link.setAttribute('data-font', fontName);
  doc.head.appendChild(link);
}

// Exported so preview surfaces that render into their own document (the page
// editor's device-preview iframe) can brand that document's root — the admin
// parent has these variables deliberately reset.
export function applyBrandingToDocument(branding: BrandingSettings, doc: Document = document) {
  const root = doc.documentElement;
  
  // The document CARRIES its theme (next-themes stamps `dark` on <html>, and
  // PreviewFrame mirrors it into its own root) — so per-theme brand values
  // resolve from the doc we are painting, never from module state. Same rule
  // as useScrollAnimation's ownerDocument resolution.
  const isDark = root.classList.contains('dark');

  // House pattern promoted from secondary (it had this since birth; primary
  // never got it — the adoption class again): a brand surface derives its own
  // text color from its lightness, so black-on-dark-blue cannot be authored.
  const contrastForeground = (hsl: string): string => {
    const lightness = parseFloat(hsl.split(/\s+/)[2] || '50');
    return lightness < 40 ? '0 0% 98%' : '0 0% 9%';
  };

  // Apply colors
  const effectivePrimary = (isDark && branding.primaryColorDark) || branding.primaryColor;
  if (effectivePrimary) {
    root.style.setProperty('--primary', effectivePrimary);
    root.style.setProperty('--primary-foreground', contrastForeground(effectivePrimary));
  }
  if (branding.secondaryColor) {
    root.style.setProperty('--secondary', branding.secondaryColor);
    root.style.setProperty('--secondary-foreground', contrastForeground(branding.secondaryColor));
  }
  if (branding.accentColor) {
    root.style.setProperty('--accent', branding.accentColor);
  }
  
  // Apply fonts
  if (branding.headingFont) {
    loadGoogleFont(branding.headingFont, doc);
    root.style.setProperty('--font-serif', `'${branding.headingFont}', Georgia, serif`);
  }
  if (branding.bodyFont) {
    loadGoogleFont(branding.bodyFont, doc);
    root.style.setProperty('--font-sans', `'${branding.bodyFont}', system-ui, sans-serif`);
  }
  
  // Apply border radius — BOTH scales from the same dial.
  //
  // --radius is the control-level radius (buttons, inputs); --radius-block is
  // the PANEL radius the self-styled blocks draw with (cta, newsletter,
  // pricing-calculator, ai-faq — rounded-[var(--radius-block,1rem)]). Until
  // 2026-08-25 only --radius followed branding, so a customer who chose sharp
  // corners still got 1rem-rounded panels: half the page obeyed the dial.
  // The block scale is deliberately ~2× the control scale — a panel is a
  // bigger shape than a button and reads flat at button radii — and 'none'
  // means none everywhere: sharp is a design choice, not a control-only one.
  const radiusMap: Record<string, string> = {
    none: '0',
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
  };
  const blockRadiusMap: Record<string, string> = {
    none: '0',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
  };
  if (branding.borderRadius) {
    root.style.setProperty('--radius', radiusMap[branding.borderRadius] || '0.5rem');
    root.style.setProperty('--radius-block', blockRadiusMap[branding.borderRadius] || '1rem');
  }
  
  // Apply scroll animation mode (on | eager | off). Read by useScrollAnimation
  // and by global CSS rule that forces animation:none when off.
  const scrollMode = branding.scrollAnimations || 'on';
  root.dataset.scrollAnimations = scrollMode;

  // Apply favicon — only meaningful on the top-level document; a preview
  // iframe has no tab of its own.
  if (branding.favicon && doc === document) {
    const existingFavicon = doc.querySelector('link[rel="icon"]');
    if (existingFavicon) {
      existingFavicon.setAttribute('href', branding.favicon);
    } else {
      const favicon = doc.createElement('link');
      favicon.rel = 'icon';
      favicon.href = branding.favicon;
      doc.head.appendChild(favicon);
    }
  }
}

/**
 * Reset branding CSS variables to their default values defined in index.css.
 * This is used when entering admin routes to ensure consistent admin UI.
 */
function resetBrandingToDefaults() {
  const root = document.documentElement;
  
  // Remove inline styles to let index.css defaults take over
  root.style.removeProperty('--primary');
  root.style.removeProperty('--secondary');
  root.style.removeProperty('--accent');
  root.style.removeProperty('--font-serif');
  root.style.removeProperty('--font-sans');
  root.style.removeProperty('--primary-foreground');
  root.style.removeProperty('--radius');
  root.style.removeProperty('--radius-block');
}

interface BrandingProviderProps {
  children: ReactNode;
}

export function BrandingProvider({ children }: BrandingProviderProps) {
  const { setTheme, resolvedTheme } = useTheme();
  const [pathname, setPathname] = useState(window.location.pathname);
  const themeSetRef = useRef(false);
  
  // Listen to URL changes (for SPA navigation)
  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    
    // Also observe pushState/replaceState for react-router navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      setPathname(window.location.pathname);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      setPathname(window.location.pathname);
    };
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);
  
  // Check if we're on an admin route - don't apply branding colors to admin
  const isAdminRoute = pathname.startsWith('/admin');
  
  const { data: branding, isLoading } = useQuery({
    queryKey: ['site-settings', 'branding'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'branding')
        .maybeSingle();

      if (error) throw error;
      return (data?.value as unknown as BrandingSettings) || defaultBranding;
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (branding && !isAdminRoute) {
      // resolvedTheme i deps: per-tema-primären måste appliceras OM när temat
      // flippar — dokumentklassen är sanningen appliceringen läser.
      applyBrandingToDocument(branding);
      themeSetRef.current = false;
      
      // Theme toggle OFF => the operator's default theme is authoritative: no
      // visitor choice can exist, and a stale localStorage value (e.g. "light"
      // written by an earlier admin session) must not win.
      // Theme toggle ON => only seed the default when the visitor has not made
      // an explicit choice yet, so a refresh doesn't clobber their selection.
      if (branding.defaultTheme) {
        if (branding.allowThemeToggle === false) {
          setTheme(branding.defaultTheme);
        } else {
          let hasExplicitChoice = false;
          try {
            hasExplicitChoice = !!localStorage.getItem('theme');
          } catch {
            // localStorage unavailable (private mode) — fall through to default
          }
          if (!hasExplicitChoice) {
            setTheme(branding.defaultTheme);
          }
        }
      }

    }
    
    // Admin uses the platform default design tokens, not the customer's
    // public-site branding. It still respects the user's theme choice
    // (light/dark/system) so the landing-page toggle carries over.
    if (isAdminRoute && !themeSetRef.current) {
      resetBrandingToDefaults();
      themeSetRef.current = true;
    }
  }, [branding, setTheme, isAdminRoute, resolvedTheme]);

  return (
    <BrandingContext.Provider value={{ branding: branding || null, isLoading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}

export const AVAILABLE_HEADING_FONTS = [
  'PT Serif',
  'Playfair Display',
  'Merriweather',
  'Lora',
  'Libre Baskerville',
];

export const AVAILABLE_BODY_FONTS = [
  'Inter',
  'Open Sans',
  'Roboto',
  'Source Sans 3',
  'Lato',
];
