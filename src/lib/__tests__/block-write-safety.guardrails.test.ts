import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_CONTRACTS,
  KNOWN_BLOCK_TYPES,
  DATA_DRIVEN_BLOCK_TYPES,
  normalizeBlockData,
  normalizeBlocks,
  preflightBlockArgs,
  suggestBlockFields,
  validateBlockData,
} from '../../../supabase/functions/_shared/normalize-blocks';
import { classifyCall, isReadSkill } from '../../../supabase/functions/_shared/skills/read-surface';
import { getImportableBlockTypes } from '@/lib/block-reference';

/**
 * Two QA agents wrote FlowWork pages end-to-end (2026-08-19) and found the
 * block write path forgiving in exactly the wrong places:
 *   (a) an INVENTED block type was written, saved and rendered as nothing;
 *   (b) an unknown FIELD answered "updated" and changed nothing;
 *   (c) validation ran BEFORE normalization, so the raw-string/alias
 *       forgiveness the normalizer offers never got a chance to apply.
 * These tests pin the fixed behaviour: the gate refuses what cannot render,
 * and the normalizer gets first pass at what merely has the wrong name.
 */

describe('block write safety — invented types are refused with suggestions', () => {
  it('rejects a type nothing renders, and names the near misses', () => {
    const result = validateBlockData('call_to_action', { title: 'X', buttonText: 'Go' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('call_to_action');
    // The suggestion is the point: a bare "invalid" leaves the agent guessing.
    expect(result.errors.join(' ')).toContain('"cta"');
    // …and the full type list travels in the hint so a retry can pick blind.
    expect(result.hint).toContain('hero');
    expect(result.hint).toContain('describe_blocks');
  });

  it('suggests the FAQ-shaped blocks for the invented "faq" type', () => {
    const result = validateBlockData('faq', { items: [{ question: 'Q', answer: 'A' }] });
    expect(result.valid).toBe(false);
    const suggested = result.errors.join(' ');
    expect(suggested).toMatch(/accordion|ai-faq/);
  });

  it('accepts every renderable type — data-driven blocks are not "invented"', () => {
    // products/kb-hub/handbook render from the DB and are excluded from AI page
    // IMPORT, but adding one to a page is legitimate. Refusing them would be a
    // regression dressed as a fix.
    for (const type of DATA_DRIVEN_BLOCK_TYPES) {
      const result = validateBlockData(type, {});
      expect(result.valid, `${type} must be writable`).toBe(true);
    }
  });

  it('KNOWN_BLOCK_TYPES stays in sync with block-reference.ts', () => {
    // The Deno-side allowlist is IMPORTABLE_BLOCK_TYPES + the excluded list from
    // getImportableBlockTypes(). If someone edits that exclusion list, this fails.
    const src = readFileSync(join(process.cwd(), 'src/lib/block-reference.ts'), 'utf-8');
    const m = src.match(/const excluded = \[([^\]]+)\]/);
    expect(m, 'excluded list not found in block-reference.ts — update this parser').toBeTruthy();
    const excluded = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect([...DATA_DRIVEN_BLOCK_TYPES].sort()).toEqual([...excluded].sort());
    for (const type of getImportableBlockTypes()) {
      expect(KNOWN_BLOCK_TYPES, `${type} missing from the write gate`).toContain(type);
    }
  });
});

/**
 * Samma spärr, andra skrivvägen (verifierat hål, 2026-08-22).
 *
 * `manage_page` create/update går inte via validateBlockData utan via
 * normalizeBlocks → validateBlockContracts. Där slog kontrollen ned på
 * BLOCK_CONTRACTS, och en typ UTAN post föll rakt igenom loopen och SPARADES.
 * Följden var att plattformen var oense med sig själv i ett och samma anrop:
 *   - "hero" utan `title`  → hela skrivningen vägrades, användaren såg felet.
 *   - "two_column"         → sparades tyst och renderade ingenting.
 * Den andra raden är den farliga: sidan blev "grön" med osynliga hål, och
 * modellen rapporterade en sektion som inte fanns. Skarpt observerat när en
 * modell skickade snake_case-varianterna "two_column" och "sticky_story" —
 * de riktiga typerna heter "two-column" och "sticky-scroll".
 *
 * Testerna nedan pinnar TVÅ saker som är lätta att råka bryta:
 *   1. Okänd typ vägras på manage_page-vägen, med förslag och describe_blocks.
 *   2. "Saknar kontrakt" är INTE "okänd typ" — en legitim blocktyp utan
 *      obligatoriska fält (section-divider, terms, newsletter …) måste
 *      fortfarande gå igenom. En spärr som skjuter dem vore en regression
 *      utklädd till fix.
 */
describe('block write safety — manage_page refuses invented types too', () => {
  it('normalizeBlocks drops the invented type WITH a reason (never silently)', () => {
    const blocks = [
      { id: 'ok', type: 'hero', data: { title: 'Välkommen' } },
      { id: 'bad', type: 'two_column', data: { content: { type: 'doc', content: [] } } },
    ];
    const dropped = normalizeBlocks(blocks);
    // Loud, not silent: agent-execute turns any non-empty reason list into a
    // throw, so a reason here IS the refusal of the whole write.
    expect(dropped.length, 'the invented type was written through').toBe(1);
    expect(dropped[0]).toContain('two_column');
    expect(dropped[0]).toContain('not a block type');
    // The correction has to travel with the refusal, or the retry is a guess.
    expect(dropped[0]).toContain('"two-column"');
    expect(dropped[0]).toContain('describe_blocks');
  });

  it('the snake_case misses from the live incident are both named', () => {
    const blocks = [
      { id: 'a', type: 'sticky_story', data: { chapters: [{ id: 'c1', title: 'T', body: 'B' }] } },
    ];
    const dropped = normalizeBlocks(blocks);
    expect(dropped.length).toBe(1);
    expect(dropped[0]).toContain('"sticky-scroll"');
  });

  it('a block with no type at all is refused, not written as a nameless hole', () => {
    const dropped = normalizeBlocks([{ id: 'x', data: { title: 'T' } }]);
    expect(dropped.length).toBe(1);
    expect(dropped[0]).toContain('type');
  });

  it('"no contract" is not "unknown type" — contract-free real blocks still save', () => {
    // The distinction the fix hangs on. section-divider/terms/newsletter are
    // pure-presentation or self-fetching blocks: rightly no BLOCK_CONTRACTS
    // entry, and rightly writable.
    const contractFree = KNOWN_BLOCK_TYPES.filter((t) => !BLOCK_CONTRACTS[t]);
    expect(contractFree.length, 'no contract-free type left to guard').toBeGreaterThan(0);
    const blocks = contractFree.map((type, i) => ({ id: `b${i}`, type, data: {} }));
    expect(normalizeBlocks(blocks), 'a legitimate contract-free block was refused').toEqual([]);
    expect(blocks.length).toBe(contractFree.length);

    // …and the same for a block that HAS a contract and satisfies it.
    const ok = [{ id: 'd', type: 'section-divider', data: { shape: 'wave' } }];
    expect(normalizeBlocks(ok)).toEqual([]);
  });

  it('both write paths now agree about what a block type is', () => {
    // The bug was the disagreement, not either verdict on its own.
    for (const invented of ['two_column', 'sticky_story', 'hero_section']) {
      expect(validateBlockData(invented, {}).valid, `${invented} passed validateBlockData`).toBe(false);
      expect(
        normalizeBlocks([{ id: 'b', type: invented, data: { title: 'T' } }]).length,
        `${invented} passed the manage_page path`,
      ).toBe(1);
    }
  });

  it('the FlowWork preflight inherits the strictness — bounced BEFORE staging', () => {
    // preflightBlockArgs runs the same normalizeBlocks, so it must bounce the
    // invented type without any change of its own. If it did not, a human would
    // be asked to approve a write that produces invisible holes.
    const result = preflightBlockArgs('manage_page', {
      action: 'create',
      title: 'Om oss',
      blocks: [
        { type: 'hero', data: { title: 'Välkommen' } },
        { type: 'two_column', data: { content: { type: 'doc', content: [] } } },
      ],
    });
    expect(result.checked).toBe(true);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('two_column');
    expect(result.errors[0]).toContain('"two-column"');

    // content_json is the alias `get` hands back — same refusal through it.
    const viaAlias = preflightBlockArgs('manage_page', {
      action: 'update',
      page_id: 'p1',
      content_json: [{ type: 'sticky_story', data: { chapters: [] } }],
    });
    expect(viaAlias.errors.length).toBe(1);
    expect(viaAlias.errors[0]).toContain('sticky_story');
  });

  it('preflight leaves the caller\'s arguments untouched while judging them', () => {
    // The approval card shows these arguments verbatim; normalizeBlocks mutates
    // in place, so the copy is load-bearing.
    const args = {
      action: 'create',
      title: 'Om oss',
      blocks: [{ type: 'two_column', data: { content: 'raw' } }],
    };
    const before = JSON.stringify(args);
    preflightBlockArgs('manage_page', args);
    expect(JSON.stringify(args)).toBe(before);
  });
});

/**
 * Plattformens EGEN vokabulär, använd på fel ställe (skarpt, 2026-08-22 — andra
 * försöket i rad från samma användare).
 *
 * Två syskonskills namnger samma objekt olika:
 *   manage_page        blocks: [{ type, data }]
 *   create_page_block  block_type + block_data
 * Modellen tog manage_pages SKAL och create_page_blocks FÄLTNAMN:
 *   blocks: [ { block_type: 'hero', block_data: { headline, eyebrow, body } }, … ]
 * Utfallet var två defekter i rad:
 *   A) inget alias fanns, så varje block saknade `type`;
 *   B) felet blev `Block validation dropped 7 block(s): "undefined" block: invalid`
 *      ×7 — som varken säger vad som är fel eller hur man rättar det.
 * Ingen av dem är "modellen gissade ett fältnamn". `block_type` är ett namn VI
 * själva publicerat, i samma domän, för samma sak. Att skalen inte accepterar
 * varandras notation är plattformens godtycke, inte anroparens fel.
 *
 * Testerna pinnar båda halvorna, plus den gräns som gör aliaset försvarbart:
 * KUVERTET förlåts, TYPNAMNET gör det inte (`two_column` vägras alltjämt).
 */
describe('block write safety — the sibling skill\'s envelope is not a guess', () => {
  it('the real failing payload now writes — envelope folded, nothing dropped', () => {
    // Verbatim shape from the incident, headline/eyebrow/body and all.
    const blocks: Record<string, unknown>[] = [
      { block_type: 'hero', block_data: { headline: 'Välkommen till Nordbrygg', eyebrow: 'SEDAN 1998', body: 'Vi rostar kaffe.' } },
      { block_type: 'cta', block_data: { title: 'Redo?', buttonText: 'Kontakta oss', buttonUrl: '/kontakt' } },
    ];
    expect(normalizeBlocks(blocks), 'the mixed form is still refused').toEqual([]);

    // Folded to the canonical envelope — and the alias must NOT survive into
    // content_json, or the next read re-teaches the mix.
    expect(blocks[0].type).toBe('hero');
    expect(blocks[1].type).toBe('cta');
    expect(blocks[0]).not.toHaveProperty('block_type');
    expect(blocks[0]).not.toHaveProperty('block_data');
    // …and the per-type field aliases still got their pass afterwards.
    expect((blocks[0].data as Record<string, unknown>).title).toBe('Välkommen till Nordbrygg');
    expect((blocks[0].data as Record<string, unknown>).subtitle).toBe('Vi rostar kaffe.');
  });

  it('halves are never blended — type/data win and block_* is discarded', () => {
    const blocks: Record<string, unknown>[] = [
      { type: 'hero', block_type: 'cta', data: { title: 'Kanonisk' }, block_data: { title: 'Ignorerad' } },
    ];
    expect(normalizeBlocks(blocks)).toEqual([]);
    expect(blocks[0].type).toBe('hero');
    expect((blocks[0].data as Record<string, unknown>).title).toBe('Kanonisk');
    expect(blocks[0]).not.toHaveProperty('block_type');
  });

  it('one half is enough — a block_data-only envelope still resolves', () => {
    const blocks: Record<string, unknown>[] = [
      { type: 'hero', block_data: { title: 'Halvblandat' } },
    ];
    expect(normalizeBlocks(blocks)).toEqual([]);
    expect((blocks[0].data as Record<string, unknown>).title).toBe('Halvblandat');
  });

  it('the envelope tolerance does NOT leak into type names', () => {
    // The whole reason the alias is defensible: `block_type` is our own word,
    // `two_column` is a spelling the platform never published. If forgiving the
    // first ever starts forgiving the second, the fix has become the bug.
    const dropped = normalizeBlocks([
      { block_type: 'two_column', block_data: { content: { type: 'doc', content: [] } } },
    ]);
    expect(dropped.length).toBe(1);
    expect(dropped[0]).toContain('not a block type');
    expect(dropped[0]).toContain('"two-column"');
  });

  it('a block with NO type key at all names the problem and the correct form', () => {
    // Defect B: `"undefined" block: invalid` said neither what broke nor how to
    // fix it. Whatever the wording becomes, these two facts must travel with it.
    const dropped = normalizeBlocks([{ id: 'x', data: { title: 'T' } }]);
    expect(dropped.length).toBe(1);
    expect(dropped[0]).not.toContain('undefined');
    expect(dropped[0]).toContain('{ type, data }');
    expect(dropped[0]).toContain('describe_blocks');
  });

  it('a block with a real type but no data object says so, not "invalid"', () => {
    const dropped = normalizeBlocks([{ id: 'y', type: 'hero' }]);
    expect(dropped.length).toBe(1);
    expect(dropped[0]).not.toMatch(/\binvalid\b/);
    expect(dropped[0]).toContain('hero');
    expect(dropped[0]).toContain('data');
    expect(dropped[0]).toContain('describe_blocks');
  });

  it('FlowWork preflight accepts the mixed form on BOTH page-write skills', () => {
    // The two surfaces must not disagree about which of our own two names is
    // real — that disagreement is the defect, not either verdict on its own.
    const viaManagePage = preflightBlockArgs('manage_page', {
      action: 'create',
      title: 'Om oss',
      blocks: [{ block_type: 'hero', block_data: { headline: 'Hej' } }],
    });
    expect(viaManagePage.checked).toBe(true);
    expect(viaManagePage.errors).toEqual([]);

    const viaCreateBlock = preflightBlockArgs('create_page_block', {
      page_id: 'p1',
      blocks: [{ block_type: 'hero', block_data: { headline: 'Hej' } }],
    });
    expect(viaCreateBlock.checked).toBe(true);
    expect(viaCreateBlock.errors).toEqual([]);
  });

  it('preflight still leaves the mixed-form arguments untouched', () => {
    // The approval card shows these verbatim; the envelope fold mutates in
    // place, so preflight has to keep judging a copy.
    for (const skill of ['manage_page', 'create_page_block'] as const) {
      const args: Record<string, unknown> = skill === 'manage_page'
        ? { action: 'create', title: 'Om oss', blocks: [{ block_type: 'hero', block_data: { headline: 'Hej' } }] }
        : { page_id: 'p1', blocks: [{ block_type: 'hero', block_data: { headline: 'Hej' } }] };
      const before = JSON.stringify(args);
      preflightBlockArgs(skill, args);
      expect(JSON.stringify(args), `${skill} mutated the caller's args`).toBe(before);
    }
  });
});

/**
 * En tredjedel av hjälteblocket kastades TYST (skarpt verifierat 2026-08-22,
 * optic /agentic — sidan skrevs av FlowWork samma dag).
 *
 * Agenten skrev ett hero-block med fälten `primary_cta`, `secondary_cta` och
 * `subheadline`. HeroBlock läser `primaryButton`, `secondaryButton` och
 * `subtitle`. Skrivningen gick igenom, sidan blev "grön", och tre innehåll låg
 * kvar i content_json med ingenting som renderade dem:
 *   subheadline:   "Optic Tunnels bygger den fysiska infrastrukturen …"
 *   primary_cta:   "Utforska möjligheten"
 *   secondary_cta: "Prata med oss"
 * Sidan såg tunn ut. Den var inte tunn — en tredjedel hade kastats.
 *
 * Klassen är exakt densamma som okända TYPER, ett lager ned, och överlevde den
 * fixen med en dag: `validateBlockContracts` (manage_page-vägen) kontrollerade
 * bara att OBLIGATORISKA fält FANNS — aldrig att de fält som SKICKADES finns.
 * Syskonvägen (`validateBlockData`, create_page_block / manage_page_blocks)
 * fail-closade redan. Plattformen var alltså oense med sig själv igen, i samma
 * anrop: `hero` utan title vägrades högljutt medan `primary_cta` sparades tyst.
 *
 * Testerna nedan pinnar tre saker:
 *   1. Det VERKLIGA fallet vägras på manage_page-vägen — högljutt, med rätt
 *      fältnamn i felet (självrättande i loopen, inte en återvändsgränd).
 *   2. `subheadline` RÄDDAS i stället för att vägras (husets linje: alias när
 *      anroparen namngett rätt block men använt plattformens egen synonym —
 *      "strong headline + subheadline + CTA" står i vår egen skill-instruktion),
 *      medan `primary_cta`/`secondary_cta` VÄGRAS: de namnen har plattformen
 *      aldrig publicerat annat än som avskräckande exempel ("not body,
 *      primary_cta or secondary_cta"), och de bär dessutom fel FORM
 *      (primaryButton är { text, url }, inte en sträng).
 *   3. FlowWork-preflighten ärver strängheten utan en rad egen kod, så felet
 *      bouncar FÖRE stageningen och modellen rättar sig i sin egen loop.
 */
describe('block write safety — manage_page refuses unknown FIELDS too', () => {
  /** Blocket precis som det skrevs, ordagrant, på optic /agentic. */
  const agenticHero = () => ({
    id: 'hero-agentic',
    type: 'hero',
    data: {
      title: 'Infrastrukturen bakom agentiska arbetsflöden',
      subheadline: 'Optic Tunnels bygger den fysiska infrastrukturen bakom nästa generations '
        + 'arbetsflöden — dedikerad fiber, privat AI och colocation.',
      primary_cta: 'Utforska möjligheten',
      secondary_cta: 'Prata med oss',
    },
  });

  it('the real /agentic hero is refused — never saved thin and silent', () => {
    const dropped = normalizeBlocks([agenticHero()]);
    expect(dropped.length, 'the block was written with fields nothing renders').toBe(1);
    expect(dropped[0]).toContain('primary_cta');
    expect(dropped[0]).toContain('secondary_cta');
    // Självrättande: felet måste bära det RIKTIGA namnet, annars är nästa försök
    // en ny gissning.
    expect(dropped[0]).toContain('"primaryButton"');
    expect(dropped[0]).toContain('"secondaryButton"');
    // …och hela fältlistan reser med, precis som för okända typer.
    expect(dropped[0]).toContain('subtitle');
    expect(dropped[0]).toContain('unknown field');
  });

  it('subheadline is rescued, the two cta names are not — the house line', () => {
    // Rescued: samma klass som heading/headline→title. Ett block med bara det
    // felnamnet sparas, och innehållet hamnar där renderaren läser det.
    const rescued: Record<string, unknown>[] = [
      { id: 'h', type: 'hero', data: { title: 'Rubrik', subheadline: 'Stödraden' } },
    ];
    expect(normalizeBlocks(rescued), 'subheadline should be forgiven, not refused').toEqual([]);
    expect((rescued[0].data as Record<string, unknown>).subtitle).toBe('Stödraden');
    expect(rescued[0].data).not.toHaveProperty('subheadline');

    // Refused: primary_cta är inget namn plattformen publicerat, och formen
    // stämmer inte heller (primaryButton är { text, url }).
    const refused = normalizeBlocks([
      { id: 'h2', type: 'hero', data: { title: 'Rubrik', primary_cta: 'Utforska' } },
    ]);
    expect(refused.length).toBe(1);
    expect(refused[0]).toContain('primary_cta');
  });

  it('both write paths agree about what a FIELD is', () => {
    // Det var oenigheten som var buggen, inte någon av domarna för sig.
    for (const data of [
      { title: 'T', primary_cta: 'Go' },
      { title: 'T', tagline: 'nope' },
    ]) {
      expect(validateBlockData('hero', { ...data }).valid, 'validateBlockData let it through').toBe(false);
      expect(
        normalizeBlocks([{ id: 'b', type: 'hero', data: { ...data } }]).length,
        'the manage_page path let it through',
      ).toBe(1);
    }
  });

  it('the refusal carries a filled example the model can copy', () => {
    const dropped = normalizeBlocks([agenticHero()]);
    expect(dropped[0]).toContain('primaryButton');
    // BLOCK_HINTS-exemplet visar FORMEN — { text, url } — som namnet ensamt inte gör.
    expect(dropped[0]).toContain('"url"');
  });

  it('the FlowWork preflight inherits it — bounced BEFORE staging', () => {
    // Punkt 5: preflightBlockArgs kör samma normalizeBlocks, så den ska bounca
    // utan en enda rad egen kod. Annars klickar en människa godkänn på en
    // skrivning vars innehåll försvinner, och felet når aldrig modellen.
    const viaPage = preflightBlockArgs('manage_page', {
      action: 'create',
      title: 'Agentic',
      blocks: [agenticHero()],
    });
    expect(viaPage.checked).toBe(true);
    expect(viaPage.errors.length).toBe(1);
    expect(viaPage.errors[0]).toContain('primary_cta');
    expect(viaPage.errors[0]).toContain('"primaryButton"');

    // Samma verdict genom content_json-aliaset (det `get` lämnar tillbaka) …
    const viaAlias = preflightBlockArgs('manage_page', {
      action: 'update',
      page_id: 'p1',
      content_json: [agenticHero()],
    });
    expect(viaAlias.errors.length).toBe(1);

    // … och genom syskonskillen, som redan var sträng.
    const viaBlock = preflightBlockArgs('create_page_block', {
      page_id: 'p1',
      block_type: 'hero',
      block_data: agenticHero().data,
    });
    expect(viaBlock.checked).toBe(true);
    expect(viaBlock.errors.length).toBe(1);
    expect(viaBlock.errors[0]).toContain('primary_cta');
  });

  it('preflight still leaves the caller\'s arguments untouched', () => {
    const args = { action: 'create', title: 'Agentic', blocks: [agenticHero()] };
    const before = JSON.stringify(args);
    preflightBlockArgs('manage_page', args);
    expect(JSON.stringify(args)).toBe(before);
  });

  it('negative test: the corrected block saves, and nothing else changed', () => {
    // Samma innehåll under renderarens egna namn — måste gå rakt igenom, annars
    // är grinden en vägg.
    const fixed: Record<string, unknown>[] = [{
      id: 'hero-agentic',
      type: 'hero',
      data: {
        title: 'Infrastrukturen bakom agentiska arbetsflöden',
        subtitle: 'Optic Tunnels bygger den fysiska infrastrukturen …',
        primaryButton: { text: 'Utforska möjligheten', url: '/kontakt' },
        secondaryButton: { text: 'Prata med oss', url: '/kontakt' },
      },
    }];
    expect(normalizeBlocks(fixed)).toEqual([]);
    expect(fixed.length).toBe(1);

    // Blocktyper utan deklarerad fältlista (de datadrivna) får inte plötsligt
    // vägras — de har ingen creation tool och därmed ingen katalog att mäta mot.
    for (const type of DATA_DRIVEN_BLOCK_TYPES) {
      expect(
        normalizeBlocks([{ id: 'd', type, data: { anything: 'goes', limit: 3 } }]),
        `${type} must stay writable`,
      ).toEqual([]);
    }
  });

  it('a block never loses a field it genuinely HAS to an alias', () => {
    // Latent fälla som fältgrinden hade förvandlat till 12 vägrade block i vår
    // egen flaggskeppsmall: quick-links kallar sin rubrik `heading` (det är
    // fältet QuickLinksBlock läser), men heading→title-aliaset döpte om det
    // ovillkorligt. Aliaset är nu katalogmedvetet: ett fält blocket verkligen
    // har byts aldrig bort, och ett fält blocket saknar byts aldrig in.
    const links: Record<string, unknown>[] = [{
      id: 'q1',
      type: 'quick-links',
      data: { heading: 'Hur kan vi hjälpa dig?', links: [{ id: 'l1', label: 'Kontakt', url: '/kontakt' }] },
    }];
    expect(normalizeBlocks(links), 'a correct quick-links block was refused').toEqual([]);
    expect((links[0].data as Record<string, unknown>).heading).toBe('Hur kan vi hjälpa dig?');
    expect(links[0].data).not.toHaveProperty('title');
  });

  it('renderer-published fallbacks are folded, not refused', () => {
    // StatsBlock läser `data.stats || data.items` och TimelineBlock
    // `data.steps || data.items` / `data.variant || data.layout`. De namnen
    // RENDERAR alltså — och våra egna mallar använder dem. En grind som vägrade
    // dem vore ett falskt nej, och skulle göra varje mallinstallerad sida
    // oändringsbar via manage_page.
    const blocks: Record<string, unknown>[] = [
      { id: 's', type: 'stats', data: { items: [{ value: '99%', label: 'Uptime' }] } },
      { id: 't', type: 'timeline', data: { items: [{ id: 'x', title: 'Start' }], layout: 'vertical' } },
    ];
    expect(normalizeBlocks(blocks)).toEqual([]);
    expect((blocks[0].data as Record<string, unknown>).stats).toHaveLength(1);
    expect(blocks[0].data).not.toHaveProperty('items');
    expect((blocks[1].data as Record<string, unknown>).steps).toHaveLength(1);
    expect((blocks[1].data as Record<string, unknown>).variant).toBe('vertical');
  });

  it('the field suggestion reads the SAME catalogue the gate refuses from', () => {
    // Ingen andra fältkatalog: förslaget kan aldrig namnge ett fält som inte
    // finns för just den typen, och aldrig utebli för ett som gör det.
    expect(suggestBlockFields('hero', 'primary_cta')).toContain('primaryButton');
    expect(suggestBlockFields('hero', 'sub_title')).toEqual(['subtitle']);
    expect(suggestBlockFields('hero', 'background_image')).toContain('backgroundImage');
    // cta-blocket har inget primaryButton — då föreslås dess egna namn i stället.
    expect(suggestBlockFields('cta', 'primary_cta')).toContain('buttonText');
    expect(suggestBlockFields('cta', 'primary_cta')).not.toContain('primaryButton');
    // Okänd typ har ingen katalog → inget förslag, och heller ingen gissning.
    expect(suggestBlockFields('not-a-block', 'whatever')).toEqual([]);
  });
});

describe('block write safety — unknown fields are refused, not silently dropped', () => {
  it('names the offending field AND the valid field list', () => {
    const result = validateBlockData('hero', { title: 'Hello', tagline: 'nope' });
    expect(result.valid).toBe(false);
    const msg = result.errors.join(' ');
    expect(msg).toContain('tagline');
    expect(msg).toContain('unknown field');
    // The reply must carry the vocabulary, or the retry is another guess.
    expect(msg).toContain('subtitle');
    expect(msg).toContain('primaryButton');
  });

  it('internal "_"-prefixed keys are plumbing, not content', () => {
    const result = validateBlockData('hero', { title: 'Hello', _caller_user_id: 'u1' });
    expect(result.valid).toBe(true);
  });

  it('unknownFieldScope limits the check to what the caller sent', () => {
    // The update path merges stored data that may predate this gate. Judging the
    // merge would make such a block permanently un-editable by an agent.
    const merged = { title: 'Hello', legacyField: 'written in 2026-05' };
    expect(validateBlockData('hero', merged).valid).toBe(false);
    expect(
      validateBlockData('hero', merged, { unknownFieldScope: { title: 'New title' } }).valid,
    ).toBe(true);
  });
});

describe('block write safety — normalize runs BEFORE validate', () => {
  it('normalizeBlockData maps the hero aliases agents actually write', () => {
    const block = {
      id: 'b1',
      type: 'hero',
      data: { heading: 'Welcome', body: 'We build things', buttonText: 'Contact', buttonLink: '/contact' },
    };
    normalizeBlockData(block);
    const data = block.data as Record<string, unknown>;
    expect(data.title).toBe('Welcome');
    expect(data.subtitle).toBe('We build things');
    expect(data.primaryButton).toEqual({ text: 'Contact', url: '/contact' });
    // The wrong names must be gone — leaving them re-teaches the mistake and
    // trips the unknown-field gate on the next update.
    expect(data.heading).toBeUndefined();
    expect(data.body).toBeUndefined();
    expect(data.buttonText).toBeUndefined();
    expect(data.buttonLink).toBeUndefined();
  });

  it('a normalized hero passes the gate that its raw form would fail', () => {
    const raw = { heading: 'Welcome', buttonText: 'Contact', buttonLink: '/contact' };
    // Validated raw (the old order) → refused: no title, three unknown fields.
    expect(validateBlockData('hero', { ...raw }).valid).toBe(false);
    // Normalized first (the fixed order) → accepted.
    const block = { id: 'b1', type: 'hero', data: { ...raw } };
    normalizeBlockData(block);
    const result = validateBlockData('hero', block.data as Record<string, unknown>);
    expect(result.valid, result.errors.join('; ')).toBe(true);
  });

  it('text/two-column aliases and raw strings survive the round trip', () => {
    const text = { id: 't1', type: 'text', data: { heading: 'Title', text: 'Just a sentence.' } };
    normalizeBlockData(text);
    const td = text.data as Record<string, unknown>;
    expect(td.title).toBe('Title');
    expect((td.content as { type?: string })?.type).toBe('doc');
    expect(td.text).toBeUndefined();
    expect(validateBlockData('text', td).valid).toBe(true);

    const two = { id: 'c1', type: 'two-column', data: { leftContent: 'Left side', rightContent: 'Right side' } };
    normalizeBlockData(two);
    const cd = two.data as Record<string, unknown>;
    expect((cd.leftColumn as { type?: string })?.type).toBe('doc');
    expect((cd.rightColumn as { type?: string })?.type).toBe('doc');
    expect(cd.leftContent).toBeUndefined();
  });

  it('agent-execute normalizes before it validates on all three write paths', () => {
    const src = readFileSync(join(process.cwd(), 'supabase/functions/agent-execute/index.ts'), 'utf-8');
    const region = src.slice(src.indexOf("case 'manage_page_blocks'"), src.indexOf("case 'generate_meta_description'"));
    // Every validateBlockData call in the block-write region must be preceded by
    // a normalizeBlockData call — the ordering bug was invisible in review.
    const order = [...region.matchAll(/normalizeBlockData|validateBlockData/g)].map((m) => m[0]);
    expect(order.length).toBeGreaterThanOrEqual(6);
    let normalized = 0;
    for (const call of order) {
      if (call === 'normalizeBlockData') normalized++;
      else expect(normalized, 'validateBlockData ran before any normalizeBlockData').toBeGreaterThan(0);
    }
  });
});

describe('block write safety — required names must be writable names', () => {
  /**
   * The trap this pins (found 2026-08-22): BLOCK_CONTRACTS.cta required
   * ['buttonText', 'primaryButtonText', 'buttons'], but block-reference gives
   * the cta only buttonText/buttonUrl. So `primaryButtonText` satisfied the
   * required gate and was then refused by the unknown-FIELD gate — and the
   * required error text handed that unusable name straight to the agent:
   *   '"cta" block must have at least one of: "buttonText" | "primaryButtonText" | "buttons"'
   * An agent that reads the error picks a name that fails again on the retry.
   * `features` carried the same defect with `items`.
   */
  it('every name in every required OR-group is a field the gate accepts', () => {
    for (const [blockType, contract] of Object.entries(BLOCK_CONTRACTS)) {
      for (const group of contract.required) {
        for (const field of group) {
          const result = validateBlockData(blockType, { [field]: 'x' });
          const unknown = result.errors.filter((e) => e.includes('unknown field'));
          expect(
            unknown.join(' '),
            `"${blockType}" requires "${field}", which the unknown-field gate refuses — `
            + 'a caller following the required-field error would fail again on the retry. '
            + 'Either alias it in normalizeBlockData or drop it from the OR-group.',
          ).not.toContain(field);
        }
      }
    }
  });

  it('cta requires buttonText, and says so in one unambiguous name', () => {
    expect(validateBlockData('cta', { buttonText: 'Start' }).valid).toBe(true);

    const missing = validateBlockData('cta', { title: 'No button at all' });
    expect(missing.valid).toBe(false);
    expect(missing.errors[0]).toContain('"buttonText"');
    // The old OR-group leaked names no cta can carry.
    expect(missing.errors.join(' ')).not.toContain('primaryButtonText');
  });

  it('normalizeBlockData maps the cta button aliases to the renderer names', () => {
    const block = {
      id: 'c1',
      type: 'cta',
      data: { title: 'Ready?', primaryButtonText: 'Start', primaryButtonUrl: '/signup' },
    };
    normalizeBlockData(block);
    const data = block.data as Record<string, unknown>;
    expect(data.buttonText).toBe('Start');
    expect(data.buttonUrl).toBe('/signup');
    expect(data.primaryButtonText).toBeUndefined();
    expect(data.primaryButtonUrl).toBeUndefined();
    expect(validateBlockData('cta', data).valid).toBe(true);
  });

  it('a cta buttons[] array fills the two slots CTABlock actually renders', () => {
    const block = {
      id: 'c2',
      type: 'cta',
      data: {
        title: 'Ready?',
        buttons: [
          { text: 'Start', url: '/signup' },
          { label: 'Talk to us', href: '/contact' },
          { text: 'Nowhere to render this', url: '/x' },
        ],
      },
    };
    normalizeBlockData(block);
    const data = block.data as Record<string, unknown>;
    expect(data.buttonText).toBe('Start');
    expect(data.buttonUrl).toBe('/signup');
    expect(data.secondaryButtonText).toBe('Talk to us');
    expect(data.secondaryButtonUrl).toBe('/contact');
    expect(data.buttons).toBeUndefined();
    expect(validateBlockData('cta', data).valid).toBe(true);
  });

  it('a features block written with items keeps its cards', () => {
    const block = {
      id: 'f1',
      type: 'features',
      data: { title: 'What we do', items: [{ id: 'a', title: 'Fast', description: 'Very' }] },
    };
    normalizeBlockData(block);
    const data = block.data as Record<string, unknown>;
    expect((data.features as unknown[])?.length).toBe(1);
    expect(data.items).toBeUndefined();
    expect(validateBlockData('features', data).valid).toBe(true);
  });

  it('a legacy row holding only the old name stays editable after the trim', () => {
    // The update path validates the MERGE of incoming fields into stored data,
    // so trimming the OR-group would strand a pre-gate row that has only
    // primaryButtonText — unless the alias runs first, which is the order
    // agent-execute uses (pinned by the ordering test above).
    const stored = { title: 'Ready?', primaryButtonText: 'Start', primaryButtonUrl: '/signup' };
    const incoming = { title: 'Ready to begin?' };
    const merged = { id: 'c3', type: 'cta', data: { ...stored, ...incoming } };
    normalizeBlockData(merged);
    const result = validateBlockData('cta', merged.data as Record<string, unknown>, {
      unknownFieldScope: incoming,
    });
    expect(result.valid, result.errors.join('; ')).toBe(true);
    expect((merged.data as Record<string, unknown>).buttonText).toBe('Start');
  });
});

describe('block write safety — the schema lookup is reachable from FlowWork', () => {
  it('describe_blocks counts as a read (it returns schema, touches no data)', () => {
    // Without this, an employee's "add a section to the pricing page" had to
    // guess field names: the loop could stage the write but never look up the
    // contract, because describe_* matches no read prefix.
    expect(isReadSkill('describe_blocks')).toBe(true);
    expect(classifyCall('describe_blocks', {})).toBe('read');
  });
});
