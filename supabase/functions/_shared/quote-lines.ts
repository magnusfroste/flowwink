/**
 * Where a quote's lines live — the edge layer's expression of ONE rule.
 *
 * Quote lines are stored in two places while the convergence on `quote_items`
 * finishes:
 *   - `quote_items` (the TABLE) — written by the agent/MCP path
 *     (agent-execute `manage_quote`), by `quotes-module.ts` when a quote is
 *     created from a template or a deal, and by `comms-send/quote_email.ts`.
 *     The `recalc_quote_totals` trigger keeps the quote header's totals in step
 *     with these rows.
 *   - `quotes.line_items` (the JSONB column) — written by the admin panel
 *     (`QuoteDetailSheet`) and `CreateQuoteDialog`.
 *
 * The rule, stated once and mirrored everywhere it is needed:
 *   THE TABLE WINS WHEN IT HAS ROWS; the JSONB column is the fallback.
 *
 * The three places that express it, which must never disagree:
 *   1. `public.get_public_quote(text)` (SQL) — what the CUSTOMER's page renders.
 *   2. `src/lib/quote-lines.ts` `resolveQuoteLines` — what the ADMIN panel edits.
 *   3. this module — what the SIGNING endpoint hashes and invoices.
 * `src/lib/__tests__/quote-signature-hash-covers-lines.guardrails.test.ts`
 * pins them to each other. Do not add a fourth opinion; extend this one.
 *
 * Deno cannot import `src/lib/quote-lines.ts` (it speaks the `@/` alias and
 * pulls React-side types), so this file mirrors the rule instead of importing
 * it — and stays free of Deno-only globals so vitest can execute it directly.
 *
 * Everything here is fail-closed. A signature is a legal artifact: a proof
 * that could not be built must never look like a proof that was built.
 */

/** A row as it comes off the `quote_items` table. */
export interface QuoteItemRow {
  description?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  unit_price_cents?: number | string | null;
  line_total_cents?: number | string | null;
  discount_pct?: number | string | null;
  product_id?: string | null;
  position?: number | null;
  is_optional?: boolean | null;
  selected_by_customer?: boolean | null;
}

/**
 * One line exactly as the customer read it on the public quote page.
 * The field set and the normalization mirror `get_public_quote` — the hash has
 * to cover the document that was SHOWN, not a different projection of it.
 * `id` is deliberately absent: it identifies a row, it is not content, and the
 * JSONB fallback synthesizes it from the array position.
 */
export interface SignedQuoteLine {
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price_cents: number;
  line_total_cents: number;
  is_optional: boolean;
  selected_by_customer: boolean;
}

export type SignedQuoteLineOrigin = 'quote_items' | 'line_items' | 'none';

export type ResolveSignedQuoteLinesResult =
  | { ok: true; origin: SignedQuoteLineOrigin; lines: SignedQuoteLine[] }
  | { ok: false; code: 'quote_lines_unreadable' | 'quote_lines_missing'; reason: string };

export interface ResolveSignedQuoteLinesInput {
  /** Did the `quote_items` read finish WITHOUT an error? */
  itemsReadOk: boolean;
  /** Rows from `quote_items` for this quote (empty array when there are none). */
  itemRows: QuoteItemRow[] | null | undefined;
  /** The `quotes.line_items` JSONB, as loaded with the quote row. */
  jsonbLines: unknown;
  /** The quote header's total. A total with no readable lines is a broken document. */
  totalCents: number;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : v == null ? null : String(v);
}

/** `quote_items` row → the shape the public page renders. */
function fromItemRow(row: QuoteItemRow): SignedQuoteLine {
  const quantity = num(row.quantity, 0);
  const unitPrice = num(row.unit_price_cents, 0);
  return {
    description: str(row.description),
    quantity,
    unit: str(row.unit),
    unit_price_cents: unitPrice,
    // The table stores the line total precomputed (it carries per-line discount
    // and tax); only a NULL falls back to the naive product.
    line_total_cents:
      row.line_total_cents == null ? Math.round(quantity * unitPrice) : num(row.line_total_cents, 0),
    is_optional: row.is_optional === true,
    selected_by_customer: row.selected_by_customer !== false,
  };
}

/**
 * A `quotes.line_items` entry → the same shape. Mirrors the fallback branch of
 * `get_public_quote`: the JSONB says `qty` where the table says `quantity`, it
 * has no optional-items concept (every line is included), and the line total is
 * computed rather than stored.
 */
function fromJsonbLine(raw: unknown): SignedQuoteLine {
  const li = (raw ?? {}) as Record<string, unknown>;
  const quantity = li.qty != null ? num(li.qty, 1) : li.quantity != null ? num(li.quantity, 1) : 1;
  const unitPrice = num(li.unit_price_cents, 0);
  return {
    description: str(li.description),
    quantity,
    unit: str(li.unit),
    unit_price_cents: unitPrice,
    line_total_cents: Math.round(quantity * unitPrice),
    is_optional: false,
    selected_by_customer: true,
  };
}

/**
 * Resolve the lines a signature must cover — or refuse.
 *
 * Refuses in exactly two situations, both of which used to produce a hash over
 * an empty list:
 *   - the `quote_items` read did not complete → we cannot know where the lines
 *     live, so we cannot know what we are hashing;
 *   - no lines came back from either store, yet the quote claims money → the
 *     document is inconsistent and the price cannot be evidenced.
 */
export function resolveSignedQuoteLines(
  input: ResolveSignedQuoteLinesInput,
): ResolveSignedQuoteLinesResult {
  if (!input.itemsReadOk) {
    return {
      ok: false,
      code: 'quote_lines_unreadable',
      reason:
        "Could not read this quote's line items — nothing was signed. Reload the quote and try again.",
    };
  }

  const rows = Array.isArray(input.itemRows) ? input.itemRows : [];
  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => num(a.position, 0) - num(b.position, 0));
    return { ok: true, origin: 'quote_items', lines: sorted.map(fromItemRow) };
  }

  const jsonb = Array.isArray(input.jsonbLines) ? (input.jsonbLines as unknown[]) : [];
  if (jsonb.length > 0) {
    return { ok: true, origin: 'line_items', lines: jsonb.map(fromJsonbLine) };
  }

  if (num(input.totalCents, 0) !== 0) {
    return {
      ok: false,
      code: 'quote_lines_missing',
      reason:
        'This quote shows a total but no line items could be read for it — nothing was signed. Contact us and we will send a corrected quote.',
    };
  }

  // A genuinely empty quote worth nothing: hashing an empty list is the truth
  // here, not a hole in the evidence.
  return { ok: true, origin: 'none', lines: [] };
}

/**
 * The lines that go on the invoice the acceptance creates: the ones the
 * customer actually bought. An optional line the customer left unticked is not
 * part of the sale — the same lines `set_quote_item_selection` excludes when it
 * recomputes the totals.
 */
export function invoiceLinesForSignedQuote(input: {
  origin: SignedQuoteLineOrigin;
  lines: SignedQuoteLine[];
  jsonbLines: unknown;
}): Array<Record<string, unknown>> {
  // When the JSONB column IS the source, hand it through untouched: it can
  // carry `product_id` and `discount_pct`, which the public projection drops.
  // Narrowing it here would silently strip a discount off the invoice.
  if (input.origin === 'line_items' && Array.isArray(input.jsonbLines)) {
    return input.jsonbLines as Array<Record<string, unknown>>;
  }
  return input.lines
    .filter((l) => !l.is_optional || l.selected_by_customer)
    .map((l) => ({
      description: l.description ?? '',
      qty: l.quantity,
      unit_price_cents: l.unit_price_cents,
      ...(l.unit ? { unit: l.unit } : {}),
    }));
}

/**
 * The algorithm stamp carried INSIDE `quote_signatures.content_hash`, as
 * `<alg>:<hex>`.
 *
 * It lives in the value rather than in a column of its own on purpose. The
 * stamp describes the digest; if the two are stored apart they can be separated
 * — by a schema squash, by a row copy, by an edge deploy that lands before its
 * migration — and a v2 hash would then read as a v1 one, or worse, the reverse.
 * A self-describing digest is the same reason `sha256:…` prefixes exist in OCI
 * and `$2b$` in bcrypt.
 *
 * Legacy rows carry a BARE 64-character hex: those hashes were computed over
 * `quote.line_items ?? []`, which for an agent-written quote was an empty list.
 * They are never recomputed — rewriting them would be forging history — and the
 * certificate page reports them for what they are.
 */
export const QUOTE_CONTENT_HASH_ALG = 'sha256-quote-v2';

/**
 * The canonical document a quote signature covers. Everything the customer read
 * on the public page, lines included, in the order they read it.
 * `hash_alg` is inside the payload as well as in front of the digest, so a v2
 * hash can never collide with the v1 hash of some other document.
 */
export function buildQuoteSignaturePayload(input: {
  quote: Record<string, unknown>;
  lines: SignedQuoteLine[];
}): string {
  const q = input.quote;
  return JSON.stringify({
    hash_alg: QUOTE_CONTENT_HASH_ALG,
    quote_number: q.quote_number,
    title: q.title ?? null,
    intro_text: q.intro_text ?? null,
    terms_text: q.terms_text ?? null,
    line_items: input.lines,
    subtotal_cents: q.subtotal_cents,
    tax_cents: q.tax_cents,
    total_cents: q.total_cents,
    currency: q.currency,
    valid_until: q.valid_until ?? null,
    version: q.version ?? 1,
  });
}
