import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveUiText, type UiTextMap } from '../../../supabase/functions/_shared/locale/ui-text';
import { invoicePdfLabels } from '../../../supabase/functions/_shared/invoices/pdf-labels';
import { extractUiTextKeys } from '../../../scripts/lib/extract-ui-text-keys.mjs';

// LiteIT's shape: a Swedish site, its texts under @sv.
const SWEDISH: UiTextMap = {
  '@sv': {
    'invoice.receipt': 'Kvitto',
    'invoice.title': 'Faktura',
    'invoice.statusPaid': 'Betald',
    'invoice.total': 'Totalt',
    'invoice.billTo': 'Faktureras',
  },
};

describe('the invoice PDF speaks the customer\'s language', () => {
  it('a paid invoice is headed as the receipt, in Swedish, with no due date', () => {
    const L = invoicePdfLabels(resolveUiText(SWEDISH, 'sv', 'sv'), 'paid');
    expect(L.heading).toBe('KVITTO');
    expect(L.statusValue).toBe('BETALD');
    expect(L.total).toBe('TOTALT');
    expect(L.billTo).toBe('FAKTURERAS');
    expect(L.showDue).toBe(false);
  });

  it('an open invoice is an invoice and shows its due date', () => {
    const L = invoicePdfLabels(resolveUiText(SWEDISH, 'sv', 'sv'), 'sent');
    expect(L.heading).toBe('FAKTURA');
    expect(L.statusValue).toBe('OPEN');
    expect(L.showDue).toBe(true);
  });

  it('an English customer on a Swedish site gets English, never the Swedish texts', () => {
    const L = invoicePdfLabels(resolveUiText(SWEDISH, 'en', 'sv'), 'paid');
    expect(L.heading).toBe('RECEIPT');
    expect(L.total).toBe('TOTAL');
  });

  it('nothing translated is the English the PDF always had', () => {
    const L = invoicePdfLabels(resolveUiText({}, 'sv', 'sv'), 'sent');
    expect([L.heading, L.billTo, L.number, L.description, L.qty, L.unitPrice, L.amount, L.subtotal, L.tax, L.total])
      .toEqual(['INVOICE', 'BILL TO', 'Invoice #', 'Description', 'Qty', 'Unit price', 'Amount', 'Subtotal', 'Tax', 'TOTAL']);
    expect(L.vatInHome('SEK', '11.0234')).toBe('VAT in SEK (rate 11.0234)');
  });

  it('the PDF draws no hardcoded label', () => {
    const src = readFileSync('supabase/functions/generate-invoice-pdf/index.ts', 'utf8');
    for (const word of ['"INVOICE"', '"BILL TO"', '"Description"', '"Qty"', '"Unit Price"', '"Amount"', '"Subtotal"', '"TOTAL"', '"Notes"', '`Tax (', 'Due Date']) {
      expect(src, `${word} is drawn as code`).not.toContain(word);
    }
    expect(src).toContain('invoicePdfLabels(');
  });

  it('its keys are in the visitor-text catalogue, so an operator can translate them', () => {
    const keys = new Set((extractUiTextKeys(process.cwd()) as Array<{ key: string }>).map((k) => k.key));
    for (const k of ['invoice.billTo', 'invoice.unitPrice', 'invoice.vatInHome', 'invoice.generated']) expect(keys.has(k), k).toBe(true);
    const catalog = JSON.parse(readFileSync('src/data/ui-text-catalog.json', 'utf8')) as { keys: Array<{ key: string }> };
    expect(catalog.keys.some((k) => k.key === 'invoice.billTo')).toBe(true);
  });
});
