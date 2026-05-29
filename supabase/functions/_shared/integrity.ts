/**
 * Shared Integrity & Drift Detection Utilities
 * 
 * Used by:
 * - setup-flowpilot (post-bootstrap integrity gate + store expected hash)
 * - instance-health (drift detection endpoint)
 */

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
  const { data: allSkills } = await supabase
    .from('agent_skills')
    .select('name, enabled, instructions, tool_definition, handler, description')
    .eq('enabled', true);

  const enabledSkills = allSkills || [];
  const issues: string[] = [];

  // Info: skills without instructions (advisory — description is the required field)
  const noInstr = enabledSkills.filter((s: any) => !s.instructions || s.instructions.trim() === '');
  if (noInstr.length > 0) {
    issues.push(`Info: ${noInstr.length} skills without optional instructions (description is what matters): ${noInstr.slice(0, 5).map((s: any) => s.name).join(', ')}${noInstr.length > 5 ? '...' : ''}`);
  }

  // Hard check: skills without description
  const noDesc = enabledSkills.filter((s: any) => !s.description || s.description.trim() === '');
  if (noDesc.length > 0) {
    issues.push(`${noDesc.length} skills missing descriptions`);
  }

  // Hard check: invalid tool definitions.
  // Accept either OpenAI wrapper {type:'function', function:{name, parameters}}
  // OR a raw JSON Schema object ({type:'object', properties:{...}}) — both are
  // valid shapes used across the codebase.
  const badTd = enabledSkills.filter((s: any) => {
    if (!s.tool_definition) return true;
    const td = typeof s.tool_definition === 'string' ? JSON.parse(s.tool_definition) : s.tool_definition;
    if (!td || typeof td !== 'object') return true;
    // OpenAI wrapper
    if (td.function && td.function.name && td.function.parameters) return false;
    // Raw JSON Schema
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
