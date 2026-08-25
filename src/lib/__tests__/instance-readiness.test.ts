/**
 * The onboarding checklist must be invisible on a finished instance and
 * unmissable on a half-provisioned one.
 *
 * Both fixtures below are MEASURED, not invented:
 *
 *  - FRESH  — a locally fresh-replayed database (2026-08-22): agent_skills had
 *             6 rows, cron.job carried none of the 8 platform jobs, site_settings
 *             held only `cookie_consent_v2` and `visitor_intelligence_rules`
 *             (so no site URL), and nothing had ever reported an edge deploy.
 *             Every layer of the dashboard still rendered fine.
 *  - MATURE — the optic instance on the same day: 537 skills stamped with this
 *             build's seed hash, all 485 migrations applied, all 8 platform cron
 *             jobs active, siteUrl set, module choice saved.
 *
 * The regression these lock down cuts both ways. A checklist that shows on a
 * mature instance becomes furniture and gets ignored; a checklist that hides on
 * a broken one is the silent half-success it was built to end.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLATFORM_CRON_JOBS,
  blockingRows,
  evaluateInstanceReadiness,
  isInstanceReady,
  type ReadinessInput,
} from '@/lib/instance-readiness';
import { PLATFORM_SKILL_NAMES } from '@/lib/platform-seeds';
import instanceManifest from '../../../supabase/seed/instance-manifest.json';

const EXPECTED_MIGRATIONS = instanceManifest.layers.schema.migrations;
const EXPECTED_FUNCTIONS = Object.keys(instanceManifest.layers.edge_functions.functions);
const EXPECTED_SEED_HASH = instanceManifest.layers.skills.seed_hash;

/** optic, 2026-08-22 — a finished, running business. */
function matureInstance(): ReadinessInput {
  return {
    schema: { applied: EXPECTED_MIGRATIONS.map((m) => ({ ...m })), expected: EXPECTED_MIGRATIONS },
    skills: {
      total: 537,
      enabled: 537,
      stampHash: EXPECTED_SEED_HASH,
      expectedHash: EXPECTED_SEED_HASH,
      expectedCount: instanceManifest.layers.skills.skill_count,
      platformFloor: PLATFORM_SKILL_NAMES.length,
    },
    edge: {
      deployed: [...EXPECTED_FUNCTIONS],
      deployedAt: '2026-08-05T00:09:12.665767+00:00',
      expected: EXPECTED_FUNCTIONS,
    },
    cron: {
      jobs: PLATFORM_CRON_JOBS.map((jobname) => ({ jobname, active: true, foreign_host: false })),
      available: true,
    },
    ai: { configured: true },
    siteUrl: { configured: 'https://www.optictunnels.eu', origin: 'https://www.optictunnels.eu' },
    modules: { chosen: true, enabledCount: 40 },
  };
}

/** A fresh replay — schema applied, nothing else ever was. */
function freshInstance(): ReadinessInput {
  return {
    schema: { applied: EXPECTED_MIGRATIONS.map((m) => ({ ...m })), expected: EXPECTED_MIGRATIONS },
    skills: {
      total: 6,
      enabled: 6,
      stampHash: null,
      expectedHash: EXPECTED_SEED_HASH,
      expectedCount: instanceManifest.layers.skills.skill_count,
      platformFloor: PLATFORM_SKILL_NAMES.length,
    },
    edge: { deployed: null, deployedAt: null, expected: EXPECTED_FUNCTIONS },
    cron: {
      // What a fresh replay actually carries: migration-seeded business jobs,
      // and not one of the platform jobs.
      jobs: [
        { jobname: 'purge-cron-run-details', active: true, foreign_host: false },
        { jobname: 'gmail-reconcile', active: true, foreign_host: false },
        { jobname: 'voice-calls-sweep-stale', active: true, foreign_host: false },
      ],
      available: true,
    },
    ai: { configured: false },
    siteUrl: { configured: null, origin: 'http://localhost:8080' },
    // The `modules` row exists from birth (ensure_modules_settings seeds it),
    // so its presence proves nothing. Nobody has saved a choice.
    modules: { chosen: false, enabledCount: 7 },
  };
}

describe('a complete instance does not show the checklist', () => {
  it('is ready, with nothing blocking', () => {
    const rows = evaluateInstanceReadiness(matureInstance());
    expect(blockingRows(rows)).toEqual([]);
    expect(isInstanceReady(rows)).toBe(true);
  });

  it('stays ready when the skills seed is from another build (drift is not incompleteness)', () => {
    const input = matureInstance();
    input.skills.stampHash = 'sha256:something-from-last-week';
    const rows = evaluateInstanceReadiness(input);
    expect(rows.find((r) => r.id === 'skills')?.status).toBe('drift');
    expect(isInstanceReady(rows)).toBe(true);
  });

  it('stays ready when the edge deploy report is stale — a report is not a probe', () => {
    const input = matureInstance();
    input.edge.deployed = EXPECTED_FUNCTIONS.slice(0, 70);
    const rows = evaluateInstanceReadiness(input);
    expect(rows.find((r) => r.id === 'edge_functions')?.status).toBe('drift');
    expect(isInstanceReady(rows)).toBe(true);
  });

  it('stays ready even though the Supabase auth Site URL can never be verified from here', () => {
    const rows = evaluateInstanceReadiness(matureInstance());
    const siteUrl = rows.find((r) => r.id === 'site_url')!;
    expect(siteUrl.status).toBe('ok');
    // The unmeasurable half is still SAID, every time — it just cannot keep
    // the checklist alive forever.
    expect(siteUrl.note).toContain('URL Configuration');
    expect(siteUrl.measuredBy).toMatch(/CANNOT be read/);
  });
});

describe('a half-provisioned instance shows the checklist', () => {
  const rows = evaluateInstanceReadiness(freshInstance());

  it('is not ready', () => {
    expect(isInstanceReady(rows)).toBe(false);
  });

  it('names every layer that was never applied', () => {
    expect(blockingRows(rows).map((r) => r.id).sort()).toEqual(
      ['ai_provider', 'cron', 'modules', 'site_url', 'skills'].sort(),
    );
  });

  it('calls out the empty agent surface by the platform floor, not by a stamp', () => {
    const skills = rows.find((r) => r.id === 'skills')!;
    expect(skills.status).toBe('blocked');
    expect(skills.detail).toContain(`${PLATFORM_SKILL_NAMES.length}-skill platform floor`);
  });

  it('calls the dead automation file what it is', () => {
    const cron = rows.find((r) => r.id === 'cron')!;
    expect(cron.status).toBe('blocked');
    // All eight — the fresh replay's cron jobs are business ones from
    // migrations; not a single platform job was ever registered.
    expect(cron.detail).toContain(`${PLATFORM_CRON_JOBS.length} missing`);
  });

  it('treats running on code defaults as a step never taken, not as a choice', () => {
    const modules = rows.find((r) => r.id === 'modules')!;
    expect(modules.status).toBe('blocked');
    expect(modules.detail).toMatch(/shipped defaults/);
  });

  it('gives every blocking row an action', () => {
    for (const row of blockingRows(rows)) {
      expect(row.action, `${row.id} has no action`).toBeTruthy();
    }
  });
});

describe('honesty rules', () => {
  it('never renders ok for a layer the browser cannot measure', () => {
    const rows = evaluateInstanceReadiness(matureInstance());
    const edge = rows.find((r) => r.id === 'edge_functions')!;
    // Even with a complete deploy report, this row refuses to claim `ok` —
    // the report is a self-report from the deploy tool, not a probe.
    expect(edge.status).toBe('unverifiable');
    expect(edge.measuredBy).toMatch(/not a probe|no API for listing/);
  });

  it('does not claim health when a probe failed — an unreadable instance is not a finished one', () => {
    const input = matureInstance();
    input.schema.applied = null;
    input.cron.jobs = null;
    input.ai.configured = null;
    input.modules.chosen = null;
    const rows = evaluateInstanceReadiness(input);
    expect(isInstanceReady(rows)).toBe(false);
    for (const id of ['schema', 'cron', 'ai_provider', 'modules']) {
      expect(rows.find((r) => r.id === id)?.status, id).toBe('unknown');
    }
  });

  it('separates deploy currency from provisioning: a lagging ledger is drift, an EMPTY one is not', () => {
    // Measured 2026-08-22: optic carried 485 of the 489 migrations this build
    // expects, because four had just been written and not yet pushed. Gating
    // on that would put the onboarding card on a running business's dashboard
    // on every release — furniture. Instance Sync already reports it in red.
    const lagging = matureInstance();
    lagging.schema.applied = EXPECTED_MIGRATIONS.slice(0, -4).map((m) => ({ ...m }));
    const laggingRows = evaluateInstanceReadiness(lagging);
    expect(laggingRows.find((r) => r.id === 'schema')?.status).toBe('drift');
    expect(isInstanceReady(laggingRows)).toBe(true);

    // A database where nothing ever ran is a different claim entirely.
    const empty = matureInstance();
    empty.schema.applied = [];
    const emptyRows = evaluateInstanceReadiness(empty);
    expect(emptyRows.find((r) => r.id === 'schema')?.status).toBe('blocked');
    expect(isInstanceReady(emptyRows)).toBe(false);
  });

  it('flags a cron job that drives ANOTHER instance', () => {
    const input = matureInstance();
    input.cron.jobs = PLATFORM_CRON_JOBS.map((jobname) => ({
      jobname,
      active: true,
      foreign_host: jobname === 'flowpilot-heartbeat',
    }));
    const rows = evaluateInstanceReadiness(input);
    const cron = rows.find((r) => r.id === 'cron')!;
    expect(cron.status).toBe('blocked');
    expect(cron.detail).toContain('ANOTHER instance');
  });

  it('every row states what its icon was derived from', () => {
    for (const row of evaluateInstanceReadiness(freshInstance())) {
      expect(row.measuredBy.length, row.id).toBeGreaterThan(20);
      expect(row.why.length, row.id).toBeGreaterThan(20);
    }
  });
});

/**
 * The `modules` row's SHAPE is the only thing left that separates a decision
 * from a default, now that ensure_modules_settings() seeds the row at birth.
 * That makes two write paths load-bearing for this checklist, in two different
 * languages. If either one changes shape, the module row silently reads wrong
 * on every instance — green where nobody chose, or red forever where they did.
 * These pin both ends.
 */
describe('the module-choice signal rests on two write shapes', () => {
  it('the birth seed writes ONLY {enabled} per module', () => {
    const migration = readdirSync(join(process.cwd(), 'supabase/migrations'))
      .filter((f) => f.includes('the-module-row-is-born-with-the-instance'))
      .map((f) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8'))
      .join('\n');
    expect(migration, 'birth-seed migration not found').not.toEqual('');
    expect(migration).toMatch(/jsonb_build_object\(\s*'enabled'/);
    // "Store the MINIMAL shape" is the promise the readiness row depends on.
    expect(migration).toMatch(/MINIMAL shape/);
  });

  it('saving in Modules persists the whole merged ModulesSettings object', () => {
    const hook = readFileSync(join(process.cwd(), 'src/hooks/useModules.tsx'), 'utf8');
    // useUpdateModules casts the FULL settings object and writes that — not a
    // {enabled}-only projection.
    expect(hook).toMatch(/const jsonValue = modules as unknown as Json/);
    expect(hook).toMatch(/value:\s*jsonValue/);
  });
});

/**
 * The visibility rule is only worth testing if the component actually obeys it.
 * These pin the wiring — including the absence of a dismiss button, which is
 * the one change that would turn this surface back into decoration.
 */
describe('the checklist obeys the rule, and cannot be dismissed', () => {
  const component = readFileSync(
    join(process.cwd(), 'src/components/admin/InstanceReadinessChecklist.tsx'),
    'utf8',
  );
  const dashboard = readFileSync(join(process.cwd(), 'src/pages/admin/AdminDashboard.tsx'), 'utf8');

  it('renders nothing when the pure rule says the instance is ready', () => {
    // Synligheten är en ren funktion av MÄTT tillstånd — `ready` styr, och
    // kortet försvinner av sig självt. Kvitto-läget (hadWork) håller kvar det
    // under den mountning som faktiskt gjorde jobbet, så det sista klicket får
    // ett svar i stället för att kortet bara tystnar; en ny sidladdning börjar
    // med hadWork=false och då är det borta. Testet låser REGELN, inte den
    // exakta raden — annars fäller det varje omformulering.
    expect(component).toMatch(/if \(ready && !alwaysShow[\s\S]{0,60}?\) return null;/);
    expect(component).toMatch(/isInstanceReady/);
    // Kvittot får bara bero på denna mountning: en ref som nollställs vid
    // omladdning, aldrig något persistent.
    expect(component).toMatch(/hadWorkRef\s*=\s*useRef\(false\)/);
    // OCH det får bara minnas ARBETE, aldrig ovisshet. `ready` härleds ur
    // rader som är `unknown` innan datan finns, så första renderingen på varje
    // sidladdning har ready=false. Utan laddningsvakten sätts flaggan där — på
    // VARJE instans — och kortet kan aldrig försvinna igen. Verkligt fel på
    // nordbrygg 2026-08-22: allt grönt, kortet låg kvar.
    expect(component).toMatch(/if \(!isLoading && !ready\) hadWorkRef\.current = true;/);
  });

  it('kvittot går att stänga — men ETT RÖTT KORT gör det inte', () => {
    // Magnus: "kanske bättre om admin bara klickade på close". Rätt — ett grönt
    // kort döljer ingenting när man stänger det, det är borta vid nästa
    // laddning ändå. Men skyddet måste vara STRUKTURELLT, inte en artighet:
    // `receiptAcknowledged` får bara betyda något när `ready` är sant, så att
    // ingen klickväg kan gömma en instans som fortfarande saknar något.
    expect(component).toMatch(
      /if \(ready && !alwaysShow && \(!hadWork \|\| receiptAcknowledged\)\) return null;/,
    );
    // Knappen får bara existera i grönt läge.
    expect(component).toMatch(/\{ready && !alwaysShow && \(/);
    // Och ingenting får överleva sidladdningen.
    expect(component).not.toMatch(/receiptAcknowledged[\s\S]{0,200}(localStorage|sessionStorage)/);
  });

  it('has no dismiss/hide/snooze escape hatch', () => {
    // Identifiers, not prose — the copy legitimately says "nothing to dismiss".
    for (const escape of [
      'onDismiss',
      'setDismissed',
      'isDismissed',
      'snooze',
      'localStorage',
      'sessionStorage',
    ]) {
      expect(component, `checklist gained a ${escape} escape hatch`).not.toContain(escape);
    }
  });

  it('is mounted on the dashboard WITHOUT alwaysShow — a mature instance never sees it', () => {
    expect(dashboard).toMatch(/<InstanceReadinessChecklist \/>/);
  });
});

describe('the platform cron floor is derived from what the registrars actually schedule', () => {
  it('lists exactly the jobs ensurePlatformCron() guarantees', () => {
    expect([...PLATFORM_CRON_JOBS].sort()).toEqual(
      [
        'automation-dispatcher-every-minute',
        'booking-reminders',
        'flowpilot-daily-briefing',
        'flowpilot-heartbeat',
        'flowpilot-learn',
        'instance-health-check',
        'knowledge-indexer',
        'newsletter-dispatch-scheduled',
        'publish-scheduled-pages',
      ].sort(),
    );
  });

  it('claims no business-owned job as a platform requirement', () => {
    // These exist on a fresh replay from migrations and belong to a business
    // module, not to the platform floor — requiring them would make the
    // checklist red on instances that are perfectly finished.
    for (const businessJob of ['gmail-reconcile', 'enqueue-contract-billing-tasks', 'service-recurring-orders']) {
      expect(PLATFORM_CRON_JOBS).not.toContain(businessJob);
    }
  });
});

describe('en avbruten provisionering läses inte som releasefördröjning', () => {
  // Verkligt fall 2026-08-22: nordbryggs körning tog slut på tid vid 449/489.
  // Kedjan är omkörbar så en ny push återupptar — men bara om admin FÅR VETA
  // att installationen är avbruten. Läste den "deploy currency, ignorera"
  // skulle den halvfärdiga instansen se normal ut.
  const expected = Array.from({ length: 489 }, (_, i) => ({
    version: `2026${String(i).padStart(10, '0')}`,
    name: `m${i}`,
  }));
  const applied = expected.slice(0, 449);

  const base = (over: Partial<ReadinessInput>): ReadinessInput => ({
    schema: { applied, expected },
    skills: { total: 6, enabled: 6, stampHash: null, expectedHash: 'h', expectedCount: 537, platformFloor: 14 },
    edge: { deployed: null, deployedAt: null, expected: [] },
    cron: { jobs: null, available: null },
    ai: { configured: null },
    siteUrl: { configured: null, origin: 'https://example.test' },
    modules: { chosen: false, enabledCount: 7 },
    ...over,
  });

  const schemaOf = (input: ReadinessInput) =>
    evaluateInstanceReadiness(input).find((r) => r.id === 'schema')!;

  it('ny instans som stannade halvvägs → blocked, och säger att en push återupptar', () => {
    const row = schemaOf(base({}));
    expect(row.status).toBe('blocked');
    expect(row.detail).toContain('stopped short');
    expect(row.note).toMatch(/re-runnable|resumes/i);
  });

  it('MOGEN instans som ligger en release efter → drift, inte blocked', () => {
    // Plattformslagret seedat och modulval sparat = någon har gjort klart här.
    const row = schemaOf(
      base({
        skills: { total: 537, enabled: 500, stampHash: 'h', expectedHash: 'h', expectedCount: 537, platformFloor: 14 },
        modules: { chosen: true, enabledCount: 20 },
      }),
    );
    expect(row.status).toBe('drift');
  });

  it('räcker inte med EN av signalerna — båda krävs för att kalla den oavslutad', () => {
    const seededButNoChoice = schemaOf(
      base({ skills: { total: 537, enabled: 500, stampHash: 'h', expectedHash: 'h', expectedCount: 537, platformFloor: 14 } }),
    );
    const chosenButUnseeded = schemaOf(base({ modules: { chosen: true, enabledCount: 20 } }));
    expect(seededButNoChoice.status).toBe('drift');
    expect(chosenButUnseeded.status).toBe('drift');
  });
});

describe('en åtgärd måste peka på det som faktiskt blockerar', () => {
  // Två fall observerade skarpt på nordbrygg 2026-08-22: seed-knappen som inte
  // stämplade (raden kunde aldrig bli grön av sin egen knapp) och siteUrl-raden
  // som blockerade på FlowWink-halvan men bara länkade till Supabase-halvan —
  // den den uttryckligen inte kan mäta. En knapp som inte kan lösa sin egen rad
  // är samma sorts fel som en vakt som inte vaktar.
  const base = (over: Partial<ReadinessInput>): ReadinessInput => ({
    schema: { applied: [{ version: '1', name: 'a' }], expected: [{ version: '1', name: 'a' }] },
    skills: { total: 537, enabled: 500, stampHash: 'h', expectedHash: 'h', expectedCount: 537, platformFloor: 14 },
    edge: { deployed: null, deployedAt: null, expected: [] },
    cron: { jobs: null, available: null },
    ai: { configured: true },
    siteUrl: { configured: null, origin: 'https://nordbygg.flowwink.com' },
    modules: { chosen: true, enabledCount: 20 },
    ...over,
  });

  it('siteUrl blockerad → åtgärden löser FlowWink-halvan, aldrig Supabase-halvan', () => {
    const row = evaluateInstanceReadiness(base({})).find((r) => r.id === 'site_url')!;
    expect(row.status).toBe('blocked');
    // Formen får variera (ettklicksval på en kanonisk domän, annars en länk
    // till fältet) — invarianten är att åtgärden angriper det som BLOCKERAR.
    // Att skicka admin till Supabase-dashboarden löser aldrig den här raden.
    expect(row.action?.kind === 'run' || row.action?.kind === 'link').toBe(true);
    expect(JSON.stringify(row.action)).not.toContain('supabase.com');
  });

  it('Supabase-halvan finns kvar i noten — den är ett andra steg, inte radens grind', () => {
    const row = evaluateInstanceReadiness(base({})).find((r) => r.id === 'site_url')!;
    expect(row.note).toMatch(/Supabase/);
    expect(row.note).toContain('nordbygg.flowwink.com');
  });

  it('satt siteUrl → ok, och sluter aldrig grönt om Supabase-halvan', () => {
    const row = evaluateInstanceReadiness(
      base({ siteUrl: { configured: 'https://nordbygg.flowwink.com', origin: 'https://nordbygg.flowwink.com' } }),
    ).find((r) => r.id === 'site_url')!;
    expect(row.status).toBe('ok');
    expect(row.detail).toMatch(/unverifiable/i);
  });
});

describe('self-hosted Supabase har varken dashboard eller Management-API', () => {
  // FlowWink säljs på datasuveränitet — self-hosted är en förstklassig
  // installation, inte ett undantag. Att peka en self-hosted-operatör på
  // supabase.com/dashboard är värre än att inte säga något: det skickar hen
  // någonstans där hens instans inte finns.
  const base = (supabaseUrl: string | null): ReadinessInput => ({
    schema: { applied: [{ version: '1', name: 'a' }], expected: [{ version: '1', name: 'a' }] },
    skills: { total: 537, enabled: 500, stampHash: 'h', expectedHash: 'h', expectedCount: 537, platformFloor: 14 },
    edge: { deployed: null, deployedAt: null, expected: [] },
    cron: { jobs: null, available: null },
    ai: { configured: true },
    siteUrl: { configured: null, origin: 'https://erp.internt.se', supabaseUrl },
    modules: { chosen: true, enabledCount: 20 },
  });
  const row = (u: string | null) =>
    evaluateInstanceReadiness(base(u)).find((r) => r.id === 'site_url')!;

  it('self-hosted → miljövariabeln namnges, ingen dashboard-länk', () => {
    const r = row('https://supabase.internt.se');
    expect(r.note).toContain('GOTRUE_SITE_URL');
    expect(r.note).toMatch(/self-hosted/i);
    expect(JSON.stringify(r)).not.toContain('supabase.com/dashboard');
  });

  it('moln → dashboard-länken finns kvar', () => {
    const r = row('https://aynnvczbbeoiaukyrudy.supabase.co');
    expect(r.note).toMatch(/URL Configuration/);
    expect(r.note).not.toContain('GOTRUE_SITE_URL');
  });

  it('okänd Supabase-URL → behandlas som moln (länken är ofarlig, gissningen är inte det)', () => {
    expect(row(null).note).toMatch(/URL Configuration/);
  });
});

describe('site-URL:en ska inte behöva skrivas in för hand', () => {
  // Magnus frågade: varför måste admin lägga in den manuellt när hen redan är
  // inloggad på domänen? Svaret: värdet MÅSTE lagras (server-side kod som
  // bygger signeringslänkar, inbjudningar och påminnelsemejl har ingen
  // webbläsare att fråga). Men att skriva in den för hand är onödigt — ett
  // klick räcker, så länge ursprunget ser kanoniskt ut.
  const at = (origin: string): ReadinessInput => ({
    schema: { applied: [{ version: '1', name: 'a' }], expected: [{ version: '1', name: 'a' }] },
    skills: { total: 537, enabled: 500, stampHash: 'h', expectedHash: 'h', expectedCount: 537, platformFloor: 14 },
    edge: { deployed: null, deployedAt: null, expected: [] },
    cron: { jobs: null, available: null },
    ai: { configured: true },
    siteUrl: { configured: null, origin, supabaseUrl: 'https://x.supabase.co' },
    modules: { chosen: true, enabledCount: 20 },
  });
  const row = (o: string) => evaluateInstanceReadiness(at(o)).find((r) => r.id === 'site_url')!;

  it('kanonisk domän → ettklicksval som visar värdet', () => {
    expect(row('https://nordbygg.flowwink.com').action).toEqual({
      kind: 'run', id: 'set-site-url', label: 'Use https://nordbygg.flowwink.com',
    });
  });

  it('localhost, IP och preview-domän erbjuder INTE klicket', () => {
    // Fel kanonisk URL är värre än tom: en tom failar synligt, en fel domän
    // skickar tyst varje återställningslänk till fel ställe.
    for (const o of ['http://localhost:8080', 'http://192.168.1.10:3000', 'https://flowwink-abc123.vercel.app']) {
      expect(row(o).action, o).toEqual({ kind: 'link', to: '/admin/settings', label: 'Set the site URL' });
    }
  });
});
