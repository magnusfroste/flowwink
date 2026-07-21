import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardrail: the bookkeeping engine must not name a country's accounts.
 *
 * Until 2026-07-21, eleven SECURITY DEFINER functions carried BAS 2024 numbers
 * as parameter defaults — p_bank_account '1930', p_ar_account '1510',
 * p_revenue_account '3001', 24 in all. The engine did not branch on country,
 * it ASSUMED one, which is harder to spot than an `if (country = 'SE')`: a
 * German instance with a German pack activated still posted to 1930 and 3970.
 *
 * The model is the one Magnus named — a WordPress language pack. Core calls a
 * lookup; the pack supplies the value. Defaults are now NULL and resolve
 * through account_for(role) against the instance's active locale. An explicit
 * code still wins, because "post this one to 1930" is a real need.
 *
 * Proven live on demo: the same register_fixed_asset() call posted 1210/1930
 * under se-bas2024 and 0420/1200 under a throwaway de-skr03 pack, with no
 * account arguments passed.
 *
 * NOTE this replaces the account-existence half of
 * chart-of-accounts.guardrails.test.ts, which asserted every RPC default
 * appeared in BAS_2024_ACCOUNTS — a test that encoded "the platform is
 * Swedish" and would have blocked exactly this work.
 */

const root = process.cwd();
const migrations = join(root, 'supabase/migrations');
const BASELINE = '00000000000000_baseline.sql';

/** The latest definition of each function, in migration order. */
function latestDefinitions(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql') && x !== BASELINE).sort()) {
    const sql = readFileSync(join(migrations, f), 'utf8');
    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(/gi,
    )) {
      // Capture from the name to the end of the argument list.
      let i = m.index! + m[0].length - 1;
      let depth = 0;
      let end = i;
      for (; i < sql.length; i++) {
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      out.set(m[1], sql.slice(m.index!, end + 1));
    }
  }
  return out;
}

describe('account roles', () => {
  it('no function defaults a parameter to a literal account number', () => {
    const offenders: string[] = [];
    for (const [name, def] of latestDefinitions()) {
      // Comments are stripped first: the role migration's header quotes the
      // old signatures on purpose, and that prose must not trip the check.
      const code = def.replace(/--[^\n]*/g, '');
      for (const m of code.matchAll(/(\w+)\s+text\s+DEFAULT\s+'(\d{4})'/gi)) {
        offenders.push(`${name}.${m[1]} → '${m[2]}'`);
      }
    }
    expect(
      offenders,
      'a country\'s account numbers belong in the locale pack, not in a function ' +
        `signature — use DEFAULT NULL + account_for(role):\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('no wrapper BODY re-introduces a literal account fallback', () => {
    // The parameter-DEFAULT check above cannot see inside bodies. The mcp_*
    // jsonb wrappers predated the role layer and filled absent account args
    // with hardcoded BAS numbers — passed EXPLICITLY to the inner function, so
    // COALESCE(param, account_for(role)) never fired for gateway callers,
    // which is exactly the agent path. Found by the money-path regression
    // sweep's pre-flight on 2026-07-21.
    const offenders: string[] = [];
    for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql') && x !== BASELINE)) {
      const sql = readFileSync(join(migrations, f), 'utf8').replace(/--[^\n]*/g, '');
      for (const m of sql.matchAll(/COALESCE\(\s*args->>'[a-z_]*account[a-z_]*'[^)]*'(\d{4})'\s*\)/g)) {
        offenders.push(`${f}: fallback '${m[1]}'`);
      }
    }
    // Later migrations win, so only flag codes whose LAST definition still
    // carries the fallback: the repair migration redefines all three wrappers,
    // and files sort chronologically. Simplest correct check: the repair file
    // must exist and be the newest to touch each wrapper.
    const repair = readdirSync(migrations).find((x) => x.includes('mcp-wrappers-respect-roles'));
    expect(repair, 'the wrapper repair migration is gone').toBeTruthy();
    const later = offenders.filter((o) => o.split(':')[0] > repair!);
    expect(
      later,
      `a migration AFTER the repair re-introduced a body-literal account fallback:\n${later.join('\n')}`,
    ).toEqual([]);
  });

  it('the resolver exists and fails loudly on an unmapped role', () => {
    const f = readdirSync(migrations).find((x) => x.includes('account-roles'));
    expect(f, 'the account-roles migration is gone').toBeTruthy();
    const sql = readFileSync(join(migrations, f!), 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.account_roles');
    expect(sql).toMatch(/UNIQUE \(locale, role\)/);
    expect(sql).toMatch(/FUNCTION public\.account_for\(p_role text\)/);
    // Returning NULL would let a caller post to nowhere and look fine doing it.
    expect(sql).toMatch(/RAISE EXCEPTION[\s\S]{0,120}No account mapped to role/);
  });

  it('every role the RPCs resolve is mapped in EVERY shipped pack', () => {
    const conv = readdirSync(migrations).find((x) => x.includes('rpcs-resolve-account-roles'));
    expect(conv, 'the RPC conversion migration is gone').toBeTruthy();
    const used = new Set(
      Array.from(
        readFileSync(join(migrations, conv!), 'utf8').matchAll(/account_for\('([a-z_]+)'\)/g),
      ).map((m) => m[1]),
    );
    expect(used.size, 'no roles resolved — the conversion was undone').toBeGreaterThan(10);

    // Role mappings across ALL migrations, per locale. A pack that can be
    // ACTIVATED but not BOOK is not a pack: the agent-provisioning test found
    // ifrs-generic in exactly that state — country DE resolved to it, the
    // chart seeded, and the first booking died on an unmapped role. The
    // fallback pack above all others must be complete, since it is what every
    // country without its own pack lands on.
    const byLocale = new Map<string, Set<string>>();
    for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql'))) {
      for (const m of readFileSync(join(migrations, f), 'utf8').matchAll(
        /\('([a-z0-9-]+)',\s*'([a-z_]+)',\s*'\d{4}'/g,
      )) {
        if (!byLocale.has(m[1])) byLocale.set(m[1], new Set());
        byLocale.get(m[1])!.add(m[2]);
      }
    }
    expect([...byLocale.keys()].sort()).toEqual(['ifrs-generic', 'se-bas2024']);

    const gaps: string[] = [];
    for (const [locale, roles] of byLocale) {
      for (const r of used) if (!roles.has(r)) gaps.push(`${locale}: ${r}`);
    }
    expect(
      gaps,
      `these roles are resolved by an RPC but not mapped in every pack — that pack ` +
        `activates fine and then fails on its first booking:\n${gaps.join('\n')}`,
    ).toEqual([]);
  });

  it('an explicit account argument still wins over the role', () => {
    // The point is a sane DEFAULT, not removing the caller's control.
    const conv = readdirSync(migrations).find((x) => x.includes('rpcs-resolve-account-roles'))!;
    const sql = readFileSync(join(migrations, conv), 'utf8');
    const coalesces = sql.match(/(\w+) := COALESCE\(\1, public\.account_for\('[a-z_]+'\)\)/g) ?? [];
    expect(coalesces.length, 'resolution is not COALESCE-guarded').toBeGreaterThan(20);
  });
});
