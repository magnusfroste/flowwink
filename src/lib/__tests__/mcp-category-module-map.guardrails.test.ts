/**
 * Guardrail: SKILL_CATEGORY_MODULES måste vara KOMPLETT.
 *
 * VARFÖR SPÄRREN FINNS
 * ────────────────────
 * `isCategoryActive()` i supabase/functions/_shared/mcp/groups.ts öppnar en
 * skill-kategori om NÅGON av de listade modulerna är påslagen
 * (`required.some(m => activeModules.has(m))`). Filtret körs i tre lager:
 * MCP-gatewayn (externa agenter), FlowPilots ReAct-loop (reason.ts) och
 * agent-operate. Konsekvensen av ett hål i kartan är därför inte kosmetisk:
 *
 *   Om en modul ÄGER skills i en kategori men saknas i kategorins lista, blir
 *   modulens egna skills OSYNLIGA på varje instans där den modulen är den enda
 *   ägaren som är på.
 *
 * DET VERKLIGA FELET
 * ──────────────────
 * `communication` listade bara ["newsletter", "chat", "liveSupport", "webinars"]
 * medan TOLV moduler ägde communication-skills — bland dem `email`. En instans
 * med bara e-postmodulen påslagen exponerade noll e-postskills, och en extern
 * agent kunde därför inte svara en kund över huvud taget — exakt det steg SLA:n
 * mäter. Samma hål fanns i `content`, `crm`, `analytics` och `commerce` (POS,
 * shipping, returns, payroll, manufacturing m.fl. saknades helt).
 *
 * VARFÖR DET INTE UPPTÄCKTES
 * ──────────────────────────
 * Kommentaren ovanför kartan påstod att den var "grep-checked by mcp-regression
 * CI". Den kontrollen (mcp-contract.guardrails.test.ts) är en HANDSKRIVEN lista
 * med ~30 alias som `toContain`:as mot filens källtext. Den kan bara upptäcka
 * att ett redan känt alias försvinner — aldrig att en NY modul saknas. En spärr
 * som inte spärrar.
 *
 * DÄRFÖR HÄRLEDER DET HÄR TESTET SANNINGEN ur modulfilerna
 * (`getAllUnifiedModules() → skillSeeds[].category`) i stället för att upprepa
 * en lista. Annars hade vi bara flyttat driften.
 */
import { describe, expect, it } from 'vitest';
import '@/lib/modules';
import { getAllUnifiedModules } from '@/lib/module-def';
import {
  SKILL_CATEGORY_MODULES,
  ALWAYS_ON_CATEGORIES,
} from '../../../supabase/functions/_shared/mcp/groups';

/**
 * Medvetna undantag: modul-id → kategorier den äger skills i men INTE ska
 * kunna öppna. Varje rad måste bära ett skäl.
 *
 * `flowpilot` är påslagen på i princip varje instans. Att lista den som
 * öppnare för `crm`/`analytics` skulle göra de kategorierna permanent
 * ogatade och tysta agent-operates "modulen är av — vill du slå på den?".
 * De två skills det gäller (users_list, learn_from_data) är dessutom
 * felkategoriserade i seeden — de är agent-/systemskills, inte domänägande.
 * Fixas framåt genom omkategorisering, inte genom att bredda kartan.
 */
const DELIBERATE_EXCLUSIONS: Record<string, string[]> = {
  flowpilot: ['crm', 'analytics'],
};

/** kategori → { modul-id → antal skills } härledd ur modulregistret. */
function deriveCategoryOwners(): Map<string, Map<string, number>> {
  const byCategory = new Map<string, Map<string, number>>();
  for (const mod of getAllUnifiedModules()) {
    const seeds = (mod.skillSeeds ?? []) as Array<{ name?: string; category?: string } | null | undefined>;
    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i];
      if (!seed || typeof seed !== 'object' || !seed.category) continue;
      let owners = byCategory.get(seed.category);
      if (!owners) {
        owners = new Map<string, number>();
        byCategory.set(seed.category, owners);
      }
      owners.set(mod.id, (owners.get(mod.id) ?? 0) + 1);
    }
  }
  return byCategory;
}

describe('SKILL_CATEGORY_MODULES speglar vem som faktiskt äger skills', () => {
  const owners = deriveCategoryOwners();
  const moduleIds = new Set<string>(getAllUnifiedModules().map((m) => m.id));

  it('modulregistret är laddat (annars är resten av sviten meningslös)', () => {
    expect(moduleIds.size).toBeGreaterThan(50);
    expect(owners.size).toBeGreaterThan(5);
  });

  it('varje modul som äger skills i en gatad kategori kan också öppna den', () => {
    const holes: string[] = [];
    for (const [category, catOwners] of owners) {
      // ALWAYS_ON: gatingen konsulterar aldrig listan — den finns bara för
      // ?groups=<modul>-alias. Kompletthetskravet är därför inte tillämpligt.
      if (ALWAYS_ON_CATEGORIES.has(category)) continue;

      const listed = new Set(SKILL_CATEGORY_MODULES[category] ?? []);
      for (const [moduleId, skillCount] of catOwners) {
        if (listed.has(moduleId)) continue;
        if (DELIBERATE_EXCLUSIONS[moduleId]?.includes(category)) continue;
        holes.push(
          `${category} saknar "${moduleId}" (äger ${skillCount} skill${skillCount === 1 ? '' : 's'} i kategorin)`,
        );
      }
    }
    expect(
      holes.sort(),
      'Hål i SKILL_CATEGORY_MODULES. En instans där någon av dessa moduler är ' +
        'ENDA påslagna ägaren i kategorin får sina egna skills osynliga på ' +
        'MCP-gatewayn, i FlowPilots ReAct-loop och i agent-operate — en extern ' +
        'agent kan då inte utföra modulens arbete alls (det var så en agent ' +
        'inte kunde svara en kund). Lägg till modul-id:t i kategorins lista i ' +
        'supabase/functions/_shared/mcp/groups.ts, eller — om uteslutningen är ' +
        'avsiktlig — i DELIBERATE_EXCLUSIONS här med ett skäl:\n  ' +
        holes.sort().join('\n  '),
    ).toEqual([]);
  });

  it('varje modul-id i kartan finns på riktigt (ingen felstavad camelCase/kebab)', () => {
    const unknown: string[] = [];
    for (const [category, mods] of Object.entries(SKILL_CATEGORY_MODULES)) {
      for (const moduleId of mods) {
        if (!moduleIds.has(moduleId)) unknown.push(`${category}: "${moduleId}"`);
      }
    }
    expect(
      unknown.sort(),
      'Okända modul-id i SKILL_CATEGORY_MODULES. Ett felstavat id kan aldrig ' +
        'matcha site_settings.modules och öppnar därför aldrig kategorin — ' +
        'samma tysta hål som ett saknat id. Verifiera mot `id:`-fältet i ' +
        `src/lib/modules/*:\n  ${unknown.sort().join('\n  ')}`,
    ).toEqual([]);
  });

  it('varje kategori som äger skills är känd för kartan', () => {
    const unmapped = [...owners.keys()]
      .filter((c) => !(c in SKILL_CATEGORY_MODULES))
      .sort();
    expect(
      unmapped,
      'Skills sitter i en kategori kartan inte känner till. isCategoryActive ' +
        'returnerar då `true` (fail-open) — inget göms, men ?groups= kan inte ' +
        `nå dem och gatingen är overksam:\n  ${unmapped.join('\n  ')}`,
    ).toEqual([]);
  });

  it('undantagslistan är levande (varje undantag beskriver en verklig ägare)', () => {
    const stale: string[] = [];
    for (const [moduleId, categories] of Object.entries(DELIBERATE_EXCLUSIONS)) {
      for (const category of categories) {
        if (!owners.get(category)?.has(moduleId)) {
          stale.push(`${moduleId} → ${category}`);
        }
        if ((SKILL_CATEGORY_MODULES[category] ?? []).includes(moduleId)) {
          stale.push(`${moduleId} → ${category} (uteslutet här men listat i kartan)`);
        }
      }
    }
    expect(
      stale.sort(),
      'Föråldrat undantag. Ett undantag som inte längre motsvarar en verklig ' +
        'ägare döljer att spärren tappat täckning — ta bort raden:\n  ' +
        stale.sort().join('\n  '),
    ).toEqual([]);
  });
});
