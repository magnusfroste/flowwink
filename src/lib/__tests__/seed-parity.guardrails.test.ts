import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: every layer an instance needs must be reachable WITHOUT a browser.
 *
 * Migrations carry the schema. Skills, automations and the chart of accounts do
 * not — and for a long time the last two were reachable only from React:
 * automations from bootstrapModule(), the chart from topUpLocalePackSeeds().
 * FlowWink is sold as agent-operated, so "nobody opens the admin" is a
 * supported case. It cost two real bugs:
 *
 *   2026-07-20  a fleet deploy synced skills and silently seeded no
 *               automations — sync:skills had never covered them
 *   2026-07-21  a clean install ran on five accounts while the bookkeeping
 *               RPCs defaulted to 1930, 2890, 3970 and 7970
 *
 * Both layers now travel as artifacts and are applied by scripts/sync-skills.ts.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('seed parity between the browser path and the CLI', () => {
  it('all three seed artifacts exist and are non-empty', () => {
    const skills = JSON.parse(read('supabase/seed/module-skills.json'));
    const autos = JSON.parse(read('supabase/seed/module-automations.json'));
    const packs = JSON.parse(read('supabase/seed/locale-packs.json'));

    expect(skills.skill_count).toBeGreaterThan(100);
    expect(autos.automation_count).toBeGreaterThan(10);
    expect(packs.packs.length).toBeGreaterThan(0);
    expect(packs.default_pack).toBeTruthy();

    const defaultPack = packs.packs.find((p: any) => p.id === packs.default_pack);
    expect(defaultPack, 'the default pack is not in the artifact').toBeTruthy();
    expect(defaultPack.accounts.length).toBeGreaterThan(100);
  });

  it('the generator emits every module automation, not just skills', () => {
    const gen = read('scripts/skills-to-json.ts');
    expect(gen).toContain('module-automations.json');
    expect(gen).toContain('locale-packs.json');
    expect(gen).toMatch(/m\.automations/);
  });

  it('PLATFORM automations travel in the artifact too', () => {
    // The generator covered platform SKILLS but not PLATFORM_AUTOMATIONS —
    // Daily Briefing, Skill Curator and Integration Health Check reached
    // instances only via the browser's bootstrapModule(), the exact gap this
    // artifact exists to close (found 2026-07-22 when the new health check
    // never arrived through sync-skills).
    const gen = read('scripts/skills-to-json.ts');
    expect(gen).toMatch(/PLATFORM_AUTOMATIONS/);
    const autos = JSON.parse(read('supabase/seed/module-automations.json'));
    const platform = autos.modules.find((m: any) => m.moduleId === 'platform');
    expect(platform, 'no platform entry in the automations artifact').toBeTruthy();
    const names = platform.automations.map((a: any) => a.name);
    expect(names).toContain('Integration Health Check');
    expect(names).toContain('Daily Briefing');
  });

  it('the sync tool applies all three layers', () => {
    const sync = read('scripts/sync-skills.ts');
    expect(sync).toMatch(/insert into agent_skills/);
    expect(sync).toMatch(/insert into agent_automations/);
    expect(sync).toMatch(/insert into chart_of_accounts/);
  });

  it('the CLI sync stamps the manifest, so the sync card can tell the truth', () => {
    // instance_manifest_stamp was written only by ModulesPage — the same
    // browser-only class as automations and the chart. A CLI-synced instance
    // reported a stale or missing skills layer no matter how in-sync it was:
    // www carried a hash from 2026-07-20 and liteit none at all, both freshly
    // synced. An indicator that is always red stops being read.
    const sync = read('scripts/sync-skills.ts');
    expect(sync).toContain("'instance_manifest_stamp'");
    expect(sync).toMatch(/stamped_by: 'sync-skills-cli'/);
    expect(sync).toMatch(/on conflict \(key\) do update/);
  });

  it('automations are inserted by name only, never updated', () => {
    // bootstrapModule() deliberately does not update an existing automation:
    // an operator who retunes a cron must keep their schedule. The CLI has to
    // match, or running a sync would silently reset it.
    const sync = read('scripts/sync-skills.ts');
    expect(sync).not.toMatch(/update agent_automations/);
    expect(sync).toMatch(/existingAutos\.has\(a\.name\)/);
  });

  it('the FlowPilot executor gate is mirrored', () => {
    // An executor='flowpilot' automation has nothing to run it when the module
    // is off; bootstrap skips those, so the CLI must too.
    const sync = read('scripts/sync-skills.ts');
    expect(sync).toMatch(/executor === 'flowpilot' && !flowpilotEnabled/);
  });

  it('the chart is empty-until-chosen: no path seeds without an explicit activation', () => {
    // Magnus, 2026-07-21: FlowWink is a generic BOS — a German customer
    // installs a German kit. An instance where nobody picked a market must not
    // quietly become Swedish. Display may fall back to the default pack;
    // SEEDING and POSTING may not.
    const hook = read('src/hooks/useTenantLocalePack.ts');
    // The boot top-up keys off the explicit choice…
    expect(hook).toMatch(/if \(!chosenId \|\| topUpDoneFor === chosenId\) return;/);
    // …and the CLI refuses to fall back to the artifact's default pack.
    const sync = read('scripts/sync-skills.ts');
    expect(sync, 'sync-skills seeds the default pack again').not.toMatch(
      /\|\|\s*packArtifact\.default_pack/,
    );
    // The SQL resolver demands an activation rather than assuming Sweden.
    const mig = read('supabase/migrations/20260721190000_account-for-requires-activation.sql');
    expect(mig).toMatch(/No accounting locale activated/);
    expect(mig, 'the resolver regained a hardcoded default locale').not.toMatch(
      /'se-bas2024'\s*--\s*pack default/,
    );
  });

  it('the default choice lives in the TEMPLATE, and both installers only insert', () => {
    // Magnus's resolution: Swedish stays the default — but as the WordPress
    // installer preselects a language, not as an engine assumption. Every
    // template except blank declares the pack it activates; blank stays
    // un-activated on purpose (a truly empty start).
    const { readdirSync } = require('node:fs');
    const dir = join(root, 'src/data/templates');
    const files = readdirSync(dir).filter(
      (f: string) => f.endsWith('.ts') && !['types.ts', 'index.ts'].includes(f),
    );
    for (const f of files) {
      const src = read(`src/data/templates/${f}`);
      if (!src.includes('StarterTemplate = {')) continue;
      if (f === 'blank.ts') {
        expect(src, 'blank must stay un-activated').not.toMatch(/accountingLocale:/);
      } else {
        expect(src, `${f} declares no accountingLocale`).toMatch(/accountingLocale: 'se-bas2024'/);
      }
    }

    // Both install paths activate insert-if-absent — switching templates must
    // never flip the books of a tenant who already picked a pack — and both
    // follow the Odoo precedence: existing choice > the business's COUNTRY >
    // the template's default. Content and jurisdiction are different axes.
    const ui = read('src/hooks/useTemplateInstaller.ts');
    const uiBlock = ui.slice(ui.indexOf('Activate an accounting locale'));
    expect(uiBlock).toMatch(/packForCountry\(businessCountry\)\?\.id \?\? template\.accountingLocale/);
    expect(uiBlock).toMatch(/eq\('key', 'accounting_locale'\)/);
    expect(uiBlock).toMatch(/if \(localeToActivate && !existing\)/);

    const ae = read('supabase/functions/agent-execute/index.ts');
    const aeBlock = ae.slice(ae.indexOf('packForCountryCode'));
    expect(aeBlock).toMatch(/packForCountryCode\(businessCountry\) \?\?/);
    expect(aeBlock).toMatch(/if \(localeToActivate && !existingLocale\)/);
    // The agent path seeds the chart from the bundled artifact — no browser —
    // and the artifact carries the country mapping the resolver needs.
    expect(ae).toMatch(/_locale-packs\.json/);
    const bundle = JSON.parse(read('supabase/functions/agent-execute/_locale-packs.json'));
    expect(bundle.packs.some((p: any) => (p.countries ?? []).includes('SE'))).toBe(true);
    expect(bundle.packs.some((p: any) => (p.countries ?? []).includes('*'))).toBe(true);
  });

  it('chart presence is checked per LOCALE, in both paths — and matches the constraint', () => {
    // This guard used to say the opposite, and was right at the time: the table
    // was globally UNIQUE (account_code), liteit carried five accounts tagged
    // with the legacy locale `sv-SE`, and a locale-scoped lookup read them as
    // missing — the insert then hit the global constraint and aborted the whole
    // top-up at 261 of 263 accounts with nothing reporting why.
    //
    // On 2026-08-09 the constraint became UNIQUE (locale, account_code) so a
    // German 1200 and a Swedish 1200 could coexist. The seeders were not
    // updated: they kept the global lookup AND `on conflict (account_code)`,
    // which matches no index, so sync:skills crashed with 42P10 and the chart
    // top-up was dead fleet-wide until 2026-08-10.
    //
    // The rule now: ask the question the constraint answers. A constraint change
    // is an API change for everything that writes the table — including the test
    // that pins how it is written.
    //
    // 2026-08-23 — the same rule, taken one step further. The CLI had been
    // right since 2026-08-10: it lets `on conflict (locale, account_code) do
    // nothing` decide, and never reads first. The two PostgREST paths still
    // asked the table which codes it held, and THAT read was capped at 1000
    // rows in silence while the pack holds 1262 accounts. So the locale scope
    // was never the remaining problem — the READ was. All three paths now
    // write through the constraint; the browser and edge paths' upsert shape is
    // pinned in absence-is-not-a-silence.guardrails.test.ts, and what stays
    // here is the property this test has always been about: whatever the
    // conflict target is, it must be the one the index actually has.
    const sync = read('scripts/sync-skills.ts');
    const syncBlock = sync.slice(sync.indexOf('Chart of accounts'));
    // Raw `pg`, not PostgREST — no row cap applies to this one, and the
    // ON CONFLICT below makes the lookup an optimisation rather than a decision.
    expect(syncBlock).toMatch(/from chart_of_accounts where locale = \$1/);
    expect(syncBlock, 'the conflict target must match the index').toMatch(
      /on conflict \(locale, account_code\) do nothing/);

    // Neither PostgREST path may go back to deciding "missing" from a read.
    for (const path of ['src/hooks/useTenantLocalePack.ts', 'supabase/functions/agent-execute/index.ts']) {
      const src = read(path);
      expect(src, `${path} reads the chart to decide what to seed`).not.toMatch(
        /\.select\('account_code'\)\s*\.eq\('locale', pack\.id\)/,
      );
      expect(src, `${path} must upsert on the real constraint`).toMatch(
        /onConflict: 'locale,account_code'/,
      );
    }
  });

  it('and one code still names one account on an instance', () => {
    // What the old global constraint used to enforce as a side effect, and what
    // the per-locale one does not: two rows for 2081 differing only by a locale
    // tag both answer to the same postings, because journal lines reference the
    // code as text.
    const cleanup = read('supabase/migrations/20260810020000_one-chart-per-code-drop-legacy-locale-rows.sql');
    expect(cleanup).toMatch(/DELETE FROM public\.chart_of_accounts/);
    expect(cleanup).toMatch(/ONLY where the same code already exists under another locale/);
    expect(cleanup).toMatch(/no foreign keys/);
  });
});
