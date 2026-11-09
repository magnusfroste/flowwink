/**
 * Open access — everything an anonymous visitor can reach in the database,
 * read from the database itself.
 *
 *   npm run qa:open-access          (a local stack; the nightly fresh install runs it)
 *
 * RLS is on for every table, but a policy can still open a table to anyone:
 * `TO anon` / `TO public` with `USING (true)` or `WITH CHECK (true)`. On
 * storage, a SELECT policy for anon lets the storage API LIST a bucket, and a
 * public bucket serves any object by its path. Each of those is a decision;
 * this check makes it a written one. Every open policy and public bucket must
 * stand in OPEN_BY_DESIGN with the reason it is open — a new one turns the
 * night red, and one that closed must leave the list.
 *
 * Text-parsing the migrations cannot answer this (policies are dropped in
 * loops and dynamic SQL); a fresh install from zero can, so it runs there.
 */
import { Client } from 'pg';
import { OPEN_BY_DESIGN } from './open-access-allowlist';

const DB = process.env.BATTERY_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';


async function main(): Promise<number> {
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    const found = new Set<string>();
    const tables = await db.query<{ k: string }>(`
      select distinct schemaname || '.' || tablename || ' ' || cmd as k
        from pg_policies
       where schemaname = 'public'
         and ('anon' = any(roles) or 'public' = any(roles))
         and (qual = 'true' or with_check = 'true')`);
    for (const r of tables.rows) found.add(r.k);
    // Storage: any policy anon can use, named by the bucket it opens.
    const storage = await db.query<{ cmd: string; expr: string }>(`
      select cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
        from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and ('anon' = any(roles) or 'public' = any(roles))`);
    for (const r of storage.rows) {
      const buckets = [...r.expr.matchAll(/bucket_id = '([^']+)'/g)].map((m) => m[1]);
      for (const b of buckets.length ? buckets : ['<any bucket>']) found.add(`storage.objects ${r.cmd} ${b}`);
    }
    const buckets = await db.query<{ id: string }>(`select id from storage.buckets where public`).catch(() => ({ rows: [] as Array<{ id: string }> }));
    for (const r of buckets.rows) found.add(`bucket ${r.id}`);

    const fresh = [...found].filter((k) => !(k in OPEN_BY_DESIGN)).sort();
    const closed = Object.keys(OPEN_BY_DESIGN).filter((k) => !found.has(k)).sort();
    console.log(`open-access: ${found.size} open to anonymous visitors, ${found.size - fresh.length} by design`);
    if (fresh.length) console.log(`\nNEW — open to anyone, with no reason written down (scripts/open-access.ts OPEN_BY_DESIGN, or close it):\n  ${fresh.join('\n  ')}`);
    if (closed.length) console.log(`\nNO LONGER OPEN — remove from OPEN_BY_DESIGN:\n  ${closed.join('\n  ')}`);
    return fresh.length || closed.length ? 1 : 0;
  } finally {
    await db.end();
  }
}

process.exit(await main());
