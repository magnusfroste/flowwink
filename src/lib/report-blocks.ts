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
 * Pure: the reader draws the segments; a guardrail test parses examples.
 */

export type ReportSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'kpis'; items: Array<{ value: string; label: string; detail?: string }> }
  | { kind: 'note'; tone: 'info' | 'ok' | 'warn' | 'bad'; text: string }
  | { kind: 'details'; summary: string; text: string }
  | { kind: 'chart'; type: 'bar' | 'stacked' | 'line'; title?: string; unit?: string; axis: string; series: string[]; rows: Array<Record<string, string | number>> };

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
