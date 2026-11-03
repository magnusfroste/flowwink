/**
 * A SQL function writes columns its table has. PL/pgSQL is checked only when
 * it runs, and a write wrapped in EXCEPTION WHEN OTHERS is not checked at all:
 * run_ticket_escalations' notify step inserted support_escalations
 * (ticket_id, escalated_at, resolved) — none of which exist — inside such a
 * block, so every escalation rule with "notify" told nobody (2026-10-31).
 *
 * Discover, don't enumerate: the live body of every function (last
 * definition, drops honoured) — each INSERT column list and each UPDATE … SET
 * column — against the migrations' columns.
 */
import { describe, it, expect } from 'vitest';
import { functionBodies, tableColumns } from './fixtures/db-schema';

/** Top-level `col = …` assignments of a SET list. */
function setColumns(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim().match(/^"?(\w+)"?\s*=/)?.[1]).filter((c): c is string => !!c);
}

describe('SQL functions write columns their table has', () => {
  it('the bodies are read, drops honoured', () => {
    expect(functionBodies.size).toBeGreaterThan(800);
    expect(functionBodies.has('sign_contract_by_token')).toBe(false); // dropped 2026-08-23
    expect(functionBodies.get('run_ticket_escalations')?.body).not.toMatch(/support_escalations/);
  });

  it('every INSERT column and UPDATE … SET column exists', () => {
    const wrong: string[] = [];
    let judged = 0;
    for (const [fn, { body, file }] of functionBodies) {
      for (const m of body.matchAll(/INSERT INTO (?:"?public"?\.)?"?(\w+)"?\s*\(([^)]*)\)/gi)) {
        const cols = tableColumns.get(m[1]);
        if (!cols || !cols.size) continue;
        for (const c of m[2].split(',').map((x) => x.trim().replace(/"/g, '')).filter((x) => /^\w+$/.test(x))) {
          judged++;
          if (!cols.has(c)) wrong.push(`${fn} (${file}): INSERT ${m[1]}.${c}`);
        }
      }
      for (const m of body.matchAll(/UPDATE (?:"?public"?\.)?"?(\w+)"?(?:\s+(?:AS\s+)?\w+)?\s+SET\s+([\s\S]*?)(?:\bWHERE\b|;|\bRETURNING\b|\bFROM\b)/gi)) {
        const cols = tableColumns.get(m[1]);
        if (!cols || !cols.size) continue;
        for (const c of setColumns(m[2])) {
          judged++;
          if (!cols.has(c)) wrong.push(`${fn} (${file}): UPDATE ${m[1]}.${c}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(judged).toBeGreaterThan(3000);
  });
});
