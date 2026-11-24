import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// A customer is not staff (2026-11-24). Customers sign in to the portal since
// #1087, so a policy that admits "any signed-in user" admits a customer. Read
// on www: anyone signed in could write an approval request with its own
// required_role and status, the requester could approve his own, an open
// meeting handed out its password to anon, and every skill's instructions and
// the business's sales profile were readable by a customer.
const root = join(__dirname, '../../..');
const sql = readFileSync(join(root, 'supabase/migrations/20261124100000_en-kund-ar-inte-personal.sql'), 'utf8');

describe('a customer is not staff', () => {
  it('only staff ask for an approval, and the row decides who decides', () => {
    expect(sql).toMatch(/FOR INSERT TO authenticated WITH CHECK \(public\.is_staff\(auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/NEW\.required_role := COALESCE\(v_rule_role, 'admin'\)/);
    expect(sql).toMatch(/NEW\.status := 'pending'/);
    expect(sql).toMatch(/NEW\.requested_by := auth\.uid\(\)/);
  });

  it('nobody but an admin approves his own request, on every path', () => {
    // The check comes BEFORE the "browser only" early return, so the definer
    // functions (resolve_approval, advance_approval_step) meet it too.
    const selfCheck = sql.indexOf('NEW.resolved_by = NEW.requested_by');
    const browserOnly = sql.indexOf("current_user NOT IN ('anon', 'authenticated')");
    expect(selfCheck).toBeGreaterThan(-1);
    expect(selfCheck).toBeLessThan(browserOnly);
  });

  it('a meeting room is readable without its password', () => {
    expect(sql).toMatch(/REVOKE SELECT ON public\.webmeet_rooms FROM anon, authenticated/);
    const grant = sql.slice(sql.indexOf('GRANT SELECT (id, slug'), sql.indexOf('ON public.webmeet_rooms TO anon'));
    expect(grant).not.toMatch(/password/);
    for (const page of ['src/pages/MeetRoomPage.tsx', 'src/pages/admin/WebmeetPage.tsx']) {
      const src = readFileSync(join(root, page), 'utf8');
      expect(src, page).not.toMatch(/from\('webmeet_rooms'\)\s*\.select\('\*'\)/);
    }
  });

  it('skills and the sales profile are staff reads', () => {
    expect(sql).toMatch(/public\.is_staff\(auth\.uid\(\)\) OR scope IN \('external', 'both'\)/);
    expect(sql).toMatch(/type = 'company' AND public\.is_staff\(auth\.uid\(\)\)/);
  });
});
