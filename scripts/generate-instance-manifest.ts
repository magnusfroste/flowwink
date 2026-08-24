/**
 * Instance Manifest generator — the repo's "desired state", one line per layer.
 *
 * A FlowWink site is four layers (schema, skills, edge functions, frontend)
 * that deploy through four different channels and drift independently. This
 * artifact is the missing shared version notion: what does THIS commit of the
 * repo expect an instance to run?
 *
 *   - schema:   highest migration timestamp (what the DB ledger HEAD should be)
 *   - skills:   content hash of the skill-seed bundle (module-skills.json,
 *               volatile fields excluded) — stamped into site_settings by
 *               "Sync skills from code", compared by instance_sync_status()
 *   - edge:     per-function content hashes + a combined _shared hash. NOT
 *               observable from SQL — this is the EXPECTED side; the actual
 *               side lives with the CLI (fleet-status / supabase functions list)
 *   - frontend: self-describing — the bundle that imports this manifest IS the
 *               frontend version, so it needs no comparison
 *
 * Deliberately deterministic: no timestamps, no git SHA — same tree, same
 * bytes. That keeps diffs meaningful and lets the freshness guardrail compare
 * exactly (src/lib/__tests__/instance-manifest.guardrails.test.ts).
 *
 * Run: npm run manifest:json   (regenerate + commit whenever migrations,
 * skill seeds or edge functions change — CI guardrail fails on staleness)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sha256 = (s: string | Buffer) => 'sha256:' + createHash('sha256').update(s).digest('hex');

/** Stable stringify: sorted keys at every level, so hashing is order-proof. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v as Record<string, unknown>).sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k]))
      .join(',') + '}';
  }
  return JSON.stringify(v);
}

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listFilesRecursive(p));
    else if (name.endsWith('.ts') || name.endsWith('.json')) out.push(p);
  }
  return out;
}

/** Hash a directory's .ts/.json content, path-order-stable. */
function hashDir(dir: string, root: string): string {
  const h = createHash('sha256');
  for (const f of listFilesRecursive(dir)) {
    h.update(f.slice(root.length)); // relative path in the hash → renames count
    h.update(readFileSync(f));
  }
  return 'sha256:' + h.digest('hex');
}

export interface InstanceManifest {
  _comment: string;
  schema_version: number;
  layers: {
    schema: { migration_head: string; migrations_count: number; migrations: Array<{ version: string; name: string }> };
    skills: { seed_hash: string; skill_count: number; module_count: number };
    edge_functions: { count: number; shared_hash: string; functions: Record<string, string> };
    frontend: { self_describing: true };
  };
}

export function buildManifest(root: string): InstanceManifest {
  // Layer 1: schema — the full list of expected migrations, each as {version,
  // name}. Stored as identities (not just the head timestamp) because a
  // Lovable-managed ledger stamps `version` with the RUN TIME, so a
  // filename-timestamp comparison false-flags every managed instance. The
  // consumer matches each by EITHER version (CLI) or name (managed).
  const migrationsDir = join(root, 'supabase', 'migrations');
  const migrationFiles = readdirSync(migrationsDir).filter((f) => /^\d{14}.*\.sql$/.test(f)).sort();
  const migrations = migrationFiles.map((f) => {
    const base = f.replace(/\.sql$/, '');
    return { version: base.slice(0, 14), name: base.slice(15) }; // <ts>_<name>
  });

  // A version is an IDENTITY, not a sort key. `schema_migrations.version` is the
  // ledger's primary key, so two files sharing one timestamp are one migration
  // to every instance — the second silently never runs. And the readiness check
  // (instance-readiness.ts) matches on `version` OR `name`, so the one applied
  // file satisfies BOTH expected entries and the instance reports itself fully
  // migrated. Refusing to EMIT a duplicate stops the lie at the source; CI's
  // check-migration-forward-dated.ts is the same lock one step earlier.
  const seenVersions = new Map<string, string>();
  for (const m of migrations) {
    const prior = seenVersions.get(m.version);
    if (prior !== undefined) {
      throw new Error(
        `Migration version collision: ${m.version} is claimed by two files\n` +
        `  ${m.version}_${prior}.sql\n` +
        `  ${m.version}_${m.name}.sql\n` +
        `The version is the ledger's primary key — whichever applies second looks\n` +
        `already-applied and is silently skipped. Re-timestamp one of them.`,
      );
    }
    seenVersions.set(m.version, m.name);
  }
  const migration_head = migrations.length ? migrations[migrations.length - 1].version : '';

  // Layer 2: skills — hash of the seed bundle minus volatile fields.
  const skillsRaw = JSON.parse(readFileSync(join(root, 'supabase', 'seed', 'module-skills.json'), 'utf-8'));
  const { generated_at: _g, _comment: _c, ...skillsStable } = skillsRaw;
  const seed_hash = sha256(stableStringify(skillsStable));

  // Layer 3: edge functions — expected set + content hashes.
  const fnsDir = join(root, 'supabase', 'functions');
  const functions: Record<string, string> = {};
  for (const name of readdirSync(fnsDir).sort()) {
    if (name.startsWith('_') || name === 'tests' || name === 'shared') continue;
    const dir = join(fnsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    try { statSync(join(dir, 'index.ts')); } catch { continue; }
    functions[name] = hashDir(dir, root);
  }
  const shared_hash = hashDir(join(fnsDir, '_shared'), root);

  return {
    _comment:
      'Generated by scripts/generate-instance-manifest.ts — DO NOT edit by hand. ' +
      'The repo\'s desired state per layer; compared against live state by instance_sync_status() and the Instance Sync card.',
    schema_version: 1,
    layers: {
      schema: { migration_head, migrations_count: migrations.length, migrations },
      skills: {
        seed_hash,
        skill_count: skillsRaw.skill_count ?? 0,
        module_count: skillsRaw.module_count ?? 0,
      },
      edge_functions: { count: Object.keys(functions).length, shared_hash, functions },
      frontend: { self_describing: true },
    },
  };
}

// CLI entry (skipped when imported by the guardrail test).
if (typeof process !== 'undefined' && process.argv[1] && /generate-instance-manifest/.test(process.argv[1])) {
  const root = resolve(import.meta.dirname ?? __dirname, '..');
  const manifest = buildManifest(root);
  const out = join(root, 'supabase', 'seed', 'instance-manifest.json');
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `✅ Wrote supabase/seed/instance-manifest.json — schema head ${manifest.layers.schema.migration_head}, ` +
    `${manifest.layers.skills.skill_count} skills (${manifest.layers.skills.seed_hash.slice(0, 19)}…), ` +
    `${manifest.layers.edge_functions.count} edge functions`,
  );
}
