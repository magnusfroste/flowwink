/**
 * Report: the raw per-route record as JSON, and a markdown summary that groups
 * findings by SIGNATURE rather than by page — forty pages tripping over the
 * same missing column is one problem, and should read as one.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOISE_FILTERS, type Finding, type RouteResult } from './crawl';

export interface SkippedRoute {
  role: string;
  pattern: string;
  source: string;
  reason: string;
}

export interface RoleCoverage {
  role: string;
  appRoles: string[];
  area: string;
  discovered: number;
  swept: number;
  skipped: number;
  routesWithErrors: number;
  routesWithWarningsOnly: number;
}

export interface SweepReport {
  tool: 'view-sweep';
  startedAt: string;
  finishedAt: string;
  supabaseUrl: string;
  baseUrl: string;
  gitCommit: string;
  routesDiscovered: number;
  coverage: RoleCoverage[];
  skipped: SkippedRoute[];
  noiseFilters: Array<{ id: string; where: string; pattern: string; why: string }>;
  notes: string[];
  groups: FindingGroup[];
  results: RouteResult[];
}

export interface FindingGroup {
  signature: string;
  kind: Finding['kind'];
  severity: Finding['severity'];
  occurrences: number;
  roles: string[];
  routes: string[];
  sample: Finding;
}

export function groupFindings(results: RouteResult[]): FindingGroup[] {
  const map = new Map<string, FindingGroup>();
  for (const r of results) {
    for (const f of r.findings) {
      const key = `${f.severity}|${f.signature}`;
      let g = map.get(key);
      if (!g) {
        g = { signature: f.signature, kind: f.kind, severity: f.severity, occurrences: 0, roles: [], routes: [], sample: f };
        map.set(key, g);
      }
      g.occurrences++;
      if (!g.roles.includes(r.role)) g.roles.push(r.role);
      const where = `${r.pattern}`;
      if (!g.routes.includes(where)) g.routes.push(where);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
    return b.routes.length - a.routes.length || b.occurrences - a.occurrences;
  });
}

function md(report: SweepReport): string {
  const out: string[] = [];
  const errors = report.groups.filter((g) => g.severity === 'error');
  const warns = report.groups.filter((g) => g.severity === 'warn');
  out.push('# View sweep');
  out.push('');
  out.push(`- Run: ${report.startedAt} → ${report.finishedAt}`);
  out.push(`- Commit: ${report.gitCommit}`);
  out.push(`- Frontend: ${report.baseUrl} · Supabase: ${report.supabaseUrl}`);
  out.push(`- Routes discovered in the route table: **${report.routesDiscovered}**`);
  out.push(`- Distinct problems: **${errors.length} error**, ${warns.length} warning`);
  out.push('');
  out.push('> Every line below is a CANDIDATE. A finding is real only once someone has reproduced the request and named the cause in the source.');
  out.push('');
  out.push('## Coverage');
  out.push('');
  out.push('| Role | App roles | Area | Discovered | Swept | Skipped | Routes with errors | Warnings only |');
  out.push('|---|---|---|---:|---:|---:|---:|---:|');
  for (const c of report.coverage) {
    out.push(`| ${c.role} | ${c.appRoles.join(', ') || '—'} | ${c.area} | ${c.discovered} | ${c.swept} | ${c.skipped} | ${c.routesWithErrors} | ${c.routesWithWarningsOnly} |`);
  }
  out.push('');
  if (report.skipped.length) {
    out.push('## Skipped (announced, never silent)');
    out.push('');
    out.push('| Role | Route | Reason | Declared at |');
    out.push('|---|---|---|---|');
    for (const s of report.skipped) out.push(`| ${s.role} | \`${s.pattern}\` | ${s.reason} | ${s.source} |`);
    out.push('');
  }
  if (report.notes.length) {
    out.push('## Notes');
    out.push('');
    for (const n of report.notes) out.push(`- ${n}`);
    out.push('');
  }

  const section = (title: string, groups: FindingGroup[]) => {
    out.push(`## ${title}`);
    out.push('');
    if (groups.length === 0) {
      out.push('(none)');
      out.push('');
      return;
    }
    groups.forEach((g, i) => {
      out.push(`### ${i + 1}. \`${g.signature}\``);
      out.push('');
      out.push(`- Kind: ${g.kind} · ${g.occurrences} occurrence(s) on ${g.routes.length} route(s) · roles: ${g.roles.join(', ')}`);
      out.push(`- Sample: ${g.sample.message.replace(/\n/g, ' ').slice(0, 500)}`);
      if (g.sample.detail) {
        const d = Object.entries(g.sample.detail)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(' · ');
        if (d) out.push(`- Detail: ${d.slice(0, 700)}`);
      }
      const shown = g.routes.slice(0, 25);
      out.push(`- Routes: ${shown.map((r) => `\`${r}\``).join(', ')}${g.routes.length > shown.length ? ` … +${g.routes.length - shown.length} more` : ''}`);
      out.push('');
    });
  };
  section('Errors, grouped by signature', errors);
  section('Warnings, grouped by signature', warns);

  out.push('## What the sweep deliberately ignores');
  out.push('');
  for (const f of report.noiseFilters) out.push(`- **${f.id}** (${f.where}) \`${f.pattern}\` — ${f.why}`);
  out.push('');
  return out.join('\n');
}

export function writeReport(outDir: string, report: SweepReport): { json: string; markdown: string } {
  mkdirSync(outDir, { recursive: true });
  const json = join(outDir, 'view-sweep-report.json');
  const markdown = join(outDir, 'view-sweep-report.md');
  writeFileSync(json, JSON.stringify(report, null, 2));
  writeFileSync(markdown, md(report));
  return { json, markdown };
}

export function noiseFilterManifest(): SweepReport['noiseFilters'] {
  return NOISE_FILTERS.map((f) => ({ id: f.id, where: f.where, pattern: f.pattern.source, why: f.why }));
}
