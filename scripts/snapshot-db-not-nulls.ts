/**
 * Regenerates src/lib/__tests__/fixtures/db-not-null-columns.json
 *
 * Run with: bun run scripts/snapshot-db-not-nulls.ts
 *
 * Connects with PG* env vars (already set in dev sandbox / Lovable Cloud) or
 * DATABASE_URL. Pure read-only — only reads information_schema + agent_skills.
 */

import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURE_PATH = path.join(
  process.cwd(),
  'src/lib/__tests__/fixtures/db-not-null-columns.json',
);

async function main() {
  const client = new Client(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : undefined,
  );
  await client.connect();

  const skills = await client.query<{ table_name: string }>(`
    SELECT DISTINCT replace(handler, 'db:', '') AS table_name
    FROM public.agent_skills
    WHERE name LIKE 'manage_%' AND handler LIKE 'db:%'
    ORDER BY 1
  `);

  const tables: Record<string, string[]> = {};
  for (const { table_name } of skills.rows) {
    const cols = await client.query<{ column_name: string }>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND is_nullable = 'NO'
        AND column_default IS NULL
      ORDER BY column_name
    `,
      [table_name],
    );
    tables[table_name] = cols.rows.map((r) => r.column_name);
  }

  await client.end();

  const existing = fs.existsSync(FIXTURE_PATH)
    ? JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
    : {};

  const next = {
    _comment:
      'NOT NULL columns without DB defaults, per public table that backs a db:<table> manage_* skill. Regenerate with: bun run scripts/snapshot-db-not-nulls.ts',
    _generated_at: new Date().toISOString().slice(0, 10),
    tables,
    _skill_auto_filled_columns: existing._skill_auto_filled_columns ?? {},
  };

  fs.writeFileSync(FIXTURE_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`✓ Wrote ${Object.keys(tables).length} tables to ${FIXTURE_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
