import { describe, it, expect } from 'vitest';
import {
  buildUblInvoice, peppolParticipantId, isValidSwedishOrgNumber, money, lineNetCents,
  type UblInvoiceInput,
} from '../../../supabase/functions/_shared/einvoice/ubl';

/**
 * The UBL builder is pure, so what these tests prove is what an access point
 * receives. They encode the EN 16931 / Peppol BIS 3.0 rules that decide
 * acceptance in practice; the official Schematron is not shipped (XSLT), so a
 * live exchange with an access point is still the last word — see the
 * einvoice_dispatches ledger, which never says "sent" without one.
 */

const seller = {
  name: 'FlowWink AB', org_number: '5566778899', vat_number: 'SE556677889901',
  street: 'Storgatan 1', city: 'Stockholm', postal_code: '111 22', country: 'SE', email: 'faktura@flowwink.test',
};
const buyer = { name: 'Kund AB', org_number: '5560360793', street: 'Lillgatan 2', city: 'Göteborg', postal_code: '411 01', country: 'SE' };

const base: UblInvoiceInput = {
  invoice_number: 'INV-2026-0042', invoice_type: 'invoice', issue_date: '2026-10-05', due_date: '2026-11-04',
  currency: 'SEK', tax_rate: 0.25,
  lines: [
    { description: 'Consulting day', qty: 2, unit_price_cents: 1_200_000, unit: 'DAY' },
    { description: 'Travel', qty: 1, unit_price_cents: 150_050, discount_pct: 10 },
  ],
  buyer_reference: 'PO-77', payment_terms: '30 dagar netto',
  seller, buyer, payment: { bankgiro: '123-4567' },
};

describe('money and identifiers', () => {
  it('formats cents with two decimals and never through a float', () => {
    expect(money(1_200_000)).toBe('12000.00');
    expect(money(5)).toBe('0.05');
    expect(money(-150050)).toBe('-1500.50');
  });
  it('derives a Peppol participant id from the org number (0007) or the VAT id (9955)', () => {
    expect(peppolParticipantId({ name: 'x', org_number: '556677-8899' })).toBe('0007:5566778899');
    expect(peppolParticipantId({ name: 'x', vat_number: 'SE556677889901' })).toBe('9955:SE556677889901');
    expect(peppolParticipantId({ name: 'x', peppol_id: '0088:7300010000001' })).toBe('0088:7300010000001');
    expect(peppolParticipantId({ name: 'x' })).toBeNull();
  });
  it('checks a Swedish organisationsnummer with Luhn', () => {
    expect(isValidSwedishOrgNumber('5560360793')).toBe(true); // Luhn-valid
    expect(isValidSwedishOrgNumber('5560360794')).toBe(false);
    expect(isValidSwedishOrgNumber('123')).toBe(false);
  });
  it('line net uses the app arithmetic: qty × price × (1 − discount)', () => {
    expect(lineNetCents({ description: '', qty: 1, unit_price_cents: 150_050, discount_pct: 10 })).toBe(135_045);
  });
});

describe('an invoice document (380)', () => {
  const r = buildUblInvoice(base);

  it('is a Peppol BIS 3.0 Invoice with the mandatory header', () => {
    expect(r.xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(r.xml).toContain('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"');
    expect(r.xml).toContain('<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>');
    expect(r.xml).toContain('<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>');
    expect(r.xml).toContain('<cbc:ID>INV-2026-0042</cbc:ID>');
    expect(r.xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(r.xml).toContain('<cbc:DueDate>2026-11-04</cbc:DueDate>');
    expect(r.xml).toContain('<cbc:BuyerReference>PO-77</cbc:BuyerReference>');
  });

  it('carries both parties with Swedish endpoint and legal ids', () => {
    expect(r.xml).toContain('<cbc:EndpointID schemeID="0007">5566778899</cbc:EndpointID>');
    expect(r.xml).toContain('<cbc:EndpointID schemeID="0007">5560360793</cbc:EndpointID>');
    expect(r.xml).toContain('<cac:PartyTaxScheme><cbc:CompanyID>SE556677889901</cbc:CompanyID>');
    expect(r.xml).toContain('<cbc:RegistrationName>Kund AB</cbc:RegistrationName>');
    expect(r.sender_id).toBe('0007:5566778899');
    expect(r.recipient_id).toBe('0007:5560360793');
  });

  it('the arithmetic holds (BR-CO-10/13/15, BR-S-08): lines → taxable → tax → total', () => {
    // 2 × 12 000 = 24 000.00; 1 500.50 − 10 % = 1 350.45; sum 25 350.45; VAT 25 % = 6 337.61; total 31 688.06
    expect(r.totals.line_extension_cents).toBe(2_535_045);
    expect(r.totals.tax_cents).toBe(633_761);
    expect(r.totals.tax_inclusive_cents).toBe(3_168_806);
    expect(r.xml).toContain('<cbc:LineExtensionAmount currencyID="SEK">25350.45</cbc:LineExtensionAmount>');
    expect(r.xml).toContain('<cbc:TaxableAmount currencyID="SEK">25350.45</cbc:TaxableAmount><cbc:TaxAmount currencyID="SEK">6337.61</cbc:TaxAmount>');
    expect(r.xml).toContain('<cbc:TaxInclusiveAmount currencyID="SEK">31688.06</cbc:TaxInclusiveAmount>');
    expect(r.xml).toContain('<cbc:PayableAmount currencyID="SEK">31688.06</cbc:PayableAmount>');
    expect(r.xml.match(/<cac:TaxSubtotal>/g)?.length).toBe(1); // one rate → one breakdown
  });

  it('a line discount is an allowance on the line, so price × qty − allowance = line amount', () => {
    expect(r.xml).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
    expect(r.xml).toContain('<cbc:Amount currencyID="SEK">150.05</cbc:Amount><cbc:BaseAmount currencyID="SEK">1500.50</cbc:BaseAmount>');
    expect(r.xml).toContain('<cbc:InvoicedQuantity unitCode="DAY">2</cbc:InvoicedQuantity>');
    expect(r.xml).toContain('<cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>');
  });

  it('bankgiro is a credit transfer to SE:BANKGIRO with the invoice number as payment id', () => {
    expect(r.xml).toContain('<cbc:PaymentMeansCode name="Credit transfer">30</cbc:PaymentMeansCode>');
    expect(r.xml).toContain('<cbc:PaymentID>INV-2026-0042</cbc:PaymentID>');
    expect(r.xml).toContain('<cac:PayeeFinancialAccount><cbc:ID>1234567</cbc:ID><cac:FinancialInstitutionBranch><cbc:ID>SE:BANKGIRO</cbc:ID>');
    expect(r.validation.ok).toBe(true);
    expect(r.validation.errors).toEqual([]);
  });

  it('a part payment becomes PrepaidAmount and lowers what is payable', () => {
    const p = buildUblInvoice({ ...base, paid_amount_cents: 1_000_000 });
    expect(p.xml).toContain('<cbc:PrepaidAmount currencyID="SEK">10000.00</cbc:PrepaidAmount>');
    expect(p.xml).toContain('<cbc:PayableAmount currencyID="SEK">21688.06</cbc:PayableAmount>');
  });

  it('escapes what the invoice says', () => {
    const e = buildUblInvoice({ ...base, lines: [{ description: 'Räk & <skal> "x"', qty: 1, unit_price_cents: 100 }] });
    expect(e.xml).toContain('<cbc:Name>Räk &amp; &lt;skal&gt; &quot;x&quot;</cbc:Name>');
    expect(e.xml).not.toMatch(/<skal>/);
  });
});

describe('a credit note (381)', () => {
  it('is a CreditNote with positive amounts and the credited invoice as billing reference', () => {
    const c = buildUblInvoice({
      ...base, invoice_type: 'credit_note', invoice_number: 'CN-2026-0042-1', due_date: null,
      lines: [{ description: 'Credit', qty: 1, unit_price_cents: -250_000 }], credited_invoice_number: 'INV-2026-0042',
    });
    expect(c.xml).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(c.xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(c.xml).toContain('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-2026-0042</cbc:ID>');
    expect(c.xml).toContain('<cbc:CreditedQuantity unitCode="C62">1</cbc:CreditedQuantity>');
    expect(c.xml).toContain('<cbc:LineExtensionAmount currencyID="SEK">2500.00</cbc:LineExtensionAmount>');
    expect(c.xml).toContain('<cbc:PayableAmount currencyID="SEK">3125.00</cbc:PayableAmount>');
    expect(c.xml).not.toContain('<cbc:DueDate>');
    expect(c.xml).not.toContain('<cac:PaymentMeans>');
    expect(c.validation.ok).toBe(true);
  });
});

describe('validation says what is missing, in the words of the rule', () => {
  it('refuses a document nobody can address or pay', () => {
    const v = buildUblInvoice({
      ...base, buyer_reference: null, order_reference: null, due_date: null, payment_terms: null,
      seller: { name: '' }, buyer: { name: 'Kund AB' }, payment: {},
    });
    expect(v.validation.ok).toBe(false);
    expect(v.validation.errors.join('\n')).toMatch(/BR-06/);
    expect(v.validation.errors.join('\n')).toMatch(/PEPPOL-EN16931-R020/);
    expect(v.validation.errors.join('\n')).toMatch(/PEPPOL-EN16931-R010/);
    expect(v.validation.errors.join('\n')).toMatch(/PEPPOL-EN16931-R003/);
    expect(v.validation.errors.join('\n')).toMatch(/BG-16/);
    expect(v.validation.errors.join('\n')).toMatch(/BR-CO-25/);
    // the document is still rendered for the admin to read
    expect(v.xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
  });

  it('a seller org number that fails Luhn is an error; a zero-rated invoice is category Z', () => {
    const bad = buildUblInvoice({ ...base, seller: { ...seller, org_number: '5566778890' } });
    expect(bad.validation.errors.join('\n')).toMatch(/Luhn/);
    const z = buildUblInvoice({ ...base, tax_rate: 0 });
    expect(z.xml).toContain('<cac:TaxCategory><cbc:ID>Z</cbc:ID><cbc:Percent>0</cbc:Percent>');
    expect(z.totals.tax_cents).toBe(0);
  });
});
