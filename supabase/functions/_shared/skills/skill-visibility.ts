/**
 * Taking a skill out of the catalog — the one way every writer does it.
 *
 * `enabled:false` alone is refused by trg_enforce_mcp_exposure_invariant for
 * an exposed skill (mcp_exposed=true requires enabled=true), and with
 * `.in('name', [...])` one refused row fails the whole statement. Self-healing,
 * the integrity repair and a module's switch-off all wrote it that way and
 * never read the error, so none of them ever disabled an exposed skill.
 * Guarded by src/lib/__tests__/skill-disable-unexposes.guardrails.test.ts.
 *
 * A QUARANTINE (self-healing, FlowPilot's skill_disable) also stamps
 * `quarantined_at` + `quarantine_reason` in the same write, and every sync
 * path leaves such a row's flags alone — otherwise sync_skills_from_code,
 * which re-enables every hidden skill of an enabled module on each admin page
 * load, undoes the disable within minutes. Anything that sets enabled=true
 * lifts it (trigger trg_skill_quarantine_lifts_on_enable, 20261105100000).
 */

/** The slice of a Supabase client this module uses — typed loosely, so the edge and the browser client both fit. */
interface UpdateChain {
  in(column: string, values: string[]): { select(columns: string): PromiseLike<{ data: unknown; error: { message: string } | null }> };
}
interface Db { from(table: string): { update(values: Record<string, unknown>): UpdateChain } }

export interface HideResult {
  /** Rows actually written (read back with .select), not names asked for. */
  hidden: number;
  hidden_names: string[];
  failures: string[];
  /** false when the instance lacks the quarantine columns (migration not applied): the skills are hidden, but the sync may bring them back. */
  quarantine_recorded?: boolean;
}

const MISSING_QUARANTINE_COLUMN = /quarantine/i;

/** True when an error says the quarantine columns do not exist yet (edge deployed before the migration). */
export function isMissingQuarantineColumn(message: string | undefined | null): boolean {
  return !!message && MISSING_QUARANTINE_COLUMN.test(message);
}

export async function hideSkills(
  supabase: unknown,
  keys: string[],
  opts: { column?: 'name' | 'id'; quarantine?: string } = {},
): Promise<HideResult> {
  const db = supabase as Db;
  const column = opts.column ?? 'name';
  const out: HideResult = { hidden: 0, hidden_names: [], failures: [] };
  if (opts.quarantine) out.quarantine_recorded = true;
  const marker = opts.quarantine
    ? { quarantined_at: new Date().toISOString(), quarantine_reason: opts.quarantine.slice(0, 500) }
    : {};
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    let { data, error } = await db.from('agent_skills')
      .update({ enabled: false, mcp_exposed: false, ...(out.quarantine_recorded ? marker : {}) })
      .in(column, chunk).select('name');
    if (error && out.quarantine_recorded && isMissingQuarantineColumn(error.message)) {
      // Fail forward: hide anyway, say the marker is missing.
      out.quarantine_recorded = false;
      ({ data, error } = await db.from('agent_skills')
        .update({ enabled: false, mcp_exposed: false })
        .in(column, chunk).select('name'));
    }
    if (error) { out.failures.push(error.message); continue; }
    for (const r of (data ?? []) as Array<{ name: string }>) out.hidden_names.push(r.name);
  }
  out.hidden = out.hidden_names.length;
  return out;
}

/** A row the platform quarantined: disabled AND marked. The sync leaves its flags alone. */
export function isQuarantined(row: { enabled?: boolean | null; quarantined_at?: string | null } | undefined | null): boolean {
  return !!row && row.enabled !== true && !!row.quarantined_at;
}

// ─── Self-healing: which failures say the SKILL is broken ────────────────────

/**
 * Error codes (_shared/agent-errors.ts) that say the caller, a business rule
 * or the world got in the way — not the skill's code. Three external agents
 * guessing a parameter name, a closed period, a missing integration or a
 * provider's bad minute must never take a skill away from the whole fleet.
 * They neither count toward a streak nor break it.
 */
export const NOT_A_SKILL_FAULT: ReadonlySet<string> = new Set([
  'PERIOD_LOCKED', 'RETENTION_LOCKED', 'MISSING_EXCHANGE_RATE',
  'MISSING_REQUIRED_PARAMETER', 'UNKNOWN_PARAMETERS', 'FORBIDDEN', 'NOT_FOUND',
  'ALREADY_EXISTS', 'INVALID_INPUT', 'APPROVAL_REQUIRED', 'NOT_CONNECTED',
  'TRANSIENT', 'READ_ONLY_KEY', 'READ_ONLY_RUN', 'RULE_REFUSED',
]);

export interface ActivityRow { skill_name?: string | null; status?: string | null; code?: string | null; created_at?: string | null }

/** A streak whose newest failure is older than this says the skill WAS failing, not that it is. */
export const SELF_HEAL_FRESH_HOURS = 24;

export interface SelfHealEvidence {
  /**
   * When each skill's row last changed (agent_skills.updated_at): a deploy that
   * rewrote it, or a person's re-enable. A failure from before that is evidence
   * against the OLD skill and ends the streak.
   */
  changedAt?: Record<string, string | null | undefined>;
  now?: Date;
}

/**
 * Skills whose latest `threshold` counted runs all failed with a skill fault
 * (HANDLER_ERROR, or no code). Rows newest first. Any run that did not fail —
 * success, refused, pending — ends the skill's streak.
 *
 * Only FRESH evidence counts (2026-11-15). www lost manage_blog_posts for
 * four days: eight calls failed on 11-11 at 02:20, the fix was deployed that
 * night, the deploy lifted the quarantine — and the next heartbeat read the
 * same eight rows out of its three-day window and quarantined the fixed skill
 * again. So a failure from before the skill's row last changed ends the
 * streak, and a streak whose newest failure is over a day old is history: a
 * skill that is broken fails again when it is next called.
 */
export function selfHealCandidates(rows: ActivityRow[], threshold: number, evidence: SelfHealEvidence = {}): Array<{ name: string; streak: number }> {
  const streak = new Map<string, number>();
  const settled = new Set<string>();
  const stale = new Set<string>();
  const now = (evidence.now ?? new Date()).getTime();
  const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
  for (const r of rows) {
    const name = r.skill_name;
    if (!name || settled.has(name)) continue;
    if (r.status !== 'failed') { settled.add(name); continue; }
    const at = ms(r.created_at);
    const changed = ms(evidence.changedAt?.[name]);
    if (Number.isFinite(at) && Number.isFinite(changed) && at <= changed) { settled.add(name); continue; }
    if (r.code && NOT_A_SKILL_FAULT.has(r.code)) continue;
    // The first counted failure is the newest: over a day old, the streak is history.
    if (!streak.has(name) && Number.isFinite(at) && now - at > SELF_HEAL_FRESH_HOURS * 3600_000) { stale.add(name); settled.add(name); continue; }
    const n = (streak.get(name) ?? 0) + 1;
    streak.set(name, n);
    if (n >= threshold) settled.add(name);
  }
  return [...streak].filter(([name, n]) => n >= threshold && !stale.has(name)).map(([name, n]) => ({ name, streak: n }));
}
