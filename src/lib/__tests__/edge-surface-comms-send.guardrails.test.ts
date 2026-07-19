import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: comms-send (edge-surface B2) must not WIDEN access.
 *
 * Eleven transactional-comms functions were consolidated into one. Three of
 * them were JWT-gated as standalone functions (verify_jwt=true):
 * send-invoice-email, send-return-confirmation, csat-dispatch. comms-send is
 * necessarily deployed --no-verify-jwt (public checkout/booking flows call
 * it), so those three kinds MUST keep an in-body gate — otherwise the
 * consolidation silently turned three admin-only senders into public ones.
 */

const root = process.cwd();
const dir = join(root, 'supabase/functions/comms-send');
const index = readFileSync(join(dir, 'index.ts'), 'utf8');

const ALL_KINDS = [
  'booking_confirmation', 'order_confirmation', 'invoice_email', 'quote_email',
  'contact_email', 'return_confirmation', 'webinar_reminders',
  'booking_reminders', 'calendar_reminders', 'csat_dispatch', 'survey_send',
];

describe('comms-send consolidation', () => {
  it('every kind has its handler module and is wired in the dispatcher', () => {
    for (const k of ALL_KINDS) {
      expect(existsSync(join(dir, `${k}.ts`)), `${k}.ts`).toBe(true);
      expect(index).toContain(`${k}:`);
    }
  });

  it('the formerly JWT-gated kinds keep an in-body gate', () => {
    const gated = index.match(/const GATED = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    for (const k of ['invoice_email', 'return_confirmation', 'csat_dispatch']) {
      expect(gated, `GATED must include ${k}`).toContain(k);
    }
    expect(index).toMatch(/requireServiceOrRole/);
  });

  it('is registered verify_jwt=false in config.toml (public flows depend on it)', () => {
    const toml = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
    const section = toml.split('[functions.comms-send]')[1]?.split('[functions.')[0] ?? '';
    expect(section).toMatch(/verify_jwt\s*=\s*false/);
  });

  it('skill-name mapping covers the two comms skills that flip to edge:comms-send', () => {
    // webinars-module send_webinar_reminders + surveys-module send_survey seed
    // edge:comms-send; agent-execute injects _skill, and the dispatcher must
    // translate it — a missing entry means the skill silently errors.
    expect(index).toMatch(/send_webinar_reminders:\s*'webinar_reminders'/);
    expect(index).toMatch(/send_survey:\s*'survey_send'/);
    for (const mod of ['webinars-module', 'surveys-module']) {
      const src = readFileSync(join(root, `src/lib/modules/${mod}.ts`), 'utf8');
      expect(src, mod).toContain("'edge:comms-send'");
    }
  });

  it('no src caller still references a deleted comms function', () => {
    // The eleven standalone functions are gone; a stale invoke() would 404.
    const { execSync } = require('node:child_process');
    const out = execSync(
      `grep -rn "invoke('send-booking-confirmation'\\|invoke('send-order-confirmation'\\|invoke('send-invoice-email'\\|invoke('send-quote-email'\\|invoke('send-contact-email'\\|invoke('send-return-confirmation'\\|invoke('survey-send'\\|invoke('csat-dispatch'\\|functions/v1/send-booking-confirmation\\|functions/v1/send-contact-email" src/ --exclude-dir=__tests__ || true`,
      { cwd: root, encoding: 'utf8' },
    ).trim();
    expect(out).toBe('');
  });

  it('the cron self-heal migration repoints every deleted URL it can meet', () => {
    const mig = readFileSync(join(root, 'supabase/migrations/20260719230000_comms-send-cron-repoint.sql'), 'utf8');
    for (const [old, kind] of [
      ['send-booking-reminders', 'booking_reminders'],
      ['send-calendar-reminders', 'calendar_reminders'],
      ['csat-dispatch', 'csat_dispatch'],
    ]) {
      expect(mig).toContain(`/functions/v1/${old}`);
      expect(mig).toContain(`comms-send?kind=${kind}`);
    }
  });
});
