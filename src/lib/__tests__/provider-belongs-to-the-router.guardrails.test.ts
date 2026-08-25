/**
 * Providern hör hemma i routern — modulen säger OM, inte HUR.
 *
 * Lagerkartan 2026-08-25: bookingEmailProvider i modulpanelen var ett
 * lagerbrott med en blind fläck — composio_gmail-grenen gick DIREKT mot
 * composio-proxy, förbi routerns allowlist, suppressions och outbound-logg.
 * Ett bokningsmail via Gmail lämnade inget spår där alla andra mail loggas.
 *
 * Varsam borttagning: lagrat legacy-värde följer med som provider-HINT till
 * email-send (composio stöds där sedan edge-surface-arbetet) — ingen instans
 * tappar beteende, men varje mail går genom vakterna. Panelen bär
 * proveniensrader med djuplänkar i stället för en duplicerad ratt — och
 * djuplänkar som ingen läser är rattar som ljuger, så sidorna läser ?tab=.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const HANDLER = readFileSync(join(ROOT, 'supabase/functions/comms-send/booking_confirmation.ts'), 'utf-8');
const PANEL = readFileSync(join(__dirname, '../../components/admin/modules/ModuleDetailSheet.tsx'), 'utf-8');
const EMAILPAGE = readFileSync(join(__dirname, '../../pages/admin/EmailPage.tsx'), 'utf-8');
const COMMSPAGE = readFileSync(join(__dirname, '../../pages/admin/CommunicationsPage.tsx'), 'utf-8');

describe('providern hör hemma i routern', () => {
  it('bokningsmailet har EN väg — alltid genom email-send, aldrig direkt mot composio-proxy', () => {
    expect(HANDLER).not.toContain("invoke('composio-proxy'");
    expect(HANDLER).toContain("invoke('email-send'");
  });

  it('legacy-värdet är en HINT till routern, inte en egen transport', () => {
    expect(HANDLER).toMatch(/bookingEmailProvider === 'composio_gmail' \? 'composio'/);
  });

  it('panelen skriver aldrig providern — proveniensrader med länkar i stället', () => {
    expect(PANEL).not.toContain('bookingEmailProvider:');
    expect(PANEL).toContain('Edit email content');
    expect(PANEL).toContain('Router settings');
  });

  it('djuplänkarna landar rätt — båda sidorna läser ?tab=', () => {
    for (const [name, src] of [['EmailPage', EMAILPAGE], ['CommunicationsPage', COMMSPAGE]] as const) {
      expect(src, `${name} läser inte ?tab=`).toContain("searchParams.get('tab')");
      expect(src).toContain('defaultValue={initialTab}');
    }
  });
});
