import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: which rows are a customer's is decided by the account's CONFIRMED
 * address — portal_email() — and by nothing weaker (2026-11-19).
 *
 * Five readers asked the token's e-mail claim (the address an account was
 * opened with, proven or not) or profiles.email (the account holder's own to
 * edit): subscriptions, contracts, my_quotes, create_ticket_from_portal and
 * webinar registrations. An account opened in a customer's name read that
 * customer's services, agreements and quotes wherever sign-up did not demand a
 * confirmed address.
 *
 * The guard discovers rather than lists: every migration from the fix onward
 * is scanned for the two shapes.
 */
const dir = join(process.cwd(), 'supabase/migrations');
const FIX = '20261119120000_portalen-litar-pa-bekraftad-adress.sql';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const sqlOnly = (text: string) => text.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('the portal trusts the confirmed address', () => {
  const fix = sqlOnly(readFileSync(join(dir, FIX), 'utf-8'));

  it('the five older readers ask portal_email()', () => {
    for (const name of ['"Customers read own subscriptions"', '"Counterparty reads own contract"', '"Registrants and staff can read registrations"']) {
      const at = fix.indexOf(`CREATE POLICY ${name}`);
      expect(at, name).toBeGreaterThan(-1);
      expect(fix.slice(at, fix.indexOf(';', at)), name).toMatch(/public\.portal_email\(\)/);
    }
    for (const fn of ['my_quotes', 'create_ticket_from_portal']) {
      const at = fix.indexOf(`FUNCTION public.${fn}(`);
      expect(at, fn).toBeGreaterThan(-1);
      expect(fix.slice(at, fix.indexOf('$$;', at)), fn).toMatch(/v_email text := public\.portal_email\(\)/);
    }
  });

  it('the migration proves no policy or function is left on the token claim', () => {
    expect(fix).toMatch(/a policy still trusts the token''s unconfirmed e-mail/);
    expect(fix).toMatch(/a function still trusts the token''s unconfirmed e-mail/);
  });

  it('no migration since reads the token\'s e-mail claim or a profile\'s e-mail to decide whose a row is', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (f < FIX) continue;
      const sql = sqlOnly(readFileSync(join(dir, f), 'utf-8'));
      // The proof block of the fix names the pattern inside a regex literal; code that USES it is what counts.
      const uses = sql.replace(/~\*\s*'[^\n]*'/g, '');
      if (/auth\.jwt\(\)\s*->>\s*'email'/.test(uses)) offenders.push(`${f}: auth.jwt() ->> 'email'`);
      if (/email\s*=\s*\(\s*SELECT\s+\w+\.email\s+FROM\s+(public\.)?profiles/i.test(uses)) offenders.push(`${f}: profiles.email as identity`);
    }
    expect(offenders, 'ask public.portal_email() — the confirmed address').toEqual([]);
  });
});
