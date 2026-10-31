/**
 * A literal written into a constrained column must be a value the column
 * accepts. recordSkillLesson wrote agent_memory.category = 'skill_lessons'
 * against agent_memory_category {preference, context, fact, config,
 * snapshot}; every write failed the cast, the error was never read, and the
 * harness's "lesson survives the run" never kept one lesson (Nordbrygg
 * 2026-10-31: 7 skills failing repeatedly, 0 lessons).
 *
 * Discover, don't enumerate: every `.from('<table>').insert|update|upsert({…})`
 * in the edge functions and the app, every `key: 'literal'` in that object,
 * judged against the column's enum type or CHECK list. Filters too: an
 * `.eq/.neq/.in` on an enum column with a value it lacks fails the WHOLE
 * query — FlowPilot's business context asked deals.stage for 'qualification'
 * (the enum says 'qualified') and so never saw the pipeline at all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { columnValues } from './fixtures/db-schema';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!/^(node_modules|tests|__tests__)$/.test(f)) walk(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

/** The object literal starting at `start` (a "{"), braces balanced. */
function objectAt(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length && i < start + 4000; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}

/** Top-level `key: 'literal'` pairs only — nested objects are other columns' JSON. */
function topLevelLiterals(obj: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let depth = 0;
  for (let i = 0; i < obj.length; i++) {
    const ch = obj[i];
    if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth--;
    else if (depth === 1) {
      const m = obj.slice(i).match(/^(?<=[\s,{]?)(\w+):\s*'([a-z_-]+)'/);
      if (m && /[\s,{]/.test(obj[i - 1] ?? ' ')) {
        out.push([m[1], m[2]]);
        i += m[0].length - 1;
      }
    }
  }
  return out;
}

describe('literal writes use values the database accepts', () => {
  const files = [...walk('supabase/functions'), ...walk('src')];

  it('the scanner reaches the code it judges', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(columnValues.get('agent_memory.category')?.has('context')).toBe(true);
  });

  it('no insert/update/upsert writes a value its column refuses', () => {
    const wrong: string[] = [];
    let judged = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(['"](\w+)['"]\)\s*\.(?:insert|update|upsert)\(\s*\{/g)) {
        const obj = objectAt(src, m.index! + m[0].length - 1);
        for (const [column, value] of topLevelLiterals(obj)) {
          const allowed = columnValues.get(`${m[1]}.${column}`);
          if (!allowed) continue;
          judged++;
          if (!allowed.has(value)) {
            const line = src.slice(0, m.index).split('\n').length;
            wrong.push(`${f}:${line} ${m[1]}.${column} = '${value}' ∉ {${[...allowed].join(', ')}}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(judged).toBeGreaterThan(100);
  });

  it('no .eq/.neq/.in filters an enum column on a value it lacks', () => {
    const wrong: string[] = [];
    let judged = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.from\(['"](\w+)['"]\)/g)) {
        const chain = src.slice(m.index! + m[0].length, m.index! + m[0].length + 800).split(/;\n|\n\s*\n|\.from\(/)[0];
        const line = () => src.slice(0, m.index).split('\n').length;
        for (const e of chain.matchAll(/\.(?:eq|neq)\(\s*'(\w+)',\s*'([a-z_-]+)'\s*\)/g)) {
          const allowed = columnValues.get(`${m[1]}.${e[1]}`);
          if (!allowed) continue;
          judged++;
          if (!allowed.has(e[2])) wrong.push(`${f}:${line()} ${m[1]}.${e[1]} = '${e[2]}' ∉ {${[...allowed].join(', ')}}`);
        }
        for (const e of chain.matchAll(/\.in\(\s*'(\w+)',\s*\[([^\]]*)\]\s*\)/g)) {
          const allowed = columnValues.get(`${m[1]}.${e[1]}`);
          if (!allowed) continue;
          for (const v of [...e[2].matchAll(/'([^']+)'/g)].map((x) => x[1])) {
            judged++;
            if (!allowed.has(v)) wrong.push(`${f}:${line()} ${m[1]}.${e[1]} in '${v}' ∉ {${[...allowed].join(', ')}}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(judged).toBeGreaterThan(100);
  });
});
