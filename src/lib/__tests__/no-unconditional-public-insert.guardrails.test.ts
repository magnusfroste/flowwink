import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An INSERT policy WITH CHECK (true) for everyone is a door with no lock: the
 * visitor chooses every column. On webinar_registrations it walked past
 * capacity and status (a third seat on a two-seat webinar answered 201); on
 * orders it let an anonymous POST create an order born `paid` with any total
 * (both found 2026-09-19). A rule that lives in one RPC is not a rule while
 * the table takes a raw insert.
 *
 * This replays every CREATE POLICY / DROP POLICY in migration order and lists
 * the unconditional public INSERT policies that are still standing. The list
 * is discovered, not written down — and it may only shrink. The ones left are
 * genuine visitor surfaces whose table has nothing to protect beyond the row
 * itself (a page view, a form submission); `bookings` is owed to the booking
 * fix package, where the block moves to book_appointment_slot.
 */

const dir = join(__dirname, '../../../supabase/migrations');
const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

type Policy = { table: string; name: string; body: string };

function standingPolicies(): Policy[] {
  const live = new Map<string, Policy>();
  const stmt = /(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|\w+)\s+ON\s+(?:"?public"?\.)?"?(\w+)"?([^;]*);/gi;
  let m: RegExpExecArray | null;
  while ((m = stmt.exec(sql))) {
    const [, verb, rawName, table, body] = m;
    const key = `${table}|${rawName.replace(/"/g, '')}`;
    if (verb.toUpperCase() === 'DROP') live.delete(key);
    else live.set(key, { table, name: rawName.replace(/"/g, ''), body });
  }
  return [...live.values()];
}

const open = standingPolicies().filter((p) =>
  /FOR\s+INSERT/i.test(p.body) &&
  /WITH\s+CHECK\s*\(\s*true\s*\)/i.test(p.body) &&
  // TO public / anon, or no TO clause at all (which means public).
  (!/\bTO\b/i.test(p.body) || /\bTO\s+[^()]*\b(public|anon)\b/i.test(p.body)));

describe('no unconditional public INSERT policy guards a table that has rules', () => {
  it('replays the policy history', () => {
    expect(standingPolicies().length).toBeGreaterThan(200);
  });

  it('the money and capacity tables take no anonymous raw insert', () => {
    const tables = open.map((p) => p.table);
    for (const t of ['orders', 'order_items', 'webinar_registrations', 'invoices', 'payments', 'subscriptions']) {
      expect(tables, `${t} has an INSERT policy WITH CHECK (true) open to everyone`).not.toContain(t);
    }
  });

  it('the standing list only shrinks', () => {
    // 2026-09-19: nine found, two dropped (orders, order_items) plus webinar_registrations.
    // Add a row here only with a reason a reviewer accepts; the honest move is an RPC.
    expect(open.map((p) => p.table).sort()).toEqual([
      'back_in_stock_requests',
      'bookings', // OWED: SmartBookingBlock inserts directly — moves to book_appointment_slot in the booking package
      'chat_feedback',
      'form_submissions',
      'newsletter_subscribers',
      'page_views',
      'utm_attributions',
    ]);
  });
});
