/**
 * The words on the invoice PDF, in the customer's language.
 *
 * They are visitor texts (`invoice.*`), the same keys the invoice page reads,
 * so the PDF and the page say the same thing and an operator translates them
 * once — under Visitor texts, or with `translate_ui_text`. A paid invoice is
 * the order's receipt (send_invoice_for_order receipt: true) and is headed so;
 * it has no due date, as the page shows none.
 */
import type { UiText } from '../locale/ui-text.ts';

export interface InvoicePdfLabels {
  heading: string;
  billTo: string;
  number: string;
  status: string;
  statusValue: string;
  date: string;
  due: string;
  showDue: boolean;
  description: string;
  qty: string;
  unitPrice: string;
  amount: string;
  subtotal: string;
  tax: string;
  /** "VAT in SEK (rate 11.0234)" */
  vatInHome: (currency: string, rate: string) => string;
  total: string;
  notes: string;
  generated: string;
}

export function invoicePdfLabels(t: UiText, status: string): InvoicePdfLabels {
  const paid = status === 'paid';
  const cancelled = status === 'cancelled';
  return {
    heading: (paid ? t('invoice.receipt', 'Receipt') : t('invoice.title', 'Invoice')).toUpperCase(),
    billTo: t('invoice.billTo', 'Bill to').toUpperCase(),
    number: t('invoice.number', 'Invoice #'),
    status: t('invoice.status', 'Status'),
    statusValue: (paid
      ? t('invoice.statusPaid', 'Paid')
      : cancelled ? t('invoice.statusCancelled', 'Cancelled') : t('invoice.statusOpen', 'Open')).toUpperCase(),
    date: t('invoice.date', 'Date'),
    due: t('invoice.due', 'Due'),
    showDue: !paid,
    description: t('invoice.description', 'Description'),
    qty: t('invoice.qty', 'Qty'),
    unitPrice: t('invoice.unitPrice', 'Unit price'),
    amount: t('invoice.amount', 'Amount'),
    subtotal: t('invoice.subtotal', 'Subtotal'),
    tax: t('invoice.tax', 'Tax'),
    vatInHome: (currency, rate) =>
      t('invoice.vatInHome', 'VAT in {currency} (rate {rate})').replace('{currency}', currency).replace('{rate}', rate),
    total: t('invoice.total', 'Total').toUpperCase(),
    notes: t('invoice.notes', 'Notes'),
    generated: t('invoice.generated', 'Generated'),
  };
}
