/**
 * The generated artifacts — one list, three readers.
 *
 * Eight files in this repo are pure functions of the source: the skill-seed
 * bundle and its edge-runtime copy, the automation and locale-pack bundles,
 * the skill→module map, and the instance manifest that hashes all of it. They
 * must exist in the repo (the Supabase GitHub integration deploys
 * supabase/functions as-is, and agent-execute imports its JSON at runtime),
 * but they must not ride a PR: in the 30 days to 2026-10-01 the manifest alone
 * changed in 96 commits, and every pair of parallel PRs conflicted in it.
 *
 * The rule (R2 of the 2026-10-01 night report, #605):
 *   - a PR never commits them — CI rebuilds them before tests and build
 *     (`--check-untouched` fails a PR that did commit one);
 *   - main carries them fresh — refresh-generated-artifacts.yml rebuilds and
 *     commits after every merge (`--build`, then git decides);
 *   - the nightly fresh install proves main is fresh (`--check-fresh`).
 *
 *   npm run artifacts:build              # rebuild into the working tree
 *   npm run artifacts:check              # CI: this PR must not touch them
 *   bun run scripts/generated-artifacts.ts --check-fresh   # main/nightly
 *   bun run scripts/generated-artifacts.ts --list          # the paths, one per line
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const GENERATED_ARTIFACTS = [
  'supabase/seed/module-skills.json',
  'supabase/seed/module-automations.json',
  'supabase/seed/locale-packs.json',
  'supabase/functions/agent-execute/_module-skills.json',
  'supabase/functions/agent-execute/_locale-packs.json',
  'supabase/functions/agent-execute/_ui-text-catalog.json',
  'supabase/functions/_shared/skills/skill-modules.ts',
  'supabase/seed/instance-manifest.json',
] as const;

/** Generators, in dependency order: the manifest hashes the skills bundle. */
export const GENERATORS = ['scripts/skills-to-json.ts', 'scripts/generate-instance-manifest.ts'] as const;

export function isGeneratedArtifact(path: string): boolean {
  return (GENERATED_ARTIFACTS as readonly string[]).includes(path.replace(/^\.\//, ''));
}

const ROOT = resolve(import.meta.dirname ?? __dirname, '..');

function sh(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

export function build(): void {
  for (const g of GENERATORS) {
    const r = spawnSync('bun', ['run', g], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`generated-artifacts: ${g} exited ${r.status}`);
      process.exit(r.status ?? 1);
    }
  }
}

/** Artifacts this branch changed relative to the merge-base with the base ref. */
export function touchedOnBranch(baseRef = process.env.BASE_REF || 'origin/main'): string[] {
  let mergeBase: string;
  try {
    mergeBase = sh(['merge-base', baseRef, 'HEAD']);
  } catch {
    return [];
  }
  const changed = sh(['diff', '--name-only', mergeBase, 'HEAD']).split('\n').filter(Boolean);
  return changed.filter(isGeneratedArtifact);
}

/** Artifacts whose working-tree content differs from HEAD (after a build: stale on HEAD). */
export function staleOnHead(): string[] {
  const out = sh(['status', '--porcelain', '--', ...GENERATED_ARTIFACTS]);
  return out.split('\n').filter(Boolean).map((l) => l.slice(3).trim());
}

if (typeof process !== 'undefined' && process.argv[1] && /generated-artifacts/.test(process.argv[1])) {
  const mode = process.argv[2] ?? '--build';
  if (mode === '--build') {
    build();
  } else if (mode === '--list') {
    console.log(GENERATED_ARTIFACTS.join('\n'));
  } else if (mode === '--check-untouched') {
    const touched = touchedOnBranch();
    if (touched.length) {
      console.error(
        '✖ This branch commits generated artifacts. They are rebuilt by CI and committed on main by\n' +
          '  refresh-generated-artifacts.yml — a PR that carries them conflicts with every other PR.\n' +
          '  Restore them from the base and let the job do it:\n' +
          touched.map((f) => `    git checkout origin/main -- ${f}`).join('\n'),
      );
      process.exit(1);
    }
    console.log('✓ generated artifacts untouched on this branch');
  } else if (mode === '--check-fresh') {
    build();
    const stale = staleOnHead();
    if (stale.length) {
      console.error(
        '✖ Generated artifacts on HEAD are stale — refresh-generated-artifacts.yml did not run or did not commit:\n' +
          stale.map((f) => `    ${f}`).join('\n'),
      );
      process.exit(1);
    }
    console.log('✓ generated artifacts on HEAD are fresh');
  } else {
    console.error(`generated-artifacts: unknown mode ${mode} (--build | --list | --check-untouched | --check-fresh)`);
    process.exit(2);
  }
}
