/**
 * Shared Integrity & Drift Detection Utilities
 * 
 * Used by:
 * - setup-flowpilot (post-bootstrap integrity gate + store expected hash)
 * - instance-health (drift detection endpoint)
 */
import { readAllRows } from './read-all-rows.ts';

/**
 * Compute a deterministic hash of all skill names + instruction snippets.
 * Used to detect drift between dev baseline and deployed instance.
 */
export async function computeSkillHash(
  skills: Array<{ name: string; instructions?: string | null }>
): Promise<string> {
  const sorted = [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => `${s.name}::${(s.instructions || '').slice(0, 200)}`)
    .join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(sorted);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Run inline integrity checks against the database.
 * Returns { score, issues, totalChecks, passedChecks }.
 */
export async function runIntegrityChecks(supabase: any): Promise<{
  score: number;
  issues: string[];
  totalChecks: number;
  passedChecks: number;
}> {
  // Paginated: every number below (`noDesc.length`, `badTd.length`) is
  // published as a fact, and `skillNames` decides which automations are called
  // broken. An unbounded select is capped at 1000 rows in silence, and
  // agent_skills sits at ~540 and grows with every module — so the health
  // check would have started under-reporting its own counts and inventing
  // "automation references a missing skill" the moment the register crossed
  // the cap. A sensor that quietly reads a prefix of reality is worse than no
  // sensor. The whole population IS the question here, so this is the one
  // place pagination is the right answer rather than upsert or an `.in()`.
  const { rows: enabledSkills, error: skillsErr } = await readAllRows<any>(
    supabase,
    'agent_skills',
    {
      columns: 'name, enabled, instructions, tool_definition, handler, description',
      orderBy: 'name',
      filter: (q: any) => q.eq('enabled', true),
    },
  );
  const issues: string[] = [];
  if (skillsErr) issues.push(`Could not read the full skill register: ${skillsErr}`);

  // Note: `instructions` is an optional per-skill field; `description` is the
  // required one and is checked separately below. We do not report on missing
  // instructions — it generates noise without indicating a real problem.

  // Hard check: skills without description
  const noDesc = enabledSkills.filter((s: any) => !s.description || s.description.trim() === '');
  if (noDesc.length > 0) {
    issues.push(`${noDesc.length} skills missing descriptions`);
  }

  // Hard check: invalid tool definitions.
  // Accept any of the three shapes used across the codebase:
  //   1. OpenAI wrapper: {type:'function', function:{name, parameters}}
  //   2. Flat OpenAI:    {name, parameters, description?}
  //   3. Raw JSON Schema:{type:'object', properties:{...}}
  const badTd = enabledSkills.filter((s: any) => {
    if (!s.tool_definition) return true;
    const td = typeof s.tool_definition === 'string' ? JSON.parse(s.tool_definition) : s.tool_definition;
    if (!td || typeof td !== 'object') return true;
    if (td.function && td.function.name && td.function.parameters) return false;
    if (td.name && td.parameters) return false;
    if (td.type === 'object' && td.properties && typeof td.properties === 'object') return false;
    return true;
  });
  if (badTd.length > 0) {
    issues.push(`${badTd.length} skills with invalid tool definitions: ${badTd.slice(0, 10).map((s: any) => s.name).join(', ')}${badTd.length > 10 ? '...' : ''}`);
  }


  // Check: critical memory keys
  const { data: memKeys } = await supabase
    .from('agent_memory')
    .select('key')
    .in('key', ['soul', 'identity', 'agents']);
  const foundKeys = new Set((memKeys || []).map((m: any) => m.key));
  const missingKeys = ['soul', 'identity', 'agents'].filter(k => !foundKeys.has(k));
  if (missingKeys.length > 0) {
    issues.push(`Missing critical memory keys: ${missingKeys.join(', ')}`);
  }

  // Check: automations referencing missing skills
  const { data: autos } = await supabase
    .from('agent_automations')
    .select('name, skill_name')
    .eq('enabled', true);
  const skillNames = new Set(enabledSkills.map((s: any) => s.name));
  const brokenAutos = (autos || []).filter((a: any) => a.skill_name && !skillNames.has(a.skill_name));
  if (brokenAutos.length > 0) {
    issues.push(`${brokenAutos.length} automations reference missing skills: ${brokenAutos.map((a: any) => `${a.name}→${a.skill_name}`).join(', ')}`);
  }

  // Score is based on 4 hard checks (noInstr is advisory only).
  const totalChecks = 4;
  const failedChecks = [noDesc, badTd, missingKeys, brokenAutos].filter(arr => arr.length > 0).length;
  const passedChecks = totalChecks - failedChecks;
  const score = Math.round((passedChecks / totalChecks) * 100);


  return { score, issues, totalChecks, passedChecks };
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checked_at: string;
  version: {
    skill_count: number;
    enabled_count: number;
    skill_hash: string;
    expected_hash: string | null;
    hash_match: boolean | null;
  };
  memory: {
    soul: boolean;
    identity: boolean;
    agents: boolean;
  };
  heartbeat: {
    last_run: string | null;
    age_hours: number | null;
    stale: boolean;
  };
  integrity: {
    score: number;
    issues: string[];
  };
  checks_passed: number;
  checks_total: number;
}
