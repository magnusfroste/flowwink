/**
 * An objective's rules as a form, not JSON (2026-11-25).
 *
 * The objective sheet asked an admin to write `constraints` and
 * `success_criteria` as raw JSON, and its examples (max_posts_per_day,
 * token_budget, excluded_skills) were keys nothing reads — an admin could set
 * a budget and get no budget. These are the keys the platform does read:
 *   cadence                     — the quota partitionByCadence enforces
 *                                 ({ max, per: day|week, every?, counts: <skill> })
 *   requires_business_identity  — the identity gate (reason.ts)
 *   priority, deadline          — printed into the heartbeat's objective list
 * Every other key is kept as it was (`rest`), so a rule written by an agent or
 * a template survives an edit in the form.
 */

export type CadencePer = 'day' | 'week';

export interface ObjectiveRules {
  cadence: { max: number; per: CadencePer; every: number; counts: string } | null;
  requiresIdentity: boolean;
  priority: string;
  deadline: string;
  /** Keys the form does not edit, kept as they were. */
  rest: Record<string, unknown>;
}

export interface CriterionRow { name: string; value: string }

const KNOWN = ['cadence', 'requires_business_identity', 'priority', 'deadline'];

const positiveInt = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
};

export function readObjectiveRules(constraints: Record<string, unknown> | null | undefined): ObjectiveRules {
  const c = constraints && typeof constraints === 'object' ? constraints : {};
  const raw = c.cadence && typeof c.cadence === 'object' ? (c.cadence as Record<string, unknown>) : null;
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (!KNOWN.includes(k)) rest[k] = v;
  return {
    cadence: raw
      ? {
          max: positiveInt(raw.max, 1),
          per: raw.per === 'week' ? 'week' : 'day',
          every: positiveInt(raw.every, 1),
          counts: typeof raw.counts === 'string' ? raw.counts : '',
        }
      : null,
    requiresIdentity: c.requires_business_identity === true,
    priority: typeof c.priority === 'string' ? c.priority : '',
    deadline: typeof c.deadline === 'string' ? c.deadline.slice(0, 10) : '',
    rest,
  };
}

/** The constraints object to store: only what is set, plus the untouched keys. */
export function writeObjectiveRules(rules: ObjectiveRules): Record<string, unknown> {
  const out: Record<string, unknown> = { ...rules.rest };
  if (rules.cadence && rules.cadence.counts.trim()) {
    const cad: Record<string, unknown> = {
      max: positiveInt(rules.cadence.max, 1),
      per: rules.cadence.per,
      counts: rules.cadence.counts.trim(),
    };
    const every = positiveInt(rules.cadence.every, 1);
    if (every > 1) cad.every = every;
    out.cadence = cad;
  }
  if (rules.requiresIdentity) out.requires_business_identity = true;
  if (rules.priority.trim()) out.priority = rules.priority.trim();
  if (rules.deadline.trim()) out.deadline = rules.deadline.trim();
  return out;
}

/** Success criteria are free-form targets the model reads; a row per target. */
export function criteriaToRows(criteria: Record<string, unknown> | null | undefined): CriterionRow[] {
  if (!criteria || typeof criteria !== 'object') return [];
  return Object.entries(criteria).map(([name, v]) => ({
    name,
    value: typeof v === 'string' ? v : JSON.stringify(v),
  }));
}

export function rowsToCriteria(rows: readonly CriterionRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const name = r.name.trim();
    if (!name) continue;
    const v = r.value.trim();
    if (v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(v)) out[name] = n;
    else if (v === 'true' || v === 'false') out[name] = v === 'true';
    else {
      try {
        const parsed = JSON.parse(v);
        out[name] = parsed !== null && typeof parsed === 'object' ? parsed : v;
      } catch {
        out[name] = v;
      }
    }
  }
  return out;
}
