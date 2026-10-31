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

/**
 * Every public function's argument lists (one per overload): `args` all
 * names, `required` those without a DEFAULT. For guards that check
 * `.rpc('fn', { … })` calls — a wrong name answers PGRST202, which code that
 * does not read the error never notices.
 */
export const rpcSignatures = new Map<string, Array<{ args: string[]; required: string[] }>>();
for (const sql of migrations) {
  for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:"?public"?\.)?"?(\w+)"?\s*\(([\s\S]*?)\)\s*RETURNS/gi)) {
    const parts = m[2].split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
    const args = parts.map((p) => p.match(/^(?:(?:IN|OUT|INOUT)\s+)?"?(\w+)"?/i)?.[1] ?? '').filter(Boolean);
    const required = parts.filter((p) => !/\bDEFAULT\b|=/i.test(p)).map((p) => p.match(/^"?(\w+)"?/)?.[1] ?? '').filter(Boolean);
    const list = rpcSignatures.get(m[1]) ?? [];
    if (!list.some((x) => x.args.join(',') === args.join(','))) list.push({ args, required });
    rpcSignatures.set(m[1], list);
  }
}

/**
 * table → its columns: the generated types' Row blocks plus every CREATE
 * TABLE and ADD COLUMN in the migrations (the types lag them). Views are
 * left out — their columns are whatever the view selects.
 */
export const tableColumns = new Map<string, Set<string>>();
{
  const types = readFileSync('src/integrations/supabase/types.ts', 'utf8');
  let section = '';
  let table = '';
  let inRow = false;
  for (const line of types.split('\n')) {
    const sec = line.match(/^ {4}(Tables|Views|Functions|Enums|CompositeTypes): \{/);
    if (sec) section = sec[1];
    const t = line.match(/^ {6}(\w+): \{$/);
    if (t && section === 'Tables') {
      table = t[1];
      if (!tableColumns.has(table)) tableColumns.set(table, new Set());
    }
    if (/^ {8}Row: \{/.test(line)) inRow = section === 'Tables';
    else if (/^ {8}\}/.test(line)) inRow = false;
    const c = inRow && line.match(/^ {10}(\w+)\??:/);
    if (c) tableColumns.get(table)!.add(c[1]);
  }
  for (const sql of migrations) {
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:"?public"?\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
      const set = tableColumns.get(m[1]) ?? new Set<string>();
      for (const l of m[2].split('\n')) {
        const c = l.trim().match(/^"?(\w+)"?\s+[a-z"]/i);
        if (c && !/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE|LIKE)$/i.test(c[1])) set.add(c[1]);
      }
      tableColumns.set(m[1], set);
    }
    for (const m of sql.matchAll(/ALTER TABLE (?:ONLY )?(?:IF EXISTS )?(?:"?public"?\.)?"?(\w+)"?([\s\S]*?);/gi)) {
      for (const c of m[2].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?(\w+)"?/gi)) {
        const set = tableColumns.get(m[1]) ?? new Set<string>();
        set.add(c[1]);
        tableColumns.set(m[1], set);
      }
    }
    for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?VIEW (?:"?public"?\.)?"?(\w+)"?/gi)) tableColumns.delete(m[1]);
  }
}
