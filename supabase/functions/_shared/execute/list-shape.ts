/**
 * What a generic list hands an agent.
 *
 * Measured on optic over two weeks (2026-11-04 → 11-17), Peter's Hermes on
 * `manage_project_task` and `manage_document`:
 *
 *  - A page of 50 tasks was 58–71 KB: every row carried its whole brief and
 *    checklist. A page of documents carried every file's extracted text
 *    (`content_md`, 7 KB on average, 25 KB at most). Hermes paged the whole
 *    task table 31 times to find one task — about 190 KB a sweep.
 *  - With answers that size the model kept the first eight characters of an id
 *    and lost the rest. `project_id: "f3b6fce9"` as a list filter answered
 *    Postgres' "invalid input syntax for type uuid"; a document was asked for
 *    as `b0045441-0000-0000-0000-000000000000`.
 *  - It looked for the search under `action: "search"`, `query` and
 *    `search_query`. The parameter is `search`; the others were dropped as
 *    "not a column" and the whole list came back.
 *
 * So a list is a listing: long values are cut (and say so), a row is fetched
 * whole with `get`, the caller can name the columns it wants, the answer says
 * how many rows there are and where the next page starts, and the start of an
 * id finds the row it belongs to. Pure functions only — the executor applies
 * them, the tests read them.
 */

/** A value whose JSON is longer than this is cut from a list. */
export const LIST_VALUE_MAX = 240;
/** What is left of a long text in a list. */
export const LIST_PREVIEW_CHARS = 200;

const CUT_MARKER_RE = /… \[cut: \d+ more characters — get returns the whole value\]/;

export function cutMarker(more: number): string {
  return `… [cut: ${more} more characters — get returns the whole value]`;
}

/**
 * Whether a value an agent is about to WRITE is a list's preview. A model that
 * reads a cut brief and writes it back has shortened the task for good — the
 * write is refused instead.
 */
export function carriesCutMarker(value: unknown): boolean {
  if (typeof value === 'string') return CUT_MARKER_RE.test(value);
  if (value && typeof value === 'object') {
    try { return CUT_MARKER_RE.test(JSON.stringify(value)); } catch { return false; }
  }
  return false;
}

export interface SlimmedList {
  items: Record<string, unknown>[];
  /** Every column that was cut or left out in at least one row. */
  cut: string[];
}

/**
 * A list's rows, sized for a reader that pays per character.
 *
 *  - a text longer than LIST_VALUE_MAX keeps its first LIST_PREVIEW_CHARS and
 *    the marker that says how much is missing;
 *  - an array or object longer than that is left out;
 *  - an empty column (null) is left out, unless the caller named its columns —
 *    then the row has exactly the columns asked for;
 *  - each row names what it lost in `_cut`.
 */
export function slimListItems(
  rows: readonly Record<string, unknown>[],
  opts: { keepNulls?: boolean } = {},
): SlimmedList {
  const cutAnywhere = new Set<string>();
  const items = rows.map((row) => {
    const out: Record<string, unknown> = {};
    const cut: string[] = [];
    for (const [key, value] of Object.entries(row)) {
      if (value === null || value === undefined) {
        if (opts.keepNulls) out[key] = null;
        continue;
      }
      if (typeof value === 'string') {
        if (value.length > LIST_VALUE_MAX) {
          out[key] = value.slice(0, LIST_PREVIEW_CHARS) + cutMarker(value.length - LIST_PREVIEW_CHARS);
          cut.push(key);
        } else out[key] = value;
        continue;
      }
      if (typeof value === 'object') {
        let size = 0;
        try { size = JSON.stringify(value).length; } catch { size = LIST_VALUE_MAX + 1; }
        if (size > LIST_VALUE_MAX) { cut.push(key); continue; }
      }
      out[key] = value;
    }
    if (cut.length) {
      out._cut = cut;
      for (const c of cut) cutAnywhere.add(c);
    }
    return out;
  });
  return { items, cut: [...cutAnywhere] };
}

const COLUMN_NAME_RE = /^[a-z_][a-z0-9_]*$/i;

export interface FieldSelection {
  /** The columns to select, `id` first. Empty when the caller named none that exist. */
  select: string[];
  /** Names the caller sent that are not columns it may read. */
  unknown: string[];
}

/**
 * The columns a caller asked for (`fields: ["title","status"]` or
 * `"title,status"`), held to the columns it may read: the table's own
 * (`allowed`, when known) — and never past a select mask. `id` always rides
 * along, since a row without it cannot be acted on.
 */
export function parseFieldList(input: unknown, allowed: readonly string[]): FieldSelection {
  const raw = Array.isArray(input)
    ? input.map((x) => String(x))
    : typeof input === 'string' ? input.split(',') : [];
  const names = [...new Set(raw.map((s) => s.trim()).filter(Boolean))];
  const known = new Set(allowed);
  const select: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    if (!COLUMN_NAME_RE.test(name)) { unknown.push(name); continue; }
    if (known.size && !known.has(name)) { unknown.push(name); continue; }
    select.push(name);
  }
  if (select.length && !select.includes('id') && (!known.size || known.has('id'))) select.unshift('id');
  return { select, unknown };
}

const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_LO = '00000000-0000-0000-0000-000000000000';
const UUID_HI = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
/** The shortest start of an id that is looked up: eight hex characters, a uuid's first group. */
export const ID_PREFIX_MIN_HEX = 8;

export function isFullUuid(value: unknown): boolean {
  return typeof value === 'string' && FULL_UUID_RE.test(value.trim());
}

export interface UuidRange {
  /** The start of the id, hyphenated as a uuid is. */
  prefix: string;
  lo: string;
  hi: string;
}

function hyphenate(hex: string): string {
  const cuts = [8, 12, 16, 20];
  let out = '';
  for (let i = 0; i < hex.length; i++) {
    if (cuts.includes(i)) out += '-';
    out += hex[i];
  }
  return out;
}

/**
 * Every uuid that starts as `sent` does, as a range — a uuid orders byte-wise,
 * so the range is exact and needs no cast (PostgREST does not read `id::text`
 * in a filter; see project-task-resolve.ts).
 *
 *  - `f3b6fce9`, `f3b6fce9-74cb`, `f3b6fce974cb` → the ids that start so;
 *  - a full uuid padded with zeros (`b0045441-0000-0000-0000-000000000000`,
 *    what a model writes when it remembers only the start) → the ids that
 *    start with what precedes the padding;
 *  - any other full uuid → the ids sharing its first 13 characters (a model
 *    copies the first half and improvises the tail).
 *
 * null when there are fewer than eight hex characters to anchor on, or the
 * value is not hex at all.
 */
export function uuidPrefixRange(sent: unknown): UuidRange | null {
  if (typeof sent !== 'string') return null;
  const raw = sent.trim().toLowerCase();
  if (!raw) return null;
  let hex: string;
  if (FULL_UUID_RE.test(raw)) {
    const all = raw.replace(/-/g, '');
    const unpadded = all.replace(/0+$/, '');
    // Twelve or more trailing zeros is padding, not an id's own tail.
    hex = all.length - unpadded.length >= 12
      ? all.slice(0, Math.max(unpadded.length, ID_PREFIX_MIN_HEX))
      : all.slice(0, 12);
  } else {
    // A partial id: hex with hyphens only where a uuid has them.
    if (!/^[0-9a-f-]+$/.test(raw) || raw.length > 36) return null;
    hex = raw.replace(/-/g, '');
    if (hyphenate(hex) !== raw.replace(/-+$/, '') && hex !== raw) return null;
  }
  if (hex.length < ID_PREFIX_MIN_HEX || hex.length > 32) return null;
  const prefix = hyphenate(hex);
  return { prefix, lo: prefix + UUID_LO.slice(prefix.length), hi: prefix + UUID_HI.slice(prefix.length) };
}

/** Whether a list filter on this column takes the start of an id: `id`, or a reference (`*_id`). */
export function isIdColumn(column: string): boolean {
  return column === 'id' || column.endsWith('_id');
}

/** The names an agent reaches for when it wants to search. `search` is the parameter; these mean it. */
export const SEARCH_ALIASES = ['query', 'search_query', 'q', 'search_term', 'keyword'] as const;

/** Columns a search matches when the table declares none: what a row is called. */
export const DERIVED_SEARCH_COLUMNS = ['title', 'name', 'subject', 'file_name'] as const;

/**
 * The columns `search` matches for a table: the declared ones, else the ones a
 * row is called by, read from the table's real columns. Empty means the table
 * has nothing to search — the caller is told to filter by a column.
 */
export function searchColumnsFor(
  declared: readonly string[] | undefined,
  tableColumns: readonly string[],
): string[] {
  const real = new Set(tableColumns);
  if (declared?.length) return real.size ? declared.filter((c) => real.has(c)) : [...declared];
  return DERIVED_SEARCH_COLUMNS.filter((c) => real.has(c));
}

/**
 * The `or=` filter PostgREST reads for "any of these columns contains the
 * term". LIKE's own wildcards in the term are matched literally; the value is
 * quoted, so a comma or a parenthesis in the term cannot end the filter.
 */
export function searchOrFilter(columns: readonly string[], term: string): string {
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`);
  const quoted = `"%${like.replace(/[\\"]/g, (c) => `\\${c}`)}%"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(',');
}

export interface ListPageInput {
  offset: number;
  limit: number;
  returned: number;
  total: number | null;
}

/** Where the next page starts, or null when this was the last one. */
export function nextOffset({ offset, limit, returned, total }: ListPageInput): number | null {
  if (returned < limit) return null;
  if (typeof total === 'number' && offset + returned >= total) return null;
  return offset + returned;
}

export interface IdCandidate {
  id: string;
  label?: string | null;
}

export interface IdNotResolved {
  error: string;
  code: 'INVALID_INPUT' | 'NOT_FOUND';
  retryable: true;
  hint: string;
  candidates: IdCandidate[];
}

/** The most candidates an unresolved id is answered with. */
export const MAX_ID_CANDIDATES = 5;

function describeCandidate(c: IdCandidate): string {
  return c.label ? `${c.id} ("${c.label}")` : c.id;
}

/**
 * The answer to an id that names no row: the rows that start as it does. The
 * same rule as a task's (project-task-resolve.ts) for every generic table —
 * a write never acts on a guess; the agent re-sends with the id it is shown.
 */
export function idDidYouMean(
  table: string,
  sentId: string,
  candidates: readonly IdCandidate[],
  reason: 'partial_id' | 'not_found',
): IdNotResolved {
  const head = reason === 'partial_id'
    ? `${sentId} is the start of an id, not a whole one`
    : `no ${table} row ${sentId}`;
  const code = reason === 'partial_id' ? 'INVALID_INPUT' : 'NOT_FOUND';
  const shown = candidates.slice(0, MAX_ID_CANDIDATES);
  if (shown.length === 1) {
    return {
      error: `${head} — did you mean ${describeCandidate(shown[0])}? Re-send with that id.`,
      code, retryable: true,
      hint: 'Exactly one row starts as the id you sent; copy the whole id from this message and call again. Nothing was written.',
      candidates: shown,
    };
  }
  if (shown.length > 1) {
    const more = candidates.length > MAX_ID_CANDIDATES ? ' (more exist)' : '';
    return {
      error: `${head} — did you mean one of: ${shown.map(describeCandidate).join(', ')}${more}? Re-send with the right id.`,
      code, retryable: true,
      hint: 'Several rows start as the id you sent; pick one and copy its whole id from this message. Nothing was written.',
      candidates: shown,
    };
  }
  return {
    error: `${head}, and no ${table} row starts that way. List the rows (a search or a filter narrows it) and copy the id from the listing.`,
    code, retryable: true,
    hint: 'Ids are copied from a listing, never reproduced from memory. Nothing was written.',
    candidates: [],
  };
}
