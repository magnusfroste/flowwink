/**
 * Renderaren äger skalet — blocket äger innehållet.
 *
 * Uppmätt 2026-08-26 (kollegors iPhone 13 på optic): textblock kändes "lite
 * annorlunda paddade". Aritmetiken: wrapperns px-4 + blockets eget px-6 =
 * 40 px sidopadding mot konforma grannars 16, och py-8 + py-16 = tredubbel
 * vertikal rytm på mobil. CLAUDE.md:s konvention är att BlockRenderer ger
 * icke-full-bleed-block section + container + padding — blockets eget skal
 * är dubbelskal.
 *
 * Populationen är 29 block (Lovable-arv). Det här testet pinnar TextBlock
 * (det rapporterade och nu normaliserade) och håller en LISTA över kända
 * kvarvarande syndare — svepet som tömmer listan är ett eget, fleet-synligt
 * designbeslut. Ett NYTT block med eget skal, eller en regression i ett
 * normaliserat, fälls direkt.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '../../components/public/blocks');

const FULL_BLEED = new Set([
  'HeroBlock', 'ParallaxSectionBlock', 'AnnouncementBarBlock', 'MapBlock',
  'MarqueeBlock', 'HeaderBlock', 'FooterBlock', 'PopupBlock',
  'NotificationToastBlock', 'FloatingCtaBlock', 'ChatLauncherBlock',
  'SectionDividerBlock', 'FeaturedCarouselBlock',
]);

/** Kända dubbelskal (Lovable-arv) i väntan på normaliseringssvepet. */
const KNOWN_DOUBLE_SHELLS = new Set([
  'AccordionBlock', 'ArticleGridBlock', 'BadgeBlock', 'BentoGridBlock',
  'CTABlock', 'CartBlock', 'ConsultantMatcherBlock', 'ContactBlock',
  'CountdownBlock', 'EmbedBlock', 'FormBlock', 'InfoBoxBlock',
  'KbAccordionBlock', 'KbFeaturedBlock', 'KbHubBlock', 'LatestPostsBlock',
  'LinkGridBlock', 'LottieBlock', 'ProductsBlock', 'ProgressBlock',
  'QuoteBlock', 'ShippingInfoBlock', 'SocialProofBlock', 'TableBlock',
  'TabsBlock', 'TestimonialsBlock', 'TwoColumnBlock', 'YouTubeBlock',
]);

const OWN_SHELL = /<section className="[^"]*\bp[xy]-/;

describe('renderaren äger skalet', () => {
  it('TextBlock bär inget eget sektionsskal — det rapporterade blocket är normaliserat', () => {
    const src = readFileSync(join(DIR, 'TextBlock.tsx'), 'utf-8');
    expect(src).not.toMatch(OWN_SHELL);
    expect(src).not.toContain('container mx-auto');
  });

  it('populationen växer aldrig — nya block ärver inte dubbelskalet, normaliserade återfaller inte', () => {
    const offenders: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('Block.tsx'))) {
      const name = f.replace('.tsx', '');
      if (FULL_BLEED.has(name) || KNOWN_DOUBLE_SHELLS.has(name)) continue;
      if (OWN_SHELL.test(readFileSync(join(DIR, f), 'utf-8'))) offenders.push(name);
    }
    expect(offenders, `dubbelskal utanför den kända listan: ${offenders.join(', ')}`).toEqual([]);
  });

  it('den kända listan krymper bara — ett normaliserat block plockas ur listan, aldrig tvärtom', () => {
    // Ett namn i listan vars fil INTE längre har eget skal = normaliserat men
    // kvarglömt i listan → påminnelsen att krympa den.
    const stale: string[] = [];
    for (const name of KNOWN_DOUBLE_SHELLS) {
      const src = readFileSync(join(DIR, `${name}.tsx`), 'utf-8');
      if (!OWN_SHELL.test(src)) stale.push(name);
    }
    expect(stale, `normaliserade men kvar i listan: ${stale.join(', ')}`).toEqual([]);
  });
});
