import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ADMIN_ONLY_RPCS } from '../admin-only-rpcs';

/**
 * Rollsvepet, tredje varvet: den obevakade dörren.
 *
 * Varv 1 och 2 satte matrisen i RLS-policies, nav och agent-rälsen. Kvar låg
 * en klass som INGET av de svepen kunde se: SECURITY DEFINER-RPC:er vars vakt
 * är en hårdkodad rollista inuti funktionskroppen. Ett pg_policy-svep hittar
 * dem inte (de har ingen policy), och agent-rälsen kör aldrig igenom dem med
 * en användar-JWT (agent-execute enforcar matrisen själv, och anropar sedan
 * RPC:n med service-nyckeln). Men frontend anropar dem RAKT via
 * `supabase.rpc()` — en roll som beviljats modulen ser knappen, klickar, och
 * möts av "Only admins…".
 *
 * Testet är rent textbaserat med flit: det måste hålla i CI utan DATABASE_URL
 * (skill-linterns läxa — en grind som kräver DB-åtkomst körs aldrig). Det
 * läser samma två artefakter en granskare skulle läsa: anropen i src/ och den
 * SENASTE definitionen av varje funktion i supabase/migrations/.
 */
const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Varje RPC-namn frontend anropar direkt via supabase.rpc('…'). */
function frontendRpcNames(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(join(ROOT, 'src'))) {
    const src = readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/g)) names.add(m[1]);
  }
  return names;
}

/**
 * Den senaste definitionen av varje funktion i migrationsserien. Filnamnen är
 * tidsstämplade, så filordningen ÄR appliceringsordningen: den sist inlästa
 * definitionen är den som gäller på en färskinstallerad instans.
 */
function latestFunctionBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf-8');
    // Citerade identifierare finns i serien ("public"."add_tip") — 31 av
    // funktionerna skrivs så, och en regex utan dem gör testet blint för dem.
    const re =
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    for (const m of sql.matchAll(re)) {
      const start = m.index!;
      // Kroppen är dollar-citerad; hitta taggen och dess avslutande par.
      const tag = /AS\s+(\$[a-z_]*\$)/i.exec(sql.slice(start, start + 4000));
      if (!tag) continue;
      const openAt = sql.indexOf(tag[1], start);
      const closeAt = sql.indexOf(tag[1], openAt + tag[1].length);
      if (closeAt < 0) continue;
      bodies.set(m[1].toLowerCase(), sql.slice(openAt, closeAt));
    }
  }
  return bodies;
}

/** En vakt av klassen: has_role med en LITTERAL roll (inte en variabel ur datan). */
const LITERAL_HAS_ROLE = /has_role\(\s*[A-Za-z_][A-Za-z0-9_.]*(?:\(\))?\s*,\s*'[a-z_]+'/;

function isHardcodedRoleGuard(body: string): boolean {
  return LITERAL_HAS_ROLE.test(body) && !body.includes('can_access_module');
}

describe('frontend-anropade RPC:er lyssnar på matrisen', () => {
  const called = frontendRpcNames();
  const bodies = latestFunctionBodies();

  it('hittar både anropen och definitionerna (annars mäter testet ingenting)', () => {
    expect(called.size).toBeGreaterThan(150);
    expect(bodies.size).toBeGreaterThan(400);
  });

  it('ingen frontend-RPC bär en hårdkodad rollista utan att stå i allowlisten', () => {
    const offenders: string[] = [];
    for (const name of called) {
      const body = bodies.get(name);
      if (!body || !isHardcodedRoleGuard(body)) continue;
      if (name in ADMIN_ONLY_RPCS) continue;
      offenders.push(name);
    }
    expect(
      offenders,
      `Dessa RPC:er anropas från src/ men grindas av en hårdkodad rollista i stället för ` +
        `can_access_module(): ${offenders.join(', ')}. Byt vakten mot ` +
        `"auth.role() = 'service_role' OR can_access_module(auth.uid(),'<modul>')" i en ny ` +
        `migration — eller, om admin-only är rätt, lägg namnet i src/lib/admin-only-rpcs.ts ` +
        `med ett skäl.`,
    ).toEqual([]);
  });

  it('allowlisten är inte en parkeringsplats: varje post är fortfarande frontend-anropad', () => {
    const orphans = Object.keys(ADMIN_ONLY_RPCS).filter((n) => !called.has(n));
    expect(
      orphans,
      `Dessa står i ADMIN_ONLY_RPCS men anropas inte längre från src/: ${orphans.join(', ')}. ` +
        `Ta bort raden — en allowlist som beskriver en dörr som inte finns döljer nästa.`,
    ).toEqual([]);
  });

  it('allowlisten är inte heller inaktuell: ingen post har redan konverterats', () => {
    // Notera: kriteriet är "bär can_access_module", INTE "saknar en hårdkodad
    // rollista". Fyra poster (approval-kedjornas dynamiska required_role,
    // ägarvakten, den fritt öppna log_indirect_time) var aldrig av klassen —
    // de står här som dokumenterade beslut och ska inte flaggas som inaktuella.
    const converted = Object.keys(ADMIN_ONLY_RPCS).filter((n) =>
      (bodies.get(n) ?? '').includes('can_access_module'),
    );
    expect(
      converted,
      `Dessa har konverterats till can_access_module men står kvar i ADMIN_ONLY_RPCS: ` +
        `${converted.join(', ')}. Ta bort raden.`,
    ).toEqual([]);
  });

  it('varje post i allowlisten bär ett skäl, inte bara ett namn', () => {
    for (const [name, reason] of Object.entries(ADMIN_ONLY_RPCS)) {
      expect(reason.length, `${name} saknar ett användbart skäl`).toBeGreaterThan(25);
    }
  });
});

describe('konverteringen behöll service_role-undantaget', () => {
  const bodies = latestFunctionBodies();

  /**
   * En SECURITY DEFINER-funktion som gatewayen kör med service-nyckeln har
   * ingen auth.uid(), så can_access_module(NULL, …) är falskt. Utan
   * service_role-undantaget låser en konvertering ute varje agent — samma fälla
   * som en gång strandade 44 admin-funktioner i backdaterade migrationer.
   */
  it('ingen can_access_module-vakt saknar auth.role() = service_role', () => {
    const naked: string[] = [];
    for (const [name, body] of bodies) {
      if (!body.includes('can_access_module')) continue;
      if (!body.includes("service_role")) naked.push(name);
    }
    expect(
      naked,
      `Dessa grindar på can_access_module men saknar service_role-undantaget, så ` +
        `agent-rälsen och cron låses ute: ${naked.join(', ')}`,
    ).toEqual([]);
  });
});
