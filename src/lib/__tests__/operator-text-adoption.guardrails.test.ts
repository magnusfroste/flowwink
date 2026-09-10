import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(ROOT, 'src', p), 'utf8');

/**
 * Regeln räcker inte — den måste ANVÄNDAS.
 *
 * `operatorText` avgör vems ord som gäller när en operatörsinställning möter
 * textpacket: operatörens ord för sajtens EGET språk, packet för de andra.
 * Regeln är testad i operator-text.guardrails.test.ts. Men en anropsplats som
 * skriver `settings.title || 'English'` går förbi den, och då är felet tillbaka
 * — svensk text på en engelsk sida, tyst.
 *
 * Det har hänt två gånger (menyns "Blogg", cookie-bannerns svenska hälsning),
 * så adoptionen ratchetas här i stället för att vara frivillig. Listan är
 * ytorna där en operatörsägd sträng möter en besökare; växer den, växer listan.
 */
const CONSUMERS: Array<{ file: string; fields: string[]; raw?: true }> = [
  // Cookie-bannern läser raden RÅ (useCookieConsentSettings, ingen merge med
  // defaults), så ingen koddefault kan nå `own` — där är `null` det ärliga svaret.
  { file: 'components/public/CookieBanner.tsx', fields: ['own.title', 'own.acceptAll', 'own.essentialOnly'], raw: true },
  // Footern: taggraden och öppettiderna är operatörsägd prosa på VARJE sida.
  { file: 'components/public/PublicFooter.tsx', fields: ['branding?.brandTagline'] },
  { file: 'components/public/PublicNavigation.tsx', fields: ['blogSettings?.archiveTitle'] },
  { file: 'components/public/PublicFooter.tsx', fields: ['link.label'] },
  { file: 'pages/PublicPage.tsx', fields: ['maintenanceSettings.title', 'maintenanceSettings.message'] },
  { file: 'components/chat/ChatConversation.tsx', fields: ['settings?.title', 'settings?.welcomeMessage', 'settings?.placeholder'] },
  { file: 'components/public/ChatWidget.tsx', fields: ['settings.widgetButtonText', 'settings.title'] },
  { file: 'components/public/blocks/ChatLauncherBlock.tsx', fields: ['chatSettings?.title', 'chatSettings?.placeholder'] },
  { file: 'pages/BlogArchivePage.tsx', fields: ['blogSettings?.archiveTitle'] },
  { file: 'pages/BlogTagPage.tsx', fields: ['blogSettings?.archiveTitle'] },
  { file: 'pages/BlogCategoryPage.tsx', fields: ['blogSettings?.archiveTitle'] },
];

/**
 * Regeln måste också veta vad KODEN fyllde i. Hooken svarar
 * `{ ...default, ...lagrat }`, så ett fält som operatören aldrig rört når
 * komponenten som om hen valt det — och kodens 'Blog' slog packets "Blogg" på
 * Resta Gård. Ett anrop över ett hook-fält skickar därför sin default med.
 */
function callText(src: string, field: string): string | null {
  const start = src.search(new RegExp(`operatorText\\(\\s*${field.replace(/[.?*+^$[\]\\(){}|]/g, '\\$&')}\\s*,`));
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

describe('operatorText används där en operatörssträng möter en besökare', () => {
  for (const { file, fields, raw } of CONSUMERS) {
    const src = read(file);

    it(`${file} importerar regeln`, () => {
      expect(src, 'ytan har operatörsägd text men går inte genom regeln').toContain('operatorText');
    });

    for (const field of fields) {
      it(`${file}: ${field} går genom operatorText`, () => {
        // Fältet måste vara FÖRSTA argumentet. Radbrytning är formatering, inte
        // betydelse — grinden får inte fällas av en prettier-körning.
        const passes = new RegExp(
          `operatorText\\(\\s*${field.replace(/[.?*+^$[\]\\(){}|]/g, '\\$&')}\\s*,`,
        );
        expect(
          passes.test(src),
          `${field} passerar regeln — annars visas operatörens språk på sidor i ett annat språk`,
        ).toBe(true);
      });
      it(`${file}: ${field} skickar sin koddefault med`, () => {
        const call = callText(src, field);
        expect(call, 'anropet hittades inte').not.toBeNull();
        // Hookens default (default…Settings / default…Data) — ett bart hook-fält
        // utan default är exakt formen som visade "Blog" på en svensk sajt.
        expect(
          raw ? /,\s*null\s*\)$/.test(call!) : /default\w+(Settings|Data)\b/.test(call!),
          `${field}: skicka hookens default som femte argument, annars räknas kodens engelska som operatörens ord`,
        ).toBe(true);
      });

      it(`${file}: ${field} OR:as inte direkt med en literal`, () => {
        // `x || 'English'` är exakt förbiledningen regeln finns för.
        const bypass = new RegExp(`${field.replace(/[.?*+^$[\]\\(){}|]/g, '\\$&')}\\s*\\|\\|\\s*['"\`]`);
        expect(bypass.test(src), `${field} kringgår regeln med ||`).toBe(false);
      });
    }
  }
});
