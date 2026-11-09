/** Reading docs/processes/*.md into what the process map shows. Pure but for loadProcesses' reads. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODULE_ALIASES } from './data';

export interface ProcessDoc {
  slug: string; title: string; tagline: string; problem: string; maturity: string;
  modules: string[]; steps: string[];
}

export function canonicalModule(raw: string): string | null {
  const k = raw.toLowerCase().trim().replace(/[*`]/g, '');
  if (!k || /^-+$/.test(k)) return null;
  if (MODULE_ALIASES[k]) return MODULE_ALIASES[k];
  return k.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One process doc → what the map shows. Two module-table shapes exist: `| **Module** | role |` and `| Step | Module | Skills |`. */
export function parseProcess(slug: string, md: string): ProcessDoc {
  const pick = (re: RegExp) => md.match(re)?.[1]?.trim() ?? '';
  const raw: string[] = [];
  const involved = md.match(/## Modules involved\s*\n([\s\S]*?)\n---/);
  if (involved) {
    for (const row of involved[1].split('\n')) {
      const m = row.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (m) raw.push(m[1]);
    }
  } else {
    const participating = md.match(/## Participating modules[^\n]*\n([\s\S]*?)\n## /);
    for (const row of participating?.[1].split('\n').slice(2) ?? []) {
      const cols = row.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cols.length >= 2 && cols[1]) raw.push(...cols[1].split(/\s*[+/,]\s*/));
    }
  }
  const modules = [...new Set(raw.map(canonicalModule).filter((m): m is string => !!m))];
  const mermaid = md.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? '';
  const steps: string[] = [];
  for (const m of mermaid.matchAll(/\w+\["([^"]+)"\]/g)) {
    const label = m[1].replace(/<br\/?>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
    if (!steps.includes(label)) steps.push(label);
  }
  return {
    slug,
    title: pick(/^# (.+)$/m),
    tagline: pick(/^> (.+)$/m),
    problem: pick(/\*\*Problem it solves:\*\* (.+)/),
    maturity: pick(/\*\*Maturity level:\*\* (.+)/).replace(/\s*\(.*/, ''),
    modules,
    steps,
  };
}

export function loadProcesses(DOCS: string): Map<string, ProcessDoc> {
  const out = new Map<string, ProcessDoc>();
  for (const f of readdirSync(DOCS).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()) {
    const slug = f.slice(0, -3);
    out.set(slug, parseProcess(slug, readFileSync(join(DOCS, f), 'utf8')));
  }
  return out;
}

