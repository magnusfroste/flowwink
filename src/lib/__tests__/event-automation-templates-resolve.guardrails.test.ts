import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: every `{{event.payload.X}}` a seeded event automation maps is a
 * key the event's emitters actually put in the payload.
 *
 * Live finding (2026-11-02): 'Auto-allocate picking on order paid' mapped
 * `p_order_id: '{{event.payload.order_id}}'`, but `tg_emit_order_events`
 * emitted `order.paid` as `{ id, data }`. event-dispatcher passes an
 * unresolved template through as literal text, so `allocate_picking` got the
 * string "{{event.payload.order_id}}" as a uuid on every paid order, and the
 * automation's last_error stayed empty because the run is async.
 *
 * Discover, don't enumerate: the seeds are read out of every module file and
 * the emitters out of the code — the LATEST definition of every SQL function
 * across the migrations (emit_platform_event(...) / INSERT INTO agent_events)
 * and every `rpc('emit_platform_event', { _event_name, _payload })` in the
 * edge functions. A payload value the scanner cannot see into (to_jsonb(NEW),
 * a variable) accepts any deeper path; a payload built from a variable, or a
 * missing key next to a spread, is not proof — teach the scanner the shape.
 */

const root = process.cwd();

// ── Seeds ────────────────────────────────────────────────────────────────
const modulesDir = join(root, 'src/lib/modules');
const seedSources = [
  ...readdirSync(modulesDir).filter((f) => f.endsWith('.ts')).map((f) => join(modulesDir, f)),
  join(root, 'src/lib/platform-seeds.ts'),
];

type SeedRef = { file: string; automation: string; event: string; path: string };

function seededPayloadRefs(): { refs: SeedRef[]; eventSeeds: number } {
  const refs: SeedRef[] = [];
  let eventSeeds = 0;
  for (const file of seedSources) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/trigger_config:\s*\{\s*event:\s*'([^']+)'/g)) {
      eventSeeds++;
      const start = m.index! + m[0].length;
      // The seed's own fields: up to the next seed's trigger_config or the end of the array.
      const ends = [src.indexOf('trigger_config:', start), src.indexOf('\n];', start)].filter((x) => x > -1);
      const win = src.slice(start, ends.length ? Math.min(...ends) : undefined);
      const before = src.slice(0, m.index!);
      const names = [...before.matchAll(/name:\s*'([^']+)'/g)];
      const automation = names.length ? names[names.length - 1][1] : '?';
      for (const t of win.matchAll(/\{\{\s*event\.payload\.([a-zA-Z0-9_.]+)\s*\}\}/g)) {
        refs.push({ file: file.split('/').pop()!, automation, event: m[1], path: t[1] });
      }
    }
  }
  return { refs, eventSeeds };
}

// ── Payload shapes ───────────────────────────────────────────────────────
/** A payload shape: known keys (with their own shape), or opaque (any deeper path). */
type Shape = { keys: Map<string, Shape>; spread: boolean } | 'opaque';
type Emitter = { where: string; shape: Shape };

/** Index of the bracket closing the one at `open`, skipping quoted text. */
function matchClose(s: string, open: number, quotes: string): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (quotes.includes(c)) {
      const q = c;
      i++;
      while (i < s.length && s[i] !== q) { if (s[i] === '\\' && q !== "'") i++; i++; }
      continue;
    }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i; }
  }
  return -1;
}

/** Split on top-level commas (outside brackets and quotes). */
function splitTop(s: string, quotes: string): string[] {
  const out: string[] = [];
  let depth = 0; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quotes.includes(c)) {
      const j = matchQuote(s, i, quotes);
      cur += s.slice(i, j + 1); i = j; continue;
    }
    if ('({['.includes(c)) depth++;
    if (')}]'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function matchQuote(s: string, i: number, _quotes: string): number {
  const q = s[i]; let j = i + 1;
  while (j < s.length && s[j] !== q) { if (s[j] === '\\' && q !== "'") j++; j++; }
  return j;
}

/** Shape of a SQL expression: jsonb_build_object(...) is read, anything else is opaque. */
function sqlShape(expr: string): Shape {
  const e = expr.trim();
  const m = e.match(/^jsonb_build_object\s*\(/i);
  if (!m) return 'opaque';
  const close = matchClose(e, m[0].length - 1, "'");
  const args = splitTop(e.slice(m[0].length, close), "'");
  const keys = new Map<string, Shape>();
  for (let i = 0; i + 1 < args.length; i += 2) {
    const k = args[i].match(/^'([^']+)'$/);
    if (!k) return 'opaque'; // computed key: cannot prove a shape
    keys.set(k[1], sqlShape(args[i + 1]));
  }
  return { keys, spread: false };
}

/** Shape of a TS object literal starting at `{`. */
function tsShape(s: string, open: number): Shape {
  const close = matchClose(s, open, '\'"`');
  const body = s.slice(open + 1, close).replace(/\/\/[^\n]*/g, '');
  const keys = new Map<string, Shape>();
  let spread = false;
  for (const entry of splitTop(body, '\'"`')) {
    if (entry.startsWith('...')) { spread = true; continue; }
    const kv = entry.match(/^['"]?([A-Za-z0-9_]+)['"]?\s*:\s*([\s\S]*)$/);
    if (kv) {
      const v = kv[2].trim();
      keys.set(kv[1], v.startsWith('{') ? tsShape(v, 0) : 'opaque');
    } else if (/^[A-Za-z0-9_]+$/.test(entry)) {
      keys.set(entry, 'opaque');
    }
  }
  return { keys, spread };
}

/** Latest body of every SQL function, migrations in filename order (a later CREATE OR REPLACE wins). */
function latestSqlFunctions(): Map<string, { file: string; body: string }> {
  const dir = join(root, 'supabase/migrations');
  const fns = new Map<string, { file: string; body: string }>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, f), 'utf8');
    const re = /(CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION|DROP\s+FUNCTION(?:\s+IF\s+EXISTS)?)\s+(?:"?public"?\.)?"?([a-z_0-9]+)"?\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) {
      const name = m[2].toLowerCase();
      if (/^DROP/i.test(m[1])) { fns.delete(name); continue; }
      const tag = sql.slice(m.index).match(/\bAS\s+(\$[a-z_]*\$)/i);
      if (!tag) continue;
      const bodyStart = m.index + tag.index! + tag[0].length;
      const bodyEnd = sql.indexOf(tag[1], bodyStart);
      if (bodyEnd < 0) continue;
      fns.set(name, { file: f, body: sql.slice(bodyStart, bodyEnd) });
      re.lastIndex = bodyEnd;
    }
  }
  return fns;
}

function sqlEmitters(): Map<string, Emitter[]> {
  const out = new Map<string, Emitter[]>();
  const add = (ev: string, e: Emitter) => out.set(ev, [...(out.get(ev) ?? []), e]);
  for (const [fn, { file, body }] of latestSqlFunctions()) {
    const shapes = [
      /emit_platform_event\s*\(\s*'([a-z0-9_.]+)'\s*,\s*/gi,
      /INSERT\s+INTO\s+(?:public\.)?agent_events\s*\(\s*event_name\s*,\s*payload[^)]*\)\s*(?:VALUES\s*\(|SELECT)\s*'([a-z0-9_.]+)'\s*,\s*/gi,
    ];
    for (const re of shapes) {
      for (const m of body.matchAll(re)) {
        const rest = body.slice(m.index! + m[0].length);
        const jb = rest.match(/^jsonb_build_object\s*\(/i);
        const shape: Shape = jb ? sqlShape(rest.slice(0, matchClose(rest, jb[0].length - 1, "'") + 1)) : { keys: new Map(), spread: true };
        add(m[1], { where: `${fn}() in ${file}`, shape });
      }
    }
  }
  return out;
}

function edgeEmitters(): Map<string, Emitter[]> {
  const out = new Map<string, Emitter[]>();
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') && !/test/.test(d.name) ? [join(dir, d.name)] : []);
  for (const file of walk(join(root, 'supabase/functions'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/_event_name:\s*['"]([a-z0-9_.]+)['"]\s*,\s*_payload:\s*/g)) {
      const at = m.index! + m[0].length;
      const shape: Shape = src[at] === '{' ? tsShape(src, at) : { keys: new Map(), spread: true };
      const ev = m[1];
      out.set(ev, [...(out.get(ev) ?? []), { where: file.slice(root.length + 1), shape }]);
    }
  }
  return out;
}

/** Why `path` does not resolve on `shape`, or null when it does. */
function missing(shape: Shape, path: string[]): string | null {
  let cur: Shape = shape;
  for (const [i, seg] of path.entries()) {
    if (cur === 'opaque') return null;
    const next = cur.keys.get(seg);
    if (!next) {
      const at = path.slice(0, i + 1).join('.');
      return cur.spread ? `'${at}' is not among the literal keys (a spread or variable payload is not proof)` : `no key '${at}'`;
    }
    cur = next;
  }
  return null;
}

describe('seeded event automations map keys their events carry', () => {
  const { refs, eventSeeds } = seededPayloadRefs();
  const emitters = new Map<string, Emitter[]>();
  for (const src of [sqlEmitters(), edgeEmitters()]) {
    for (const [ev, list] of src) emitters.set(ev, [...(emitters.get(ev) ?? []), ...list]);
  }

  it('the scanner finds the seeds and the emitters (or it proves nothing)', () => {
    expect(eventSeeds).toBeGreaterThanOrEqual(5);
    expect(refs.length).toBeGreaterThanOrEqual(10);
    expect(emitters.get('order.paid')?.length ?? 0).toBeGreaterThan(0);
    expect(emitters.get('email.received')?.length ?? 0).toBeGreaterThan(0);
  });

  it('every {{event.payload.X}} resolves on every emitter of the event', () => {
    const problems: string[] = [];
    for (const r of refs) {
      const list = emitters.get(r.event) ?? [];
      if (!list.length) {
        problems.push(`${r.file} '${r.automation}': no emitter of '${r.event}' found for {{event.payload.${r.path}}}`);
        continue;
      }
      for (const e of list) {
        const why = missing(e.shape, r.path.split('.'));
        if (why) problems.push(`${r.file} '${r.automation}': {{event.payload.${r.path}}} — ${e.where} emits '${r.event}' with ${why}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('the resolver is the one the guard assumes: event.payload.<path>, unresolved passes through', () => {
    const d = readFileSync(join(root, 'supabase/functions/event-dispatcher/index.ts'), 'utf8');
    expect(d).toMatch(/function resolveTemplates/);
    expect(d).toMatch(/parts\[0\] !== 'event'/);
  });
});
