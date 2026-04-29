/**
 * Snapshot generator for the RPC ↔ skill-schema guardrail test.
 *
 * Pulls every enabled `rpc:*` skill, joins it with the matching pg_proc
 * function, and writes the expected p_-prefixed parameter names to
 * src/lib/__tests__/fixtures/rpc-skill-args.json.
 *
 * Run after any RPC signature change or new rpc:* skill:
 *   bun run scripts/snapshot-rpc-skill-args.ts
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const sb = createClient(url, key);

const { data, error } = await sb.rpc('exec_sql', {
  q: `
    SELECT s.name AS skill_name,
           REPLACE(s.handler, 'rpc:', '') AS rpc_name,
           array_agg(DISTINCT pa.parameter_name ORDER BY pa.ordinal_position) AS pg_args
    FROM agent_skills s
    JOIN pg_proc p ON p.proname = REPLACE(s.handler, 'rpc:', '')
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    JOIN information_schema.parameters pa
      ON pa.specific_name = p.proname || '_' || p.oid
    WHERE s.handler LIKE 'rpc:%' AND s.enabled = true
    GROUP BY s.name, s.handler
    ORDER BY s.name;
  `,
});

if (error) {
  console.error(error);
  process.exit(1);
}

writeFileSync(
  resolve('src/lib/__tests__/fixtures/rpc-skill-args.json'),
  JSON.stringify(data, null, 2) + '\n',
);
console.log(`Wrote ${(data as unknown[]).length} entries.`);
