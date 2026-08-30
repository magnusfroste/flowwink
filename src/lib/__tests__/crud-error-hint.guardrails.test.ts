import { describe, it, expect } from 'vitest';
import {
  classifyWriteError,
  referencedTableFromConstraint,
  buildCrudErrorHint,
} from '../../../supabase/functions/_shared/crud-error-hint';

/**
 * Den generiska CRUD-vägen var den enda av tre databasvägar som inte
 * berättade hur man rättar en felgissning. Testerna nedan pinnar de tre
 * felformer som faktiskt bär en åtgärd — och att allt annat släpps igenom
 * orört, så en berikning aldrig kan svälja ett fel den inte förstår.
 */
describe('CRUD-fel som rättar sig själva', () => {
  const VENDOR_COLUMNS = ['id', 'invoice_number', 'subtotal_cents', 'tax_cents', 'total_cents', 'vendor_id'];

  it('känner igen en okänd kolumn och pekar på den närmaste riktiga', () => {
    const hint = buildCrudErrorHint({
      table: 'vendor_invoices',
      message: "Could not find the 'amount_cents' column of 'vendor_invoices' in the schema cache",
      columns: VENDOR_COLUMNS,
      sentKeys: ['amount_cents', 'invoice_number'],
    });
    expect(hint?.error).toContain('amount_cents');
    expect(hint?.did_you_mean?.amount_cents).toContain('total_cents');
    expect(hint?.valid_columns).toEqual(VENDOR_COLUMNS);
  });

  it('svarar ändå när kolumnerna inte gick att läsa — utan att påstå något', () => {
    const hint = buildCrudErrorHint({
      table: 'vendor_invoices',
      message: "Could not find the 'amount_cents' column of 'vendor_invoices' in the schema cache",
      columns: [],
    });
    expect(hint?.did_you_mean).toEqual({});
    expect(hint?.hint).toContain('list existing rows');
  });

  it('namnger fältet som saknas vid not-null', () => {
    const hint = buildCrudErrorHint({
      table: 'contracts',
      message: 'null value in column "counterparty_name" of relation "contracts" violates not-null constraint',
      columns: ['id', 'counterparty_name', 'title'],
      sentKeys: ['title'],
    });
    expect(hint?.error).toContain('counterparty_name is required');
    expect(hint?.hint).toContain('title');
  });

  it('säger VILKEN tabell en främmande nyckel måste komma ur', () => {
    const hint = buildCrudErrorHint({
      table: 'purchase_orders',
      message:
        'insert or update on table "purchase_orders" violates foreign key constraint "purchase_orders_vendor_id_fkey"',
      columns: [],
      knownTables: ['purchase_orders', 'vendors', 'partners'],
    });
    expect(hint?.must_reference).toBe('vendors');
    expect(hint?.hint).toContain('not automatically valid');
  });

  it('konventionen föreslår, katalogen verifierar', () => {
    const tables = ['partners', 'companies', 'addresses', 'vendors'];
    expect(referencedTableFromConstraint('orders_partner_id_fkey', tables)).toBe('partners');
    expect(referencedTableFromConstraint('x_company_id_fkey', tables)).toBe('companies');
    expect(referencedTableFromConstraint('x_address_id_fkey', tables)).toBe('addresses');
  });

  it('påstår ingen tabell som inte finns — hellre tyst än självsäkert fel', () => {
    expect(referencedTableFromConstraint('x_gizmo_id_fkey', ['partners', 'vendors'])).toBeNull();
    const hint = buildCrudErrorHint({
      table: 'x',
      message: 'violates foreign key constraint "x_gizmo_id_fkey"',
      knownTables: ['partners'],
    });
    expect(hint?.must_reference).toBeUndefined();
    expect(hint?.error).not.toContain('must be an id from');
  });

  it('släpper igenom ett fel den inte förstår', () => {
    expect(classifyWriteError('deadlock detected')).toBeNull();
    expect(buildCrudErrorHint({ table: 't', message: 'deadlock detected' })).toBeNull();
  });
});
