/**
 * En bokning blir en nyhet — och nyheten når en människa.
 *
 * Uppmätt 2026-08-25 (Magnus bokning på optic): besökaren bokade, admin
 * bekräftade, mötet passerade — ingen notifierades i något led. Ytan (listan,
 * analytics) visade tillståndet; strömmen saknades. Doktrinen: nyheter bor i
 * en ström, tillstånd i en yta.
 *
 * Tre sömmar, pinnade var för sig:
 *   1. Eventet föds i TABELLEN (trigger) — varje skrivare täcks, även de som
 *      inte finns än. En emit i en enskild skrivare hade varit CTA-klassen om.
 *   2. Leveransen är en plattformsprimitiv (email_admins) — mottagare ur
 *      user_roles vid sändning, aldrig adresser i argument.
 *   3. Kopplingen är en AUTOMATION (data, dials not gates) — booking-modulens
 *      seed, inte hårdkodad routing (Law 1).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const SEEDS = readFileSync(join(__dirname, '../platform-seeds.ts'), 'utf-8');
const BOOKING = readFileSync(join(__dirname, '../modules/booking-module.ts'), 'utf-8');
const EXEC = readFileSync(
  join(ROOT, 'supabase/functions/agent-execute/index.ts'), 'utf-8');
const HANDLER = readFileSync(
  join(ROOT, 'supabase/functions/_shared/handlers/email-admins.ts'), 'utf-8');

describe('bokningen blir en nyhet', () => {
  it('eventet föds i tabellen — den BEFINTLIGA emittern består (uppmätt: tg_emit_booking_created)', () => {
    // Bygget 2026-08-25 skrev först en EGEN trigger — torrkörningen fann att
    // plattformen redan emitterar booking.created ({id, data:{hela raden}}),
    // så den nya raderades: ett dubblett-event är CTA-klassen för strömmar.
    // Pinnen: emittern finns kvar i migrationskedjan, och automationens
    // payload-vägar matchar dess form (data.*).
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const dir = join(ROOT, 'supabase/migrations');
    const carrier = readdirSync(dir).some((f: string) =>
      readFileSync(join(dir, f), 'utf-8').includes('emit_booking_created'));
    expect(carrier, 'ingen migration bär booking-emittern').toBe(true);
    expect(BOOKING).toContain('{{event.payload.data.customer_name}}');
  });

  it('email_admins är en plattformsprimitiv med railen wirad', () => {
    expect(SEEDS).toContain("name: 'email_admins'");
    expect(SEEDS).toContain("handler: 'internal:email_admins'");
    expect(EXEC).toContain("'internal:email_admins': hEmailAdmins");
  });

  it('mottagarna resolvas ur rollen vid sändning — aldrig adresser i argumenten', () => {
    expect(HANDLER).toMatch(/from\('user_roles'\)/);
    expect(HANDLER).toMatch(/eq\('role', 'admin'\)/);
    const params = SEEDS.slice(SEEDS.indexOf("name: 'email_admins'"), SEEDS.indexOf("name: 'email_admins'") + 2000);
    expect(params).not.toMatch(/\bto:\s*\{/);
  });

  it('blocked är varken success eller failure — allowlistens nej redovisas som withheld', () => {
    expect(HANDLER).toContain('blocked_by_allowlist');
    expect(HANDLER).toMatch(/blocked \+= 1/);
  });

  it('kopplingen är en automation i bokningsmodulens seed (Law 1: ingen hårdkodad routing)', () => {
    expect(BOOKING).toContain("trigger_config: { event: 'booking.created' }");
    expect(BOOKING).toContain("skill_name: 'email_admins'");
    expect(BOOKING).toContain('automations: BOOKING_AUTOMATIONS');
  });
});
