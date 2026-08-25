/**
 * Bokningsmailet är sajtinnehåll — och skärmen lovar bara det inkorgen håller.
 *
 * Rälsen fanns (email_templates + {{variabler}} + routerns template_name);
 * bekräftelsen gick förbi den med 40 rader hårdkodad engelsk HTML. Samma
 * klass som statusfärgerna: byggd men inte adopterad.
 *
 * Tre kontrakt:
 *   1. Seeden är återhävdbar och rör ALDRIG operatörens omskrivning
 *      (WHERE NOT EXISTS by name) — instansens röst är data.
 *   2. Handlern renderar mallen med legacy som Law 4-fallback, och defaulten
 *      är TJÄNST-GENERISK (Magnus reservation: en bokning kan vara en
 *      klipptid — plattformen antar aldrig samtal eller möte).
 *   3. Blocket visar "mail på väg" ENDAST när comms-send svarat success utan
 *      skipped — skärmen grundas i svaret, inte i hopp.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const SEED = readFileSync(join(ROOT, 'supabase/migrations/20260828170000_mailet-ar-sajtinnehall.sql'), 'utf-8');
const HANDLER = readFileSync(join(ROOT, 'supabase/functions/comms-send/booking_confirmation.ts'), 'utf-8');
const BLOCK = readFileSync(join(__dirname, '../../components/public/blocks/SmartBookingBlock.tsx'), 'utf-8');

describe('bokningsmailet är sajtinnehåll', () => {
  it('seeden är återhävdbar och skriver aldrig över en redigerad mall', () => {
    expect(SEED).toMatch(/WHERE NOT EXISTS[\s\S]*booking_confirmation/);
    expect(SEED).not.toMatch(/ON CONFLICT[\s\S]*DO UPDATE/);
  });

  it('defaultmallen är tjänst-generisk — inga antaganden om samtal, möte eller plats', () => {
    // Pinnen läser MALLEN (SQL-satsen), inte migrationens kommentarer — och
    // med ordgränser: 'rendering'/'redigering' är inte 'ring'.
    const content = SEED.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    for (const banned of [/\bcall you\b/i, /\bring(er|a)?\b/i, /\bphone\b/i, /\bmeeting\b/i, /\bzoom\b/i, /\bsamtal\b/i]) {
      expect(banned.test(content), `defaulten antar: ${banned}`).toBe(false);
    }
    expect(content).toContain('{{service_name}}');
  });

  it('handlern renderar ur email_templates med legacy-HTML som Law 4-fallback', () => {
    expect(HANDLER).toMatch(/from\('email_templates'\)[\s\S]*booking_confirmation/);
    expect(HANDLER).toContain('templateHtml ??');
    expect(HANDLER).toContain('templateSubject ??');
  });

  it('skärmen lovar mail endast på success utan skipped — grundat i svaret', () => {
    expect(BLOCK).toMatch(/success && !emailResult\?\.skipped/);
    expect(BLOCK).toMatch(/confirmationEmailed &&/);
  });
});
