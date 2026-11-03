/**
 * A query names columns its table has. The edge functions talk to the
 * database untyped, so a wrong column is not a compile error — it is a
 * PostgREST 42703 that fails the WHOLE query, and code that reads only
 * `data ?? []` sees an empty list. Found 2026-10-31, each live on Nordbrygg:
 * the Customer 360 timeline never showed a lead activity, task or webinar
 * (kind/summary/payload, status/due_at, status); prospect-fit never saw a
 * deal (deals has no title/status/company_id); a PO mailed to a vendor had no
 * lines (line_total_cents); ticket triage ran against an empty KB
 * (kb_articles.summary/status); every outbound GatewayAPI SMS answered
 * "conversation not found" (chat_conversations.metadata); Flowwork never saw
 * an employee (full_name/role); the content API's webinar list always failed
 * (scheduled_at — the column is date); the PO's goods receipts never listed
 * (receipt_date).
 *
 * Discover, don't enumerate: every `.from('<table>')` in the edge functions
 * and the app — the plain columns of its `.select('…')` (embedded resources
 * stripped) and the column of every filter and order in its chain.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tableColumns } from './fixtures/db-schema';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/^(node_modules|tests|__tests__)$/.test(f)) walk(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

/** The plain column names of a select list: embedded `rel(…)` stripped, aliases and casts removed. */
function plainColumns(select: string): string[] {
  let s = select;
  for (let i = 0; i < 5; i++) s = s.replace(/[\w!:.]*\s*\([^()]*\)/g, '');
  return s.split(',')
    .map((x) => x.trim().replace(/^\w+:/, '').replace(/::\w+$/, '').trim())
    .filter((x) => /^\w+$/.test(x));
}

/** The object literal starting at `start` (a "{"), braces balanced. */
function objectAt(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length && i < start + 6000; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}

/** Top-level keys of an object literal (`key: v`, `'key': v`, shorthand `key`); null when it spreads. */
function topLevelKeys(obj: string): string[] | null {
  const body = obj.slice(1, -1).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const segments: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of body) {
    if (quote) { cur += ch; if (ch === quote) quote = ''; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { segments.push(cur); cur = ''; continue; }
    cur += ch;
  }
  segments.push(cur);
  const keys: string[] = [];
  for (const raw of segments) {
    const seg = raw.trim();
    if (!seg) continue;
    if (seg.startsWith('...')) return null;
    const k = seg.match(/^['"]?(\w+)['"]?\s*(?::|$)/);
    if (k) keys.push(k[1]);
  }
  return keys;
}

describe('queries name columns their table has', () => {
  const files = [...walk('supabase/functions'), ...walk('src')];

  it('the scanner knows the schema it judges against', () => {
    expect(tableColumns.get('webinars')?.has('date')).toBe(true);
    expect(tableColumns.get('webinars')?.has('scheduled_at')).toBe(false);
    expect(tableColumns.get('purchase_order_lines')?.has('total_cents')).toBe(true);
  });

  it('every selected, filtered and ordered column exists', () => {
    const wrong: string[] = [];
    let judged = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const at = (i: number) => `${f}:${src.slice(0, i).split('\n').length}`;
      for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) {
        const cols = tableColumns.get(m[1]);
        if (!cols || cols.size === 0) continue;
        const chain = src.slice(m.index! + m[0].length, m.index! + m[0].length + 800).split(/;\n|\n\s*\n|\.from\(|\.rpc\(/)[0];
        const sel = chain.match(/^\s*\.select\(\s*(['"`])([^'"`]*)\1/);
        if (sel && !sel[2].includes('${')) {
          for (const c of plainColumns(sel[2])) {
            judged++;
            if (!cols.has(c)) wrong.push(`${at(m.index!)} select ${m[1]}.${c}`);
          }
        }
        for (const e of chain.matchAll(/\.(eq|neq|gt|gte|lt|lte|in|is|ilike|like|not|order)\(\s*['"](\w+)['"](?!\.)\s*(,[^)]*)?\)/g)) {
          if (e[1] === 'order' && /foreignTable|referencedTable/.test(e[3] ?? '')) continue;
          // .not('webinars', 'is', null) filters on an EMBEDDED resource — a table, not a column.
          if (tableColumns.has(e[2]) && !cols.has(e[2])) continue;
          judged++;
          if (!cols.has(e[2])) wrong.push(`${at(m.index!)} ${e[1]} ${m[1]}.${e[2]}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(judged).toBeGreaterThan(5000);
  });

  it('every inserted, updated and upserted key is a column', () => {
    const wrong: string[] = [];
    let judged = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)\s*\.(insert|update|upsert)\(\s*\{/g)) {
        const cols = tableColumns.get(m[1]);
        if (!cols || cols.size === 0) continue;
        const keys = topLevelKeys(objectAt(src, m.index! + m[0].length - 1));
        if (!keys) continue;
        for (const k of keys) {
          judged++;
          if (!cols.has(k)) wrong.push(`${f}:${src.slice(0, m.index).split('\n').length} ${m[2]} ${m[1]}.${k}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(judged).toBeGreaterThan(1000);
  });

  it('every .from() names a table or view that exists', () => {
    // content-api's tickets and media queries read support_tickets and media —
    // neither exists (tickets, media_assets), so both always failed (2026-10-31).
    const sql = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8')).join('\n');
    const views = new Set([...sql.matchAll(/CREATE (?:OR REPLACE )?(?:MATERIALIZED )?VIEW (?:IF NOT EXISTS )?(?:"?public"?\.)?"?(\w+)"?/gi)].map((m) => m[1]));
    const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
    const wrong = new Map<string, string>();
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) {
        const t = m[1];
        if (tableColumns.has(t) || views.has(t) || new RegExp(`^ {6}${t}: \\{$`, 'm').test(types)) continue;
        if (!wrong.has(t)) wrong.set(t, `${f}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect([...wrong].map(([t, at]) => `${t}  ← ${at}`)).toEqual([]);
  });
});
