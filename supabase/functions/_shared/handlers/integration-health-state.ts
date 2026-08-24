// Integrationshälsa som TILLSTÅND — och en notis bara vid övergång.
//
// ── FÖRLOPPET ──────────────────────────────────────────────────────────────
// Ägaren öppnade FlowChat och såg en varning ligga kvar längst ned, som om
// chatten hängde:
//
//     ⚠️ 2 integrations failing: • local_llm: no url configured
//                               • resend: cannot verify from here …
//
// Det var ingen replik. Det var `check_integrations` dagliga svep som skrev en
// rad i `chat_messages` med `role: 'assistant'` och tom `metadata` — en
// mätning maskerad som ett samtalsdrag. Ingenting i raden sade annat, så den
// läste som assistentens sista ord och ytan såg ut att vänta på användaren.
//
// Fyra ordagrant identiska kopior låg kvar sedan 2026-08-20 (och nio totalt
// sedan 2026-08-07, var och en i sin EGEN konversation "Integration health —
// ÅÅÅÅ-MM-DD", så FlowChats historik fylldes med återvändsgränder).
//
// ── VARFÖR DET INTE GICK ATT LÖSA ──────────────────────────────────────────
// Ett chattmeddelande är oföränderligt och permanent. Ett tillstånd är rörligt
// och upphör. Lägger man det rörliga i det oföränderliga kan det aldrig lösas
// — bara begravas. Därför gick ingen av de nio raderna att kvittera: att fixa
// Resend tog inte bort gårdagens mening om Resend.
//
// Och därför blev larmet värdelöst. Samma text fyra dagar i rad är tapet. Att
// dagsbrevet aldrig loggades upptäcktes först när ägaren frågade — inte för
// att larmet var otydligt, utan för att ingen läste det längre.
//
// ── PRINCIPEN ──────────────────────────────────────────────────────────────
// Fråga inte VAR informationen ska ligga, utan VAD DEN VILL AV DIG:
//
//   vill inget, bara vara sann  → glansbar YTA, ersätter sig själv → Observability
//   vill att du VET (nåt hände) → NOTIS, kvitterbar, en gång       → klockan i toppmenyn
//   vill att du AVGÖR          → SAMTAL, en gång, med en fråga     → chatten
//
// "2 integrationer felar" varje morgon är ett TILLSTÅND.
// "Gick från friska till felande" är en NYHET.
// "Resend har inte levererat på tre dagar — vill du att jag kollar?" är ett BESLUT.
//
// Den här filen bär de två första. Den tredje finns inte än; se KROKEN nedan.
//
// ── VAR TILLSTÅNDET BOR ────────────────────────────────────────────────────
// `site_settings.key = 'integration_health'` — plattformens egna nyckel/värde-
// lager, samma tabell svepet redan LÄSER (`integrations`, `system_ai`). En rad
// som skriver över sig själv är exakt vad "glansbar yta, alltid aktuell" är i
// lagring. Ingen fjärde mekanism, ingen ny tabell, ingen historiktabell.
//
// Och eftersom en övergång kräver att FÖREGÅENDE tillstånd finns lagrat
// någonstans bor det på samma yta: föregående tillstånd ÄR raden innan
// skrivningen. Läs–jämför–skriv. Att lägga "förra gången" någon annanstans än
// hos "den här gången" är att skapa två sanningar som kan driva isär.
//
// Nyckeln står medvetet UTANFÖR anon-tillåtlistan i
// 20260823120000_c6d7e8f9 — proberna namnger saknade secrets och interna
// URL:er. Personal läser via `is_staff`-policyn.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** site_settings-nyckeln som bär tillståndet. En rad, skriver över sig själv. */
export const INTEGRATION_HEALTH_KEY = 'integration_health';

/** Hur många notiser raden minns. Kvitterade äldre trillar av. */
export const MAX_NOTICES = 10;

export type IntegrationHealthNoticeKind = 'degraded' | 'new_failure' | 'recovered';

export interface IntegrationHealthNotice {
  id: string;
  at: string;
  kind: IntegrationHealthNoticeKind;
  headline: string;
  /** Vilka integrationer övergången handlade om — inte hela listan. */
  integrations: string[];
  acknowledged_at: string | null;
}

/** Den delmängd av `check_integrations` utdata som tillståndet bär vidare. */
export interface IntegrationProbeSummary {
  healthy: boolean;
  summary: string;
  failing: string[];
  unused: string[];
  /**
   * `object[]`, inte `Record<string, unknown>[]`. Raderna bärs bara vidare och
   * serialiseras — ingenting slår upp dem på godtycklig nyckel — och
   * `Record<string, unknown>` avvisar just den typ som PRODUCERAR dem:
   * IntegrationProbeResult är ett `interface`, och TypeScript ger implicita
   * indexsignaturer till objekt-typALIAS men aldrig till interface. Den lösa
   * typen var alltså inte lös; den var stängd för sin egen avsändare.
   */
  integrations: object[];
}

export interface IntegrationHealthState {
  checked_at: string;
  /** Vem som mätte: 'automation' (dagliga svepet) eller vad anroparen sa. */
  source: string;
  healthy: boolean;
  summary: string;
  failing: string[];
  unused: string[];
  /**
   * Första gången varje NUVARANDE fel sågs. Det som gör "felande sedan tre
   * dagar" möjligt att säga utan en historiktabell — och det enda tillståndet
   * behöver minnas utöver "vad är sant nu".
   */
  failing_since: Record<string, string>;
  integrations: object[];
  notices: IntegrationHealthNotice[];
}

const list = (names: string[]): string => names.join(', ');

/**
 * Ren övergångsberäkning: föregående tillstånd + ny mätning → nytt tillstånd.
 *
 * Övergångar som är värda en notis — och bara dessa tre:
 *
 *   1. friskt → felande      (`degraded`)
 *   2. ett NYTT fel dyker upp (`new_failure`) — någon felar som inte felade förut
 *   3. felande → friskt      (`recovered`) — att något läkte är också en nyhet,
 *                                            och den är trevligare att få
 *
 * "Fortfarande felande, tredje dagen" är INGEN övergång och är tyst. Det är
 * hela poängen: den meningen hör hemma på ytan, inte i en notis.
 *
 * DELVIS läkning (två felade, ett läkte, ett felar kvar) är också tyst. Den är
 * inte i listan ovan, och den lämnar dig fortfarande felande — tillståndet på
 * Observability visar den, klockan tiger. Asymmetrin mot regel 2 är avsiktlig:
 * ett nytt fel utökar det du måste göra, en delvis läkning gör det inte.
 *
 * FÖRSTA mätningen (previous === null) med fel ger `degraded`. Det är enda
 * gången "nyligen trasig" och "alltid trasig" inte går att skilja åt, och
 * tystnad där skulle betyda att en instans som föddes trasig aldrig får någon
 * notis alls.
 *
 * Högst EN notis per svep. Blir det både ett nytt fel och en läkning i samma
 * svep vinner det nya felet — det är det som kräver något av dig.
 */
export function nextIntegrationHealthState(
  previous: IntegrationHealthState | null,
  probe: IntegrationProbeSummary,
  now: string,
  source: string,
  newId: () => string,
): IntegrationHealthState {
  const prevFailing = Array.isArray(previous?.failing) ? previous!.failing : [];
  const prevSince = (previous?.failing_since ?? {}) as Record<string, string>;
  const prevNotices = Array.isArray(previous?.notices) ? previous!.notices : [];

  const nextFailing = [...probe.failing].sort();
  const prevSet = new Set(prevFailing);
  const newlyFailing = nextFailing.filter((n) => !prevSet.has(n));

  // Ett fel som redan fanns behåller sitt första-sedd — det är minnet som gör
  // "tredje dagen" möjligt att säga utan att lagra en rad per dag.
  const failing_since: Record<string, string> = {};
  for (const name of nextFailing) failing_since[name] = prevSince[name] ?? now;

  let notice: IntegrationHealthNotice | null = null;
  if (newlyFailing.length > 0) {
    const firstEver = previous === null;
    const fromHealthy = prevFailing.length === 0;
    notice = {
      id: newId(),
      at: now,
      kind: fromHealthy ? 'degraded' : 'new_failure',
      headline: firstEver
        ? `First integration check found ${nextFailing.length} failing: ${list(nextFailing)}`
        : fromHealthy
          ? `Integrations went from healthy to failing: ${list(newlyFailing)}`
          : newlyFailing.length === 1
            ? `New integration failure: ${newlyFailing[0]}`
            : `New integration failures: ${list(newlyFailing)}`,
      integrations: newlyFailing,
      acknowledged_at: null,
    };
  } else if (prevFailing.length > 0 && nextFailing.length === 0) {
    notice = {
      id: newId(),
      at: now,
      kind: 'recovered',
      headline: prevFailing.length === 1
        ? `${prevFailing[0]} is healthy again — all integrations OK`
        : `All integrations healthy again — ${list(prevFailing)} recovered`,
      integrations: [...prevFailing],
      acknowledged_at: null,
    };
  }

  const notices = notice ? [notice, ...prevNotices] : prevNotices;

  return {
    checked_at: now,
    source,
    healthy: probe.healthy,
    summary: probe.summary,
    failing: nextFailing,
    unused: [...probe.unused].sort(),
    failing_since,
    integrations: probe.integrations,
    notices: notices.slice(0, MAX_NOTICES),
  };
}

/**
 * Läs föregående tillstånd, räkna fram det nya, skriv tillbaka.
 *
 * Körs på VARJE anrop av check_integrations, inte bara det schemalagda.
 * Tillståndet är "sanningen vid senaste probningen" — vem som råkade beställa
 * probningen ändrar inte vad som är sant, och en operatör som trycker
 * "Check now" ska både uppdatera brickan och få sin notis om något faktiskt
 * ändrats.
 *
 * Best effort. Probresultatet är produkten; misslyckas skrivningen får
 * anroparen ändå hela svaret. (Samma hållning som notifyFailures hade — men nu
 * utan att ett misslyckande lämnar efter sig ett odödligt chattmeddelande.)
 */
export async function recordIntegrationHealth(
  supabase: SupabaseClient,
  probe: IntegrationProbeSummary,
  source: string,
): Promise<IntegrationHealthState | null> {
  try {
    const { data } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', INTEGRATION_HEALTH_KEY)
      .maybeSingle();

    const raw = data?.value;
    const previous = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as IntegrationHealthState)
      : null;

    const next = nextIntegrationHealthState(
      previous,
      probe,
      new Date().toISOString(),
      source,
      () => crypto.randomUUID(),
    );

    await supabase
      .from('site_settings')
      .upsert({ key: INTEGRATION_HEALTH_KEY, value: next }, { onConflict: 'key' });

    return next;
  } catch (e) {
    console.warn('[integration-health] could not record state:', (e as Error)?.message);
    return null;
  }
}

// ─── KROKEN: "innan jag skickar nyhetsbrevet…" (DESIGN-NOT, EJ BYGGD) ───────
//
// Ägaren vill att FlowPilot ska kännas som någon som har koll. Vägen dit är
// inte att den PRATAR mer utan att den VET mer. Tre lägen, i stigande ordning:
//
//   a) LÄSA tillståndet när någon frågar — "hur mår integrationerna?" ska
//      besvaras ur `site_settings.integration_health`, inte genom att proba om.
//      Kräver bara en läsande skill/verktygsväg mot nyckeln.
//   b) TA UPP något när det är nytt eller förvärras — notiserna ovan bär redan
//      den händelsen; det som saknas är att FlowPilot läser dem.
//   c) TA UPP det när ANVÄNDAREN är på väg att göra något som påverkas.
//      Det är den verkliga "har-koll"-känslan:
//
//        "innan jag skickar nyhetsbrevet — Resend har inte loggat en leverans
//         på tre dagar, vill du att jag kollar först?"
//
// VAR KROKEN SITTER: i `agent-execute/index.ts`, i förgrinden precis före
// dispatch — bredvid staging-grinden (~rad 585-640), FÖRE den. En
// beroende-preflight: skill → vilka integrationer den hänger på → läs
// `integration_health` → felar någon av dem, returnera en BOUNCE, inte en
// staged operation. (Ett godkännande bryter självrättningen: samma fel är
// självrättande i en loop och terminalt bakom en grind. En bounce är en
// mening tillbaka till modellen, som då kan välja att fråga användaren.)
//
// VAD SOM SAKNAS för att bygga den:
//   1. En MASKINLÄSBAR beroendekarta skill → integration. Idag finns kartan
//      bara åt andra hållet och i PROSA: `CONSUMERS` i check-integrations.ts
//      säger "email-send's transport chain (all outbound mail)" — läsbart för
//      en människa, oanvändbart som grind. Den ska deklareras på skillen
//      (t.ex. `depends_on_integrations: ['resend']` i seeden), så Law 2 håller:
//      skillen beskriver sig själv, grinden slår upp — ingen if-sats per skill.
//   2. Ett FÖRVÄRRAS-mått, inte bara felar/felar-inte. `failing_since` ovan ger
//      "sedan tre dagar" gratis. Det som fattas är "senaste leverans" som
//      självständigt fält: resend-proben LÄSER redan `outbound_communications`
//      för sitt bevis men kastar tidsstämpeln och returnerar bara ok/fail.
//      Lyft ut den till tillståndet så meningen ovan kan skrivas exakt.
//   3. Ett beslut om vem bouncen talar till. FlowPilot har en användare att
//      fråga; det dagliga svepet och en extern MCP-operatör har det inte.
//      Grinden måste därför kunna svara olika på "det finns någon att fråga"
//      och "det finns ingen" — annars blir den en tyst blockering i cron.
//
// Först när (1) finns är kroken Law-1-säker. Utan den blir den en if-sats per
// skill, och det är precis den väven lagarna finns för att förhindra.
