/**
 * Shared Branding Extractor — Deno-compatible
 * 
 * Single source of truth for extracting and normalizing branding data
 * from Firecrawl's `branding` format into FlowWink design tokens.
 * 
 * Consumers:
 * - migrate-page: injects branding hints into AI prompt for block styling
 * - analyze-brand: returns normalized branding for Brand Guide Assistant
 * - copilot-action: future use for style-aware block creation
 */

export interface FirecrawlBranding {
  colorScheme?: 'light' | 'dark';
  logo?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
    textSecondary?: string;
    link?: string;
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
  components?: {
    buttonPrimary?: { background?: string; textColor?: string; borderRadius?: string };
    buttonSecondary?: { background?: string; textColor?: string; borderRadius?: string };
  };
  images?: {
    logo?: string;
    favicon?: string;
    ogImage?: string;
  };
}

export interface ExtractedBranding {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  logo?: string;
  favicon?: string;
  borderRadius?: string;
  colorScheme?: 'light' | 'dark';
  buttonStyle?: { background?: string; textColor?: string; borderRadius?: string };
}

/**
 * Extract and normalize branding from Firecrawl response.
 * Returns clean, structured branding data.
 */
export function extractBranding(branding: FirecrawlBranding): ExtractedBranding {
  const colors = branding.colors || {};
  const typography = branding.typography || {};
  const fonts = branding.fonts || [];
  const images = branding.images || {};
  const spacing = branding.spacing || {};
  const components = branding.components || {};

  return {
    primaryColor: colors.primary || colors.textPrimary,
    secondaryColor: colors.secondary,
    accentColor: colors.accent || colors.link,
    backgroundColor: colors.background,
    textColor: colors.textPrimary,
    headingFont: typography.fontFamilies?.heading || typography.fontFamilies?.primary || fonts[0]?.family,
    bodyFont: typography.fontFamilies?.primary || fonts[1]?.family || fonts[0]?.family,
    logo: images.logo || branding.logo,
    favicon: images.favicon,
    borderRadius: spacing.borderRadius,
    colorScheme: branding.colorScheme,
    buttonStyle: components.buttonPrimary,
  };
}

/**
 * Generate a concise branding hint string for AI prompts.
 * Used by migrate-page to help AI set correct colors/fonts in blocks.
 */
export function generateBrandingHints(branding: FirecrawlBranding): string {
  const extracted = extractBranding(branding);
  const hints: string[] = [];

  if (extracted.primaryColor) hints.push(`Primary color: ${extracted.primaryColor}`);
  if (extracted.secondaryColor) hints.push(`Secondary color: ${extracted.secondaryColor}`);
  if (extracted.accentColor) hints.push(`Accent color: ${extracted.accentColor}`);
  if (extracted.backgroundColor) hints.push(`Background: ${extracted.backgroundColor}`);
  if (extracted.textColor) hints.push(`Text color: ${extracted.textColor}`);
  if (extracted.headingFont) hints.push(`Heading font: ${extracted.headingFont}`);
  if (extracted.bodyFont) hints.push(`Body font: ${extracted.bodyFont}`);
  if (extracted.colorScheme) hints.push(`Color scheme: ${extracted.colorScheme}`);
  if (extracted.borderRadius) hints.push(`Border radius: ${extracted.borderRadius}`);
  if (extracted.buttonStyle?.background) hints.push(`Button color: ${extracted.buttonStyle.background}`);

  if (hints.length === 0) return '';

  return `=== EXTRACTED BRAND IDENTITY ===
Use these colors and fonts when setting block styling attributes (backgroundColor, textColor, buttonColor, etc.):
${hints.join('\n')}

IMPORTANT: Apply these brand colors to blocks where appropriate:
- Hero blocks: use primary/accent for buttons, brand background
- CTA blocks: use primary color for buttons
- Feature/text blocks: maintain brand text colors
- Keep the overall color scheme (${extracted.colorScheme || 'light'}) consistent`;
}

/**
 * Convert hex/rgb color to HSL string format "H S% L%"
 * Used by client-side Brand Guide to map to CSS variables.
 */
export function colorToHsl(color: string): string {
  if (!color || typeof color !== 'string') return '220 100% 26%';
  const trimmed = color.trim();

  // Already HSL
  const hslMatch = trimmed.match(/hsl\(\s*(\d+)\s*,?\s*([\d.]+)%?\s*,?\s*([\d.]+)%?\s*\)/i);
  if (hslMatch) {
    return `${Math.round(parseFloat(hslMatch[1]))} ${Math.round(parseFloat(hslMatch[2]))}% ${Math.round(parseFloat(hslMatch[3]))}%`;
  }

  // RGB/RGBA
  const rgbMatch = trimmed.match(/rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)/i);
  if (rgbMatch) {
    return rgbToHsl(parseInt(rgbMatch[1]) / 255, parseInt(rgbMatch[2]) / 255, parseInt(rgbMatch[3]) / 255);
  }

  // HEX
  let hex = trimmed.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '220 100% 26%';

  return rgbToHsl(parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255);
}

function rgbToHsl(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
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
