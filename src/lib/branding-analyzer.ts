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
    link?: string; // Firecrawl also returns link color
  };
  fonts?: Array<{ family: string; count?: number }>;
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

// Convert color string to HSL format
// Handles HEX (#fff, #ffffff), rgb(), rgba(), and hsl() formats
export function hexToHsl(color: string): string {
  if (!color || typeof color !== 'string') return '220 100% 26%';
  
  const trimmed = color.trim();
  
  // Already HSL format? Extract values
  const hslMatch = trimmed.match(/hsl\(\s*(\d+)\s*,?\s*([\d.]+)%?\s*,?\s*([\d.]+)%?\s*\)/i);
  if (hslMatch) {
    return `${Math.round(parseFloat(hslMatch[1]))} ${Math.round(parseFloat(hslMatch[2]))}% ${Math.round(parseFloat(hslMatch[3]))}%`;
  }
  
  // RGB/RGBA format
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return rgbToHsl(r, g, b);
  }
  
  // HEX format (3 or 6 digits)
  let hex = trimmed.replace('#', '');
  
  // Expand shorthand (#fff -> #ffffff)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    console.warn('Could not parse color:', color);
    return '220 100% 26%'; // Default blue
  }
  
  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;
  
  return rgbToHsl(r, g, b);
}

// Helper: Convert RGB (0-1 range) to HSL string
function rgbToHsl(r: number, g: number, b: number): string {
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
    backgroundColor?: string;
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
  
  // Debug log to help troubleshoot
  console.log('Firecrawl colors received:', colors);
  
  // Intelligent color extraction with fallbacks
  // Firecrawl often misidentifies the primary color. We use textPrimary/accent as a better signal
  // for the "main" brand color since it's usually the dominant color used for text/headings.
  
  // Primary: Prefer textPrimary or accent (often the dominant dark brand color), fall back to primary
  // This fixes cases where Firecrawl picks a highlight color as "primary"
  const primaryColor = colors.textPrimary || colors.accent || colors.primary;
  
  // Secondary: Use Firecrawl's "primary" as secondary since it's often the accent/highlight color
  const secondaryColor = colors.secondary || colors.primary;
  
  // Accent: Use what Firecrawl calls "primary" or "link" as accent since it's usually the highlight
  const accentColor = colors.primary || colors.link || colors.accent;
  
  // Extract raw values for display
  const extracted = {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor: colors.background,
    headingFont: typography.fontFamilies?.heading || typography.fontFamilies?.primary || fonts[0]?.family,
    bodyFont: typography.fontFamilies?.primary || fonts[1]?.family || fonts[0]?.family,
    logo: images.logo || branding.logo,
    favicon: images.favicon,
    borderRadius: spacing.borderRadius,
  };
  
  console.log('Extracted branding:', extracted);
  
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
  
  console.log('Mapped branding settings:', mapped);
  
  return { extracted, mapped };
}
