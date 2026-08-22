/**
 * Guardrail: skill-lagret mäts på TÄCKNING, aldrig på artefaktens hash.
 *
 * Det verkliga felet, verifierat av tre oberoende QA-körningar på en färsk,
 * fullt provisionerad instans (2026-08-23): migrationerna kom hela vägen
 * (489/489), edge-funktionerna kom hela vägen (77/77) — men `agent_skills` bar
 * 96 av 347 skills. Commerce, contracts, subscriptions, invoicing, tickets, sla
 * och field-service var PÅSLAGNA med noll seedade skills, så
 * `search_skills("create service contract")` svarade `create_page_block,
 * manage_page…` och en extern operatör kunde inte utföra sitt uppdrag alls.
 *
 * Räddningen ljög i samma andetag: `sync_skills_from_code` svarade
 * {"status":"unchanged"} och gjorde ingenting, eftersom grinden jämförde
 * ARTEFAKTENS sha256 — en fråga om KODEN — i stället för att fråga om
 * INSTANSEN: "bär agent_skills det som de påslagna modulerna kräver?".
 *
 * Kedjan som armerade fällan (och som varje test här håller stängd):
 *   1. Första admin-laddningen synkar medan modulraden bara bär kodens default
 *      → ~96 rader skrivs, och sha:n STÄMPLAS som om lagret vore komplett.
 *   2. `install_template` (apply_settings) slår på sju moduler till i
 *      site_settings.modules. Ingen deploy, ingen migration och ingen bootstrap
 *      rör skill-lagret.
 *   3. Varje senare synk ser samma artefakt-sha → "unchanged", för alltid.
 *      Villkoret kan aldrig mer bli sant — exakt samma klass som självläkningen
 *      som väntade på att en migrationsseedad skill skulle SAKNAS.
 *
 * Och återrapporteringen: `inserted: 0` medan 251 rader skrevs. En räknare som
 * inte kan motsägas är ingen mätning. Svaret måste bära återläsningen.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateInstanceReadiness, type ReadinessInput } from '@/lib/instance-readiness';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** Kommentarer beskriver buggen i klartext; bara KODEN kan begå den. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');

const AGENT_EXECUTE = stripComments(read('supabase/functions/agent-execute/index.ts'));

/** Kroppen av sync-handlern, utan omgivande brus. */
function syncHandler(): string {
  const start = AGENT_EXECUTE.indexOf('async function executeSyncSkillsFromCode');
  expect(start, 'executeSyncSkillsFromCode finns inte längre — döptes den om?').toBeGreaterThan(-1);
  const next = AGENT_EXECUTE.indexOf('\nasync function ', start + 10);
  return AGENT_EXECUTE.slice(start, next === -1 ? undefined : next);
}

describe('sync_skills_from_code mäter verkligt tillstånd', () => {
  it('kortsluter aldrig på hashen ensam — täckningen måste hålla med', () => {
    const fn = syncHandler();
    const shortCircuit = fn.indexOf("status: 'unchanged'");
    expect(shortCircuit, 'snabbvägen är borta — den får finnas, men inte ensam').toBeGreaterThan(-1);

    // Villkoret som leder fram till svaret måste läsa MÄTNINGEN, inte bara sha:n.
    const guard = fn.slice(0, shortCircuit);
    const lastIf = guard.lastIndexOf('if (');
    const condition = guard.slice(lastIf, shortCircuit);
    expect(
      /skills_artifact_sha/.test(condition),
      'hash-grinden får vara kvar som snabbväg',
    ).toBe(true);
    expect(
      /missingBefore\.length === 0/.test(condition),
      'Snabbvägen måste kräva att INGET saknas för de påslagna modulerna. ' +
        'Utan det svarar handlern "unchanged" på en instans med 96 av 347 skills.',
    ).toBe(true);
  });

  it('härleder kravet ur de PÅSLAGNA modulerna, inte ur hela artefakten', () => {
    const fn = syncHandler();
    expect(fn).toMatch(/if \(!isEnabled\(mod\.moduleId\)\)/);
    expect(fn).toMatch(/expected\.set\(seed\.name, seed\)/);
    expect(
      /const missingBefore = expectedNames\.filter/.test(fn),
      'Mätningen är "vad av det förväntade saknas i agent_skills" — inget annat tal kan se hålet.',
    ).toBe(true);
  });

  it('stämplar sha:n ENDAST när lagret faktiskt är komplett', () => {
    const fn = syncHandler();
    const stamp = fn.indexOf("key: 'skills_artifact_sha'");
    expect(stamp).toBeGreaterThan(-1);
    // Den närmast föregående grenen måste vara fullständighetsgrinden — inte
    // någon annan if som skrivningen råkat hamna under.
    const before = fn.slice(0, stamp);
    const lastBranch = before.slice(before.lastIndexOf('if ('));
    expect(
      lastBranch.startsWith('if (complete)'),
      'En halvkörning som stämplar låser instansen i "unchanged" — det var precis så ' +
        'den här buggen överlevde tre QA-körningar.',
    ).toBe(true);
    expect(fn).toMatch(/const complete =[\s\S]{0,200}missingAfter\.length === 0/);
  });
});

describe('svaret är bevis, inte påstående', () => {
  it('läser tillbaka efter skrivningen i stället för att räkna sina egna avsikter', () => {
    const fn = syncHandler();
    const writeAt = fn.indexOf(".from('agent_skills').insert(");
    const readBack = fn.indexOf('const after = await readAllSkills');
    expect(writeAt).toBeGreaterThan(-1);
    expect(
      readBack,
      'Utan återläsning är "inserted: 251" bara skrivarens egen anteckning — ' +
        'samma familj som det tysta no-op-aliaset som svarade updated:true och skrev {}.',
    ).toBeGreaterThan(writeAt);
    expect(fn).toMatch(/missingAfter/);
    expect(fn).toMatch(/agent_skills_row_delta/);
  });

  it('flaggar motsägelsen när raddeltat inte matchar de påstådda insertarna', () => {
    // `inserted: 0` medan 251 rader skrevs fick stå oemotsagt. En siffra utan
    // motpart kan inte upptäckas som fel.
    const fn = syncHandler();
    expect(fn).toMatch(/rowDelta !== inserted\.length/);
    expect(fn).toMatch(/discrepancy/);
  });

  it('avbryter inte hela synken vid första skrivfel', () => {
    const fn = syncHandler();
    expect(
      /return \{ error: `Insert failed/.test(fn),
      'Ett trasigt seed fick tidigare lämna 250 skills oskrivna och rapportera det som ETT fel.',
    ).toBe(false);
    expect(fn).toMatch(/failures\.push\(`insert /);
    expect(fn).toMatch(/failures\.push\(`update /);
  });

  it('läser agent_skills paginerat, så radtaket aldrig tystar bort svansen', () => {
    // En trunkerad läsning skulle se befintliga skills som SAKNADE och skriva om
    // dem — eller värre, rapportera en täckning som inte finns.
    expect(AGENT_EXECUTE).toMatch(/async function readAllSkills/);
    expect(AGENT_EXECUTE).toMatch(/\.range\(from, from \+ PAGE - 1\)/);
  });
});

describe('det som ÄNDRAR kravet måste stämma av lagret', () => {
  it('install_template synkar skills efter att ha slagit på moduler', () => {
    // Steget som armerade fällan skarpt: mallen slog på sju moduler
    // server-side, och ingenting i deploy-kedjan märkte att kravet ändrats.
    const tpl = AGENT_EXECUTE.slice(
      AGENT_EXECUTE.indexOf("if (Array.isArray(template.requiredModules)"),
    );
    const enable = tpl.indexOf("settingsApplied.push('modules')");
    const sync = tpl.indexOf('executeSyncSkillsFromCode(supabase');
    expect(enable).toBeGreaterThan(-1);
    expect(
      sync,
      'En mall som slår på commerce/contracts/invoicing utan att seeda deras skills ' +
        'levererar en instans vars agentyta inte kan göra det mallen lovar.',
    ).toBeGreaterThan(enable);
  });

  it('manage_site_settings som skriver `modules` stämmer av registret', () => {
    // Den rent agentdrivna vägen: en extern operatör slår på `contracts` över
    // MCP, ingen webbläsare inblandad, och frågar sedan efter ett contract-skill
    // som aldrig seedades. Modulen är på, agentytan tom.
    const branch = AGENT_EXECUTE.slice(AGENT_EXECUTE.indexOf('if (!key) throw new Error(\'key is required for update\')'));
    const sync = branch.indexOf('executeSyncSkillsFromCode(supabase');
    expect(sync).toBeGreaterThan(-1);
    expect(branch.slice(0, sync)).toMatch(/key === 'modules'/);
  });

  it('autoActivateModule stämmer av registret när den slår på en modul', () => {
    const fn = AGENT_EXECUTE.slice(
      AGENT_EXECUTE.indexOf('async function autoActivateModule'),
      AGENT_EXECUTE.indexOf('async function executeModuleAction'),
    );
    expect(fn).toMatch(/executeSyncSkillsFromCode\(supabase/);
  });

  it('en modul-bootstrap tvingar fram en FÄRSK mätning, aldrig en memoiserad', () => {
    const bootstrap = stripComments(read('src/lib/module-bootstrap.ts'));
    expect(bootstrap).toMatch(/ensureSkillRegistry\(\{ fresh: true \}\)/);
    expect(
      /export function ensureSkillRegistry/.test(bootstrap),
      'Memoiseringen måste ligga i ensureSkillRegistry själv, annars mäter admin-skalet ' +
        'och checklistan var sitt varv per sidladdning.',
    ).toBe(true);
  });

  it('admin-skalet stämmer av lagret UTAN att först kräva att plattformslagret saknas', () => {
    // Klassen: en självläkning vars villkor aldrig mer blir sant. Den gamla
    // vägen anropade synken bara inuti "plattformslagret är ofullständigt", som
    // är falskt på varje instans efter dess första minut — så en modul som slogs
    // på efteråt fick aldrig sina skills.
    const hook = stripComments(read('src/hooks/useFlowPilotBootstrap.ts'));
    const platformBranch = hook.indexOf('missingPlatformSkills(');
    const firstSync = hook.indexOf('await ensureSkillRegistry()');
    expect(firstSync).toBeGreaterThan(-1);
    expect(
      firstSync < platformBranch,
      'Minst ett anrop till ensureSkillRegistry() måste ligga utanför (och före) ' +
        'plattform-grenen, annars är avstämningen död på varje mogen instans.',
    ).toBe(true);

    // …och fortfarande efter att modulraden är säkrad — synken är modulgrindad
    // server-side, så ordningen är en del av korrektheten.
    const modulesRow = hook.indexOf('await ensureModulesRow(defaultModulesSettings)');
    expect(modulesRow).toBeGreaterThan(-1);
    expect(modulesRow).toBeLessThan(firstSync);
  });
});

describe('provisioneringschecklistan kan se hålet', () => {
  /** Instansen QA faktiskt fick: stämplad, över golvet — och två tredjedelar tom. */
  const instance = (over: Partial<ReadinessInput['skills']> = {}): ReadinessInput => ({
    schema: { applied: [{ version: '1', name: 'a' }], expected: [{ version: '1', name: 'a' }] },
    skills: {
      total: 96,
      enabled: 96,
      stampHash: 'h',
      expectedHash: 'h',
      expectedCount: 537,
      platformFloor: 14,
      requiredByEnabledModules: 347,
      missingForEnabledModules: 251,
      missingSample: ['manage_contract', 'create_subscription', 'refund_return'],
      ...over,
    },
    edge: { deployed: null, deployedAt: null, expected: [] },
    cron: { jobs: null, available: null },
    ai: { configured: null },
    siteUrl: { configured: 'https://x.test', origin: 'https://x.test' },
    modules: { chosen: true, enabledCount: 40 },
  });

  const skillsRowOf = (input: ReadinessInput) =>
    evaluateInstanceReadiness(input).find((r) => r.id === 'skills')!;

  it('96 av 347 är INTE grönt, ens med en giltig stämpel', () => {
    const row = skillsRowOf(instance());
    expect(row.status).toBe('blocked');
    expect(row.detail).toContain('251');
    expect(row.detail).toContain('347');
  });

  it('namnger hålet, så admin ser VAD som saknas och inte bara ett tal', () => {
    expect(skillsRowOf(instance()).detail).toContain('manage_contract');
  });

  it('negativtest: full täckning på samma instans är grönt igen', () => {
    const row = skillsRowOf(
      instance({ total: 347, enabled: 347, missingForEnabledModules: 0, missingSample: [] }),
    );
    expect(row.status).toBe('ok');
    expect(row.detail).toContain('347');
  });

  it('omätbar täckning läses som "vet inte", aldrig som "inget krävs"', () => {
    // En äldre deployad agent-execute svarar utan täckningsblock. Då får raden
    // falla tillbaka på stämpeln — men den ska inte påstå full täckning.
    const row = skillsRowOf(
      instance({
        total: 537,
        enabled: 537,
        requiredByEnabledModules: null,
        missingForEnabledModules: null,
        missingSample: [],
      }),
    );
    expect(row.status).toBe('ok');
    expect(row.detail).toContain('could not be measured');
  });

  it('täckningshålet vinner över stämpel-drift — det skarpaste felet visas', () => {
    const row = skillsRowOf(instance({ stampHash: 'other-build' }));
    expect(row.status).toBe('blocked');
    expect(row.detail).toContain('missing');
  });

  it('plattformsgolvet gäller fortfarande före allt annat', () => {
    // En instans under golvet har inget lager alls; det felet är äldre och
    // grövre än täckningsgapet och måste behålla sin egen formulering.
    const row = skillsRowOf(
      instance({ total: 6, enabled: 6, stampHash: null, missingForEnabledModules: 341 }),
    );
    expect(row.status).toBe('blocked');
    expect(row.detail).toContain('platform floor');
  });
});
