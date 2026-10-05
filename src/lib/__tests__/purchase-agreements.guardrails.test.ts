import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { purchasingModule } from '@/lib/modules/purchasing-module';

/**
 * Blanket purchase agreements: one truth for what is left, one ceiling for
 * every writer.
 *
 * The remaining quantity on an agreement line is never stored — it is the
 * call-off lines on purchase orders that are not cancelled. The ceiling is a
 * trigger on purchase_order_lines, so a call-off edited after the fact
 * (update_purchase_order, amend_purchase_order) is held to it the same as one
 * created through call_off_purchase_agreement. The UI and the agent share the
 * two RPCs.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migration = read('supabase/migrations/20261005030000_ramavtalet-och-avropen.sql');

describe('the agreement has no stored counter', () => {
  it('agreement lines store only what was agreed', () => {
    const table = migration.match(/CREATE TABLE IF NOT EXISTS public\.purchase_agreement_lines \(([\s\S]*?)\n\);/)?.[1] ?? '';
    expect(table).toMatch(/agreed_quantity integer NOT NULL/);
    expect(table).not.toMatch(/called_quantity|remaining_quantity/);
  });

  it('called is the sum of call-off lines on orders that are not cancelled', () => {
    expect(migration).toMatch(/purchase_agreement_line_called[\s\S]*?po\.status <> 'cancelled'/);
  });
});

describe('the ceiling is on the table', () => {
  it('a trigger guards both new call-offs and later edits of quantity', () => {
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF quantity, agreement_line_id ON public\.purchase_order_lines/);
    expect(migration).toMatch(/Call-off exceeds agreement/);
  });

  it('call-offs take the price from the agreement, never from the caller', () => {
    const fn = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.call_off_purchase_agreement'));
    expect(fn).toMatch(/v_al\.unit_price_cents, v_al\.tax_rate/);
    expect(fn).not.toMatch(/->>'unit_price_cents'/);
  });

  it('both RPCs carry the service-role escape and the module gate', () => {
    for (const fn of ['manage_purchase_agreement', 'call_off_purchase_agreement']) {
      const body = migration.slice(migration.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`));
      expect(body, fn).toMatch(/auth\.role\(\) = 'service_role' OR can_access_module\(auth\.uid\(\), 'purchasing'\)/);
    }
  });
});

describe('one surface for the admin and the agent', () => {
  const skills = new Map(purchasingModule.skillSeeds?.map((s) => [s.name, s]) ?? []);

  it('the skills call the same RPCs the panel calls', () => {
    expect(skills.get('manage_purchase_agreement')?.handler).toBe('rpc:manage_purchase_agreement');
    expect(skills.get('call_off_purchase_agreement')?.handler).toBe('rpc:call_off_purchase_agreement');
    const hook = read('src/hooks/usePurchaseAgreements.ts');
    expect(hook).toMatch(/'manage_purchase_agreement'/);
    expect(hook).toMatch(/'call_off_purchase_agreement'/);
  });

  it('the Purchase Orders page has an Agreements tab', () => {
    const page = read('src/pages/admin/PurchaseOrdersPage.tsx');
    expect(page).toMatch(/<TabsTrigger value="agreements">Agreements<\/TabsTrigger>/);
    expect(page).toMatch(/<PurchaseAgreementsPanel \/>/);
  });
});
