import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { invoicingModule } from '@/lib/modules/invoicing-module';

/**
 * An e-invoice is "sent" only when an access point said so.
 *
 * Without an access point the dispatch is recorded as `simulated` and the
 * answer says it reached nobody — the same stance as email-send's simulate
 * mode. A document that fails validation is refused, never handed on. And the
 * XML comes from ONE pure builder (`_shared/einvoice/ubl.ts`) that the unit
 * tests exercise, so what the tests prove is what the function emits.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('the einvoice function', () => {
  const fn = read('supabase/functions/einvoice/index.ts');

  it('builds the document through the shared, unit-tested builder', () => {
    expect(fn).toMatch(/import \{ buildUblInvoice[^}]*\} from '\.\.\/_shared\/einvoice\/ubl\.ts'/);
    expect(fn).not.toMatch(/<cbc:InvoiceTypeCode>/); // no second renderer in the function
  });

  it('refuses to dispatch a document that fails validation', () => {
    expect(fn).toMatch(/if \(!result\.validation\.ok\) \{\s*return json\(\{ success: false, error: 'E-invoice refused/);
  });

  it('writes "sent" only after a 2xx from the access point; no access point means "simulated"', () => {
    const dispatch = fn.slice(fn.indexOf("if (action === 'dispatch')"));
    expect(dispatch).toMatch(/if \(!provider\) \{\s*row\.status = 'simulated';/);
    const sentAt = dispatch.indexOf("row.status = 'sent'");
    const okCheck = dispatch.lastIndexOf('if (res.ok)', sentAt);
    expect(okCheck).toBeGreaterThan(-1);
    expect(dispatch.slice(okCheck, sentAt)).not.toMatch(/else/);
    expect(dispatch).toMatch(/row\.status = 'failed'/);
  });

  it('is gated like the PDF: invoicing-module user or service role', () => {
    expect(fn).toMatch(/requireServiceOrModule\(req, supabase, 'invoicing'\)/);
  });
});

describe('the ledger and the skills', () => {
  it('the ledger only knows honest states', () => {
    const migration = read('supabase/migrations/20261005060000_fakturan-talar-peppol.sql');
    expect(migration).toMatch(/CHECK \(status IN \('simulated', 'sent', 'accepted', 'rejected', 'failed'\)\)/);
    expect(migration).toMatch(/can_access_module\(auth\.uid\(\), 'invoicing'\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS buyer_reference text/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS peppol_id text/);
  });

  it('both skills go through the same door as the admin panel', () => {
    const skills = new Map(invoicingModule.skillSeeds?.map((s) => [s.name, s]) ?? []);
    expect(skills.get('export_invoice_ubl')?.handler).toBe('edge:einvoice');
    expect(skills.get('send_einvoice')?.handler).toBe('edge:einvoice');
    const hook = read('src/hooks/useEinvoice.ts');
    expect(hook).toMatch(/functions\.invoke\('einvoice'/);
    expect(read('src/components/admin/invoices/InvoiceDetailSheet.tsx')).toMatch(/<EinvoicePanel invoice=\{invoice\} \/>/);
    expect(read('src/pages/admin/InvoicesPage.tsx')).toMatch(/<TabsTrigger value="einvoice">E-invoice<\/TabsTrigger>/);
  });

  it('manage_invoice can address an invoice and carry the buyer reference', () => {
    const skill = invoicingModule.skillSeeds?.find((s) => s.name === 'manage_invoice');
    const props = (skill?.tool_definition as { function: { parameters: { properties: Record<string, unknown> } } }).function.parameters.properties;
    expect(props).toHaveProperty('company_id');
    expect(props).toHaveProperty('buyer_reference');
    const edge = read('supabase/functions/agent-execute/index.ts');
    expect(edge).toMatch(/company_id: a\.company_id \|\| null,\s*buyer_reference: a\.buyer_reference \|\| null,/);
    expect(edge).toMatch(/'lead_id', 'company_id', 'buyer_reference'/);
  });
});

describe('a credit note is a document, not three amounts', () => {
  it('create_credit_note copies the party, the reference and writes lines that sum to its subtotal', () => {
    const m = readFileSync(join(root, 'supabase/migrations/20261005060100_kreditnotan-bar-sin-part-och-sina-rader.sql'), 'utf8');
    expect(m).toMatch(/company_id, partner_id, buyer_reference, line_items\s*\) VALUES/);
    expect(m).toMatch(/v_inv\.company_id, v_inv\.partner_id, v_inv\.buyer_reference,/);
    expect(m).toMatch(/'unit_price_cents', -COALESCE\(\(l->>'unit_price_cents'\)::numeric, 0\)/); // full credit: lines negated
    expect(m).toMatch(/'qty', 1, 'unit_price_cents', v_sub\)/);                                   // partial: one line, the net
    // the over-crediting guard the earlier migration built is still in the body
    expect(m).toMatch(/exceeds remaining creditable amount/);
  });

  it('the exporter inherits the credited invoice\'s party for older credit notes, never a guessed one', () => {
    const fn = read('supabase/functions/einvoice/index.ts');
    expect(fn).toMatch(/if \(!invoice\.company_id && orig\?\.company_id\) invoice\.company_id = orig\.company_id;/);
    expect(fn).toMatch(/buyer_reference: invoice\.buyer_reference \?\? creditedBuyerRef \?\? null/);
  });
});

