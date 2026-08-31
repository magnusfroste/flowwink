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
const CONSUMERS: Array<{ file: string; fields: string[] }> = [
  { file: 'components/public/CookieBanner.tsx', fields: ['own.title', 'own.acceptAll', 'own.essentialOnly'] },
  { file: 'components/public/PublicNavigation.tsx', fields: ['blogSettings?.archiveTitle'] },
  { file: 'components/public/PublicFooter.tsx', fields: ['link.label'] },
  { file: 'pages/PublicPage.tsx', fields: ['maintenanceSettings.title', 'maintenanceSettings.message'] },
  { file: 'components/chat/ChatConversation.tsx', fields: ['settings?.title', 'settings?.welcomeMessage', 'settings?.placeholder'] },
  { file: 'components/public/ChatWidget.tsx', fields: ['settings.widgetButtonText', 'settings.title'] },
];

describe('operatorText används där en operatörssträng möter en besökare', () => {
  for (const { file, fields } of CONSUMERS) {
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

      it(`${file}: ${field} OR:as inte direkt med en literal`, () => {
        // `x || 'English'` är exakt förbiledningen regeln finns för.
        const bypass = new RegExp(`${field.replace(/[.?*+^$[\]\\(){}|]/g, '\\$&')}\\s*\\|\\|\\s*['"\`]`);
        expect(bypass.test(src), `${field} kringgår regeln med ||`).toBe(false);
      });
    }
  }
});
