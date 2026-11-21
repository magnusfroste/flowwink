/**
 * Change part of a text without sending the text.
 *
 * Measured on optic, 2026-11-19 and 11-20: to change a few phrases in a 98 KB
 * wiki page, an agent searched for "find and replace a phrase inside a wiki
 * page without resending the whole body", found nothing, and wrote the page
 * again — one `content_md` and three `append_md` calls of about 25 KB each, a
 * minute per call, three times over two days. Between the first call and the
 * last the page was a quarter of itself, and every sentence it did not mean to
 * touch was typed again from what the model remembered of it.
 *
 * An edit names the text as it stands (`find`) and what replaces it (`with`).
 * Pure — the wiki handler reads the stored body, applies the edits and writes
 * once, so one call is one revision.
 *
 *  - `find` is matched exactly: case, spaces and line breaks as stored.
 *  - It must occur exactly ONCE, unless the edit says `all: true`. A phrase
 *    that occurs five times is not something to change by accident.
 *  - Edits apply in order, each to the result of the one before.
 *  - All or nothing: one edit that cannot be applied and nothing is written.
 */

/** The most edits one call may carry. */
export const MAX_BODY_EDITS = 50;

export interface BodyEdit {
  find: string;
  with: string;
  all?: boolean;
}

export interface AppliedEdit {
  /** The start of what was looked for — enough to recognise it in the answer. */
  find: string;
  replaced: number;
}

export interface FailedEdit {
  /** Position in the list the caller sent, from 0. */
  index: number;
  find: string;
  /** How many times `find` occurs in the body at that point. */
  occurrences: number;
  reason: 'not_found' | 'ambiguous' | 'malformed';
  /** A nearby truth: the text is there with another case or other spacing. */
  near?: 'other_case' | 'other_whitespace';
}

export type BodyEditOutcome =
  | { ok: true; body: string; applied: AppliedEdit[] }
  | { ok: false; error: string; hint: string; failed: FailedEdit[] };

const label = (s: string) => (s.length > 60 ? `${s.slice(0, 60)}…` : s);

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) n++;
  return n;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Read what the caller sent as edits. Null means it is not a list of edits at all. */
export function readBodyEdits(input: unknown): BodyEdit[] | null {
  // One edit sent bare ({ find, with }) is the list of one.
  const list = Array.isArray(input) ? input : (input && typeof input === 'object' ? [input] : null);
  if (!list || list.length === 0) return null;
  return list.map((e) => {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    return {
      find: typeof o.find === 'string' ? o.find : '',
      // `with` is the name; `replace` and `replacement` are what a model also reaches for.
      with: typeof o.with === 'string' ? o.with
        : typeof o.replace === 'string' ? o.replace
        : typeof o.replacement === 'string' ? o.replacement
        : (undefined as unknown as string),
      all: o.all === true,
    };
  });
}

export function applyBodyEdits(body: string, edits: BodyEdit[]): BodyEditOutcome {
  if (edits.length > MAX_BODY_EDITS) {
    return {
      ok: false,
      error: `${edits.length} edits in one call — the most is ${MAX_BODY_EDITS}.`,
      hint: 'Send the edits in several calls, or rewrite the page with content_md after reading it in full.',
      failed: [],
    };
  }
  let current = body;
  const applied: AppliedEdit[] = [];
  const failed: FailedEdit[] = [];

  edits.forEach((edit, index) => {
    if (!edit.find || typeof edit.with !== 'string') {
      failed.push({ index, find: label(edit.find || ''), occurrences: 0, reason: 'malformed' });
      return;
    }
    const occurrences = countOccurrences(current, edit.find);
    if (occurrences === 0) {
      const f: FailedEdit = { index, find: label(edit.find), occurrences, reason: 'not_found' };
      if (current.toLowerCase().includes(edit.find.toLowerCase())) f.near = 'other_case';
      else if (squash(current).includes(squash(edit.find))) f.near = 'other_whitespace';
      failed.push(f);
      return;
    }
    if (occurrences > 1 && !edit.all) {
      failed.push({ index, find: label(edit.find), occurrences, reason: 'ambiguous' });
      return;
    }
    current = current.split(edit.find).join(edit.with);
    applied.push({ find: label(edit.find), replaced: occurrences });
  });

  if (failed.length) {
    const parts = failed.map((f) => {
      if (f.reason === 'malformed') return `edit ${f.index}: needs find (the text as it stands) and with (what replaces it; "" removes it)`;
      if (f.reason === 'ambiguous') return `edit ${f.index}: "${f.find}" occurs ${f.occurrences} times`;
      const near = f.near === 'other_case' ? ' (it is there with other capitals)'
        : f.near === 'other_whitespace' ? ' (it is there with other spaces or line breaks)' : '';
      return `edit ${f.index}: "${f.find}" is not in the page${near}`;
    });
    return {
      ok: false,
      error: `Nothing was changed — ${parts.join('; ')}.`,
      hint: 'find must match the stored text exactly (action get shows it). For a phrase that occurs several times, send a longer find that occurs once, or all: true to change every occurrence.',
      failed,
    };
  }
  if (!current.trim()) {
    return {
      ok: false,
      error: 'Nothing was changed — the edits would leave the page empty.',
      hint: 'Delete the page with action delete if that is the intent.',
      failed: [],
    };
  }
  return { ok: true, body: current, applied };
}
