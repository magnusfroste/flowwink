import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pagesModule } from '../modules/pages-module';

/**
 * Guardrail: heading colour is a dial per SURFACE, and the inverse band swaps it.
 *
 * Synclair's brand manual (v1.0, October 2026): yellow headings on a dark
 * ground, deep blue on a light one; black on blue never. Headings used to
 * inherit the text colour — white on dark, near-black on light — so the
 * connected ChatGPT coloured them with CSS on hashed ids (2026-10-19). Now:
 * `--heading-color-light` / `--heading-color-dark` from branding, the theme
 * picks one, and the inverse section (sectionBackground "dark" on a light
 * page) takes the other. A block that colours its own heading still wins:
 * the rule sits in the base layer, under every utility class.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('heading colour per surface', () => {
  it('the stylesheet reads one variable, resolved by theme and swapped on the inverse surface', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/--heading-color-light: currentColor;/);
    expect(css).toMatch(/--heading-color-dark: currentColor;/);
    expect(css).toMatch(/--heading-color: var\(--heading-color-light\);/);
    const dark = css.slice(css.indexOf('  .dark {'), css.indexOf('  .dark {') + 200);
    expect(dark).toMatch(/--heading-color: var\(--heading-color-dark\);/);
    const headings = css.slice(css.indexOf('h1, h2, h3, h4, h5, h6 {'), css.indexOf('}', css.indexOf('h1, h2, h3, h4, h5, h6 {')));
    expect(headings).toMatch(/color: var\(--heading-color\);/);
    expect(css).toMatch(/\.surface-inverse \{\s*--heading-color: var\(--heading-color-dark\);/);
    expect(css).toMatch(/\.dark \.surface-inverse \{\s*--heading-color: var\(--heading-color-light\);/);
    // base layer: a utility class on a heading (text-white on a hero) still wins
    expect(css.indexOf('h1, h2, h3, h4, h5, h6 {')).toBeGreaterThan(css.indexOf('@layer base'));
  });

  it('the renderer marks the inverse band, and the provider sets or clears the two variables', () => {
    const renderer = read('src/components/public/BlockRenderer.tsx');
    expect(renderer).toMatch(/case 'dark':[\s\S]{0,300}section: 'bg-foreground surface-inverse'/);
    const provider = read('src/providers/BrandingProvider.tsx');
    expect(provider).toMatch(/setOrClear\('--heading-color-light', branding\.headingColor \? headingColorMap\[branding\.headingColor\] : undefined\)/);
    expect(provider).toMatch(/setOrClear\('--heading-color-dark', branding\.headingColorDark \? headingColorMap\[branding\.headingColorDark\] : undefined\)/);
    expect(provider).toMatch(/primary: 'hsl\(var\(--primary\)\)', accent: 'hsl\(var\(--accent\)\)'/);
    const settings = read('src/hooks/useSiteSettings.tsx');
    expect(settings).toMatch(/headingColor\?: 'foreground' \| 'primary' \| 'accent';/);
    expect(settings).toMatch(/headingColorDark\?: 'foreground' \| 'primary' \| 'accent';/);
    const admin = read('src/pages/admin/BrandingSettingsPage.tsx');
    expect(admin).toMatch(/updateField\('headingColor'/);
    expect(admin).toMatch(/updateField\('headingColorDark'/);
  });

  it('site_branding_update takes heading_color and heading_color_dark, option-checked, and says what the manual rule maps to', () => {
    const seed = pagesModule.skillSeeds.find((s) => s.name === 'site_branding_update')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { enum?: string[] }> } } }).function.parameters.properties;
    expect(props.heading_color.enum).toEqual(['foreground', 'primary', 'accent']);
    expect(props.heading_color_dark.enum).toEqual(['foreground', 'primary', 'accent']);
    expect(seed.instructions).toMatch(/heading_color_dark: "accent", heading_color: "primary"/);
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toMatch(/pick\('heading_color', heading_color, \['foreground', 'primary', 'accent'\]\)/);
    expect(ae).toMatch(/pick\('heading_color_dark', heading_color_dark, \['foreground', 'primary', 'accent'\]\)/);
    expect(ae).toMatch(/updated\.headingColorDark/);
  });
});
