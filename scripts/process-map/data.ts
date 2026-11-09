/**
 * The curated half of the process map (`npm run docs:process-map`).
 *
 * Everything else — titles, problems, maturity, modules, steps — is read from
 * docs/processes/*.md. What lives here is what no single doc states: which
 * family a process belongs to, which hand-offs between processes are real,
 * and the one purchase traced through the code. A guard
 * (process-map-stays-true) keeps every entry pointing at something that
 * exists: a process doc, a source symbol.
 */

export interface Family { name: string; color: string; slugs: string[] }

/** Column order of the map; every process doc belongs to exactly one family. */
export const FAMILIES: Family[] = [
  { name: 'Attrahera & sälja', color: '#2a78d6', slugs: ['content-to-conversion', 'register-to-attend', 'book-to-meet', 'propose-to-meet', 'lead-to-customer', 'quote-to-cash'] },
  { name: 'Avtal & återkommande', color: '#6250d6', slugs: ['sign-to-serve', 'subscribe-to-renew', 'support-to-resolution'] },
  { name: 'Leverera varor', color: '#eb6834', slugs: ['order-to-delivery', 'return-to-refund', 'procure-to-pay', 'plan-to-produce'] },
  { name: 'Projekt', color: '#1baf7a', slugs: ['plan-to-deliver'] },
  { name: 'Ekonomi & personal', color: '#c98500', slugs: ['record-to-report', 'acquire-to-retire', 'hire-to-retire'] },
];

/** A hand-off: the first process's outcome is where the second begins. `why` names where the doc says so. */
export const HANDOFFS: Array<{ from: string; to: string; both?: boolean; why: string }> = [
  { from: 'content-to-conversion', to: 'lead-to-customer', why: 'content-to-conversion.md: a reader becomes a lead' },
  { from: 'register-to-attend', to: 'lead-to-customer', why: 'register-to-attend.md: every registration is a scored lead' },
  { from: 'propose-to-meet', to: 'book-to-meet', why: 'propose-to-meet.md: a customer-facing poll creates a booking' },
  { from: 'lead-to-customer', to: 'quote-to-cash', why: 'lead-to-customer.md' },
  { from: 'quote-to-cash', to: 'sign-to-serve', why: "sign-to-serve.md: the quote's lines land in the agreement" },
  { from: 'sign-to-serve', to: 'subscribe-to-renew', why: 'sign-to-serve.md: create_subscription_from_contract' },
  { from: 'sign-to-serve', to: 'support-to-resolution', why: 'sign-to-serve.md: the ticket carries the subscription' },
  { from: 'plan-to-produce', to: 'procure-to-pay', why: 'plan-to-produce.md: trigger_procurement_for_mo' },
  { from: 'plan-to-produce', to: 'order-to-delivery', why: 'plan-to-produce.md: finished goods to the shelf' },
  { from: 'order-to-delivery', to: 'return-to-refund', both: true, why: 'order-to-delivery.md / return-to-refund.md' },
];

/** Modules whose presence means a process writes the ledger — drawn as a booking line into Record-to-Report. */
export const LEDGER_MODULES = ['Accounting', 'Invoicing', 'Expenses', 'Reconciliation'];

/** Raw module names in the docs → the one name the map shows. */
export const MODULE_ALIASES: Record<string, string> = {
  'crm (leads)': 'CRM / Leads', crm: 'CRM / Leads', leads: 'CRM / Leads', 'crm / deals': 'Deals', deals: 'Deals',
  'companies (b2b portal)': 'Companies', companies: 'Companies', 'e-commerce': 'Products & orders', products: 'Products & orders',
  'hr (employees)': 'HR', hr: 'HR', resume: 'Consultants', 'fixed-assets': 'Fixed assets', 'knowledge base': 'Knowledge base',
  account: 'Customer portal', 'ai chat': 'Chat', booking: 'Bookings', sla: 'SLA', pos: 'POS', flowpilot: 'FlowPilot',
  'meeting polls': 'Meeting Polls',
};

/**
 * One purchase, from the checkout to the close — the webshop order traced
 * through the code. `evidence` is a symbol that must still exist in the
 * source (supabase/ or src/) for the step to be told; `file` narrows where.
 */
export const PURCHASE_CHAIN: Array<{ title: string; module: string; text: string; evidence: string; file?: string }> = [
  { title: 'Kunden handlar i webbshoppen', module: 'Products & orders', text: 'Stripe Checkout (create-checkout). Ordern skapas med status pending.', evidence: 'create-checkout', file: 'supabase/functions/create-checkout/index.ts' },
  { title: 'Betalningen bekräftas', module: 'Products & orders', text: 'stripe-webhook markerar ordern betald och sänder händelsen order.paid.', evidence: 'order.paid', file: 'supabase/functions/stripe-webhook/index.ts' },
  { title: 'Försäljningen bokförs', module: 'Accounting', text: 'book_order_paid: intäkt och moms per rad, i bolagets valuta.', evidence: 'FUNCTION public.book_order_paid' },
  { title: 'Kvittot blir en faktura', module: 'Invoicing', text: 'Automationen "Receipt on paid order" → send_invoice_for_order (receipt): en betald faktura i /admin/invoices, mejlad på orderns språk.', evidence: "name: 'Receipt on paid order'", file: 'src/lib/modules/products-module.ts' },
  { title: 'Plocket startar', module: 'Inventory', text: 'Automationen "Auto-allocate picking on order paid" → allocate_picking reserverar lagret rad för rad.', evidence: "name: 'Auto-allocate picking on order paid'", file: 'src/lib/modules/inventory-module.ts' },
  { title: 'Paketet skickas', module: 'Inventory', text: 'confirm_pick → ship_picking: bärare och spårnummer stämplas på ordern.', evidence: 'ship_picking' },
  { title: 'Varukostnaden lämnar med varan', module: 'Accounting', text: 'consume_order_stock vid leverans: FEFO ur lagret, kostnad såld vara bokförs (Dt KSV / Kr lager).', evidence: 'FUNCTION public.consume_order_stock' },
  { title: 'Månaden stängs', module: 'Accounting', text: 'Record-to-Report: råbalans, momsdeklaration, månadsbokslut — samma rader som ordern skrev.', evidence: 'close_accounting_period' },
];
