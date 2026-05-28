/**
 * Guardrail: user_roles invariants.
 *
 * Two bugs in one regression caused admin login to fail on fresh installs:
 *   1. `handle_new_user` trigger silently added a `writer` row alongside the
 *      `admin` row inserted by scripts/flowwink.sh → multi-role accounts.
 *   2. `check-secrets` did `.maybeSingle()` on user_roles without filtering
 *      by `role`, so multi-role admins randomly got 403 Forbidden.
 *
 * These static checks would have caught both before deploy.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function loadLatestHandleNewUser(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // chronological
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(dir, files[i]), 'utf8');
    if (/FUNCTION\s+public\.handle_new_user/i.test(sql)) return sql;
  }
  throw new Error('No migration found defining public.handle_new_user');
}

function listEdgeFunctionFiles(): string[] {
  const root = 'supabase/functions';
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const f = join(root, entry.name, 'index.ts');
    try {
      readFileSync(f, 'utf8');
      out.push(f);
    } catch {
      /* no index.ts, skip */
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Guardrail 1: handle_new_user must handle 'admin' signup_type
// and must never produce >1 user_roles INSERT per branch.
// ─────────────────────────────────────────────────────────────

describe('handle_new_user trigger', () => {
  const sql = loadLatestHandleNewUser();

  // Isolate just the function body (between the latest CREATE OR REPLACE and its $$ terminator).
  const fnMatch = sql.match(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.handle_new_user[\s\S]*?\$function\$\s*;/i,
  );
  const fnBody = fnMatch?.[0] ?? '';

  it('has a dedicated branch for signup_type = admin', () => {
    expect(fnBody).toMatch(/signup_type\s*=\s*'admin'/i);
    // The admin branch must INSERT 'admin' (not 'writer' / 'customer')
    const adminBranch = fnBody.match(
      /signup_type\s*=\s*'admin'[\s\S]*?(?=ELSIF|ELSE|END\s+IF)/i,
    )?.[0];
    expect(adminBranch, 'admin branch must exist').toBeDefined();
    expect(adminBranch!).toMatch(/INSERT\s+INTO\s+public\.user_roles[\s\S]*?'admin'/i);
  });

  it('inserts exactly one user_roles row per signup_type branch', () => {
    // Count INSERT INTO user_roles statements — must match the number of
    // signup_type branches (customer / admin / else = 3).
    const inserts = (fnBody.match(/INSERT\s+INTO\s+public\.user_roles/gi) || []).length;
    expect(inserts).toBe(3);
  });

  it('uses ON CONFLICT DO NOTHING so re-runs stay idempotent', () => {
    const conflicts = (fnBody.match(/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/gi) || []).length;
    // 3 user_roles inserts + 1 profiles insert = 4 conflict guards
    expect(conflicts).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────
// Guardrail 2: every edge function that reads user_roles for an
// admin check must filter by .eq('role', 'admin').
//
// Multi-role accounts (e.g. admin + writer) will otherwise return
// an arbitrary row and break authorization checks.
// ─────────────────────────────────────────────────────────────

describe('edge functions: user_roles admin checks', () => {
  const files = listEdgeFunctionFiles();

  it('never call .from("user_roles").*.maybeSingle() without filtering by role', () => {
    const violations: string[] = [];

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (!/\.from\(['"]user_roles['"]\)/.test(src)) continue;

      // Find each chained call starting at .from('user_roles') up to the
      // terminator (.maybeSingle / .single / .then / await assignment ; ).
      const chains = src.matchAll(
        /\.from\(['"]user_roles['"]\)[\s\S]{0,400}?(\.(?:maybeSingle|single)\(\)|;|\n\s*\n)/g,
      );
      for (const m of chains) {
        const chain = m[0];
        const terminator = m[1];
        // Only enforce on row-fetch chains (Single / maybeSingle).
        if (!/maybeSingle|single/.test(terminator)) continue;
        const hasRoleFilter = /\.eq\(['"]role['"]\s*,/.test(chain);
        if (!hasRoleFilter) {
          violations.push(`${file}: missing .eq('role', ...) before ${terminator.trim()}`);
        }
      }
    }

    if (violations.length) {
      throw new Error(
        `Found ${violations.length} unfiltered user_roles fetch(es):\n` +
          violations.map((v) => `  • ${v}`).join('\n') +
          `\n\nFix: add .eq('role', 'admin').limit(1) before .maybeSingle().` +
          `\nMulti-role accounts (admin+writer) otherwise break role checks.`,
      );
    }
    expect(violations).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// Guardrail 3: scripts/flowwink.sh /create-admin sends signup_type=admin
// so the trigger creates the right role from the start.
// ─────────────────────────────────────────────────────────────

describe('scripts/flowwink.sh create-admin', () => {
  it('passes signup_type=admin in user_metadata', () => {
    const sh = readFileSync('scripts/flowwink.sh', 'utf8');
    // Only the create-admin curl call writes user_metadata with signup_type.
    expect(sh).toMatch(/user_metadata[\s\S]{0,200}signup_type[\\"' :]+admin/);
  });
});
