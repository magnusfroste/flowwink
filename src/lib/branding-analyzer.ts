import { AVAILABLE_HEADING_FONTS, AVAILABLE_BODY_FONTS } from '@/providers/BrandingProvider';
import type { BrandingSettings } from '@/hooks/useSiteSettings';

// Firecrawl branding response types
interface FirecrawlBranding {
  colorScheme?: 'light' | 'dark';
  logo?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
    textSecondary?: string;
  };
  fonts?: Array<{ family: string }>;
  typography?: {
    fontFamilies?: {
      primary?: string;
      heading?: string;
      code?: string;
    };
    fontSizes?: Record<string, string>;
    fontWeights?: Record<string, number>;
  };
  spacing?: {
    baseUnit?: number;
    borderRadius?: string;
  };
  images?: {
    logo?: string;
    favicon?: string;
    ogImage?: string;
  };
}

// Convert HEX to HSL string
export function hexToHsl(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '220 100% 26%';
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Find closest matching font from available fonts
function findClosestFont(fontName: string | undefined, availableFonts: readonly string[]): string {
  if (!fontName) return availableFonts[0];
  
  const normalizedName = fontName.toLowerCase().replace(/['"]/g, '').trim();
  
  // Direct match
  const directMatch = availableFonts.find(f => 
    f.toLowerCase() === normalizedName
  );
  if (directMatch) return directMatch;
  
  // Partial match
  const partialMatch = availableFonts.find(f => 
    f.toLowerCase().includes(normalizedName) || 
    normalizedName.includes(f.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  // Category-based fallback
  const isSerif = /serif|times|georgia|garamond|baskerville|playfair|merriweather/i.test(normalizedName);
  const isMono = /mono|code|consolas|courier/i.test(normalizedName);
  
  if (isSerif) {
    return availableFonts.find(f => /serif|times|georgia|baskerville|merriweather/i.test(f)) || availableFonts[0];
  }
  if (isMono) {
    return availableFonts.find(f => /mono/i.test(f)) || availableFonts[0];
  }
  
  // Default to first sans-serif option
  return availableFonts.find(f => /inter|roboto|open|source|lato/i.test(f)) || availableFonts[0];
}

// Determine border radius from extracted value
function determineBorderRadius(borderRadius?: string): BrandingSettings['borderRadius'] {
  if (!borderRadius) return 'md';
  
  const value = parseInt(borderRadius);
  if (isNaN(value) || value === 0) return 'none';
  if (value <= 4) return 'sm';
  if (value <= 8) return 'md';
  return 'lg';
}

// Determine shadow intensity based on color scheme
function determineShadowIntensity(colorScheme?: string): BrandingSettings['shadowIntensity'] {
  // Dark themes typically use less shadow
  if (colorScheme === 'dark') return 'none';
  return 'subtle';
}

export interface AnalyzedBranding {
  extracted: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    headingFont?: string;
    bodyFont?: string;
    logo?: string;
    favicon?: string;
    borderRadius?: string;
  };
  mapped: Partial<BrandingSettings>;
}

export function analyzeBranding(branding: FirecrawlBranding): AnalyzedBranding {
  const colors = branding.colors || {};
  const typography = branding.typography || {};
  const fonts = branding.fonts || [];
  const images = branding.images || {};
  const spacing = branding.spacing || {};
  
  // Extract raw values
  const extracted = {
    primaryColor: colors.primary,
    secondaryColor: colors.secondary || colors.background,
    accentColor: colors.accent,
    headingFont: typography.fontFamilies?.heading || typography.fontFamilies?.primary || fonts[0]?.family,
    bodyFont: typography.fontFamilies?.primary || fonts[1]?.family || fonts[0]?.family,
    logo: images.logo || branding.logo,
    favicon: images.favicon,
    borderRadius: spacing.borderRadius,
  };
  
  // Map to our BrandingSettings format
  const mapped: Partial<BrandingSettings> = {
    primaryColor: extracted.primaryColor ? hexToHsl(extracted.primaryColor) : undefined,
    secondaryColor: extracted.secondaryColor ? hexToHsl(extracted.secondaryColor) : undefined,
    accentColor: extracted.accentColor ? hexToHsl(extracted.accentColor) : undefined,
    headingFont: findClosestFont(extracted.headingFont, AVAILABLE_HEADING_FONTS),
    bodyFont: findClosestFont(extracted.bodyFont, AVAILABLE_BODY_FONTS),
    logo: extracted.logo,
    favicon: extracted.favicon,
    borderRadius: determineBorderRadius(extracted.borderRadius),
    shadowIntensity: determineShadowIntensity(branding.colorScheme),
  };
  
  // Remove undefined values
  Object.keys(mapped).forEach(key => {
    if (mapped[key as keyof typeof mapped] === undefined) {
      delete mapped[key as keyof typeof mapped];
    }
  });
  
  return { extracted, mapped };
}
