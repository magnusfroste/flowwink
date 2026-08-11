import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Every edge function on disk must be declared in supabase/config.toml.
 *
 * The Supabase GitHub integration deploys, on merge, exactly the functions
 * declared as [functions.<name>] — nothing else. When 17 real functions
 * (including the mail router, the invite flows and the billing crons) had no
 * declaration, a fresh GitHub-synced instance was born unable to send mail,
 * invite colleagues, or bill. The gap was invisible: the instance looked live.
 *
 * This gate makes the manifest and the directory agree, so the next function
 * added without a declaration fails CI instead of shipping a silent hole.
 */

const ROOT = join(__dirname, '../../..');
const FUNCTIONS_DIR = join(ROOT, 'supabase/functions');
const CONFIG = join(ROOT, 'supabase/config.toml');

// Not deployable functions — shared utilities and test fixtures.
const NON_FUNCTIONS = new Set(['_shared', 'shared', 'tests']);

function declaredFunctions(): Set<string> {
  const txt = readFileSync(CONFIG, 'utf8');
  const names = [...txt.matchAll(/^\[functions\.([^\]]+)\]/gm)].map((m) => m[1]);
  return new Set(names);
}

function functionDirs(): string[] {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_FUNCTIONS.has(d.name))
    .map((d) => d.name)
    // A real function has an entry file.
    .filter((name) => existsSync(join(FUNCTIONS_DIR, name, 'index.ts')));
}

describe('config.toml declares every edge function', () => {
  it('leaves no function on disk undeclared (GitHub sync would skip it)', () => {
    const declared = declaredFunctions();
    const undeclared = functionDirs().filter((f) => !declared.has(f));
    expect(
      undeclared,
      `These functions exist but are not in config.toml, so a GitHub-synced deploy would NOT ship them: ${undeclared.join(', ')}`,
    ).toEqual([]);
  });

  it('every declaration sets verify_jwt explicitly (no silent gateway default)', () => {
    const txt = readFileSync(CONFIG, 'utf8');
    const blocks = [...txt.matchAll(/\[functions\.([^\]]+)\]([\s\S]*?)(?=\n\[|\s*$)/g)];
    const missing = blocks
      .filter(([, , body]) => !/verify_jwt\s*=\s*(true|false)/.test(body))
      .map(([, name]) => name);
    expect(
      missing,
      `verify_jwt must be explicit — an unset value takes the gateway default (true) and silently 401s any cron/anon caller: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
