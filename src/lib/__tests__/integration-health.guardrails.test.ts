import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
    // source: 'automation' is what makes the handler notify admin FlowChat
    // on failure — without it the sweep would be silent, recreating the
    // original incident with extra steps.
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
