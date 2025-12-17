import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { supabase } from '@/integrations/supabase/client';
import type { BrandingSettings } from '@/hooks/useSiteSettings';

interface BrandingContextValue {
  branding: BrandingSettings | null;
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
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

function loadGoogleFont(fontName: string) {
  const fontParam = GOOGLE_FONTS_MAP[fontName];
  if (!fontParam) return;
  
  const existingLink = document.querySelector(`link[data-font="${fontName}"]`);
  if (existingLink) return;
  
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontParam}&display=swap`;
  link.setAttribute('data-font', fontName);
  document.head.appendChild(link);
}

function applyBrandingToDocument(branding: BrandingSettings) {
  const root = document.documentElement;
  
  // Apply colors
  if (branding.primaryColor) {
    root.style.setProperty('--primary', branding.primaryColor);
  }
  if (branding.secondaryColor) {
    root.style.setProperty('--secondary', branding.secondaryColor);
  }
  if (branding.accentColor) {
    root.style.setProperty('--accent', branding.accentColor);
  }
  
  // Apply fonts
  if (branding.headingFont) {
    loadGoogleFont(branding.headingFont);
    root.style.setProperty('--font-serif', `'${branding.headingFont}', Georgia, serif`);
  }
  if (branding.bodyFont) {
    loadGoogleFont(branding.bodyFont);
    root.style.setProperty('--font-sans', `'${branding.bodyFont}', system-ui, sans-serif`);
  }
  
  // Apply border radius
  const radiusMap: Record<string, string> = {
    none: '0',
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
  };
  if (branding.borderRadius) {
    root.style.setProperty('--radius', radiusMap[branding.borderRadius] || '0.5rem');
  }
  
  // Apply favicon
  if (branding.favicon) {
    const existingFavicon = document.querySelector('link[rel="icon"]');
    if (existingFavicon) {
      existingFavicon.setAttribute('href', branding.favicon);
    } else {
      const favicon = document.createElement('link');
      favicon.rel = 'icon';
      favicon.href = branding.favicon;
      document.head.appendChild(favicon);
    }
  }
}

interface BrandingProviderProps {
  children: ReactNode;
}

export function BrandingProvider({ children }: BrandingProviderProps) {
  const { setTheme } = useTheme();
  
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
    if (branding) {
      applyBrandingToDocument(branding);
      
      // Force theme when toggle is disabled
      if (branding.allowThemeToggle === false && branding.defaultTheme) {
        setTheme(branding.defaultTheme);
      }
    }
  }, [branding, setTheme]);

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
