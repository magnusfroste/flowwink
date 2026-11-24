import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The customer page crashed for every contact with a lead id (view sweep,
// 2026-11-24): the handler asked orders and bookings for lead_id, which
// neither table has, and its strict read turns a 400 into an error for the
// whole page. The tables that carry no lead_id say so with hasLead = false.
const src = readFileSync(join(__dirname, '../../../supabase/functions/_shared/handlers/customer-360.ts'), 'utf8');

describe('customer 360 asks a table only for columns it has', () => {
  it('orders and bookings are read by e-mail and party, never by lead id', () => {
    for (const table of ['orders', 'bookings']) {
      const call = src.slice(src.indexOf(`fetchByLeadOrEmail(\n        "${table}"`));
      const args = call.slice(0, call.indexOf('),'));
      expect(args, table).toMatch(/"customer_email",\s*true,\s*false,?\s*$/);
    }
    expect(src).toMatch(/if \(leadId && hasLead\)/);
  });
});
