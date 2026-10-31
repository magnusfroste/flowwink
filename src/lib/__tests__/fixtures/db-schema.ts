/**
 * What the database accepts, read from the migrations and the generated
 * types — for guards that check code against the schema without a database:
 * enum types (with every value added later), and per "table.column" the
 * allowed values from an enum type or a `CHECK (col = ANY (ARRAY[...]))`
 * constraint (the last definition winning), and enum-typed RPC arguments.
 */
import { readFileSync, readdirSync } from 'node:fs';

const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'));

const quoted = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

export const enumValues = new Map<string, Set<string>>();
for (const sql of migrations) {
  for (const m of sql.matchAll(/CREATE TYPE (?:"?public"?\.)?"?(\w+)"? AS ENUM \(([^)]*)\)/gi)) {
    if (!enumValues.has(m[1])) enumValues.set(m[1], new Set(quoted(m[2])));
  }
  for (const m of sql.matchAll(/ALTER TYPE (?:"?public"?\.)?"?(\w+)"? ADD VALUE (?:IF NOT EXISTS )?'([^']+)'/gi)) {
    if (!enumValues.has(m[1])) enumValues.set(m[1], new Set());
    enumValues.get(m[1])!.add(m[2]);
  }
}

/** "table.column" → the values it accepts. */
export const columnValues = new Map<string, Set<string>>();
{
  const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  let table = '';
  let inRow = false;
  for (const line of types.split('\n')) {
    const t = line.match(/^ {6}(\w+): \{$/);
    if (t) table = t[1];
    if (/^ {8}Row: \{/.test(line)) inRow = true;
    else if (/^ {8}\}/.test(line)) inRow = false;
    const c = inRow && line.match(/^ {10}(\w+)\??: Database\["public"\]\["Enums"\]\["(\w+)"\]/);
    if (c && enumValues.has(c[2])) columnValues.set(`${table}.${c[1]}`, enumValues.get(c[2])!);
  }
  const checks = new Map<string, Set<string>>();
  const checkColumn = new Map<string, string>();
  for (const sql of migrations) {
    let current = '';
    for (const line of sql.split('\n')) {
      const t = line.match(/(?:CREATE TABLE|ALTER TABLE)(?: IF NOT EXISTS)?(?: ONLY)? (?:"?public"?\.)"?(\w+)"?/i);
      if (t) current = t[1];
      for (const m of line.matchAll(/CONSTRAINT "?(\w+)"? CHECK \(+"?(\w+)"?(?:::text)? = ANY \(\(?ARRAY\[([^\]]*)\]/gi)) {
        if (!current) continue;
        checks.set(m[1], new Set(quoted(m[3])));
        checkColumn.set(m[1], `${current}.${m[2]}`);
      }
      for (const m of line.matchAll(/DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/gi)) checks.delete(m[1]);
    }
  }
  for (const [name, values] of checks) {
    const col = checkColumn.get(name)!;
    if (!columnValues.has(col)) columnValues.set(col, values);
  }
}

/** "function.p_arg" → enum values (any overload). */
export const rpcArgValues = new Map<string, Set<string>>();
for (const sql of migrations) {
  for (const m of sql.matchAll(/CREATE OR REPLACE FUNCTION (?:"?public"?\.)"?(\w+)"?\(([^)]*)\)/gi)) {
    for (const a of m[2].matchAll(/"?(\w+)"? (?:"?public"?\.)"?(\w+)"?/g)) {
      const values = enumValues.get(a[2]);
      if (values) rpcArgValues.set(`${m[1]}.${a[1]}`, values);
    }
  }
}
