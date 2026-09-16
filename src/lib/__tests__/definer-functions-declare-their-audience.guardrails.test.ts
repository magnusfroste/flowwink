import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A SECURITY DEFINER function runs as its owner and passes straight through RLS,
 * so the guard in its body is the only guard there is.
 *
 * 2026-09-17: 30 of them had no guard and were executable by `anon` — the key in
 * every visitor's browser — on all seven instances (refund_return,
 * mark_expense_report_paid, receive_purchase_order, record_pos_sale, …). The
 * August sweep had revoked PUBLIC at SCHEMA level, which cannot remove the
 * built-in EXECUTE for PUBLIC, so everything created afterwards was born open.
 * 20260917090000 fixed the defaults (a new function is now born closed to anon)
 * and guarded the staff writers — but `authenticated` is still granted by
 * default, and every signed-in portal customer is `authenticated`.
 *
 * So from that migration on, every SECURITY DEFINER function must declare who
 * may call it: a guard in its body, or an explicit GRANT naming the audience.
 * This scans every later migration — it does not list functions.
 */

const DIR = join(__dirname, '../../../supabase/migrations');
const CUTOFF = '20260917090000';

const GUARD = /auth\.role\(\)\s*=\s*'service_role'|can_access_module\s*\(|has_role\s*\(|token_is_plausible\s*\(/i;

interface DefinerFn { name: string; body: string }

export function definerFunctions(sql: string): DefinerFn[] {
  const out: DefinerFn[] = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\$([a-z_]*)\$([\s\S]*?)\$\3\$/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const header = m[2];
    if (!/security\s+definer/i.test(header)) continue;
    if (/returns\s+trigger/i.test(header)) continue; // not callable as RPC
    out.push({ name: m[1].toLowerCase(), body: m[4] });
  }
  return out;
}

export function undeclared(sql: string): string[] {
  return definerFunctions(sql)
    .filter((f) => !GUARD.test(f.body))
    .filter((f) => !new RegExp(`grant\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${f.name}\\b[^;]*\\bto\\b`, 'i').test(sql))
    .map((f) => f.name);
}

describe('SECURITY DEFINER functions declare their audience', () => {
  it('the cutoff migration makes new functions born closed to anon, globally', () => {
    const sql = readFileSync(join(DIR, readdirSync(DIR).find((f) => f.startsWith(CUTOFF))!), 'utf8');
    // The schema-level form cannot remove PUBLIC's built-in EXECUTE; only the global one can.
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  });

  it('every later migration guards or grants each definer function', () => {
    const later = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f.slice(0, 14) > CUTOFF);
    const offenders = later.flatMap((f) => undeclared(readFileSync(join(DIR, f), 'utf8')).map((n) => `${f}: ${n}`));
    expect(
      offenders,
      'SECURITY DEFINER without a guard (service_role / can_access_module / has_role / token_is_plausible) ' +
        'or an explicit GRANT EXECUTE … TO <audience>:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the scanner itself: catches an open writer, accepts guards, grants and triggers', () => {
    const fn = (name: string, header: string, body: string) =>
      `CREATE OR REPLACE FUNCTION public.${name}(p uuid) RETURNS jsonb LANGUAGE plpgsql ${header} AS $function$\nBEGIN\n${body}\nEND;\n$function$;`;
    expect(undeclared(fn('open_writer', 'SECURITY DEFINER', 'UPDATE returns SET status = 1;'))).toEqual(['open_writer']);
    expect(undeclared(fn('guarded', 'SECURITY DEFINER SET search_path TO public',
      "IF NOT (auth.role() = 'service_role' OR can_access_module(auth.uid(),'returns')) THEN RAISE EXCEPTION 'x'; END IF;"))).toEqual([]);
    expect(undeclared(fn('public_form', 'SECURITY DEFINER', 'INSERT INTO leads DEFAULT VALUES;') +
      '\nGRANT EXECUTE ON FUNCTION public.public_form(uuid) TO anon;')).toEqual([]);
    expect(undeclared(fn('invoker', '', 'UPDATE returns SET status = 1;'))).toEqual([]);
    expect(undeclared(`CREATE FUNCTION public.tg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;`)).toEqual([]);
    // an auth.uid() that is only a default is not a guard
    expect(undeclared(fn('defaults_to_caller', 'SECURITY DEFINER', 'v := COALESCE(p, auth.uid());'))).toEqual(['defaults_to_caller']);
  });

  it('applied to the old shape: refund_return as it stood in August would be refused', () => {
    const aug = readdirSync(DIR).find((f) => f.startsWith('20260820200001'))!;
    expect(undeclared(readFileSync(join(DIR, aug), 'utf8'))).toContain('refund_return');
  });
});
