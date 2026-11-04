/**
 * The report dialect — markdown plus four blocks, the same as AgentReports
 * (github.com/magnusfroste/agentreports), so a report written for one reads
 * in the other:
 *
 *   ::kpis            - value | label | detail      (one per line)
 *   ::note warn       text …                        (info | ok | warn | bad)
 *   ::details Title   text …                        (collapsed)
 *   ::                                              closes a block
 *   ```chart bar title="…" unit="kr"               bar | stacked | line
 *   Axis, Series A, Series B                        CSV, first column the axis
 *   ```
 *
 * And one FlowWink adds (2026-11-03) — figures fetched when the report is
 * opened, so a report of live blocks is a dashboard:
 *
 *   ```live
 *   {"skill": "check_books", "args": {}, "title": "The books",
 *    "kpis":  [{"path": "summary.total", "label": "Need attention"}],
 *    "chart": {"type": "bar", "rows": "months", "axis": "month", "series": ["revenue"], "divide": 100, "unit": "kr"},
 *    "table": {"rows": "findings", "columns": [{"path": "label", "label": "Finding"}], "limit": 10}}
 *   ```
 *
 * A live block runs ONE read skill as the person who opens the report
 * (agent-execute read_only: anything but a read is refused), so the role
 * matrix applies to the figures too. AgentReports shows it as code.
 *
 * Pure: the reader draws the segments, publish_report checks live blocks
 * with the same parser; a guardrail test parses examples.
 */

export type ReportSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'kpis'; items: Array<{ value: string; label: string; detail?: string }> }
  | { kind: 'note'; tone: 'info' | 'ok' | 'warn' | 'bad'; text: string }
  | { kind: 'details'; summary: string; text: string }
  | { kind: 'chart'; type: 'bar' | 'stacked' | 'line'; title?: string; unit?: string; axis: string; series: string[]; rows: Array<Record<string, string | number>> }
  | { kind: 'live'; spec: LiveSpec }
  | { kind: 'invalid'; source: string; errors: string[] };

export interface LiveValue { path: string; label?: string; unit?: string; divide?: number }
export interface LiveSpec {
  skill: string;
  args: Record<string, unknown>;
  title?: string;
  kpis?: Array<LiveValue & { label: string }>;
  chart?: { type: 'bar' | 'stacked' | 'line'; rows: string; axis: string; series: string[]; unit?: string; divide?: number; title?: string };
  table?: { rows: string; columns: Array<{ path: string; label: string; unit?: string; divide?: number }>; limit?: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const num = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v !== 0);

/** Check a live block's JSON: the shape the reader can draw, or the reasons it cannot. */
export function validateLiveSpec(raw: unknown): { spec?: LiveSpec; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { errors: ['a live block is one JSON object'] };
  if (!str(raw.skill) || !/^[a-z][a-z0-9_]*$/.test(String(raw.skill))) errors.push('skill: the name of a read skill, e.g. check_books');
  if (raw.args !== undefined && !isObj(raw.args)) errors.push('args: an object of the skill\'s arguments');
  const k = raw.kpis, c = raw.chart, t = raw.table;
  if (k === undefined && c === undefined && t === undefined) errors.push('give kpis, chart or table — what to draw from the answer');
  if (k !== undefined) {
    if (!Array.isArray(k) || k.length === 0 || k.length > 12) errors.push('kpis: 1–12 entries');
    else k.forEach((e, i) => {
      if (!isObj(e) || !str(e.path) || !str(e.label)) errors.push(`kpis[${i}]: {path, label}`);
      else if (!num(e.divide)) errors.push(`kpis[${i}].divide: a non-zero number`);
    });
  }
  if (c !== undefined) {
    if (!isObj(c) || !str(c.rows) || !str(c.axis) || !Array.isArray(c.series) || c.series.length === 0 || !c.series.every(str)) {
      errors.push('chart: {rows, axis, series: [..]} — rows is the path to a list in the answer');
    } else if (c.type !== undefined && !['bar', 'stacked', 'line'].includes(String(c.type))) errors.push('chart.type: bar | stacked | line');
    else if (!num(c.divide)) errors.push('chart.divide: a non-zero number');
  }
  if (t !== undefined) {
    if (!isObj(t) || !str(t.rows) || !Array.isArray(t.columns) || t.columns.length === 0
      || !t.columns.every((col) => isObj(col) && str(col.path) && str(col.label))) {
      errors.push('table: {rows, columns: [{path, label}]}');
    }
  }
  if (errors.length) return { errors };
  return {
    errors,
    spec: {
      skill: String(raw.skill),
      args: (raw.args as Record<string, unknown>) ?? {},
      ...(str(raw.title) ? { title: String(raw.title) } : {}),
      ...(k ? { kpis: k as LiveSpec['kpis'] } : {}),
      ...(c ? { chart: { type: 'bar', ...(c as object) } as LiveSpec['chart'] } : {}),
      ...(t ? { table: t as LiveSpec['table'] } : {}),
    },
  };
}

/** A value from an answer by dot path: "summary.total", "rows.0.amount", "findings.length". */
export function resolvePath(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of String(path).split('.').filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && part === 'length') cur = cur.length;
    else if (Array.isArray(cur) && /^\d+$/.test(part)) cur = cur[Number(part)];
    else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

const TONES = new Set(['info', 'ok', 'warn', 'bad']);

function attr(spec: string, name: string): string | undefined {
  const m = spec.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function parseChart(spec: string, body: string[]): ReportSegment | null {
  const type = (['stacked', 'line'].find((t) => new RegExp(`\\b${t}\\b`).test(spec)) ?? 'bar') as 'bar' | 'stacked' | 'line';
  const lines = body.map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const header = lines[0].split(',').map((h) => h.trim());
  if (header.length < 2) return null;
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(',').map((c) => c.trim());
    const row: Record<string, string | number> = { [header[0]]: cells[0] ?? '' };
    header.slice(1).forEach((h, i) => {
      const raw = (cells[i + 1] ?? '').replace(/\s/g, '');
      const n = Number(raw);
      row[h] = raw !== '' && Number.isFinite(n) ? n : 0;
    });
    return row;
  });
  return { kind: 'chart', type, title: attr(spec, 'title'), unit: attr(spec, 'unit'), axis: header[0], series: header.slice(1), rows };
}

export function parseReport(source: string): ReportSegment[] {
  const out: ReportSegment[] = [];
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  let md: string[] = [];
  const flush = () => {
    const text = md.join('\n').trim();
    if (text) out.push({ kind: 'markdown', text });
    md = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const block = line.match(/^::(kpis|note|details)\b\s*(.*)$/);
    const chart = line.match(/^```chart\b(.*)$/);
    if (/^```live\s*$/.test(line)) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '```') body.push(lines[j++]);
      if (j >= lines.length) { md.push(line); continue; }
      flush();
      const source = body.join('\n');
      let parsed: unknown;
      try { parsed = JSON.parse(source); } catch (e) {
        out.push({ kind: 'invalid', source, errors: [`not JSON: ${(e as Error).message}`] });
        i = j; continue;
      }
      const { spec, errors } = validateLiveSpec(parsed);
      out.push(spec ? { kind: 'live', spec } : { kind: 'invalid', source, errors });
      i = j;
      continue;
    }
    if (block) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '::') body.push(lines[j++]);
      if (j >= lines.length) { md.push(line); continue; } // never closed: plain text
      flush();
      const [, kind, rest] = block;
      if (kind === 'kpis') {
        const items = body.map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean).map((l) => {
          const [value, label = '', detail] = l.split('|').map((p) => p.trim());
          return { value, label, ...(detail ? { detail } : {}) };
        });
        out.push({ kind: 'kpis', items });
      } else if (kind === 'note') {
        const tone = TONES.has(rest.trim()) ? (rest.trim() as 'info' | 'ok' | 'warn' | 'bad') : 'info';
        out.push({ kind: 'note', tone, text: body.join('\n').trim() });
      } else {
        out.push({ kind: 'details', summary: rest.trim() || 'Details', text: body.join('\n').trim() });
      }
      i = j;
      continue;
    }
    if (chart) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '```') body.push(lines[j++]);
      const seg = j < lines.length ? parseChart(chart[1], body) : null;
      if (!seg) { md.push(line); continue; }
      flush();
      out.push(seg);
      i = j;
      continue;
    }
    md.push(line);
  }
  flush();
  return out;
}
