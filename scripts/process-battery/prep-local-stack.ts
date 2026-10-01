/**
 * Prepare a LOCAL stack for the process battery — the same four steps every
 * time, in the only order that works:
 *
 *   1. sync skills from code      (install_template is itself a skill row; a
 *                                  fresh database has none for disabled modules)
 *   2. install the template        (country → accounting locale; walks BOTH
 *                                  gates the way an operator does: staged →
 *                                  approve_pending_operation, human →
 *                                  resolve_approval)
 *   3. enable every module         (site_settings.modules)
 *   4. sync skills again           (chart of accounts + the skills of the
 *                                  modules step 3 switched on)
 *
 *   npm run qa:prep                                # flowwink-platform, SE
 *   BATTERY_TEMPLATE=digital-shop BATTERY_COUNTRY=SE npm run qa:prep
 *
 * Reads the same env as the battery (SUPABASE_SERVICE_ROLE_KEY, BATTERY_FN_URL,
 * BATTERY_DB_URL) and refuses a non-local target for the same reason. The
 * nightly fresh-install job (.github/workflows/fresh-install-nightly.yml) runs
 * exactly this before the battery, the view sweep and the skill smoke.
 *
 * Idempotent: a second run re-syncs, re-installs skipping what exists, and
 * leaves the modules on.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertLocalTarget, connect, Scenario } from './lib';

const ROOT = resolve(import.meta.dirname, '../..');
const DB_URL = process.env.BATTERY_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const TEMPLATE = process.env.BATTERY_TEMPLATE ?? 'flowwink-platform';
const COUNTRY = process.env.BATTERY_COUNTRY ?? 'SE';

assertLocalTarget();
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('qa:prep: set SUPABASE_SERVICE_ROLE_KEY to the LOCAL stack\'s key (supabase status -o env).');
  process.exit(2);
}

function syncSkills(label: string): void {
  console.log(`\n== ${label}: sync skills from code`);
  const r = spawnSync('npm', ['run', '--silent', 'sync:skills', '--', '--apply'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: DB_URL },
    encoding: 'utf8',
  });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const lines = out.split('\n').filter((l) => /^\s{2}(skills|automations|chart of accounts|bookkeeping)/.test(l));
  console.log(lines.map((l) => '   ' + l.trim()).join('\n') || out.trim().split('\n').slice(-5).join('\n'));
  if (r.status !== 0) {
    console.error(`qa:prep: sync:skills exited ${r.status}`);
    process.exit(1);
  }
}

/** Module toggles — the keys of ModulesSettings, read from the hook's own type. */
function moduleIds(): string[] {
  const src = readFileSync(resolve(ROOT, 'src/hooks/useModules.tsx'), 'utf8');
  const m = src.match(/export interface ModulesSettings \{([\s\S]*?)\n\}/);
  if (!m) throw new Error('qa:prep: could not read ModulesSettings from src/hooks/useModules.tsx');
  return [...m[1].matchAll(/^\s+([a-zA-Z0-9]+):\s*ModuleConfig;/gm)].map((x) => x[1]);
}

const db = await connect();
try {
  syncSkills('1/4');

  console.log(`\n== 2/4: install template "${TEMPLATE}" (country ${COUNTRY}) through agent-execute, both gates`);
  const s = new Scenario('prep-local-stack', db);
  let installed: Record<string, unknown> | null = null;
  // Right after `supabase db reset` the edge runtime restarts and the first
  // call can be shed (503/546). Three tries, ten seconds apart, is what a
  // person does; after that the stack is actually down.
  for (let attempt = 1; attempt <= 3 && !installed; attempt++) {
    const out = await s.skill('install_template', { template_id: TEMPLATE, country: COUNTRY, apply_settings: true });
    if (out.ok && (out.data as { success?: boolean }).success) {
      installed = out.data as Record<string, unknown>;
    } else {
      console.log(`   attempt ${attempt}: ${(out.error || JSON.stringify(out.raw)).slice(0, 160)}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  if (!installed) {
    console.error('qa:prep: install_template did not succeed — is `supabase functions serve` running against this stack?');
    process.exit(1);
  }
  const created = (installed.created ?? {}) as Record<string, number>;
  console.log(`   ok — locale ${installed.accounting_locale_activated ?? '—'}, pages ${created.pages ?? 0}, kb ${created.kb_articles ?? 0}, products ${created.products ?? 0}; gates walked: ${s.handshakes.map((h) => h.gate).join(' → ') || 'none'}`);

  console.log('\n== 3/4: enable every module');
  const ids = moduleIds();
  const { rows } = await db.query(
    `update site_settings
        set value = (select jsonb_object_agg(k, coalesce(value->k, '{}'::jsonb) || '{"enabled":true}'::jsonb) from unnest($1::text[]) k),
            updated_at = now()
      where key = 'modules'
      returning (select count(*) from jsonb_each(value) e where (e.value->>'enabled')::bool) as enabled`,
    [ids],
  );
  if (!rows.length) {
    await db.query(
      `insert into site_settings (key, value) values ('modules', (select jsonb_object_agg(k, '{"enabled":true}'::jsonb) from unnest($1::text[]) k))`,
      [ids],
    );
  }
  console.log(`   ${rows[0]?.enabled ?? ids.length}/${ids.length} modules enabled`);

  syncSkills('4/4');

  const { rows: counts } = await db.query(
    `select (select count(*) from agent_skills where enabled) as skills,
            (select count(*) from chart_of_accounts) as accounts,
            (select value::text from site_settings where key = 'accounting_locale') as locale`,
  );
  console.log(`\nready: ${counts[0].skills} skills enabled, ${counts[0].accounts} accounts in the chart, locale ${counts[0].locale ?? '—'}`);
} finally {
  await db.end();
}
