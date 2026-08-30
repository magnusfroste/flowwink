/**
 * Self-correcting errors for the generic CRUD path.
 *
 * FlowWink has three ways a skill reaches the database, and until now only two
 * of them told an agent how to fix a wrong guess:
 *
 *   RPC        "missing required parameters: [customer_name, product_name…];
 *               this skill requires […]; you sent […]"
 *   staged     "vendor_name → did you mean \"vendor_id\"? Valid parameters: …"
 *   generic    "Could not find the 'amount_cents' column of 'vendor_invoices'"
 *
 * The third is a dead end. It names the mistake and stops — and a model in a
 * loop answers a dead end by looking for another door, which is exactly the
 * failure the parameter-contract bounce was written to stop. Measured on a
 * live instance: `register_vendor_invoice` with `amount_cents` (the column is
 * `total_cents`) produced no list of valid columns, no nearest match, nothing.
 *
 * So the generic path gets the same courtesy, built from the SAME suggestion
 * engine, and from the table's real columns rather than a hand-kept list —
 * a list per table would be the thing nobody updates when a column is added.
 *
 * Three PostgREST write failures carry a fix an agent can act on:
 *   PGRST204  unknown column       → the nearest real column, and the full set
 *   23502     not-null violation   → the field that must be supplied
 *   23503     foreign key          → WHICH table the value must come from,
 *                                    which is the difference between a party id
 *                                    and a vendors id
 */
import { suggestClosestNames } from './suggest-names.ts';

export type WriteFailure =
  | { kind: 'unknown_column'; column: string; table?: string }
  | { kind: 'not_null'; column: string; table?: string }
  | { kind: 'foreign_key'; constraint: string; table?: string }
  | null;

export interface CrudErrorHint {
  error: string;
  did_you_mean?: Record<string, string[]>;
  valid_columns?: string[];
  must_reference?: string;
  hint?: string;
}

/**
 * Read the shape of the failure out of the driver's message.
 *
 * Matching on TEXT is regrettable but it is what reaches this layer: the
 * PostgREST client collapses the error into a message string by the time the
 * generic handler catches it. Every pattern below is anchored on wording that
 * comes from PostgreSQL or PostgREST itself, not from our own code, and an
 * unrecognised message returns null so the original error passes through
 * untouched — the enrichment can never swallow a failure it does not
 * understand.
 */
export function classifyWriteError(message: string): WriteFailure {
  const msg = String(message ?? '');

  const unknownColumn = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
  if (unknownColumn) {
    return { kind: 'unknown_column', column: unknownColumn[1], table: unknownColumn[2] };
  }

  const notNull = msg.match(/null value in column "([^"]+)" of relation "([^"]+)" violates not-null/i)
    ?? msg.match(/null value in column "([^"]+)" violates not-null/i);
  if (notNull) {
    return { kind: 'not_null', column: notNull[1], table: notNull[2] };
  }

  const fk = msg.match(/violates foreign key constraint "([^"]+)"/i);
  if (fk) {
    const onTable = msg.match(/on table "([^"]+)"/i) ?? msg.match(/insert or update on table "([^"]+)"/i);
    return { kind: 'foreign_key', constraint: fk[1], table: onTable?.[1] };
  }

  return null;
}

/**
 * Which table a foreign key points at.
 *
 * The constraint name follows a convention (`<table>_<column>_fkey`, column
 * `<thing>_id`), and a convention is a proposal, not a fact. So the guess is
 * checked against the real table list when one is available: if no candidate
 * exists, this returns null and the hint says nothing about the target rather
 * than naming a table that isn't there. An agent told the wrong table with
 * confidence is worse off than one told nothing.
 */
export function referencedTableFromConstraint(
  constraint: string,
  knownTables?: Iterable<string>,
): string | null {
  const m = constraint.match(/([a-z0-9]+)_id_fkey$/i);
  if (!m) return null;
  const base = m[1].toLowerCase();

  const candidates = [
    /[sxz]$|ch$|sh$/.test(base) ? `${base}es` : null,
    base.endsWith('y') ? `${base.slice(0, -1)}ies` : null,
    `${base}s`,
    base,
  ].filter((x): x is string => !!x);

  const known = knownTables ? new Set(knownTables) : null;
  if (!known || known.size === 0) return candidates[0];
  return candidates.find((c) => known.has(c)) ?? null;
}

export interface BuildCrudHintInput {
  table: string;
  message: string;
  /** Every column the table actually has. Empty when introspection failed. */
  columns?: string[];
  /** The keys the caller sent, used only to name what it should send instead. */
  sentKeys?: string[];
  /** Every table in the schema, so a foreign-key guess can be VERIFIED. */
  knownTables?: string[];
}

/**
 * Turn a raw driver message into an answer an agent can act on next turn.
 * Returns null when the failure is not one of the three we can explain, so the
 * caller keeps its original error.
 */
export function buildCrudErrorHint(input: BuildCrudHintInput): CrudErrorHint | null {
  const { table, message, columns = [], sentKeys = [], knownTables } = input;
  const failure = classifyWriteError(message);
  if (!failure) return null;

  if (failure.kind === 'unknown_column') {
    const near = columns.length ? suggestClosestNames(failure.column, columns) : [];
    return {
      error:
        `${table} has no column "${failure.column}"` +
        (near.length ? ` — did you mean ${near.map((n) => `"${n}"`).join(' or ')}?` : '.'),
      did_you_mean: near.length ? { [failure.column]: near } : {},
      valid_columns: columns,
      hint: columns.length
        ? `Send the column names above verbatim. Nothing reads "${failure.column}", so the write would not have done what you intended.`
        : `Could not read ${table}'s columns to suggest an alternative; call the skill with no arguments to list existing rows and copy a field name from one.`,
    };
  }

  if (failure.kind === 'not_null') {
    return {
      error: `${table}.${failure.column} is required and was not supplied.`,
      valid_columns: columns,
      hint:
        sentKeys.length
          ? `You sent [${sentKeys.join(', ')}]. Add "${failure.column}" — a default cannot be invented for it.`
          : `Add "${failure.column}" — a default cannot be invented for it.`,
    };
  }

  const referenced = referencedTableFromConstraint(failure.constraint, knownTables);
  return {
    error:
      `A value on ${table} points at a row that does not exist (${failure.constraint}).` +
      (referenced ? ` It must be an id from "${referenced}".` : ''),
    must_reference: referenced ?? undefined,
    hint: referenced
      ? `Ids are not interchangeable across registers: an id that is valid in one table is not automatically valid in "${referenced}". Look the counterparty up in "${referenced}" and use that id.`
      : 'Look the referenced row up first and use its id.',
  };
}
