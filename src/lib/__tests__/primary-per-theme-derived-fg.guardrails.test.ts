/**
 * En token, många kontrastpartners — löst med två värden och en regel.
 *
 * Systemet föddes med TVÅ primärer (index.css: djup ljus-tema, lyft mörk-tema)
 * men BrandingProvider plattade till båda med ETT inline-värde och rörde
 * aldrig --primary-foreground. Magnus olösliga loop vid dark-låset på optic:
 * länk-på-mörkt vill ha ljus primär, som då failar som yta under temats
 * nära-svarta text. (1) primaryColorDark (logoDark-konventionen) + (2)
 * luminans-härledd foreground — mönstret som SECONDARY haft sedan födseln
 * och primary aldrig fick (adoptionsklassen, femte fyndet).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROVIDER = readFileSync(join(__dirname, '../../providers/BrandingProvider.tsx'), 'utf-8');
const FRAME = readFileSync(join(__dirname, '../../components/admin/PreviewFrame.tsx'), 'utf-8');
const TYPES = readFileSync(join(__dirname, '../../hooks/useSiteSettings.tsx'), 'utf-8');

describe('primären är per-tema med härledd text', () => {
  it('dokumentet bär temat — per-tema-värdet läses ur dess klass, aldrig ur modulstate', () => {
    expect(PROVIDER).toMatch(/isDark = root\.classList\.contains\('dark'\)/);
    expect(PROVIDER).toMatch(/isDark && branding\.primaryColorDark\) \|\| branding\.primaryColor/);
  });

  it('primärens foreground HÄRLEDS — svart-på-mörkblå kan inte längre författas', () => {
    expect(PROVIDER).toMatch(/setProperty\('--primary-foreground', contrastForeground\(effectivePrimary\)\)/);
  });

  it('en härledningsregel, två brukare — secondary behåller exakt sin födelseregel (tröskel 40)', () => {
    expect(PROVIDER).toMatch(/lightness < 40 \? '0 0% 98%' : '0 0% 9%'/);
    expect(PROVIDER).toMatch(/contrastForeground\(branding\.secondaryColor\)/);
  });

  it('temaflipp brandar OM — providern reagerar på resolvedTheme, ramen i sin klass-synk', () => {
    expect(PROVIDER).toMatch(/\[branding[^\]]*resolvedTheme\]/);
    expect(FRAME).toMatch(/syncRootClass[\s\S]{0,300}applyBrandingToDocument\(branding, doc\)/);
  });

  it('admin-nollställningen släpper den härledda foregrounden', () => {
    expect(PROVIDER).toMatch(/removeProperty\('--primary-foreground'\)/);
  });

  it('typen följer logoDark-konventionen', () => {
    expect(TYPES).toContain('primaryColorDark?: string');
  });
});
