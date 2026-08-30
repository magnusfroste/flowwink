import { describe, expect, it, vi } from 'vitest';

// reason.ts (directly) and handlers.ts (transitively) pull in ai-config, which
// is Deno-side; stub it so the pure gate logic runs in vitest.
vi.mock('../../../supabase/functions/_shared/ai-config.ts', () => ({ resolveAiConfig: async () => ({}) }));
// flowpilot-module imports the browser supabase client, which needs Vite env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

/**
 * Guardrail: content-producing objectives HOLD until Business Identity exists.
 *
 * Fresh-install class (Restagård, 2026-08-27): the starter objective
 * "Establish content presence — publish 3 blog posts within the first week"
 * was seeded 'active', and FlowPilot's loop ran it BEFORE any Business
 * Identity was written — three generic English blog posts, ungrounded by
 * construction. The grounding doctrine says outward-facing generation grounds
 * in identity; an objective that produces public content therefore declares
 * `constraints.requires_business_identity` and waits for company_name +
 * services.
 *
 * Three rails, each executed here:
 *   1. Seeding — starterObjectiveRow births the gated objective 'paused' with
 *      a visible hold reason on an identity-less instance.
 *   2. Runtime belt — partitionByIdentityGate/loadObjectives hold a gated
 *      objective that is 'active' anyway (old seeds, manual activation).
 *   3. Wake — the site_settings trigger (SQL, pinned by text below) flips the
 *      hold to 'active' when a complete profile is written, whoever writes it.
 */

const loadReason = async () => await import('../../../supabase/functions/_shared/pilot/reason.ts');
const loadModule = async () => await import('../modules/flowpilot-module');
const loadDenoGate = async () =>
  await import('../../../supabase/functions/_shared/domains/business-identity-block.ts');
const loadFrontendGate = async () => await import('../business-identity-gate');

/** Minimal Supabase stub for loadObjectives: objectives + activity + profile. */
function stubDb({
  objectives,
  activity = [],
  profile,
  profileError = false,
}: {
  objectives: unknown[];
  activity?: unknown[];
  profile?: unknown;
  profileError?: boolean;
}) {
  return {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query-builder stub mirrors PostgREST's untyped chain
      const q: any = {
        select: () => q,
        eq: () => q,
        in: () => q,
        or: () => q,
        order: () => q,
        limit: async () => ({ data: objectives }),
        maybeSingle: async () =>
          profileError
            ? { data: null, error: new Error('read failed') }
            : { data: profile === undefined ? null : { value: profile }, error: null },
      };
      if (table === 'agent_activity') {
        q.gte = () => Promise.resolve({ data: activity });
      } else {
        q.gte = () => q;
      }
      return q;
    },
  };
}

const gatedObjective = (over: Record<string, unknown> = {}) => ({
  id: 'obj-content',
  goal: 'Establish content presence — publish 3 blog posts within the first week',
  status: 'active',
  constraints: { no_destructive_actions: true, requires_business_identity: true },
  success_criteria: { published_posts: 3 },
  progress: {},
  created_at: '2026-08-27T00:00:00Z',
  updated_at: '2026-08-27T00:00:00Z',
  ...over,
});

describe('seeding: a fresh install births the content objective paused', async () => {
  const M = await loadModule();
  const contentSeed = M.FLOWPILOT_STARTER_OBJECTIVES.find((o) => /blog posts/.test(o.goal))!;

  it('the blog starter objective DECLARES the identity gate', () => {
    expect(contentSeed).toBeDefined();
    expect((contentSeed.constraints as Record<string, unknown>).requires_business_identity).toBe(true);
  });

  it('NEGATIVE: no identity → paused with a visible hold reason, never active', () => {
    const row = M.starterObjectiveRow(contentSeed, false);
    expect(row.status).toBe('paused');
    const hold = row.progress.hold as { reason: string; note: string };
    expect(hold.reason).toBe('awaiting_business_identity');
    expect(hold.note).toMatch(/Business Identity/);
  });

  it('identity present → born active', () => {
    expect(M.starterObjectiveRow(contentSeed, true).status).toBe('active');
    expect(M.starterObjectiveRow(contentSeed, true).progress).toEqual({});
  });

  it('ungated starter objectives are unaffected by a missing identity', () => {
    for (const seed of M.FLOWPILOT_STARTER_OBJECTIVES) {
      if ((seed.constraints as Record<string, unknown>).requires_business_identity === true) continue;
      expect(M.starterObjectiveRow(seed, false).status).toBe('active');
    }
  });
});

describe('runtime belt: an active gated objective is NOT run without identity', async () => {
  const R = await loadReason();

  it('NEGATIVE: fresh install, no profile → the content objective is held out of the working set', async () => {
    const db = stubDb({ objectives: [gatedObjective()], profile: undefined });
    const out = await R.loadObjectives(db);
    expect(out).toMatch(/Holding for Business Identity/);
    expect(out).toMatch(/never invent an identity/);
    // Not listed as actionable — no priority row for it.
    expect(out).not.toMatch(/\[obj-content\]/);
  });

  it('an incomplete profile (name but no services) still holds', async () => {
    const db = stubDb({
      objectives: [gatedObjective()],
      profile: { company_name: 'Restagård', services: [] },
    });
    const out = await R.loadObjectives(db);
    expect(out).toMatch(/Holding for Business Identity/);
    expect(out).not.toMatch(/\[obj-content\]/);
  });

  it('a complete profile lets the objective through', async () => {
    const db = stubDb({
      objectives: [gatedObjective()],
      profile: { company_name: 'Restagård', services: [{ name: 'Gårdsbutik', description: '' }] },
    });
    const out = await R.loadObjectives(db);
    expect(out).toMatch(/\[obj-content\]/);
    expect(out).not.toMatch(/Holding for Business Identity/);
  });

  it('ungated objectives keep working while the gated one holds', async () => {
    const db = stubDb({
      objectives: [
        gatedObjective(),
        gatedObjective({ id: 'obj-research', goal: 'Research competitors', constraints: {} }),
      ],
      profile: undefined,
    });
    const out = await R.loadObjectives(db);
    expect(out).toMatch(/\[obj-research\]/);
    expect(out).not.toMatch(/\[obj-content\]/);
  });

  it('a FAILED profile read fails OPEN (the degraded identity marker covers that turn)', async () => {
    const db = stubDb({ objectives: [gatedObjective()], profileError: true });
    const out = await R.loadObjectives(db);
    expect(out).toMatch(/\[obj-content\]/);
  });
});

describe('the readiness predicate agrees across both runtimes', async () => {
  const D = await loadDenoGate();
  const F = await loadFrontendGate();

  const cases: Array<[unknown, boolean]> = [
    [null, false],
    [{}, false],
    [{ company_name: 'Restagård' }, false], // no services
    [{ services: [{ name: 'Gårdsbutik' }] }, false], // no name
    [{ company_name: '   ', services: [{ name: 'Gårdsbutik' }] }, false],
    [{ company_name: 'Restagård', services: [] }, false],
    [{ company_name: 'Restagård', services: [''] }, false],
    [{ company_name: 'Restagård', services: [{}] }, false],
    [{ company_name: 'Restagård', services: ['Gårdsbutik'] }, true],
    [{ company_name: 'Restagård', services: [{ name: 'Gårdsbutik', description: '' }] }, true],
    // Legacy shapes a profile nobody re-saved may still carry:
    [{ company_name: 'Restagård', services: { Gårdsbutik: 'Egen butik' } }, true],
    [{ company_name: 'Restagård', services: 'Gårdsbutik och kafé' }, true],
  ];

  it.each(cases)('%j → %s in both runtimes', (profile, expected) => {
    expect(D.hasCoreBusinessIdentity(profile)).toBe(expected);
    expect(F.hasCoreBusinessIdentity(profile)).toBe(expected);
  });
});

describe('create_objective TEACHES the gate for runtime-created content objectives', () => {
  // Same lesson as the cadence guard (objective-cadence-seed.guardrails.test.ts):
  // the seeded starter objective is only one member of the class. A blog/social/
  // newsletter objective FlowPilot creates at runtime must declare the same
  // constraint or the belt in reason.ts has nothing to hold. Law 2: the fix is
  // metadata on the interface, never a routing hack.
  it('both the param description (pre-call lever) and the instructions demand the flag', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const seed = readFileSync(join(process.cwd(), 'src/lib/modules/flowpilot-module.ts'), 'utf8');
    const block = seed.slice(seed.indexOf("name: 'create_objective'"), seed.indexOf("name: 'learn_from_data'"));
    const hits = block.match(/constraints\.requires_business_identity/g) ?? [];
    expect(hits.length, 'gate guidance must reach both the description and the instructions').toBeGreaterThanOrEqual(2);
    expect(block).toMatch(/Identity gate — REQUIRED for outward-facing content goals/);
    expect(block).toMatch(/Never work around the hold by inventing an identity/);
  });
});

describe('wake rail: the site_settings trigger exists and matches the hold contract', () => {
  // The wake is SQL — vitest cannot execute it, so pin the contract's load-
  // bearing pieces: the trigger fires on company_profile writes, readiness
  // mirrors the predicate (name + services, legacy shapes included), and ONLY
  // gate-held objectives wake (a manual pause carries no hold marker).
  it('the migration wires trigger, readiness and the hold-reason match', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260903030000_content-holds-until-the-company-knows-itself.sql'),
      'utf8',
    );
    expect(sql).toMatch(/CREATE TRIGGER trg_wake_identity_gated_objectives/);
    expect(sql).toMatch(/ON public\.site_settings/);
    expect(sql).toMatch(/NEW\.key = 'company_profile'/);
    expect(sql).toMatch(/company_name/);
    expect(sql).toMatch(/requires_business_identity/);
    expect(sql).toMatch(/'awaiting_business_identity'/);
    // Catch-up for identity written before the trigger existed.
    expect(sql).toMatch(/UPDATE public\.site_settings\s+SET value = value/);
  });
});
