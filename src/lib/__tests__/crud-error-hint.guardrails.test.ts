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

  it('ett ogiltigt enum-värde svarar med fältet och värdena databasen tar', () => {
    // optic 2026-10-29: status "blocked" på project_tasks, två gånger, och svaret
    // sa bara "invalid input value" — värdena kommer ur schemat, inte ur en lista här.
    const hint = buildCrudErrorHint({
      table: 'project_tasks',
      message: 'Update project_tasks failed: invalid input value for enum project_task_status: "blocked"',
      enums: { status: ['todo', 'in_progress', 'review', 'done'], priority: ['low', 'medium', 'high', 'urgent'] },
      sent: { id: '2c59636c', action: 'update', status: 'blocked', description: 'Grävning pausad' },
    });
    expect(hint?.field).toBe('status');
    expect(hint?.valid_values).toEqual(['todo', 'in_progress', 'review', 'done']);
    expect(hint?.error).toContain('project_tasks.status must be one of todo, in_progress, review, done');
    expect(hint?.error).toContain('"blocked"');
    expect(hint?.hint).toContain('situation rather than a state');
  });

  it('enum-felet påstår inga värden när schemat inte gick att läsa', () => {
    const hint = buildCrudErrorHint({
      table: 'project_tasks',
      message: 'invalid input value for enum public.project_task_status: "blocked"',
      sent: { status: 'blocked' },
    });
    expect(hint?.valid_values).toBeUndefined();
    expect(hint?.error).toContain('"blocked" is not a valid public.project_task_status');
    expect(hint?.hint).toContain('read_skill');
  });

  it('enum-felet klassas som INVALID_INPUT så att agenten rättar värdet och försöker igen', async () => {
    const { classifyAgentError } = await import('../../../supabase/functions/_shared/agent-errors');
    const hint = buildCrudErrorHint({
      table: 'project_tasks',
      message: 'invalid input value for enum project_task_status: "blocked"',
      enums: { status: ['todo', 'done'] },
      sent: { status: 'blocked' },
    });
    expect(classifyAgentError(hint!.error)).toMatchObject({ code: 'INVALID_INPUT', retryable: true });
  });

  it('släpper igenom ett fel den inte förstår', () => {
    expect(classifyWriteError('deadlock detected')).toBeNull();
    expect(buildCrudErrorHint({ table: 't', message: 'deadlock detected' })).toBeNull();
  });
});
