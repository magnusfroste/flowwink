import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  executeInspectRenderedPage,
  type RenderedPageReport,
} from '../../../supabase/functions/_shared/handlers/inspect-rendered-page';
import { FOLDED_ALIASES } from '../../../supabase/functions/_shared/normalize-blocks';

/**
 * VARFÖR DEN HÄR SPÄRREN FINNS
 *
 * Agenten bygger blint. Den skriver block och ser aldrig hur de blev.
 *
 * Det verkliga felet (optic, sidan /agentic, 2026-08-22): FlowWork bad
 * FlowPilot bygga en sida. Agenten skrev ett hero-block med fälten
 * `primary_cta`, `secondary_cta` och `subheadline`. HeroBlock.tsx läser
 * `primaryButton`, `secondaryButton` och `subtitle`. Alla tre nycklarna
 * sparades utan protest — content_json är JSON och tar emot vad som helst —
 * och renderades av ingenting. Sidan blev tunn, en tredjedel av innehållet
 * låg i databasen och syntes aldrig, och agenten rapporterade den klar.
 *
 * Tre ställen där verkligheten kunde ha talat, tystnad i alla tre. Det är
 * inte ett kunskapsproblem utan ett SINNESproblem: agenten saknar syn på sitt
 * eget resultat. `describe_blocks` svarar på "vad kan jag bygga";
 * `inspect_rendered_page` svarar på "vad blev det".
 *
 * Testerna nedan pinnar exakt det verkliga fallet — hero med primary_cta —
 * plus de två övriga fynden sensorn ska bära (visuellt tomma block och
 * sidans komposition). Negativtestet pinnar den dyraste möjliga regressionen:
 * en sensor som skriker på korrekt skrivna block lär agenten radera bra
 * innehåll, och är värre än ingen sensor alls.
 *
 * Fältkatalogen är INTE kopierad hit. Sensorn läser BLOCK_CREATION_TOOLS och
 * BLOCK_CONTRACTS — samma genererade artefakt respektive samma handkurerade
 * minimikontrakt som skrivgrinden i normalize-blocks.ts vägrar ifrån. Två
 * kopior som glider isär är precis den klassen vi städat bort.
 */

/* ------------------------------------------------------------------ *
 * En minimal PostgREST-stubb: bara den kedja handlern faktiskt bygger.
 * ------------------------------------------------------------------ */
function stubSupabase(pages: Array<Record<string, unknown>>) {
  const make = (rows: Array<Record<string, unknown>>) => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    q.select = chain;
    q.is = chain;
    q.eq = (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return q;
    };
    q.order = chain;
    q.limit = (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null });
    return q;
  };
  return { from: () => make([...pages]) } as never;
}

const page = (slug: string, content_json: unknown) => ({
  id: `id-${slug}`,
  slug,
  title: slug,
  status: 'published',
  locale: 'sv',
  content_json,
  updated_at: '2026-08-22T10:00:00Z',
  deleted_at: null,
});

/** Ett korrekt skrivet hero — facit, och grunden för negativtestet. */
const goodHero = {
  type: 'hero',
  data: {
    title: 'Agentic operations',
    subtitle: 'Din webbplats är en konsult.',
    primaryButton: { text: 'Boka demo', url: '/boka' },
    secondaryButton: { text: 'Läs mer', url: '/om' },
    backgroundImage: 'https://example.com/hero.jpg',
  },
};

describe('inspect_rendered_page: fält som skrevs men läses av ingen', () => {
  /**
   * Kärnfyndet. Om det här testet någonsin blir grönt av fel skäl (t.ex. att
   * primary_cta blir ett giltigt fältnamn) ska det bytas ut, inte tas bort —
   * frågan "vad skrev jag som ingenting läser" måste fortsätta ha ett svar.
   */
  it('hittar exakt /agentic-fallet: primary_cta, secondary_cta, subheadline på ett hero', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('agentic', [
          {
            type: 'hero',
            data: {
              title: 'Agentic operations',
              subheadline: 'Din webbplats är en konsult.',
              primary_cta: { text: 'Boka demo', url: '/boka' },
              secondary_cta: { text: 'Läs mer', url: '/om' },
            },
          },
        ]),
      ]),
      { slug: 'agentic' },
    ) as RenderedPageReport;

    expect(res.status).toBe('success');
    expect(res.verdict).toBe('needs_attention');

    const found = (res.unread_fields as Array<{ field: string }>).map((f) => f.field).sort();
    expect(
      found,
      'sensorn måste namnge varje fält som lagrades men inte renderas — '
        + 'tystnaden här ÄR defekten den byggdes för',
    ).toEqual(['primary_cta', 'secondary_cta', 'subheadline']);

    // Rätt namn tillbaka där katalogen kan peka ut det. Utan namnet är
    // fyndet en gåta; med namnet är det en instruktion.
    const byField = Object.fromEntries(
      (res.unread_fields as Array<{ field: string; likely_meant: string | null }>)
        .map((f) => [f.field, f.likely_meant]),
    );
    expect(byField.primary_cta).toBe('primaryButton');
    expect(byField.secondary_cta).toBe('secondaryButton');

    // Innehållet ska följa med, annars vet agenten inte vad som gick förlorat.
    const cta = (res.unread_fields as Array<{ field: string; value_preview: string }>)
      .find((f) => f.field === 'primary_cta')!;
    expect(cta.value_preview).toContain('Boka demo');

    // Sammanfattningen är det enda en modell garanterat läser.
    expect(res.summary).toContain('primary_cta');
  });

  it('flaggar INTE de datadrivna blocken (products/kb-hub) — de hämtar egna rader', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('shop', [goodHero, { type: 'products', data: {} }])]),
      { slug: 'shop' },
    ) as RenderedPageReport;
    expect(res.empty_blocks).toEqual([]);
    expect(res.unread_fields).toEqual([]);
  });
});

describe('inspect_rendered_page: block som blev visuellt tomma', () => {
  /**
   * Skrivgrinden kan inte se det här: varje fältnamn är rättstavat och
   * blocket renderar ändå en tom sektion, för att det innehållsbärande
   * fältet saknas. En tom sektion ser ut som ett fel för besökaren.
   */
  it('ett features-block utan features/items rapporteras som tom sektion med anledning', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('tunn', [goodHero, { type: 'features', data: { title: 'Det vi gör' } }])]),
      { slug: 'tunn' },
    ) as RenderedPageReport;

    const empty = res.empty_blocks as Array<{ block_index: number; block_type: string; missing: string[] }>;
    expect(empty).toHaveLength(1);
    expect(empty[0].block_type).toBe('features');
    expect(empty[0].block_index).toBe(1);
    expect(empty[0].missing.join(' ')).toContain('features');
    expect(res.verdict).toBe('needs_attention');
  });

  it('tom sträng och tom Tiptap-doc räknas som frånvarande — de lagras fint och renderar blankt', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('blank', [
          { type: 'hero', data: { title: '   ' } },
          { type: 'text', data: { content: { type: 'doc', content: [{ type: 'paragraph' }] } } },
        ]),
      ]),
      { slug: 'blank' },
    ) as RenderedPageReport;
    const types = (res.empty_blocks as Array<{ block_type: string }>).map((b) => b.block_type).sort();
    expect(types).toEqual(['hero', 'text']);
  });

  it('en okänd blocktyp renderar ingenting alls och rapporteras som eget fynd', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('x', [{ type: 'faq_section', data: { items: [] } }])]),
      { slug: 'x' },
    ) as RenderedPageReport;
    const unknown = res.unknown_block_types as Array<{ block_type: string; did_you_mean: string[] }>;
    expect(unknown).toHaveLength(1);
    expect(unknown[0].block_type).toBe('faq_section');
    expect(unknown[0].did_you_mean.length).toBeGreaterThan(0);
  });
});

describe('inspect_rendered_page: renderarens egna fältfallbacks', () => {
  /**
   * DET VERKLIGA FALLET, andra halvan.
   *
   * StatsBlock.tsx rad 214 läser `data.stats || (data as any).items`, och
   * TimelineBlock.tsx rad 149–150 läser `data.steps || (data as any).items`
   * respektive `data.variant || (data as any).layout`. Ett lagrat block med
   * `items` RENDERAS alltså — det är inte ett gammalt namn som väntar på
   * städning, det är ett namn renderaren läser.
   *
   * Våra egna mallar levererar exakt den formen: 14 stats-block med `items`,
   * 9 timeline-block med `items` och 4 med `layout`, spridda över 15 av 72
   * sidor i templates/*.json (449 block). Utan folden gav den mallkorpusen
   * 50 falska fynd — 27 "inget läser detta" PLUS 23 "det här blocket renderar
   * en tom sektion" — och 15 sidor fick verdict needs_attention fastän varje
   * sida renderar rätt.
   *
   * Det är den dyraste sortens fel en sensor kan göra: den råder agenten att
   * skriva om eller ta bort innehåll som besökaren ser. En sensor som ljuger
   * är värre än ingen sensor — den lär agenten att förstöra.
   *
   * Folden läser FOLDED_ALIASES ur normalize-blocks via den delade
   * applyRendererFallbacks(); den byggs INTE om här. Två kopior som glider
   * isär är precis det fel sensorn finns för att upptäcka.
   */
  it('stats-block med `items` rapporteras varken som oläst fält eller som tom sektion', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('mall', [
          goodHero,
          { type: 'stats', data: { items: [{ value: '500+', label: 'kunder' }] } },
          { type: 'cta', data: { buttonText: 'Boka', buttonUrl: '/boka' } },
        ]),
      ]),
      { slug: 'mall' },
    ) as RenderedPageReport;

    expect(
      res.unread_fields,
      'StatsBlock läser `data.stats || data.items` — att kalla `items` oläst är '
        + 'ett råd att radera innehåll som syns på sidan',
    ).toEqual([]);
    expect(
      res.empty_blocks,
      'blocket har sina siffror; "renderar en tom sektion" vore lika falskt',
    ).toEqual([]);
    expect(res.verdict).toBe('ok');
    expect(res.summary).toContain('Every written field is read');
  });

  it('timeline-block med `items` och `layout` rapporteras inte heller', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('resa', [
          goodHero,
          { type: 'timeline', data: { items: [{ title: 'Start', description: 'Vi börjar' }], layout: 'horizontal' } },
          { type: 'cta', data: { buttonText: 'Boka', buttonUrl: '/boka' } },
        ]),
      ]),
      { slug: 'resa' },
    ) as RenderedPageReport;
    expect(res.unread_fields).toEqual([]);
    expect(res.empty_blocks).toEqual([]);
    expect(res.verdict).toBe('ok');
  });

  /**
   * Folden får inte trubba av sensorn på just de typer den foldar: ett
   * påhittat fält på ett stats-block ska fortfarande namnges.
   */
  it('folden gör inte stats/timeline blinda för fält som verkligen inte läses', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('halv', [
          { type: 'stats', data: { items: [{ value: '9', label: 'st' }], metrics: [{ value: '3' }] } },
        ]),
      ]),
      { slug: 'halv' },
    ) as RenderedPageReport;
    const found = (res.unread_fields as Array<{ field: string }>).map((f) => f.field);
    expect(found).toEqual(['metrics']);
  });

  /**
   * Skrivvägens ÖVRIGA alias (heading/headline→title, subheadline→subtitle,
   * kuvertet block_type/block_data, hero buttonText→primaryButton …) döper om
   * FÖRE lagringen. Ett värde som ändå ligger kvar under det namnet har aldrig
   * passerat skrivvägen — mallinstall, sidmigrering, rå SQL, återläst backup —
   * och läses av ingenting. Skulle sensorn spela upp dem här blev den blind
   * för exakt /agentic-incidenten den byggdes för.
   */
  it('spelar INTE upp skrivvägens omdöpningar — lagrad `subheadline` är fortfarande osynlig', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('agentic', [
          { type: 'hero', data: { title: 'Rubrik', subheadline: 'Stödrad som ingen renderare läser' } },
        ]),
      ]),
      { slug: 'agentic' },
    ) as RenderedPageReport;
    const found = (res.unread_fields as Array<{ field: string }>).map((f) => f.field);
    expect(found).toEqual(['subheadline']);
    expect(res.verdict).toBe('needs_attention');
  });

  /** En sensor får aldrig ändra det den mäter — folden sker på en kopia. */
  it('muterar inte sidans lagrade content_json', async () => {
    const stored = [{ type: 'stats', data: { items: [{ value: '500+', label: 'kunder' }] } }];
    const before = JSON.stringify(stored);
    await executeInspectRenderedPage(stubSupabase([page('mall', stored)]), { slug: 'mall' });
    expect(
      JSON.stringify(stored),
      'sensorn läser en kopia; en fold som slog igenom på raden vore en tyst skrivning',
    ).toBe(before);
  });

  /**
   * Framtidsspärr: dyker en FJÄRDE renderarfallback upp blir den ett nytt
   * falskt positivt dagen den skeppas. Skanna de publika renderarna och kräv
   * att varje `data.x || (data as any).y` finns i FOLDED_ALIASES.
   */
  it('varje renderarfallback i publika block täcks av FOLDED_ALIASES', () => {
    const root = join(__dirname, '../../..');
    const dir = join(root, 'src/components/public/blocks');
    const pairs = new Set<string>();
    for (const [, vals] of Object.entries(FOLDED_ALIASES)) {
      for (const [from, to] of vals) pairs.add(`${from}->${to}`);
    }
    const re = /data\.([A-Za-z_]+)\s*\|\|\s*\(data as any\)\.([A-Za-z_]+)/g;
    const missing: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(join(dir, file), 'utf-8');
      for (const m of src.matchAll(re)) {
        const [, primary, alias] = m;
        if (!pairs.has(`${alias}->${primary}`)) missing.push(`${file}: ${alias} → ${primary}`);
      }
    }
    expect(
      missing,
      'en renderare som läser ett andra fältnamn måste stå i FOLDED_ALIASES — '
        + 'annars rapporterar sensorn innehåll som syns på sidan som oläst',
    ).toEqual([]);
  });
});

describe('inspect_rendered_page: sidans komposition', () => {
  it('två text-block i rad rapporteras — ingen av de 70 skeppade mallsidorna har det', async () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ord.' }] }] };
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('essa', [
          goodHero,
          { type: 'text', data: { content: doc } },
          { type: 'text', data: { content: doc } },
          { type: 'cta', data: { buttonText: 'Kontakta oss' } },
        ]),
      ]),
      { slug: 'essa' },
    ) as RenderedPageReport;

    const c = res.composition!;
    expect(c.block_count).toBe(4);
    expect(c.text_block_count).toBe(2);
    expect(c.adjacent_repeats).toEqual([{ from_index: 1, type: 'text' }]);
    expect(c.opens_with).toBe('hero');
    expect(c.closes_with).toBe('cta');
    expect((c.notes as string[]).join(' ')).toContain('text');
  });

  it('räknar block som faktiskt bär bild/video/logotyp — "tunn sida" är ett mätbart tillstånd', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('bild', [goodHero, { type: 'cta', data: { buttonText: 'Kör' } }])]),
      { slug: 'bild' },
    ) as RenderedPageReport;
    expect(res.composition!.blocks_with_media).toBe(1);
  });

  it('content_json som inte är en blocklista rapporteras som "renderar ingenting alls"', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('trasig', { blocks: [] })]),
      { slug: 'trasig' },
    ) as RenderedPageReport;
    expect(res.verdict).toBe('needs_attention');
    expect(res.summary).toContain('content_json');
  });
});

describe('inspect_rendered_page: negativtest — sensorn får inte skrika på korrekt arbete', () => {
  /**
   * Den dyraste regressionen är ett falskt positivt: en sensor som kallar ett
   * rätt skrivet fält "oläst" lär agenten skriva om innehåll som redan
   * fungerar. Därför pinnas den rena sidan lika hårt som den trasiga.
   */
  it('en korrekt sida ger noll fynd och verdict ok', async () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ord.' }] }] };
    const res = await executeInspectRenderedPage(
      stubSupabase([
        page('ren', [
          goodHero,
          { type: 'features', data: { features: [{ id: '1', title: 'Ett', description: 'A' }] } },
          { type: 'text', data: { content: doc } },
          { type: 'stats', data: { stats: [{ id: '1', value: '500+', label: 'kunder' }] } },
          { type: 'cta', data: { buttonText: 'Boka', buttonUrl: '/boka' } },
        ]),
      ]),
      { slug: 'ren' },
    ) as RenderedPageReport;

    expect(res.unread_fields).toEqual([]);
    expect(res.empty_blocks).toEqual([]);
    expect(res.unknown_block_types).toEqual([]);
    expect(res.composition!.notes).toEqual([]);
    expect(res.verdict).toBe('ok');
    expect(res.summary).toContain('Every written field is read');
  });

  it('slugg med inledande snedstreck hittar samma sida — "/agentic" är inte en annan sida', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('agentic', [goodHero])]),
      { slug: '/agentic/' },
    ) as RenderedPageReport;
    expect(res.status).toBe('success');
    expect(res.page!.slug).toBe('agentic');
  });

  it('utan page_id eller slug failar den stängt och säger vad som saknas', async () => {
    const res = await executeInspectRenderedPage(stubSupabase([]), {}) as RenderedPageReport;
    expect(res.status).toBe('failed');
    expect(res.error).toContain('page_id or slug');
  });

  it('okänd sida returnerar kända slugs i stället för en tyst tom rapport', async () => {
    const res = await executeInspectRenderedPage(
      stubSupabase([page('start', [goodHero])]),
      { slug: 'finns-inte' },
    ) as RenderedPageReport;
    expect(res.status).toBe('failed');
    expect(res.known_slugs).toContain('start');
  });
});

describe('inspect_rendered_page: hemvist och katalog', () => {
  const root = join(__dirname, '../../..');
  const handler = readFileSync(
    join(root, 'supabase/functions/_shared/handlers/inspect-rendered-page.ts'),
    'utf-8',
  );

  /**
   * Plattformsprimitiv, inte FlowPilot-förmåga: elva moduler rör sidskrivning
   * och konsumenterna är FlowPilots ReAct-loop, FlowWork, externa agenter via
   * MCP-gatewayn och mall-/migreringsvägen. En seed bakom FlowPilot-toggeln
   * hade gjort sensorn osynlig för tre av fyra.
   */
  it('seedas i platform-seeds, aldrig i flowpilot-module', () => {
    const seeds = readFileSync(join(root, 'src/lib/platform-seeds.ts'), 'utf-8');
    expect(
      seeds,
      'inspect_rendered_page måste seedas i src/lib/platform-seeds.ts — '
        + 'samma hem som describe_blocks, vars motsatta halva den är',
    ).toContain('inspect_rendered_page');
    const flowpilot = readFileSync(join(root, 'src/lib/modules/flowpilot-module.ts'), 'utf-8');
    expect(flowpilot).not.toContain('inspect_rendered_page');
  });

  it('agent-execute kan faktiskt köra handlern — en seed utan wire är en död skill', () => {
    const idx = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf-8');
    expect(idx).toContain("internal:inspect_rendered_page");
    expect(idx).toContain('executeInspectRenderedPage');
  });

  /**
   * Fältkatalogen får finnas i EN kopia. Sensorn läser den genererade
   * BLOCK_CREATION_TOOLS och det handkurerade BLOCK_CONTRACTS; skulle någon
   * lägga in en egen lista med fältnamn här driver de två isär inom en månad,
   * och sensorn börjar ljuga åt båda hållen.
   */
  it('bygger ingen andra fältkatalog — läser den genererade artefakten', () => {
    expect(handler).toContain('BLOCK_CREATION_TOOLS');
    expect(handler).toContain('BLOCK_CONTRACTS');
    // Ingen litteral fältnamnslista av typen ['title', 'subtitle', ...].
    expect(handler).not.toMatch(/const\s+\w*FIELDS\w*\s*(:\s*[^=]+)?=\s*\[\s*'/);
  });
});

/**
 * Spärr: locale får inte tyst utesluta en läsning.
 *
 * 2026-08-22, kvällen. FlowWork byggde sidan (efter att ha rättat sig själv två
 * gånger på bouncar — loopen fungerade) och bad sedan sensorn granska den:
 *
 *     { slug: "agentic-mt4unduy", locale: "sv-SE" }
 *
 * Raden är lagrad som locale "en" trots att innehållet är svenskt. Filtret
 * uteslöt den och svaret blev `No page found for slug "agentic-mt4unduy"` —
 * medan `known_slugs` i SAMMA svar gladeligen räknade upp just den slugen.
 * Sensorn vi byggde för att avsluta tysta fel misslyckades tyst om sitt eget
 * kriterium.
 *
 * Två regler följer. Detta är en LÄSNING: att vägra titta på sidan callern
 * uppenbart menade, på grund av en metadata-krock, hjälper ingen. Och varje
 * filter som kan förklara ett uteblivet svar måste NAMNGES i felet.
 */
describe('locale utesluter inte en läsning, och filtret döljer sig inte', () => {
  const SRC = readFileSync(
    join(__dirname, '../../../supabase/functions/_shared/handlers/inspect-rendered-page.ts'),
    'utf8',
  );

  it('locale ingår inte i uppslagsfrågan', () => {
    expect(
      SRC,
      'locale filtrerar i själva frågan igen — då försvinner sidan ur svaret ' +
        'i stället för att rapporteras med en not',
    ).not.toMatch(/q\s*=\s*q\.eq\(\s*['"]locale['"]/);
  });

  it('en locale-krock rapporteras som en not, inte som frånvaro', () => {
    expect(SRC, 'ingen locale_note byggs — krocken blir tyst igen').toContain('localeNote');
    expect(SRC, 'noten når aldrig svaret').toContain('locale_note');
  });

  it('"hittar inte" namnger det locale som begärdes', () => {
    // Maskera kommentarer först: filens EGEN docstring citerar det gamla felet
    // ordagrant, och en naiv indexOf träffar prosan i stället för koden. Exakt
    // den fällan lät en migrationstransformation generera skarp SQL ur svensk
    // text tidigare samma dag. Kod är kod; kommentarer är text som ser ut som kod.
    const code = SRC
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
    const i = code.indexOf('No page found for');
    expect(i, 'felmeddelandet är borta').toBeGreaterThan(-1);
    expect(
      code.slice(i, i + 400),
      'felet nämner inte att ett locale begärdes — samma tystnad som orsakade fallet',
    ).toContain('locale');
  });
});

