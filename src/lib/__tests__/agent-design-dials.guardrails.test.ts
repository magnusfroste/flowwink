import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_REFERENCE } from '../block-reference';
import { pagesModule } from '../modules/pages-module';

vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));

/**
 * Guardrail: the design has dials, and an agent can see them.
 *
 * Live finding (synclair, 2026-10-19): a connected ChatGPT built the whole site
 * in a day — 528 calls, 3 errors — and put the DESIGN in custom_scripts: a
 * runtime stylesheet of 84 rules with !important hooked on hashed block ids
 * and Tailwind class names, 664 KB at its peak, rewritten 35 times with no
 * sensor. All 16 heroes had backgroundType "none"; 51 block ids were tagged
 * "-light-" so the CSS could paint light sections in a dark site. Every one of
 * those wishes had a home the agent could not see: `sectionBackground` on the
 * block envelope (never in describe_blocks), default_theme and heading style
 * (not in site_branding_update), and the sensor that judges blocks could not
 * see a stylesheet.
 *
 * Locked here:
 *  1. describe_blocks serves the block envelope with every answer.
 *  2. A block written with sectionBackground keeps it through the write path.
 *  3. site_branding_update takes the theme and heading dials, option-checked.
 *  4. The stylesheet reads the heading dials as variables.
 *  5. custom_scripts is refused past the cap, and the refusal names the rails.
 *  6. inspect_rendered_page names a stylesheet in custom_scripts.
 *  7. "video" is explained where an agent looks for it.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const D = await import('../../../supabase/functions/_shared/handlers/describe-blocks.ts');
const N = await import('../../../supabase/functions/_shared/normalize-blocks.ts');
const I = await import('../../../supabase/functions/_shared/handlers/inspect-rendered-page.ts');

describe('agent design dials', () => {
  it('1. describe_blocks serves the block envelope at every level', () => {
    for (const args of [{}, { block_type: 'two-column' }, { block_types: ['hero', 'cta'] }, { block_type: 'nope' }]) {
      const r = D.executeDescribeBlocks(args);
      expect(r.envelope.sectionBackground).toMatch(/none \| muted \| accent \| dark/);
      expect(r.envelope.sectionBackground).toMatch(/INVERSE/);
      expect(r.envelope.note).toMatch(/NEXT TO type and data/);
    }
  });

  it('2. sectionBackground on the envelope survives the write path', () => {
    const blocks: Array<Record<string, unknown>> = [
      { id: 'b1', type: 'features', sectionBackground: 'dark', anchorId: 'why', data: { title: 'Why', items: [{ title: 'A', description: 'a' }] } },
    ];
    const dropped = N.normalizeBlocks(blocks);
    expect(dropped).toEqual([]);
    expect(blocks[0].sectionBackground).toBe('dark');
    expect(blocks[0].anchorId).toBe('why');
  });

  it('3. site_branding_update declares the theme and heading dials, and the handler option-checks them', () => {
    const seed = pagesModule.skillSeeds.find((s) => s.name === 'site_branding_update')!;
    const props = (seed.tool_definition as { function: { parameters: { properties: Record<string, { enum?: string[] }> } } }).function.parameters.properties;
    expect(props.default_theme.enum).toEqual(['light', 'dark', 'system']);
    expect(props.border_radius.enum).toEqual(['none', 'sm', 'md', 'lg']);
    expect(props.heading_transform.enum).toEqual(['none', 'uppercase']);
    expect(props.heading_weight.enum).toEqual(['semibold', 'bold', 'black']);
    expect(props.heading_tracking.enum).toEqual(['tight', 'normal', 'wide']);
    expect(props.allow_theme_toggle).toBeTruthy();
    expect(seed.instructions).toMatch(/sectionBackground/);
    expect(seed.instructions).toMatch(/default_theme/);

    const ae = read('supabase/functions/agent-execute/index.ts');
    const block = ae.slice(ae.indexOf("if (skillName === 'site_branding_update')"), ae.indexOf("key: 'branding', value: updated"));
    for (const dial of ['default_theme', 'border_radius', 'heading_transform', 'heading_weight', 'heading_tracking']) {
      expect(block, `${dial} is option-checked`).toMatch(new RegExp(`pick\\('${dial}'`));
    }
    expect(block).toMatch(/updated\.defaultTheme/);
    expect(block).toMatch(/updated\.allowThemeToggle/);
  });

  it('4. the stylesheet reads the heading dials as variables, and the provider sets or clears them', () => {
    const css = read('src/index.css');
    const headings = css.slice(css.indexOf('h1, h2, h3, h4, h5, h6 {'), css.indexOf('}', css.indexOf('h1, h2, h3, h4, h5, h6 {')));
    expect(headings).toMatch(/font-weight: var\(--heading-weight\)/);
    expect(headings).toMatch(/letter-spacing: var\(--heading-tracking\)/);
    expect(headings).toMatch(/text-transform: var\(--heading-transform\)/);
    expect(css).toMatch(/--heading-weight: 700;/);
    const provider = read('src/providers/BrandingProvider.tsx');
    expect(provider).toMatch(/setOrClear\('--heading-transform'/);
    expect(provider).toMatch(/removeProperty\(name\)/);
    const settings = read('src/hooks/useSiteSettings.tsx');
    expect(settings).toMatch(/headingTransform\?: 'none' \| 'uppercase'/);
    const admin = read('src/pages/admin/BrandingSettingsPage.tsx');
    for (const field of ['headingTransform', 'headingWeight', 'headingTracking']) expect(admin).toMatch(new RegExp(`updateField\\('${field}'`));
  });

  it('5. custom_scripts is refused past the cap, and the refusal names the rails', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    const cap = ae.slice(ae.indexOf("if (key === 'custom_scripts'"), ae.indexOf("const { data, error } = await supabase.from('site_settings')\n        .upsert({ key, value }"));
    expect(cap).toMatch(/CUSTOM_SCRIPTS_MAX_CHARS = 16_000/);
    expect(cap).toMatch(/throw new Error/);
    for (const rail of ['site_branding_update', 'sectionBackground', 'hero.backgroundType', 'heading_transform', 'default_theme', 'report_finding']) {
      expect(cap, `refusal names ${rail}`).toContain(rail);
    }
  });

  it('6. inspect_rendered_page names a stylesheet hiding in custom_scripts', async () => {
    const page = { id: 'p1', slug: 'home', title: 'Home', status: 'published', locale: 'sv', updated_at: '2026-10-19', content_json: [
      { id: 'a', type: 'hero', data: { title: 'T', subtitle: 'S' } },
      { id: 'b', type: 'features', data: { title: 'F', items: [{ title: 'x', description: 'y' }] } },
      { id: 'c', type: 'cta', data: { title: 'Go', buttonText: 'Go', buttonUrl: '/x' } },
    ] };
    const overlay = Array.from({ length: 12 }, (_, i) => `main .s${i}{background:#000!important;color:#fff!important}`).join('\n');
    const client = (scripts: Record<string, string>) => ({
      from(table: string) {
        const q: Record<string, unknown> = {};
        const chain = () => q;
        Object.assign(q, {
          select: chain, is: chain, eq: chain, order: chain, neq: chain, limit: () => Promise.resolve({ data: table === 'pages' ? [page] : [], error: null }),
          maybeSingle: () => Promise.resolve({ data: table === 'site_settings' ? { value: scripts } : null, error: null }),
        });
        return q;
      },
    });
    const dirty = await I.executeInspectRenderedPage(client({ headEnd: overlay }) as never, { slug: 'home' });
    expect(dirty.composition?.notes.join(' ')).toMatch(/custom_scripts carries a stylesheet/);
    const clean = await I.executeInspectRenderedPage(client({ headEnd: '<script async src="https://example.com/tag.js"></script>' }) as never, { slug: 'home' });
    expect(clean.composition?.notes.join(' ')).not.toMatch(/custom_scripts/);
  });

  it('7. "video" is explained where an agent looks for it', () => {
    const embed = BLOCK_REFERENCE.find((b) => b.type === 'embed')!;
    expect(embed.description).toMatch(/no "video" block type/);
    expect(embed.description).toMatch(/hero\.backgroundType "video"/);
  });
});
