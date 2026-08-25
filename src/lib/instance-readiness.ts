/**
 * Instance readiness — the first screen that makes a half-provisioned instance
 * impossible to miss.
 *
 * The failure this exists to kill: a fresh FlowWink instance renders a healthy
 * dashboard while the agent surface is empty and the automation file is dead.
 * Nothing errors. Measured on a fresh replay (2026-08-22): 6 skills, zero
 * platform cron jobs, no module choice ever made — versus 537 skills and 8
 * platform jobs on a mature instance. Every layer was silently absent.
 *
 * A "site" is four layers (schema, edge functions, skills, frontend) plus the
 * human steps nobody can do for you (auth redirects, an AI key, a module
 * choice). This module turns all seven into ROWS with a measured status.
 *
 * Two design rules, both non-negotiable:
 *
 *   1. HONESTY BEFORE GREEN. A row that cannot be measured from the browser
 *      says so (`unverifiable`) and never renders as ok. `measuredBy` on every
 *      row states, verbatim, what the icon is derived from — nobody has to
 *      trust the colour. The whole day's bug-hunt was silent half-success; this
 *      surface must not become another instance of it.
 *   2. IT DISAPPEARS BY ITSELF. Visibility is a pure function of measured
 *      state — there is no dismiss button, because a dismiss button hides
 *      truth. Only `blocked` and `unknown` gate; a row that is merely drifted
 *      or unverifiable can never keep the checklist alive forever.
 *
 * This file is deliberately pure (no React, no Supabase) so the visibility rule
 * can be pinned by tests against both a fresh and a mature instance.
 */

/**
 * - `ok`            — measured, and complete.
 * - `blocked`       — measured, and incomplete. The instance is not finished.
 * - `drift`         — measured, provisioned, but not matching THIS build.
 *                     Advisory: build currency is Instance Sync's job, not the
 *                     onboarding checklist's, so it never gates.
 * - `unverifiable`  — structurally not measurable from a browser session.
 *                     Never green, never gating; carries an exact instruction.
 * - `unknown`       — the probe itself failed. Health is not claimed, so it
 *                     gates: an instance we cannot read is not a finished one.
 */
export type ReadinessStatus = 'ok' | 'blocked' | 'drift' | 'unverifiable' | 'unknown';

export type ReadinessRowId =
  | 'schema'
  | 'edge_functions'
  | 'skills'
  | 'cron'
  | 'ai_provider'
  | 'site_url'
  | 'modules';

export type ReadinessAction =
  /** Something the UI can do on this instance, right now. */
  | { kind: 'run'; id: 'seed-skills' | 'register-cron' | 'set-site-url'; label: string }
  /** A decision that lives on another admin page — go make it there. */
  | { kind: 'link'; to: string; label: string }
  /** Only doable outside FlowWink (Supabase dashboard, a shell). */
  | { kind: 'external'; href: string; label: string };

export interface ReadinessRow {
  id: ReadinessRowId;
  label: string;
  status: ReadinessStatus;
  /** What the measurement actually says, in one line. */
  detail: string;
  /** Why this step exists at all — pedagogy in the UI, not in a manual. */
  why: string;
  /** The provenance of the icon: what was read, and from where. */
  measuredBy: string;
  action?: ReadinessAction;
  /**
   * An instruction that is true regardless of status — used where only PART of
   * a row is measurable and the rest must be stated rather than implied.
   */
  note?: string;
}

/**
 * The platform cron floor: exactly the jobs `register_flowpilot_cron()` +
 * `register_retrieval_cron()` schedule, i.e. what `ensurePlatformCron()`
 * guarantees. Derived from those two functions rather than from a mature
 * instance's `cron.job` listing, so a business-owned job (gmail-reconcile,
 * contract billing) can never masquerade as a platform requirement.
 *
 * Without these there is no heartbeat, no automation tick and no retrieval
 * sweep — every automation sits at run_count 0 forever, and nothing errors.
 */
export const PLATFORM_CRON_JOBS: readonly string[] = [
  'flowpilot-heartbeat',
  'flowpilot-learn',
  'flowpilot-daily-briefing',
  'automation-dispatcher-every-minute',
  'publish-scheduled-pages',
  'instance-health-check',
  'knowledge-indexer',
  'newsletter-dispatch-scheduled',
  'booking-reminders',
];

export interface CronJobState {
  jobname: string;
  active: boolean;
  /** cron_health_report() flags a job whose command points at another instance. */
  foreign_host?: boolean | null;
}

export interface ReadinessInput {
  schema: {
    /** The ledger, or null when it could not be read. */
    applied: Array<{ version: string; name: string }> | null;
    /** What this build expects (from the bundled instance manifest). */
    expected: Array<{ version: string; name: string }>;
  };
  skills: {
    /** Rows in agent_skills, or null when the status RPC failed. */
    total: number | null;
    enabled: number | null;
    /** site_settings.instance_manifest_stamp.seed_hash, if ever stamped. */
    stampHash: string | null;
    expectedHash: string;
    expectedCount: number;
    /** PLATFORM_SKILL_NAMES.length — the always-on floor. */
    platformFloor: number;
    /**
     * Vad de PÅSLAGNA modulerna kräver, mätt av sync_skills_from_code mot den
     * deployade seed-artefakten. null = mätningen kunde inte göras.
     *
     * Raden hade ETT tal före det här: antalet rader i agent_skills. Ett antal
     * kan inte se ett HÅL. En färsk, fullt provisionerad instans bar 96 av 347
     * skills — commerce, contracts, subscriptions, invoicing, tickets, sla och
     * field-service påslagna med noll seedade skills — och raden lyste grönt
     * ("96 skill(s) seeded, matching this build"), eftersom stämpeln fanns och
     * 96 > golvet 14. En extern operatör kunde inte utföra sitt uppdrag alls.
     *
     * Kravet är alltså inte "finns det några skills" utan "finns DE skills som
     * modulvalet lovar". Mätningen görs på servern, ur samma artefakt som
     * skriver raderna — en skrivare, en sanning.
     */
    requiredByEnabledModules?: number | null;
    /** Hur många av dem som saknas i agent_skills (efter en eventuell reparation). */
    missingForEnabledModules?: number | null;
    /** De första saknade namnen — nog för att namnge hålet i UI:t. */
    missingSample?: string[];
  };
  edge: {
    /** Last set reported by the deploy tool, or null when never reported. */
    deployed: string[] | null;
    deployedAt: string | null;
    expected: string[];
  };
  cron: {
    /** cron_health_report().jobs, or null when the RPC failed. */
    jobs: CronJobState[] | null;
    /** false when pg_cron is not installed at all. */
    available: boolean | null;
  };
  ai: {
    /** true/false when check-secrets answered; null when it did not. */
    configured: boolean | null;
  };
  siteUrl: {
    /** site_settings.general.siteUrl */
    configured: string | null;
    /** window.location.origin — the value to paste into Supabase. */
    origin: string;
    /**
     * Projektets Supabase-URL. Avgör om instansen är moln eller self-hosted:
     * en self-hosted stack har varken dashboard eller Management-API, så
     * andra halvan sätts som miljövariabel i stället.
     */
    supabaseUrl?: string | null;
  };
  modules: {
    /**
     * Whether an operator has ever SAVED a module choice — not merely whether
     * the row exists.
     *
     * The row's existence stopped being a signal on 2026-08-22, when
     * `ensure_modules_settings()` started seeding it at birth to end the
     * client/server split brain. What still separates a decision from a
     * default is the SHAPE of what was written: the birth seed stores the
     * minimal `{id: {enabled}}`, while an explicit save in /admin/modules
     * persists the whole merged ModulesSettings object (name, category,
     * autonomy, …). An entry carrying more than `enabled` therefore came from
     * a human pressing Save.
     *
     * null = could not read.
     */
    chosen: boolean | null;
    enabledCount: number | null;
  };
}

/** Supabase dashboard deep link for the URL configuration (auth redirects). */
export const SUPABASE_AUTH_URL_CONFIG =
  'https://supabase.com/dashboard/project/_/auth/url-configuration';

/**
 * Har den här instansen NÅGONSIN blivit färdigställd?
 *
 * Skiljer två tillstånd som ser identiska ut i ledgern men betyder motsatta
 * saker: en MOGEN instans som ligger en release efter (frontenden deployar
 * rutinmässigt före sina migrationer — ofarligt), och en NY installation vars
 * körning stannade halvvägs (fyrtio migrationer saknas — allvarligt).
 *
 * Signalen är att ingen någonsin gjort klart: plattformslagret aldrig seedat
 * OCH inget modulval sparat. En instans i drift har passerat båda för länge
 * sedan. Verkligt fall 2026-08-22: nordbryggs körning tog slut på tid vid
 * 449/489, och utan den här skillnaden hade schema-raden sagt "deploy currency,
 * not an onboarding gap" till en admin vars installation var avbruten.
 */
function neverFinished(input: ReadinessInput): boolean {
  const platformUnseeded =
    input.skills.total != null && input.skills.total < input.skills.platformFloor;
  const noModuleChoice = input.modules.chosen === false;
  return platformUnseeded && noModuleChoice;
}

function schemaRow(input: ReadinessInput['schema'], unfinished = false): ReadinessRow {
  const base = {
    id: 'schema' as const,
    label: 'Database schema',
    why: 'Every other layer sits on this one. A missing migration means missing tables and RPCs — the handlers that call them fail one at a time, at runtime, in whichever module happens to touch them first.',
    measuredBy:
      'supabase_migrations ledger via instance_sync_status(), matched by identity against the migration list bundled in this build.',
  };

  if (input.applied === null) {
    return {
      ...base,
      status: 'unknown',
      detail: 'Migration ledger could not be read — health is not claimed.',
      action: { kind: 'link', to: '/admin/system', label: 'Open Observability' },
    };
  }

  // Match by IDENTITY, not by head timestamp: a managed ledger stamps `version`
  // with the RUN time, so comparing heads false-flags it. Same rule as the
  // Instance Sync card — one convention, two surfaces.
  const versions = new Set(input.applied.map((m) => m.version));
  const names = new Set(input.applied.map((m) => m.name));
  const missing = input.expected.filter(
    (m) => !versions.has(m.version) && !names.has(m.name) && !names.has(`${m.version}_${m.name}`),
  );

  // An EMPTY ledger is the provisioning failure: no migration ever ran, so
  // there is no instance yet. That gates.
  if (input.applied.length === 0) {
    return {
      ...base,
      status: 'blocked',
      detail: `No migrations have been applied at all — this database was never provisioned (${input.expected.length} expected).`,
      note: 'Migrations reach an instance through the deploy rail (supabase db push / the fork sync), never from this UI.',
      action: { kind: 'link', to: '/admin/system', label: 'See the full layer diff' },
    };
  }

  if (missing.length === 0) {
    return {
      ...base,
      status: 'ok',
      detail: `All ${input.expected.length} migrations this build expects are applied.`,
    };
  }

  // På en instans som ALDRIG blivit färdigställd är en eftersläpande ledger
  // inte releasefördröjning — det är en avbruten provisionering. Körningen kan
  // ta slut på tid mitt i kedjan (nordbrygg stannade på 449/489). Den är
  // återupptagbar, eftersom varje migration är omkörbar — men bara om någon
  // vet att en ny push är det som startar om den. Utan den här grenen läser
  // admin "deploy currency, ignorera" på en halvfärdig installation.
  if (unfinished) {
    return {
      ...base,
      status: 'blocked',
      detail: `The provisioning run stopped short: ${missing.length} of ${input.expected.length} migrations were never applied. This instance has never been finished, so this is an unfinished install — not release lag.`,
      note: 'Runs can time out mid-chain. Every migration is re-runnable, so pushing to the connected repo starts a new run that resumes where this one stopped.',
      action: { kind: 'link', to: '/admin/system', label: 'See the full layer diff' },
    };
  }

  // A populated ledger that lags THIS build is drift, not an unfinished
  // install — and the frontend is the one auto-deployed layer, so it routinely
  // arrives minutes before the migrations it expects. Gating here would put
  // the onboarding card on a mature instance's dashboard on every release,
  // which is how a checklist becomes furniture. Build currency has an owner
  // already: the Instance Sync card, which reports the same diff in red.
  return {
    ...base,
    status: 'drift',
    detail: `${missing.length} of ${input.expected.length} migrations this build expects are not applied yet — e.g. ${missing
      .slice(0, 2)
      .map((m) => m.name)
      .join(', ')}${missing.length > 2 ? '…' : ''}.`,
    note: 'Deploy currency, not an onboarding gap. Migrations reach an instance through the deploy rail (supabase db push / the fork sync), never from this UI — Instance Sync tracks the diff.',
    action: { kind: 'link', to: '/admin/system', label: 'See the full layer diff' },
  };
}

function skillsRow(input: ReadinessInput['skills']): ReadinessRow {
  const base = {
    id: 'skills' as const,
    label: 'Agent skills',
    why: 'Skills are table DATA born from TypeScript seeds — the one deploy layer that no push, deploy or migration ever applies. Without them FlowPilot and every external agent have nothing to call, and the site looks perfectly healthy while doing it.',
    measuredBy: 'agent_skills row count + the seed stamp, via instance_sync_status().',
  };

  if (input.total === null) {
    return {
      ...base,
      status: 'unknown',
      detail: 'Skill registry could not be read — health is not claimed.',
      action: { kind: 'link', to: '/admin/modules', label: 'Open Modules' },
    };
  }

  // Floor check FIRST. "No stamp yet" is ambiguous; carrying fewer skills than
  // the always-on platform layer alone requires is not — the layer was never
  // applied at all.
  if (input.total < input.platformFloor) {
    return {
      ...base,
      status: 'blocked',
      detail: `Only ${input.total} skill(s) — below the ${input.platformFloor}-skill platform floor. The agent surface was never built on this instance.`,
      action: { kind: 'run', id: 'seed-skills', label: 'Seed skills now' },
    };
  }

  // Täckning FÖRE stämpeln. Stämpeln är ett påstående; det här är en mätning,
  // och en instans kan bära en giltig stämpel och ändå sakna två tredjedelar av
  // det modulvalet lovar (96/347, verifierat av tre QA-körningar). Ett hål i
  // agent-ytan är den skarpaste sanningen raden har — den vinner över allt annat.
  if (
    input.requiredByEnabledModules != null &&
    input.missingForEnabledModules != null &&
    input.missingForEnabledModules > 0
  ) {
    return {
      ...base,
      status: 'blocked',
      detail:
        `${input.requiredByEnabledModules - input.missingForEnabledModules} of ${input.requiredByEnabledModules} skill(s) ` +
        `required by the enabled modules are registered — ${input.missingForEnabledModules} missing` +
        ((input.missingSample ?? []).length ? ` (e.g. ${(input.missingSample ?? []).slice(0, 3).join(', ')})` : '') +
        '. Those modules are switched ON with no agent surface behind them.',
      note: 'Row count alone cannot see this: the layer looks populated while the specific skills an operator needs are absent.',
      action: { kind: 'run', id: 'seed-skills', label: 'Seed the missing skills' },
    };
  }

  if (input.stampHash === null) {
    return {
      ...base,
      status: 'blocked',
      detail: `${input.total} skill(s) present but never synced from code — no seed stamp on this instance, so nothing guarantees the definitions match any build.`,
      action: { kind: 'run', id: 'seed-skills', label: 'Seed skills now' },
    };
  }

  if (input.stampHash !== input.expectedHash) {
    // Provisioned, but from another build. That is drift, not an unfinished
    // install — Instance Sync owns build currency, so this never gates.
    return {
      ...base,
      status: 'drift',
      detail: `${input.total} skill(s) seeded, but from a different build than this frontend (${input.expectedCount} expected).`,
      note: 'Not an onboarding gap — run "Sync skills from code" in Modules when convenient. Instance Sync tracks build currency.',
      action: { kind: 'run', id: 'seed-skills', label: 'Sync skills from code' },
    };
  }

  return {
    ...base,
    status: 'ok',
    detail:
      `${input.total} skill(s) seeded (${input.enabled ?? 0} enabled), matching this build` +
      (input.requiredByEnabledModules != null
        ? ` — all ${input.requiredByEnabledModules} required by the enabled modules are registered.`
        : '. Per-module coverage could not be measured, so only the build stamp is claimed.'),
  };
}

function edgeRow(input: ReadinessInput['edge']): ReadinessRow {
  const base = {
    id: 'edge_functions' as const,
    label: 'Edge functions',
    why: 'Every `edge:` skill handler, the MCP gateway and the public chat endpoint live here. A function that was never deployed fails only when something calls it.',
  };

  // The browser cannot list a project's deployed functions — there is no such
  // API from an anon/authenticated session, and probing 77 URLs is not a
  // measurement, it is a guess. What DOES exist is a self-report the deploy
  // tool writes. A report is not a probe, and this row says so.
  if (input.deployed === null) {
    return {
      ...base,
      status: 'unverifiable',
      detail: `Cannot be measured from here. This build expects ${input.expected.length} functions; nothing on this instance has ever reported what is deployed.`,
      measuredBy:
        'Nothing. The browser has no API for listing deployed functions — this row is never green on a guess.',
      note: 'The deploy tool (flowwink.sh /update-funcs) records its own result in site_settings.edge_functions_deployed. Until it runs, the Supabase Functions view is the only source of truth.',
      action: {
        kind: 'external',
        href: 'https://supabase.com/dashboard/project/_/functions',
        label: 'Open Supabase Functions',
      },
    };
  }

  const deployedSet = new Set(input.deployed);
  const missing = input.expected.filter((fn) => !deployedSet.has(fn));
  const reportedAt = input.deployedAt ? ` (reported ${input.deployedAt.slice(0, 10)})` : '';

  if (missing.length === 0) {
    return {
      ...base,
      status: 'unverifiable',
      detail: `The deploy tool last reported all ${input.expected.length} functions deployed${reportedAt}.`,
      measuredBy:
        'site_settings.edge_functions_deployed — what the deploy tool SAID it did, not a probe of what is running.',
      note: 'Still a self-report: it can only be as fresh as the last deploy run. Supabase Functions is authoritative.',
    };
  }

  return {
    ...base,
    status: 'drift',
    detail: `The last deploy report${reportedAt} is missing ${missing.length} function(s) this build expects — e.g. ${missing
      .slice(0, 3)
      .join(', ')}${missing.length > 3 ? '…' : ''}.`,
    measuredBy:
      'site_settings.edge_functions_deployed vs this build\'s manifest — a stale report reads the same as a missing deploy, so this never gates the checklist.',
    action: {
      kind: 'external',
      href: 'https://supabase.com/dashboard/project/_/functions',
      label: 'Open Supabase Functions',
    },
  };
}

function cronRow(input: ReadinessInput['cron']): ReadinessRow {
  const base = {
    id: 'cron' as const,
    label: 'Scheduled jobs',
    why: 'The automation file only moves because a cron job ticks it. Without these there is no heartbeat, no dispatcher tick and no retrieval sweep — every automation stays at run_count 0 forever, and nothing anywhere reports an error.',
    measuredBy: `cron.job via cron_health_report(), against the ${PLATFORM_CRON_JOBS.length} jobs ensurePlatformCron() registers.`,
  };

  if (input.jobs === null) {
    return {
      ...base,
      status: 'unknown',
      detail: 'Scheduled jobs could not be read — health is not claimed.',
      action: { kind: 'run', id: 'register-cron', label: 'Register platform jobs' },
    };
  }

  if (input.available === false) {
    return {
      ...base,
      status: 'blocked',
      detail: 'pg_cron is not installed on this database — nothing scheduled can ever run.',
      note: 'Enable the pg_cron extension on the Supabase project, then re-run the platform job registration.',
      action: {
        kind: 'external',
        href: 'https://supabase.com/dashboard/project/_/database/extensions',
        label: 'Open Supabase Extensions',
      },
    };
  }

  const byName = new Map(input.jobs.map((j) => [j.jobname, j]));
  const missing = PLATFORM_CRON_JOBS.filter((n) => !byName.has(n));
  const inactive = PLATFORM_CRON_JOBS.filter((n) => byName.get(n)?.active === false);
  // The poison-chain class: a job cloned from another instance keeps pointing
  // at that instance's URL and silently drives someone else's site.
  const foreign = input.jobs.filter((j) => j.foreign_host === true).map((j) => j.jobname);

  if (missing.length === 0 && inactive.length === 0 && foreign.length === 0) {
    return {
      ...base,
      status: 'ok',
      detail: `All ${PLATFORM_CRON_JOBS.length} platform jobs are scheduled and active on this instance.`,
    };
  }

  const problems: string[] = [];
  if (missing.length) problems.push(`${missing.length} missing (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`);
  if (inactive.length) problems.push(`${inactive.length} inactive`);
  if (foreign.length) problems.push(`${foreign.length} pointing at ANOTHER instance (${foreign.slice(0, 2).join(', ')})`);

  return {
    ...base,
    status: 'blocked',
    detail: `Platform jobs: ${problems.join(' · ')}.`,
    action: { kind: 'run', id: 'register-cron', label: 'Register platform jobs' },
  };
}

function aiRow(input: ReadinessInput['ai']): ReadinessRow {
  const base = {
    id: 'ai_provider' as const,
    label: 'AI provider',
    why: 'FlowPilot, the public chat and every AI-backed block resolve through one provider. With no key the surfaces still render — they just answer nothing, which is the hardest failure to spot.',
    measuredBy:
      'check-secrets presence booleans (openai / gemini / anthropic) plus the integrations table for a local model. Presence only — no key value ever leaves the edge function.',
  };

  if (input.configured === null) {
    return {
      ...base,
      status: 'unknown',
      detail: 'Provider status could not be read — health is not claimed.',
      action: { kind: 'link', to: '/admin/integrations', label: 'Open Integrations' },
    };
  }

  if (!input.configured) {
    return {
      ...base,
      status: 'blocked',
      // "Ingen nyckel" är INTE det enda sättet att hamna här.
      // resolveIntegrationStatus kräver både hasKey OCH att integrationen är
      // påslagen, så en satt nyckel bakom en avstängd integration landar också
      // på false. Att då påstå "no key is present" vore osant — och att skicka
      // någon till Supabase för att sätta en nyckel som redan finns är den
      // sortens hjälp som kostar en halvtimme. Raden namnger båda vägarna.
      detail: 'No AI provider is active on this instance — either no key is set, or the integration holding it is switched off.',
      note: 'Keys are edge-function secrets — set them on the Supabase project (or point the local-model integration at your own endpoint). A key that IS set still counts as inactive until its integration is enabled in Integrations. Reload after either.',
      action: { kind: 'link', to: '/admin/integrations', label: 'Open Integrations' },
    };
  }

  return { ...base, status: 'ok', detail: 'At least one AI provider has a key AND is switched on.' };
}

/**
 * Ser ursprunget ut som en riktig publik adress?
 *
 * localhost, IP-adresser och Vercels preview-domäner är platser en admin
 * RÅKAR vara på — inte den kanoniska adressen kunderna ska få i sina mejl.
 * Där erbjuds inget ettklicksval, för ett felaktigt värde är värre än ett tomt:
 * ett tomt fält failar synligt, en fel domän skickar tyst varje
 * återställningslänk och signeringsinbjudan till fel ställe.
 */
function canonicalLooking(origin: string): boolean {
  const host = safeHost(origin);
  if (!host) return false;
  if (/^(localhost|127\.|\[?::1)/i.test(host)) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host.split(':')[0])) return false;
  if (/\.vercel\.app$/i.test(host)) return false;
  return host.includes('.');
}

/** Värdnamnet ur en URL, tomt om den inte går att tolka — får aldrig kasta i en statusrad. */
function safeHost(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

function siteUrlRow(input: ReadinessInput['siteUrl']): ReadinessRow {
  // Self-hosted Supabase has no dashboard to link to and no Management API —
  // Auth's Site URL is an environment variable there (GOTRUE_SITE_URL /
  // GOTRUE_URI_ALLOW_LIST), set where the container is defined. Pointing a
  // self-hosted operator at supabase.com/dashboard is worse than saying
  // nothing: it sends them somewhere their instance does not exist.
  // Detection is the project host — cloud projects live on *.supabase.co.
  const selfHosted =
    !!input.supabaseUrl && !/(^|\.)supabase\.co$/i.test(safeHost(input.supabaseUrl));

  const base = {
    id: 'site_url' as const,
    label: 'Public URL & auth redirects',
    why: 'Password resets, colleague invites and signup confirmations are links built from a URL. Get it wrong and every one of those emails sends your users to localhost — the mail is delivered, the flow is dead.',
    measuredBy:
      'site_settings.general.siteUrl. Supabase Auth\'s own Site URL is project configuration, not data, and CANNOT be read from a browser session — this icon covers the FlowWink half only.',
    note: selfHosted
      ? `Second half, unverifiable from here: this is a self-hosted Supabase, so set GOTRUE_SITE_URL to ${input.origin} (and add it to GOTRUE_URI_ALLOW_LIST) where the auth container's environment is defined, then restart it. There is no dashboard and no Management API on a self-hosted stack.`
      : `Second half, unverifiable from here: set Supabase → Authentication → URL Configuration → Site URL to ${input.origin} and add it to the redirect allow-list. Nothing in this UI can read or write that value.`,
    action: selfHosted
      ? undefined
      : {
          kind: 'external' as const,
          href: SUPABASE_AUTH_URL_CONFIG,
          label: 'Open Supabase URL configuration',
        },
  };

  if (!input.configured) {
    // Åtgärden måste peka på det som FAKTISKT blockerar. Raden mäter
    // FlowWink-halvan (site_settings.general.siteUrl, satt i /admin/settings)
    // men bar tidigare bara en länk till Supabase-halvan — den den uttryckligen
    // inte kan mäta. En knapp som inte kan lösa sin egen rad är samma fel som
    // en vakt som inte vaktar; observerat skarpt på nordbrygg 2026-08-22, där
    // Supabase-halvan var satt medan raden stod kvar på "not done".
    // Supabase-halvan finns kvar i noten, där den hör hemma: den är ett andra
    // steg, inte det som gör raden grön.
    return {
      ...base,
      status: 'blocked',
      detail: `No public site URL is set in FlowWink. Backend links have no absolute address to build from. This instance is being served from ${input.origin}.`,
      // Du är redan på domänen — skriv inte in den för hand. Men ett TYST
      // autoval vore fel: en admin kan sitta på en preview-deploy eller
      // localhost, och en felaktig kanonisk URL skickar kunder dit i varje
      // mejl. Därför ett klick som visar värdet, inte en osynlig skrivning.
      action: canonicalLooking(input.origin)
        ? { kind: 'run', id: 'set-site-url', label: `Use ${input.origin}` }
        : { kind: 'link', to: '/admin/settings', label: 'Set the site URL' },
    };
  }

  return {
    ...base,
    status: 'ok',
    detail: `Public site URL is ${input.configured}. The Supabase half stays unverifiable from here — see the note.`,
  };
}

function modulesRow(input: ReadinessInput['modules']): ReadinessRow {
  const base = {
    id: 'modules' as const,
    label: 'Module choice',
    why: 'Modules decide which nav, skills and automations this business actually gets. Running on shipped defaults is not a decision — it is the absence of one, and it stays invisible because defaults look exactly like choices.',
    measuredBy:
      'The SHAPE of site_settings.modules. The birth seed writes only {enabled} per module; saving in Modules persists the full module objects. Anything richer than {enabled} means a human pressed Save.',
  };

  if (input.chosen === null) {
    return {
      ...base,
      status: 'unknown',
      detail: 'Module settings could not be read — health is not claimed.',
      action: { kind: 'link', to: '/admin/modules', label: 'Open Modules' },
    };
  }

  if (!input.chosen) {
    return {
      ...base,
      status: 'blocked',
      detail: `No module choice has ever been saved — this instance is running on the shipped defaults${
        input.enabledCount != null ? ` (${input.enabledCount} enabled)` : ''
      }. Review them and save, even if you keep them all.`,
      action: { kind: 'link', to: '/admin/modules', label: 'Choose modules' },
    };
  }

  return {
    ...base,
    status: 'ok',
    detail: `Modules were chosen for this instance${
      input.enabledCount != null ? ` (${input.enabledCount} enabled)` : ''
    }.`,
  };
}

/**
 * Evaluate every row from measured state. Pure — same input, same rows.
 *
 * Row order is the order an instance is built in: schema → functions → skills
 * → jobs, then the three human steps. That is also the order in which a
 * failure upstream explains a failure downstream.
 */
export function evaluateInstanceReadiness(input: ReadinessInput): ReadinessRow[] {
  return [
    schemaRow(input.schema, neverFinished(input)),
    edgeRow(input.edge),
    skillsRow(input.skills),
    cronRow(input.cron),
    aiRow(input.ai),
    siteUrlRow(input.siteUrl),
    modulesRow(input.modules),
  ];
}

/**
 * Which rows keep the checklist on screen.
 *
 * `blocked` — measured as incomplete.
 * `unknown` — the probe failed, so completeness was never established. An
 *             instance we cannot read is not a finished instance; claiming
 *             otherwise would be exactly the silent half-success this surface
 *             exists to expose.
 *
 * `drift` and `unverifiable` deliberately do NOT gate. Neither can ever be
 * resolved to green from this UI, so gating on them would make the checklist
 * immortal — and an immortal checklist is furniture, which is how a mature
 * instance learns to ignore it.
 */
export function blockingRows(rows: ReadinessRow[]): ReadinessRow[] {
  return rows.filter((r) => r.status === 'blocked' || r.status === 'unknown');
}

/** True when nothing is blocking — the checklist removes itself. */
export function isInstanceReady(rows: ReadinessRow[]): boolean {
  return blockingRows(rows).length === 0;
}
