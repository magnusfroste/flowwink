import type { InvoiceLineItem } from '@/hooks/useInvoices';

/**
 * Quote lines live in TWO places, and a save that only knows one of them is a
 * data-loss weapon.
 *
 *  - The MCP/agent path writes rows into the `quote_items` TABLE
 *    (agent-execute `manage_quote`). The `recalc_quote_totals` trigger keeps
 *    quotes.subtotal/tax/total in step with those rows.
 *  - The admin panel writes the `quotes.line_items` JSONB column and computes
 *    the totals itself.
 *
 * An agent-written quote therefore has rows in `quote_items` and an EMPTY
 * `line_items` column. The admin sheet loaded `line_items` (→ []), recomputed
 * `computeInvoiceTotals([], rate)` (→ 0) and wrote both back on Save: a
 * 2 247,50 kr quote became 0 kr from one click, with nothing edited. An
 * accepted-and-paid quote renders in the same panel and was one click from the
 * same fate.
 *
 * The convergence of the two stores is a separate decision. Until then this
 * module is the single place that answers "where do THIS quote's lines live,
 * and is this save allowed to touch lines and totals at all?" — and it answers
 * fail-closed: a list that was never read must never become a write.
 */

/** A row as it comes off the `quote_items` table. */
export interface QuoteItemRow {
  id?: string;
  description?: string | null;
  quantity?: number | null;
  unit_price_cents?: number | null;
  discount_pct?: number | null;
  product_id?: string | null;
  position?: number | null;
  is_optional?: boolean | null;
  selected_by_customer?: boolean | null;
}

/**
 * Where the lines the panel is showing actually came from.
 * `unknown` means the read did not complete — the only honest answer when the
 * `quote_items` query is still loading or errored, and the one that must block
 * a write.
 */
export type QuoteLineOrigin = 'quote_items' | 'line_items' | 'none' | 'unknown';

/** `quote_items` row → the shape the admin panel and totals math speak. */
export function mapQuoteItemRow(row: QuoteItemRow): InvoiceLineItem {
  return {
    description: row.description ?? '',
    qty: Number(row.quantity ?? 0),
    unit_price_cents: Number(row.unit_price_cents ?? 0),
    product_id: row.product_id ?? null,
    ...(row.discount_pct ? { discount_pct: Number(row.discount_pct) } : {}),
  };
}

export interface ResolveQuoteLinesInput {
  /** Did the `quote_items` read finish successfully? */
  itemsLoaded: boolean;
  /** Rows from `quote_items` for this quote (empty array when there are none). */
  itemRows: QuoteItemRow[] | undefined | null;
  /** The `quotes.line_items` JSONB, as loaded with the quote. */
  jsonbLines: InvoiceLineItem[] | undefined | null;
}

export interface ResolvedQuoteLines {
  origin: QuoteLineOrigin;
  items: InvoiceLineItem[];
  /** True when the panel may edit these lines in place (JSONB is its own store). */
  editable: boolean;
}

/**
 * The table wins when it has rows — it is the store the trigger recalculates
 * from, so it is the store that backs the totals on the quote header. The JSONB
 * column is the admin-composed fallback, exactly like `get_public_quote` does
 * it for the customer-facing page.
 */
export function resolveQuoteLines(input: ResolveQuoteLinesInput): ResolvedQuoteLines {
  const jsonb = Array.isArray(input.jsonbLines) ? input.jsonbLines : [];

  if (!input.itemsLoaded) {
    // Not read yet — say so. Showing the JSONB here would let a save that never
    // saw the table's rows look like a save that did.
    return { origin: 'unknown', items: jsonb, editable: false };
  }

  const rows = Array.isArray(input.itemRows) ? input.itemRows : [];
  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
    return { origin: 'quote_items', items: sorted.map(mapQuoteItemRow), editable: false };
  }

  if (jsonb.length > 0) return { origin: 'line_items', items: jsonb, editable: true };

  return { origin: 'none', items: [], editable: true };
}

export interface QuoteSaveGuardInput {
  origin: QuoteLineOrigin;
  /** Number of lines the form currently holds (what the save would write). */
  editedLineCount: number;
  /** Number of lines the panel LOADED for this quote (before any editing). */
  loadedLineCount: number;
  /** The quote's current total in the database. */
  currentTotalCents: number;
}

// `reason?: never` on the all-clear arm is a compiler affordance, not a field.
// tsconfig.app.json sets "strict": false, and without strictNullChecks
// TypeScript will not narrow a discriminated union by truthiness — so inside
// `if (!decision.allowed)` the union is still all three arms and `.reason`
// cannot be read. Declaring the absent property as optional-never keeps the
// call sites written the way the guardrail pins them
// (quote-lines-two-stores.guardrails.test.ts), says out loud that this arm
// carries no reason, and emits nothing at runtime.
export type QuoteSaveDecision =
  /** Save everything, lines and totals included. */
  | { allowed: true; writeLines: true; reason?: never }
  /** Save the other fields; leave lines and totals to whoever owns them. */
  | { allowed: true; writeLines: false; reason: string }
  /** Refuse — saving would destroy money the panel never loaded. */
  | { allowed: false; reason: string };

/**
 * Decide what a Save is permitted to write. Fail-closed by construction:
 * every branch that cannot prove the lines were read refuses to write lines or
 * totals. Refusing a save is recoverable; a zeroed accepted quote is not.
 */
export function decideQuoteSave(input: QuoteSaveGuardInput): QuoteSaveDecision {
  if (input.origin === 'unknown') {
    return {
      allowed: false,
      reason:
        "Could not read this quote's line items — nothing was saved. Reopen the quote and try again.",
    };
  }

  if (input.origin === 'quote_items') {
    return {
      allowed: true,
      writeLines: false,
      reason:
        'The line items of this quote are stored on the quote itself (written by the agent/API path). ' +
        'Other fields were saved; the lines and totals were left untouched.',
    };
  }

  // The panel loaded nothing, the form holds nothing — yet the quote claims
  // money. Something else owns those lines (or the row is inconsistent).
  // Writing zeros here is the bug, not the fix.
  if (input.editedLineCount === 0 && input.loadedLineCount === 0 && input.currentTotalCents !== 0) {
    return {
      allowed: false,
      reason:
        `This quote shows a total but no line items could be loaded for it — saving would zero it. ` +
        `Nothing was saved.`,
    };
  }

  return { allowed: true, writeLines: true };
}

/**
 * The same defect one document downstream: converting a quote whose lines the
 * caller could not read produces an invoice with no lines and a total that the
 * invoice sheet's own Save would then zero. Refuse the conversion instead.
 */
export function canConvertQuoteToInvoice(input: {
  origin: QuoteLineOrigin;
  resolvedLineCount: number;
  totalCents: number;
}): { ok: true; reason?: never } | { ok: false; reason: string } {
  if (input.origin === 'unknown') {
    return {
      ok: false,
      reason: "Could not read this quote's line items — no invoice was created. Reopen and try again.",
    };
  }
  if (input.resolvedLineCount === 0 && input.totalCents !== 0) {
    return {
      ok: false,
      reason:
        'This quote has a total but no readable line items — an invoice made from it would be empty. Nothing was created.',
    };
  }
  return { ok: true };
}
