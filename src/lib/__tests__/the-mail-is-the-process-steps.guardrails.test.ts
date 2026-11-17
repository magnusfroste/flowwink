import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The mail is the process step's, not the browser's (2026-11-17).
 *
 * Read from a battery run: a booking made by an agent left nothing in the mail
 * rail — the confirmation was sent by the page that booked — and
 * send_contract_for_signature issued a link and e-mailed nobody. Both steps
 * were SKIPPED in the battery as "no e-mail provider locally", though a send
 * without a provider is logged as simulated and can be read.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('a booking is confirmed whoever made it', () => {
  const mod = read('src/lib/modules/booking-module.ts');
  const handler = read('supabase/functions/comms-send/booking_confirmation.ts');

  it('an automation answers every booking.created with the confirmation skill', () => {
    const seed = mod.slice(mod.indexOf("name: 'Booking confirmation to the customer'"));
    expect(seed.slice(0, 900)).toMatch(/trigger_config: \{ event: 'booking\.created' \}/);
    expect(seed.slice(0, 900)).toMatch(/skill_name: 'send_booking_confirmation'/);
    expect(seed.slice(0, 900)).toMatch(/booking_id: '\{\{event\.payload\.id\}\}'/);
    expect(read('supabase/functions/comms-send/index.ts')).toMatch(/send_booking_confirmation: 'booking_confirmation'/);
  });

  it('one mail per booking: the stamp is claimed in one statement, before the send', () => {
    const claim = handler.indexOf('.is("confirmation_sent_at", null)');
    expect(claim).toBeGreaterThan(0);
    expect(claim).toBeLessThan(handler.indexOf("functions.invoke('email-send'"));
    expect(handler).toMatch(/reason: "already_confirmed"/);
  });

  it('a claim that sent nothing is released — a disabled setting and a failed send', () => {
    expect((handler.match(/await release\(\);/g) ?? []).length).toBe(2);
    const disabled = handler.slice(handler.indexOf('confirmationEmailEnabled === false'));
    expect(disabled.indexOf('await release();')).toBeLessThan(disabled.indexOf('confirmation_email_disabled'));
  });

  it('a cancelled or past booking is not confirmed by itself — and that is asked before the claim', () => {
    expect(handler).toMatch(/status === 'cancelled' \|\| status === 'no_show' \|\| over/);
    expect(handler.indexOf('"booking_cancelled"')).toBeLessThan(handler.indexOf('.is("confirmation_sent_at", null)'));
  });
});

describe('sending a contract for signature e-mails the counterparty', () => {
  const core = read('supabase/functions/_shared/execute/core.ts');
  const skill = core.slice(core.indexOf("if (skillName === 'send_contract_for_signature')"), core.indexOf("if (skillName === 'get_contract_content')"));

  it('the skill mails the link itself and says whether it did', () => {
    expect(skill).toMatch(/kind: 'contract_email', contract_id: contract\.id, public_url: signingUrl/);
    expect(skill).toMatch(/email_sent: emailSent/);
    expect(skill).toMatch(/email_error: emailError/);
    // A re-send of a pending agreement is a reminder.
    expect(skill).toMatch(/reminder: contract\.status === 'pending_signature'/);
  });

  it('…after the agreement is marked pending, never before', () => {
    expect(skill.indexOf("status: 'pending_signature'")).toBeLessThan(skill.indexOf("kind: 'contract_email'"));
  });
});

describe('the battery reads what the customer got', () => {
  it('no scenario skips a mail step for want of a provider where the rail can be read', () => {
    for (const f of ['book-to-meet', 'sign-to-serve']) {
      const src = read(`scripts/process-battery/scenarios/${f}.ts`);
      expect(src, f).toMatch(/await s\.mail\(/);
      expect(src, f).not.toMatch(/s\.skip\('the (confirmation e-mail reaches the customer|signing link is e-mailed)/);
    }
    expect(read('scripts/process-battery/scenarios/book-to-meet.ts')).toMatch(/s\.pulse\('event-dispatcher'/);
  });
});
