/**
 * UBL 2.1 e-invoice — Peppol BIS Billing 3.0 (EN 16931) — from a FlowWink invoice.
 *
 * Pure: no Deno, no fetch, no database. The caller gathers the invoice, the
 * seller (site_settings.company_profile + einvoice settings), the buyer (the
 * lead's company) and hands them here; this file answers with the XML and a
 * validation report. The edge function `einvoice` and the unit tests read the
 * same code, so what the tests prove is what an access point receives.
 *
 * What is NOT here, on purpose: the official Schematron. It needs an XSLT
 * engine we do not ship. The rules below are the EN 16931 / Peppol rules that
 * decide acceptance in practice (presence of mandatory fields, the arithmetic
 * BR-CO-*, one VAT breakdown per rate, the Swedish identifier schemes). A
 * document with errors is still rendered — the admin can read it — but
 * `dispatch` refuses to send it.
 *
 * Money: the invoice stores cents; UBL wants decimals with exactly two places
 * in the document currency. Every amount here is formatted from an integer of
 * cents, never from a float, so the sums the validator checks are the sums the
 * reader sees.
 */

export type TaxCategory = 'S' | 'Z' | 'E' | 'K' | 'G' | 'O';

export interface UblParty {
  /** Registered company name (BT-27 / BT-44). */
  name: string;
  /** Swedish organisationsnummer, digits only (10). Scheme 0007. */
  org_number?: string | null;
  /** VAT id incl. country prefix, e.g. SE556677889901. */
  vat_number?: string | null;
  /** Explicit Peppol participant id "scheme:value" (e.g. "0007:5566778899"); derived from org/VAT when absent. */
  peppol_id?: string | null;
  street?: string | null;
  city?: string | null;
  postal_code?: string | null;
  /** ISO 3166-1 alpha-2; defaults to SE when the org number says Sweden. */
  country?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface UblPaymentMeans {
  bankgiro?: string | null;
  iban?: string | null;
  bic?: string | null;
}

export interface UblLine {
  description: string;
  qty: number;
  unit_price_cents: number;
  discount_pct?: number | null;
  /** Unit code (UN/ECE Rec 20). C62 = piece/unit, HUR = hour, DAY = day. */
  unit?: string | null;
}

export interface UblInvoiceInput {
  invoice_number: string;
  /** 'invoice' → 380, 'credit_note' → 381 */
  invoice_type: 'invoice' | 'credit_note';
  issue_date: string;           // YYYY-MM-DD
  due_date?: string | null;     // YYYY-MM-DD
  currency: string;             // ISO 4217
  /** Rate as a fraction (0.25) — the invoice stores one rate for all lines. */
  tax_rate: number;
  lines: UblLine[];
  /** Cents already paid; becomes PrepaidAmount, PayableAmount = total − prepaid. */
  paid_amount_cents?: number | null;
  /** BT-10. Peppol requires BuyerReference or an order reference. */
  buyer_reference?: string | null;
  /** BT-13 purchase order reference. */
  order_reference?: string | null;
  /** For a credit note: the invoice it credits (BT-25). */
  credited_invoice_number?: string | null;
  payment_terms?: string | null;
  note?: string | null;
  seller: UblParty;
  buyer: UblParty;
  payment: UblPaymentMeans;
}

export interface UblValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface UblResult {
  xml: string;
  validation: UblValidation;
  /** The totals the document states, in cents — for the caller to compare with the invoice row. */
  totals: { line_extension_cents: number; tax_exclusive_cents: number; tax_cents: number; tax_inclusive_cents: number; prepaid_cents: number; payable_cents: number };
  recipient_id: string | null;
  sender_id: string | null;
}

/** Peppol participant id: "0007:5566778899" from a Swedish org number, "9955:SE…" from a VAT id. */
export function peppolParticipantId(p: UblParty): string | null {
  const explicit = (p.peppol_id ?? '').trim();
  if (explicit) return explicit.includes(':') ? explicit : `0007:${explicit}`;
  const org = digitsOnly(p.org_number);
  if (org.length === 10) return `0007:${org}`;
  const vat = (p.vat_number ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (/^SE\d{12}$/.test(vat)) return `9955:${vat}`;
  return null;
}

export function digitsOnly(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Swedish organisationsnummer: 10 digits with a Luhn check digit. */
export function isValidSwedishOrgNumber(s: string | null | undefined): boolean {
  const d = digitsOnly(s);
  if (d.length !== 10) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(d[i]) * (i % 2 === 0 ? 2 : 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Cents → "1234.50". Negative stays negative (credit notes are rendered positive by the caller). */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Line net in cents, the same arithmetic as computeInvoiceTotals in the app. */
export function lineNetCents(l: UblLine): number {
  const pct = Math.min(100, Math.max(0, l.discount_pct || 0));
  return Math.round(l.qty * l.unit_price_cents * (1 - pct / 100));
}

function taxCategoryFor(rate: number): TaxCategory {
  return rate > 0 ? 'S' : 'Z';
}

function countryOf(p: UblParty): string {
  const c = (p.country ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  if (/^(sverige|sweden)$/i.test(c)) return 'SE';
  if (digitsOnly(p.org_number).length === 10 || /^SE/i.test(p.vat_number ?? '')) return 'SE';
  return c ? c.slice(0, 2) : '';
}

function partyXml(tag: 'cac:AccountingSupplierParty' | 'cac:AccountingCustomerParty', p: UblParty): string {
  const pid = peppolParticipantId(p);
  const [scheme, value] = pid ? pid.split(':', 2) : [null, null];
  const org = digitsOnly(p.org_number);
  const vat = (p.vat_number ?? '').replace(/[\s-]/g, '').toUpperCase();
  const country = countryOf(p);
  const parts: string[] = [];
  parts.push(`<${tag}><cac:Party>`);
  if (pid) parts.push(`<cbc:EndpointID schemeID="${esc(scheme)}">${esc(value)}</cbc:EndpointID>`);
  if (org.length === 10) parts.push(`<cac:PartyIdentification><cbc:ID schemeID="0007">${esc(org)}</cbc:ID></cac:PartyIdentification>`);
  parts.push(`<cac:PartyName><cbc:Name>${esc(p.name)}</cbc:Name></cac:PartyName>`);
  parts.push('<cac:PostalAddress>');
  if (p.street) parts.push(`<cbc:StreetName>${esc(p.street)}</cbc:StreetName>`);
  if (p.city) parts.push(`<cbc:CityName>${esc(p.city)}</cbc:CityName>`);
  if (p.postal_code) parts.push(`<cbc:PostalZone>${esc(p.postal_code)}</cbc:PostalZone>`);
  parts.push(`<cac:Country><cbc:IdentificationCode>${esc(country)}</cbc:IdentificationCode></cac:Country>`);
  parts.push('</cac:PostalAddress>');
  if (vat) parts.push(`<cac:PartyTaxScheme><cbc:CompanyID>${esc(vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`);
  parts.push('<cac:PartyLegalEntity>');
  parts.push(`<cbc:RegistrationName>${esc(p.name)}</cbc:RegistrationName>`);
  if (org.length === 10) parts.push(`<cbc:CompanyID schemeID="0007">${esc(org)}</cbc:CompanyID>`);
  parts.push('</cac:PartyLegalEntity>');
  if (p.email || p.phone) {
    parts.push('<cac:Contact>');
    if (p.phone) parts.push(`<cbc:Telephone>${esc(p.phone)}</cbc:Telephone>`);
    if (p.email) parts.push(`<cbc:ElectronicMail>${esc(p.email)}</cbc:ElectronicMail>`);
    parts.push('</cac:Contact>');
  }
  parts.push(`</cac:Party></${tag}>`);
  return parts.join('');
}

/**
 * Render the document and validate it. A credit note (381) is rendered with
 * positive amounts — UBL's CreditNote carries the sign in the document type —
 * so a FlowWink credit note stored negative is passed through Math.abs here.
 */
export function buildUblInvoice(input: UblInvoiceInput): UblResult {
  const isCredit = input.invoice_type === 'credit_note';
  const root = isCredit ? 'CreditNote' : 'Invoice';
  const ns = isCredit
    ? 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2'
    : 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const typeTag = isCredit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode';
  const typeCode = isCredit ? '381' : '380';
  const lineTag = isCredit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
  const qtyTag = isCredit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';

  const errors: string[] = [];
  const warnings: string[] = [];
  const cur = (input.currency || '').toUpperCase();
  const rate = Number(input.tax_rate) || 0;
  const category = taxCategoryFor(rate);
  const ratePct = Math.round(rate * 10000) / 100; // 0.25 → 25

  // ── Lines and totals (cents, integer arithmetic) ─────────────────────────
  const lines = (input.lines ?? []).filter((l) => l && (l.description ?? '').trim() !== '' || (l?.qty ?? 0) !== 0);
  const lineXml: string[] = [];
  let lineExtension = 0;
  lines.forEach((l, i) => {
    const gross = Math.round(Math.abs(l.qty) * Math.abs(l.unit_price_cents));
    const net = Math.abs(lineNetCents({ ...l, qty: Math.abs(l.qty), unit_price_cents: Math.abs(l.unit_price_cents) }));
    const allowance = gross - net;
    lineExtension += net;
    const unit = (l.unit ?? 'C62').trim() || 'C62';
    const parts: string[] = [];
    parts.push(`<${lineTag}><cbc:ID>${i + 1}</cbc:ID>`);
    parts.push(`<${qtyTag} unitCode="${esc(unit)}">${esc(String(Math.abs(l.qty)))}</${qtyTag}>`);
    parts.push(`<cbc:LineExtensionAmount currencyID="${esc(cur)}">${money(net)}</cbc:LineExtensionAmount>`);
    if (allowance > 0) {
      parts.push(`<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode><cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason><cbc:MultiplierFactorNumeric>${esc(String(l.discount_pct))}</cbc:MultiplierFactorNumeric><cbc:Amount currencyID="${esc(cur)}">${money(allowance)}</cbc:Amount><cbc:BaseAmount currencyID="${esc(cur)}">${money(gross)}</cbc:BaseAmount></cac:AllowanceCharge>`);
    }
    parts.push(`<cac:Item><cbc:Name>${esc((l.description || `Line ${i + 1}`).slice(0, 200))}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${esc(String(ratePct))}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>`);
    parts.push(`<cac:Price><cbc:PriceAmount currencyID="${esc(cur)}">${money(Math.abs(l.unit_price_cents))}</cbc:PriceAmount></cac:Price>`);
    parts.push(`</${lineTag}>`);
    lineXml.push(parts.join(''));
    if (!(l.description ?? '').trim()) warnings.push(`Line ${i + 1} has no description (BT-153); "Line ${i + 1}" was written.`);
  });
  const taxExclusive = lineExtension;
  const tax = Math.round(taxExclusive * rate);
  const taxInclusive = taxExclusive + tax;
  const prepaid = Math.min(Math.max(0, Math.round(Math.abs(input.paid_amount_cents ?? 0))), taxInclusive);
  const payable = taxInclusive - prepaid;

  // ── Validation (the rules that decide acceptance in practice) ────────────
  if (!input.invoice_number?.trim()) errors.push('BR-02: the invoice has no number (BT-1).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date ?? '')) errors.push('BR-03: issue date (BT-2) must be YYYY-MM-DD.');
  if (!/^[A-Z]{3}$/.test(cur)) errors.push('BR-05: the currency (BT-5) must be an ISO 4217 code.');
  if (lines.length === 0) errors.push('BR-16: an invoice needs at least one line (BG-25).');
  if (!input.seller.name?.trim()) errors.push('BR-06: the seller has no name (BT-27) — fill in the company profile.');
  if (!input.buyer.name?.trim()) errors.push('BR-07: the buyer has no name (BT-44).');
  if (!countryOf(input.seller)) errors.push('BR-09: the seller address has no country (BT-40).');
  if (!countryOf(input.buyer)) errors.push('BR-11: the buyer address has no country (BT-55).');
  const sellerId = peppolParticipantId(input.seller);
  const buyerId = peppolParticipantId(input.buyer);
  if (!sellerId) errors.push('PEPPOL-EN16931-R020: the seller needs an electronic address (BT-34) — a Swedish organisationsnummer (0007) or a VAT id (9955).');
  if (!buyerId) errors.push('PEPPOL-EN16931-R010: the buyer needs an electronic address (BT-49) — add the organisationsnummer or VAT id on the company.');
  if (input.seller.org_number && !isValidSwedishOrgNumber(input.seller.org_number)) errors.push(`The seller organisationsnummer "${input.seller.org_number}" fails the Luhn check.`);
  if (input.buyer.org_number && !isValidSwedishOrgNumber(input.buyer.org_number)) warnings.push(`The buyer organisationsnummer "${input.buyer.org_number}" fails the Luhn check.`);
  if (!input.seller.vat_number?.trim()) warnings.push('BR-CO-26 / BR-S-02: the seller has no VAT id (BT-31); a standard-rated invoice needs one.');
  if (!input.seller.street && !input.seller.city) warnings.push('Seller address (BG-5) is empty beyond the country.');
  if (!(input.buyer_reference ?? '').trim() && !(input.order_reference ?? '').trim()) {
    errors.push('PEPPOL-EN16931-R003: a buyer reference (BT-10) or purchase order reference (BT-13) is required.');
  }
  if (isCredit && !(input.credited_invoice_number ?? '').trim()) warnings.push('BT-25: the credit note names no preceding invoice.');
  if (!isCredit && !input.due_date && !(input.payment_terms ?? '').trim()) errors.push('PEPPOL-EN16931-R061/BR-CO-25: an invoice with an amount due needs a due date (BT-9) or payment terms (BT-20).');
  if (payable > 0 && !input.payment.bankgiro && !input.payment.iban) errors.push('BG-16: no payment means — add a bankgiro or IBAN under Invoices → E-invoice.');
  if (input.payment.iban && !input.payment.bic) warnings.push('BT-86: an IBAN without a BIC — some receivers require it.');
  if (!isCredit && lines.some((l) => l.qty < 0 || l.unit_price_cents < 0)) warnings.push('A negative line on an invoice (380) — a credit belongs in a credit note (381).');

  // ── Document ─────────────────────────────────────────────────────────────
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<${root} xmlns="${ns}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`);
  out.push('<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>');
  out.push('<cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>');
  out.push(`<cbc:ID>${esc(input.invoice_number)}</cbc:ID>`);
  out.push(`<cbc:IssueDate>${esc(input.issue_date)}</cbc:IssueDate>`);
  if (!isCredit && input.due_date) out.push(`<cbc:DueDate>${esc(input.due_date)}</cbc:DueDate>`);
  out.push(`<${typeTag}>${typeCode}</${typeTag}>`);
  if (input.note) out.push(`<cbc:Note>${esc(input.note.slice(0, 1000))}</cbc:Note>`);
  out.push(`<cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>`);
  if (input.buyer_reference) out.push(`<cbc:BuyerReference>${esc(input.buyer_reference)}</cbc:BuyerReference>`);
  if (input.order_reference) out.push(`<cac:OrderReference><cbc:ID>${esc(input.order_reference)}</cbc:ID></cac:OrderReference>`);
  if (isCredit && input.credited_invoice_number) {
    out.push(`<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(input.credited_invoice_number)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`);
  }
  out.push(partyXml('cac:AccountingSupplierParty', input.seller));
  out.push(partyXml('cac:AccountingCustomerParty', input.buyer));
  if (!isCredit && (input.payment.bankgiro || input.payment.iban)) {
    // 30 = credit transfer. Bankgiro is a Swedish account scheme: the account id
    // is the bankgiro number and the "bank" is SE:BANKGIRO, which is how Peppol
    // receivers in Sweden expect it.
    const pm: string[] = ['<cac:PaymentMeans><cbc:PaymentMeansCode name="Credit transfer">30</cbc:PaymentMeansCode>'];
    pm.push(`<cbc:PaymentID>${esc(input.invoice_number)}</cbc:PaymentID>`);
    if (input.payment.bankgiro) {
      pm.push(`<cac:PayeeFinancialAccount><cbc:ID>${esc(digitsOnly(input.payment.bankgiro))}</cbc:ID><cac:FinancialInstitutionBranch><cbc:ID>SE:BANKGIRO</cbc:ID></cac:FinancialInstitutionBranch></cac:PayeeFinancialAccount>`);
    } else {
      pm.push(`<cac:PayeeFinancialAccount><cbc:ID>${esc((input.payment.iban ?? '').replace(/\s/g, ''))}</cbc:ID>${input.payment.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${esc(input.payment.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}</cac:PayeeFinancialAccount>`);
    }
    pm.push('</cac:PaymentMeans>');
    out.push(pm.join(''));
  }
  if (input.payment_terms) out.push(`<cac:PaymentTerms><cbc:Note>${esc(input.payment_terms)}</cbc:Note></cac:PaymentTerms>`);
  out.push(`<cac:TaxTotal><cbc:TaxAmount currencyID="${esc(cur)}">${money(tax)}</cbc:TaxAmount>`);
  out.push(`<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${esc(cur)}">${money(taxExclusive)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${esc(cur)}">${money(tax)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${esc(String(ratePct))}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>`);
  out.push('</cac:TaxTotal>');
  out.push('<cac:LegalMonetaryTotal>');
  out.push(`<cbc:LineExtensionAmount currencyID="${esc(cur)}">${money(lineExtension)}</cbc:LineExtensionAmount>`);
  out.push(`<cbc:TaxExclusiveAmount currencyID="${esc(cur)}">${money(taxExclusive)}</cbc:TaxExclusiveAmount>`);
  out.push(`<cbc:TaxInclusiveAmount currencyID="${esc(cur)}">${money(taxInclusive)}</cbc:TaxInclusiveAmount>`);
  if (prepaid > 0) out.push(`<cbc:PrepaidAmount currencyID="${esc(cur)}">${money(prepaid)}</cbc:PrepaidAmount>`);
  out.push(`<cbc:PayableAmount currencyID="${esc(cur)}">${money(payable)}</cbc:PayableAmount>`);
  out.push('</cac:LegalMonetaryTotal>');
  out.push(...lineXml);
  out.push(`</${root}>`);

  return {
    xml: out.join('\n'),
    validation: { ok: errors.length === 0, errors, warnings },
    totals: { line_extension_cents: lineExtension, tax_exclusive_cents: taxExclusive, tax_cents: tax, tax_inclusive_cents: taxInclusive, prepaid_cents: prepaid, payable_cents: payable },
    recipient_id: buyerId,
    sender_id: sellerId,
  };
}
