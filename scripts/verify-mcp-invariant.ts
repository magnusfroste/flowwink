/**
 * Pre-deploy guardrail: MCP exposure invariant.
 *
 *   Rule: every skill with `mcp_exposed = true` MUST also have `enabled = true`.
 *
 * Background: skills with mcp_exposed=true appear in the public MCP catalog
 * (tools/list). External agents (Jan, Peter, etc.) will then attempt to call
 * them — and if the skill is disabled the call crashes with "skill disabled".
 * Either flip mcp_exposed=false OR keep the skill enabled.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun run scripts/verify-mcp-invariant.ts
 *
 * Exit 0 = invariant holds. Exit 1 = orphan tools detected (deploy blocked).
 *
 * If env vars are missing the script exits 0 with a warning so local dev
 * doesn't break — CI is responsible for providing the secrets.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.warn('[verify-mcp-invariant] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — skipping check.');
  process.exit(0);
}

interface SkillRow {
  id: string;
  name: string;
  enabled: boolean;
  mcp_exposed: boolean;
  handler: string | null;
}

async function main() {
  const url = `${SUPABASE_URL}/rest/v1/agent_skills?mcp_exposed=eq.true&enabled=eq.false&select=id,name,enabled,mcp_exposed,handler`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });

  if (!res.ok) {
    console.error(`[verify-mcp-invariant] PostgREST error ${res.status}: ${await res.text()}`);
    process.exit(2);
  }

  const orphans = (await res.json()) as SkillRow[];

  if (orphans.length === 0) {
    console.log('[verify-mcp-invariant] ✅ OK — no orphan MCP tools.');
    process.exit(0);
  }

  console.error(`[verify-mcp-invariant] ❌ Found ${orphans.length} orphan MCP tool(s) (mcp_exposed=true, enabled=false):`);
  for (const r of orphans) {
    console.error(`  - ${r.name}  [handler=${r.handler ?? 'n/a'}]`);
  }
  console.error('');
  console.error('Fix options:');
  console.error('  1. Re-enable the skill:    UPDATE agent_skills SET enabled=true WHERE name=\'<name>\';');
  console.error('  2. Hide it from MCP:       UPDATE agent_skills SET mcp_exposed=false WHERE name=\'<name>\';');
  process.exit(1);
}

main().catch((err) => {
  console.error('[verify-mcp-invariant] crashed:', err);
  process.exit(2);
});
