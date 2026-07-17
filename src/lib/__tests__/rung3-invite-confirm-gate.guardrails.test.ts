/**
 * Guardrail: a company membership (identity ladder rung 3) is activated only for
 * a CONFIRMED, proven-owned email — never on a bare email match at signup.
 *
 * The P2 invite trigger fired AFTER INSERT ON profiles (created at signup, before
 * email confirmation), so an attacker who signed up with an invited address could
 * claim that company's membership before proving ownership. The fix
 * (20260718120000) gates activation on email_confirmed_at. This locks that gate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(__dirname, '../../../supabase/migrations/20260718120000_rung3-invite-confirm-gate.sql'),
  'utf-8',
);

describe('rung-3 invite confirmation-gate guardrails', () => {
  it('the profiles-insert path activates only when the email is already confirmed', () => {
    const fn = migration.slice(migration.indexOf('function public.link_invited_company_contacts'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    // Must check email_confirmed_at before activating.
    expect(body).toMatch(/email_confirmed_at is not null/i);
    expect(body).toContain('activate_confirmed_company_contact');
  });

  it('activation also fires at the moment of confirmation (auth.users trigger)', () => {
    expect(migration).toMatch(/after update of email_confirmed_at on auth\.users/i);
    const fn = migration.slice(migration.indexOf('function public.link_company_contact_on_confirm'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/new\.email_confirmed_at is not null and old\.email_confirmed_at is null/i);
  });

  it('the shared activator only touches invited, unlinked rows for that email', () => {
    const fn = migration.slice(migration.indexOf('function public.activate_confirmed_company_contact'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/cc\.auth_user_id is null/);
    expect(body).toMatch(/cc\.status = 'invited'/);
    expect(body).toMatch(/lower\(cc\.contact_email\) = lower\(p_email\)/);
  });

  it('it heals any pre-fix membership bound to a still-unconfirmed user', () => {
    expect(migration).toMatch(/set auth_user_id = null, status = 'invited'[\s\S]*?u\.email_confirmed_at is null/i);
  });
});
