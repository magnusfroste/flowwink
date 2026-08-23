import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLATFORM_SKILLS, PLATFORM_AUTOMATIONS } from '@/lib/platform-seeds';

/**
 * Guardrail: integration health is a first-class, scheduled platform sensor.
 *
 * Origin (Magnus, 2026-07-22): the fleet's SearXNG was misconfigured for
 * days — web search silently fell back to Firecrawl and the only trace was a
 * provider field deep inside agent_activity outputs. "Had we had tests on
 * every integration I'd have seen it earlier." A failing integration must be
 * one skill call away from visible, and probed daily without anyone asking.
 */

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('integration health', () => {
  const skill = PLATFORM_SKILLS.find((s) => s.name === 'check_integrations');

  it('check_integrations is a platform skill (module-toggle-independent)', () => {
    expect(skill, 'check_integrations missing from platform seeds').toBeTruthy();
    expect(skill?.handler).toBe('internal:check_integrations');
    // Read-only sensor — must not be gated behind approval.
    expect(skill?.trust_level).toBe('auto');
  });

  it('a daily automation runs it and labels the source', () => {
    const auto = PLATFORM_AUTOMATIONS.find((a) => a.skill_name === 'check_integrations');
    expect(auto, 'no automation schedules check_integrations').toBeTruthy();
    expect(auto?.trigger_type).toBe('cron');
    // source: 'automation' is provenance, no longer a behaviour switch. It used
    // to be what made the handler post into admin FlowChat; now the state is
    // recorded on EVERY call and the source is what lets the Observability card
    // say "checked … by the daily sweep" rather than "somebody pressed a button".
    expect((auto?.skill_arguments as Record<string, unknown>)?.source).toBe('automation');
  });

  it('the dispatch in agent-execute is wired', () => {
    const ae = read('supabase/functions/agent-execute/index.ts');
    expect(ae).toContain("handler === 'internal:check_integrations'");
    expect(ae).toContain('executeCheckIntegrations(supabase');
  });

  it('probes are bounded and the known failure shapes carry their fix', () => {
    const h = read('supabase/functions/_shared/handlers/check-integrations.ts');
    // Every probe must time out — a hung endpoint is a diagnosis, not a hang.
    expect(h).toMatch(/PROBE_TIMEOUT_MS = \d+/);
    expect(h).toMatch(/AbortController/);
    // The two failure shapes from the founding incident are named diagnostics:
    expect(h).toContain('enable "json" under search.formats');
    expect(h).toMatch(/engines likely blocking this server's IP/);
    // Never a billable write: probes are GETs/auth checks only.
    expect(h, 'a probe issues a POST — probes must be reads').not.toMatch(/method:\s*'POST'/);
  });
});

describe('a probe must test what the platform actually does', () => {
  /**
   * optic's FlowChat reported "resend: key rejected (HTTP 401) — rotate or
   * re-enter the API key" about a key that had sent a colleague invitation
   * fourteen minutes earlier and a password reset four minutes earlier.
   *
   * The probe hit GET /domains. The platform sends with POST /emails. A Resend
   * key scoped to "Sending access" — least privilege, the right choice — is
   * refused by /domains. So the health check failed a working integration, and
   * the remedy it suggested (rotate the key) would have broken a working one.
   *
   * A warning that fires on a healthy system teaches people to ignore warnings.
   */
  const src = read('supabase/functions/_shared/handlers/check-integrations.ts');

  it('asks the outbound log before it asks the vendor', () => {
    const resendBlock = src.slice(src.indexOf('resend: async'), src.indexOf('openai:'));
    expect(resendBlock).toMatch(/from\('outbound_communications'\)/);
    expect(resendBlock).toMatch(/\.eq\('provider', 'resend'\)/);
    expect(resendBlock).toMatch(/\.eq\('status', 'sent'\)/);
    // A delivered mail is proof on the real path — stronger than any probe.
    expect(resendBlock).toMatch(/sending works — last delivered/);
  });

  it('does not tell you to rotate a key it cannot actually judge', () => {
    const resendBlock = src.slice(src.indexOf('resend: async'), src.indexOf('openai:'));
    expect(resendBlock).not.toMatch(/rotate or re-enter/);
    expect(resendBlock).toMatch(/cannot verify from here/);
    expect(resendBlock).toMatch(/a sending-only key is refused by \/domains/);
  });

  it('the probe signature carries the client, so evidence stays available', () => {
    expect(src).toMatch(/supabase: SupabaseClient,\n\) => Promise<\{ ok: boolean; detail: string \}>;/);
    expect(src).toMatch(/await probe\(entry\.config \?\? \{\}, supabase\)/);
  });
});

// ---------------------------------------------------------------------------
// Konsumtion före hälsa
// ---------------------------------------------------------------------------

/**
 * "Trasig" är en egenskap hos något som ANVÄNDS, inte hos något som FINNS.
 *
 * Förloppet (optic, 2026-08-23): FlowChat larmade om local_llm — "no url
 * configured". Raden i site_settings bar model och apiKey men tom endpoint.
 * Men `system_ai.provider` på den instansen är "openai", och resolveAiConfig
 * läser integrations.local_llm.config ENDAST när providern är "local".
 * Ingenting konsumerade den. Kontrollen rapporterade ett fel i en del
 * plattformen inte använder — på en instans som helt enkelt inte köpt den
 * delen. Varje instans som inte köpt allt skulle larma likadant, varje dag,
 * tills folk slutar läsa rapporten.
 *
 * Fixen rör INTE Law 4 ("nycklar finns → funktionen fungerar" står kvar) och
 * INTE skrivsidan. Den lägger ett steg FÖRE: fråga om något konsumerar,
 * innan du frågar om det fungerar. Tre utfall i stället för två.
 *
 * Spärren nedan provar BÅDA riktningarna. En spärr som bara provar den tysta
 * riktningen skulle godkänna en kontroll som tystnar om allt.
 */
describe('en oanvänd integration är inte en trasig integration', () => {
  /** Kedjebar attrapp: site_settings-rader in, PostgREST-liknande svar ut. */
  function fakeSupabase(rows: Record<string, unknown>) {
    return {
      from(table: string) {
        let wantedKey: string | null = null;
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: (col: string, val: string) => {
            if (table === 'site_settings' && col === 'key') wantedKey = val;
            return chain;
          },
          gte: () => chain,
          order: () => chain,
          // outbound_communications-bevisfrågan slutar på .limit()
          limit: async () => ({ data: [] }),
          maybeSingle: async () =>
            wantedKey !== null && rows[wantedKey] !== undefined
              ? { data: { value: rows[wantedKey] } }
              : { data: null },
          // Tillståndsskrivningen (integration_health) slukas här — de här
          // testerna handlar om RETURFORMEN, som är oberoende av den.
          upsert: async () => ({ error: null }),
        });
        return chain;
      },
    };
  }

  const localLlmUnconfigured = {
    local_llm: { name: 'Local LLM', config: { model: 'optictunnels', apiKey: 'x', endpoint: '' } },
  };

  it('probas inte alls, rapporteras som unused och drar inte ner healthy', async () => {
    const { executeCheckIntegrations } = await import(
      '../../../supabase/functions/_shared/handlers/check-integrations.ts'
    );
    const probed = vi.fn();
    vi.stubGlobal('fetch', probed);

    const out = await executeCheckIntegrations(
      fakeSupabase({ integrations: localLlmUnconfigured, system_ai: { provider: 'openai' } }) as never,
    );

    const entry = (out.integrations as Array<Record<string, unknown>>)[0];
    expect(entry.name).toBe('local_llm');
    expect(entry.status).toBe('unused');
    expect(entry.consumed).toBe(false);
    // Motiveringen ska peka på kartan som konsulterades, inte på en gissning.
    expect(String(entry.detail)).toMatch(/system_ai|resolveAiConfig|provider/);
    expect(out.failing).toEqual([]);
    expect(out.unused).toEqual(['local_llm']);
    expect(out.healthy).toBe(true);
    expect(probed, 'en oanvänd integration ska inte ens probas').not.toHaveBeenCalled();
  });

  it('men samma tomma endpoint larmar HÖGT när providern faktiskt är local', async () => {
    const { executeCheckIntegrations } = await import(
      '../../../supabase/functions/_shared/handlers/check-integrations.ts'
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const out = await executeCheckIntegrations(
      fakeSupabase({ integrations: localLlmUnconfigured, system_ai: { provider: 'local' } }) as never,
    );

    const entry = (out.integrations as Array<Record<string, unknown>>)[0];
    expect(entry.status).toBe('fail');
    expect(entry.consumed).toBe(true);
    // Larmet måste säga VAD som hänger på den — annars är det en notis.
    expect(String(entry.detail)).toContain('IN USE BY');
    expect(out.failing).toEqual(['local_llm']);
    expect(out.healthy).toBe(false);
  });

  it('och en konsumerad, trasig SearXNG larmar fortfarande — grundincidenten', async () => {
    const { executeCheckIntegrations } = await import(
      '../../../supabase/functions/_shared/handlers/check-integrations.ts'
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));

    const out = await executeCheckIntegrations(
      fakeSupabase({
        integrations: { searxng: { config: { url: 'https://search.example' } } },
        system_ai: { provider: 'openai' },
      }) as never,
    );

    expect(out.failing).toEqual(['searxng']);
    expect(out.healthy).toBe(false);
    expect(String((out.integrations as Array<Record<string, unknown>>)[0].detail))
      .toContain('enable "json" under search.formats');
  });

  it('en uttryckligen avstängd integration är fortfarande skipped, inte unused', async () => {
    // Law 4 rörd? Nej. Den saknade flaggan betyder fortfarande "på"; det som
    // ändrats är att vi frågar om konsumtion innan vi frågar om hälsa.
    const { executeCheckIntegrations } = await import(
      '../../../supabase/functions/_shared/handlers/check-integrations.ts'
    );
    vi.stubGlobal('fetch', vi.fn());
    const out = await executeCheckIntegrations(
      fakeSupabase({
        integrations: { searxng: { enabled: false, config: { url: 'https://search.example' } } },
        system_ai: { provider: 'openai' },
      }) as never,
    );
    const entry = (out.integrations as Array<Record<string, unknown>>)[0];
    expect(entry.status).toBe('skipped');
    expect(entry.detail).toBe('disabled in settings');
  });

  it('varje probe har en konsumtionsregel — annars kan "vet ej" nås av misstag', () => {
    const src = read('supabase/functions/_shared/handlers/check-integrations.ts');
    const block = (start: string) => {
      const from = src.indexOf(start);
      expect(from, `hittade inte ${start}`).toBeGreaterThan(-1);
      const body = src.slice(from + start.length);
      return body.slice(0, body.indexOf('\n};'));
    };
    const keys = (body: string) => [...body.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]).sort();

    const probes = keys(block('const PROBES: Record<string, Probe> = {'));
    const consumers = keys(block('const CONSUMERS: Record<string, (m: InstanceMap) => Consumption> = {'));
    expect(probes.length).toBeGreaterThan(4);
    for (const p of probes) {
      expect(
        consumers,
        `${p} har en probe men ingen konsumtionsregel — kontrollen skulle larma ` +
          'om något ingen vet om det används.',
      ).toContain(p);
    }
  });
});

// ---------------------------------------------------------------------------
// En mätning är inget samtalsdrag
// ---------------------------------------------------------------------------

/**
 * FÖRLOPPET. Ägaren öppnade FlowChat och såg en varning ligga kvar längst ned,
 * som om chatten hängde:
 *
 *     ⚠️ 2 integrations failing: • local_llm: no url configured
 *                               • resend: cannot verify from here …
 *
 * Uppmätt på optic: en rad i `chat_messages` med `role: 'assistant'` och tom
 * `metadata`, skriven av automationen "Integration Health Check" (cron
 * `30 6 * * *`, skill `check_integrations`). FYRA ORDAGRANT IDENTISKA KOPIOR
 * sedan 2026-08-20 — nio totalt sedan 2026-08-07, var och en i sin egen
 * konversation "Integration health — ÅÅÅÅ-MM-DD", så FlowChats historik fylldes
 * med återvändsgränder.
 *
 * Två fel, och det andra är det djupa:
 *   1. Ett övervakningsresultat maskerade sig som ett SAMTALSDRAG. Ingenting i
 *      raden sade annat, så den läste som assistentens sista ord och ytan såg
 *      ut att vänta på användaren.
 *   2. Ett chattmeddelande är oföränderligt och permanent. Ett tillstånd är
 *      rörligt och upphör. Lägger man det rörliga i det oföränderliga kan det
 *      ALDRIG LÖSAS — bara begravas. Därför gick INGEN AV DE NIO ATT KVITTERA.
 *
 * Och det gjorde larmet värdelöst: samma text fyra dagar i rad blir TAPET. Att
 * dagsbrevet aldrig loggades upptäcktes först när ägaren frågade — inte för att
 * larmet var otydligt, utan för att ingen läste det längre.
 *
 * De två spärrarna nedan pinnar precis de två sakerna:
 *   A. en hälsokontroll kan inte skriva ett `role: 'assistant'`-meddelande
 *   B. en OFÖRÄNDRAD status skapar ingen notis
 *
 * B är den som håller larmet läsbart. En spärr som bara provade A hade
 * godkänt en kontroll som skrek varje morgon på en annan yta.
 */
describe('en mätning är inget samtalsdrag', () => {
  /**
   * Koden utan kommentarer. Docstringarna i de här filerna BERÄTTAR förloppet
   * och citerar därför både `chat_messages` och rollen den skrev — det är
   * husstil och ska inte behöva skrivas om för att blidka en spärr. Spärren
   * ska mäta vad koden GÖR. Block-kommentarer faller helt; radkommentarer bara
   * när de står först på raden, så att `https://…` i en import överlever.
   */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  const handler = stripComments(read('supabase/functions/_shared/handlers/check-integrations.ts'));
  const state = stripComments(
    read('supabase/functions/_shared/handlers/integration-health-state.ts'),
  );

  it('A: hälsokontrollen skriver inte i chatten alls', () => {
    for (const [name, src] of [
      ['check-integrations.ts', handler],
      ['integration-health-state.ts', state],
    ] as const) {
      expect(
        src,
        `${name} rör chat_messages. En mätning är inget samtalsdrag — den hör ` +
          'hemma i tillståndet (site_settings.integration_health) och, bara vid ' +
          'övergång, i en kvitterbar notis.',
      ).not.toMatch(/chat_messages/);
      expect(
        src,
        `${name} rör chat_conversations. Nio döda konversationer på optic kom ` +
          'ur exakt den raden.',
      ).not.toMatch(/chat_conversations/);
      expect(
        src,
        `${name} skriver role: 'assistant'. Det är det som fick övervakningen ` +
          'att läsa som assistentens sista ord.',
      ).not.toMatch(/role:\s*['"]assistant['"]/);
    }
  });

  it('A: svepet skriver i stället tillståndet', () => {
    expect(handler).toMatch(/recordIntegrationHealth\(/);
    expect(state).toMatch(/INTEGRATION_HEALTH_KEY = 'integration_health'/);
    // Tillståndet ersätter sig självt — en rad, inte en logg.
    expect(state).toMatch(/\.upsert\(\s*\{\s*key: INTEGRATION_HEALTH_KEY/);
  });

  it('A: notisen går att kvittera — det är hela skillnaden mot ett chattmeddelande', () => {
    const migrations = readdirSync(join(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => read(join('supabase/migrations', f)))
      .join('\n');
    expect(
      migrations,
      'Ingen migration definierar acknowledge_integration_health. En notis som ' +
        'inte går att stänga är ett chattmeddelande med extra steg.',
    ).toMatch(/FUNCTION public\.acknowledge_integration_health/);
  });

  it('A: tillståndsnyckeln är INTE anon-läsbar', () => {
    // Proberna namnger saknade secrets och interna URL:er. Nyckeln får aldrig
    // hamna i tillåtlistan i 20260823120000_c6d7e8f9.
    const allowlistSql = read(
      'supabase/migrations/20260823120000_c6d7e8f9-nyckelknippan-lag-i-skyltfonstret.sql',
    );
    const policy = allowlistSql.match(
      /CREATE\s+POLICY\s+"Public site config is readable"[\s\S]*?;/i,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy).not.toMatch(/'integration_health'/);
  });
});

/**
 * B, som beteende. Övergångarna som ska ge en notis är exakt tre:
 * friskt→felande, ett NYTT fel, och felande→friskt. Allt annat är tyst.
 */
describe('bara en övergång är en nyhet', () => {
  const at = (n: number) => `2026-08-2${n}T06:30:00.000Z`;
  let seq = 0;
  const id = () => `notice-${++seq}`;

  const probe = (failing: string[]) => ({
    healthy: failing.length === 0,
    summary: `${failing.length} failing`,
    failing,
    unused: [] as string[],
    integrations: failing.map((name) => ({ name, status: 'fail', detail: 'x' })),
  });

  async function next(prev: unknown, failing: string[], day: number) {
    const { nextIntegrationHealthState } = await import(
      '../../../supabase/functions/_shared/handlers/integration-health-state.ts'
    );
    return nextIntegrationHealthState(prev as never, probe(failing), at(day), 'automation', id);
  }

  it('friskt → felande ger en notis', async () => {
    const healthy = await next(null, [], 0);
    expect(healthy.notices).toHaveLength(0);
    const broke = await next(healthy, ['resend'], 1);
    expect(broke.notices).toHaveLength(1);
    expect(broke.notices[0].kind).toBe('degraded');
    expect(broke.notices[0].acknowledged_at).toBeNull();
  });

  it('B: "fortfarande felande, tredje dagen" ger INGEN ny notis', async () => {
    let s = await next(null, [], 0);
    s = await next(s, ['resend'], 1); // övergången
    const afterFirst = s.notices.length;
    s = await next(s, ['resend'], 2); // dag två — samma sanning
    s = await next(s, ['resend'], 3); // dag tre — samma sanning
    expect(
      s.notices.length,
      'Fyra ordagrant identiska kopior är precis det förlopp den här spärren ' +
        'finns för. Ett oförändrat tillstånd är ingen nyhet.',
    ).toBe(afterFirst);
    // Men tillståndet självt är färskt — ytan ska vara aktuell, inte tyst.
    expect(s.checked_at).toBe(at(3));
    expect(s.failing).toEqual(['resend']);
    // Och den minns sedan när, så "tredje dagen" går att säga utan en logg.
    expect(s.failing_since.resend).toBe(at(1));
  });

  it('ett NYTT fel ovanpå ett gammalt ger en notis om just det nya', async () => {
    let s = await next(null, ['resend'], 1);
    const before = s.notices.length;
    s = await next(s, ['resend', 'searxng'], 2);
    expect(s.notices.length).toBe(before + 1);
    expect(s.notices[0].kind).toBe('new_failure');
    expect(s.notices[0].integrations).toEqual(['searxng']);
    // Det gamla felets ålder överlever — det nya får sin egen.
    expect(s.failing_since.resend).toBe(at(1));
    expect(s.failing_since.searxng).toBe(at(2));
  });

  it('felande → friskt ger en notis (att något läkte är också en nyhet)', async () => {
    let s = await next(null, ['resend'], 1);
    s = await next(s, [], 2);
    expect(s.notices[0].kind).toBe('recovered');
    expect(s.healthy).toBe(true);
    expect(s.failing_since).toEqual({});
  });

  it('DELVIS läkning är tyst — den lämnar dig fortfarande felande', async () => {
    let s = await next(null, ['resend', 'searxng'], 1);
    const before = s.notices.length;
    s = await next(s, ['resend'], 2);
    expect(s.notices.length).toBe(before);
    expect(s.failing).toEqual(['resend']);
  });

  it('en kvitterad notis kommer inte tillbaka av nästa svep', async () => {
    let s = await next(null, ['resend'], 1);
    s = {
      ...s,
      notices: s.notices.map((n) => ({ ...n, acknowledged_at: at(1) })),
    };
    s = await next(s, ['resend'], 2);
    expect(s.notices.every((n) => n.acknowledged_at)).toBe(true);
  });
});

/**
 * Och samma sak hela vägen genom den riktiga handlern, mot en attrapp som
 * FAKTISKT lagrar det som skrivs. Den rena funktionen kan vara rätt medan
 * kopplingen är fel — det var kopplingen som var fel förra gången.
 */
describe('svepet kört två gånger i rad', () => {
  /** Kedjebar attrapp med minne: upsert skriver, maybeSingle läser tillbaka. */
  function statefulSupabase(rows: Record<string, unknown>) {
    return {
      from(table: string) {
        let wantedKey: string | null = null;
        const chain: Record<string, unknown> = {};
        Object.assign(chain, {
          select: () => chain,
          eq: (col: string, val: string) => {
            if (table === 'site_settings' && col === 'key') wantedKey = val;
            return chain;
          },
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: [] }),
          maybeSingle: async () =>
            wantedKey !== null && rows[wantedKey] !== undefined
              ? { data: { value: rows[wantedKey] } }
              : { data: null },
          upsert: async (row: { key: string; value: unknown }) => {
            rows[row.key] = row.value;
            return { error: null };
          },
        });
        return chain;
      },
    };
  }

  it('första svepet ger en notis, andra svepet ger ingen — och returformen är orörd', async () => {
    const { executeCheckIntegrations } = await import(
      '../../../supabase/functions/_shared/handlers/check-integrations.ts'
    );
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })));

    const rows: Record<string, unknown> = {
      integrations: { searxng: { config: { url: 'https://search.example' } } },
      system_ai: { provider: 'openai' },
    };
    const db = statefulSupabase(rows) as never;

    const first = await executeCheckIntegrations(db, { source: 'automation' });
    // Punkt 3: skillen är agentyta — den returnerar fortfarande hela svaret.
    expect(first.failing).toEqual(['searxng']);
    expect(first.healthy).toBe(false);
    expect(first).toHaveProperty('unused');
    expect(first).toHaveProperty('integrations');

    const afterFirst = rows.integration_health as { notices: unknown[]; source: string };
    expect(afterFirst.notices).toHaveLength(1);
    expect(afterFirst.source).toBe('automation');

    await executeCheckIntegrations(db, { source: 'automation' });
    const afterSecond = rows.integration_health as { notices: unknown[] };
    expect(
      afterSecond.notices,
      'Andra morgonen med samma fel skapade en andra notis — det är precis så ' +
        'de fyra identiska kopiorna uppstod.',
    ).toHaveLength(1);
  });
});
