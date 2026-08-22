import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preflightBlockArgs } from '../../../supabase/functions/_shared/normalize-blocks';

/**
 * Spärr: blockbouncen ligger FÖRE godkännandekortet, inte efter.
 *
 * Verifierat förlopp (FlowWork, 2026-08-22). En admin bad FlowWork skapa en
 * sida. Modellen anropade manage_page action=create med block som hade fel
 * fältnamn. Vad som hände, i ordning:
 *
 *   1. workspace-chats preflight kollade skillens TOPPNIVÅ-required
 *      (action, title) — båda fanns, anropet släpptes igenom.
 *   2. Operationen STAGEADES som en pending_operation. Admin fick ett snyggt
 *      godkännandekort.
 *   3. Admin godkände.
 *   4. FÖRST DÅ kördes agent-execute, som validerar blockens NÄSTLADE innehåll
 *      (_shared/normalize-blocks.ts) och vägrade fail-closed:
 *      'Block validation dropped 2 block(s): "hero" block: missing required
 *       field [title]; … Fix the named fields and retry — nothing was written.'
 *   5. Felet nådde en människa, EFTER godkännandet. Modellen hade redan lämnat
 *      loopen.
 *
 * Kärnan: felmeddelandet är skrivet för att vara SJÄLVRÄTTANDE ("Fix the named
 * fields and retry"), och i FlowPilots ReAct-loop fungerar det — där kommer
 * refusalen tillbaka som tool-result och modellen rättar sig nästa varv.
 * Godkännandegrinden bryter den återkopplingen: när felet uppstår är modellen
 * borta, och felet landar på människan som just godkände en dödsdömd skrivning.
 *
 * Fixen är inte ett bättre felmeddelande utan en flyttad grind: samma kontrakt,
 * samma anropsordning, körd innan något stageas — och importerad från samma fil
 * som exekutorn använder, aldrig omskriven bredvid grinden. Två kopior av ett
 * kontrakt är två kontrakt, och det är den drift-klassen den här kodbasen redan
 * har blött för.
 *
 * Testerna nedan pinnar tre saker:
 *   A. Spärren SÄGER IFRÅN om ett block som exekutorn skulle vägra.
 *   B. Spärren TIGER om ett block som skulle ha klarat sig — den kör på den
 *      NORMALISERADE formen, precis som exekutorn, annars bouncar den råtext
 *      som normaliseraren hade räddat.
 *   C. Anropet ligger före stageningen i workspace-chat (textkoppling — filen
 *      körs i Deno och kan inte importeras härifrån).
 */

const WORKSPACE_CHAT = join(
  __dirname,
  '../../../supabase/functions/workspace-chat/index.ts',
);

const heroWithoutTitle = {
  id: 'b1',
  type: 'hero',
  data: { subtitle: 'Vi bygger saker', primaryButton: { text: 'Kontakt', url: '/kontakt' } },
};

const heroWithTitle = {
  id: 'b1',
  type: 'hero',
  data: { title: 'Nordbrygg', subtitle: 'Vi bygger saker' },
};

describe('A. blockbouncen fångar det exekutorn skulle vägra', () => {
  it('manage_page create: hero utan title bouncas, med faltet utpekat', () => {
    const result = preflightBlockArgs('manage_page', {
      action: 'create',
      title: 'Om oss',
      blocks: [heroWithTitle, heroWithoutTitle],
    });
    expect(result.checked).toBe(true);
    expect(
      result.errors.length,
      'Spärren släppte igenom ett hero-block utan title. Exakt det anropet ' +
        'stageades, godkändes av en människa och dog sedan i agent-execute — ' +
        'felet måste tillbaka till MODELLEN medan den fortfarande är i loopen.',
    ).toBeGreaterThan(0);
    const joined = result.errors.join(' ');
    expect(joined).toContain('hero');
    expect(joined).toContain('title');
  });

  it('content_json räknas som blocks — det är namnet `get` returnerar', () => {
    const result = preflightBlockArgs('manage_page', {
      action: 'update',
      page_id: '11111111-1111-1111-1111-111111111111',
      content_json: [heroWithoutTitle],
    });
    expect(result.checked).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('create_page_block batch: ett trasigt block racker for att bounca hela anropet', () => {
    const result = preflightBlockArgs('create_page_block', {
      page_id: '11111111-1111-1111-1111-111111111111',
      blocks: [
        { type: 'hero', data: { title: 'OK' } },
        { type: 'hero', data: { subtitle: 'saknar title' } },
      ],
    });
    expect(result.checked).toBe(true);
    expect(result.errors.join(' ')).toContain('title');
  });

  it('create_page_block enkelläge och manage_page_blocks add går genom samma grind', () => {
    const single = preflightBlockArgs('create_page_block', {
      page_id: '11111111-1111-1111-1111-111111111111',
      block_type: 'hero',
      block_data: { subtitle: 'saknar title' },
    });
    expect(single.errors.length).toBeGreaterThan(0);

    const add = preflightBlockArgs('manage_page_blocks', {
      action: 'add',
      page_id: '11111111-1111-1111-1111-111111111111',
      block_type: 'hero',
      block_data: { subtitle: 'saknar title' },
    });
    expect(add.errors.length).toBeGreaterThan(0);
  });

  it('påhittad blocktyp bouncas också — den skulle sparats och renderat ingenting', () => {
    const result = preflightBlockArgs('manage_page_blocks', {
      action: 'add',
      page_id: '11111111-1111-1111-1111-111111111111',
      block_type: 'call_to_action',
      block_data: { title: 'X', buttonText: 'Go' },
    });
    expect(result.errors.join(' ')).toContain('call_to_action');
  });
});

describe('B. spärren bouncar inte det som skulle ha klarat sig', () => {
  it('giltiga block passerar tyst', () => {
    const result = preflightBlockArgs('manage_page', {
      action: 'create',
      title: 'Om oss',
      blocks: [heroWithTitle],
    });
    expect(result.checked).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('råsträng i ett Tiptap-fält räddas av normaliseraren — grinden dömer den NORMALISERADE formen', () => {
    // Ordningen är bärande: validering före normalisering vägrar en text vars
    // content är en råsträng, fast exekutorn hade gjort om den till ett
    // Tiptap-dokument och sparat den utan invändning. En spärr som är strängare
    // än exekutorn är inte en spärr, den är en ny bugg.
    const result = preflightBlockArgs('manage_page', {
      action: 'create',
      title: 'Om oss',
      blocks: [{ id: 'b2', type: 'text', data: { content: 'Bara löpande text.' } }],
    });
    expect(
      result.errors,
      'Grinden körde på RÅ form i stället för normaliserad och bouncade ett ' +
        'block exekutorn hade accepterat.',
    ).toEqual([]);
  });

  it('läsande anrop och skills utan block rörs inte', () => {
    expect(preflightBlockArgs('manage_page', { action: 'list' }).checked).toBe(false);
    expect(preflightBlockArgs('manage_page', { action: 'get', slug: 'om-oss' }).checked).toBe(false);
    expect(preflightBlockArgs('manage_contact', { action: 'create', name: 'X' }).checked).toBe(false);
  });

  it('manage_page_blocks update lämnas till exekutorn — den validerar MERGEN mot den lagrade raden', () => {
    // Utan raden vet vi varken blockets typ eller vilka fält som redan finns.
    // Att gissa här vore fail-closed på fel sida: uppdateringar som skulle ha
    // gått igenom skulle bouncas.
    const result = preflightBlockArgs('manage_page_blocks', {
      action: 'update',
      page_id: '11111111-1111-1111-1111-111111111111',
      block_id: '22222222-2222-2222-2222-222222222222',
      block_data: { subtitle: 'bara ett fält' },
    });
    expect(result.checked).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('argumenten muteras inte — kortet och exekutorn ska se det modellen skickade', () => {
    const args = {
      action: 'create',
      title: 'Om oss',
      blocks: [{ id: 'b2', type: 'text', data: { content: 'Bara löpande text.' } }],
    };
    const before = JSON.stringify(args);
    preflightBlockArgs('manage_page', args);
    expect(JSON.stringify(args)).toBe(before);
  });
});

describe('C. bouncen ligger före stageningen i workspace-chat', () => {
  const src = readFileSync(WORKSPACE_CHAT, 'utf8');
  // Kommentarer är text som ser ut som kod — maskera dem innan positioner mäts.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

  it('kontrakten importeras från _shared — de skrivs aldrig om bredvid grinden', () => {
    expect(
      code,
      'workspace-chat validerar inte längre block via _shared/normalize-blocks. ' +
        'Antingen är spärren borta, eller så har någon skrivit en andra kopia ' +
        'av kontrakten — och två kopior av ett kontrakt är två kontrakt.',
    ).toMatch(/import\s*\{[^}]*preflightBlockArgs[^}]*\}\s*from\s*'\.\.\/_shared\/normalize-blocks\.ts'/);
  });

  it('preflightBlockArgs anropas FÖRE anropet mot agent-execute', () => {
    const checkAt = code.indexOf('preflightBlockArgs(name');
    const executeAt = code.indexOf('functions/v1/agent-execute');
    expect(checkAt, 'preflightBlockArgs anropas inte alls i runExecuteSkill.').toBeGreaterThan(-1);
    expect(executeAt).toBeGreaterThan(-1);
    expect(
      checkAt,
      'Blockvalideringen ligger efter (eller i stället för) anropet som stagear ' +
        'operationen. Då är vi tillbaka i förloppet från 2026-08-22: kortet ' +
        'visas, människan godkänner, och FÖRST DÅ upptäcks att blocken är ogiltiga.',
    ).toBeLessThan(executeAt);
  });

  it('bouncen returnerar felet till modellen och stagear ingenting', () => {
    const idx = code.indexOf('preflightBlockArgs(name');
    const window = code.slice(idx, idx + 1600);
    // Ett `return` innan fetch:en = ingenting stageas.
    expect(window).toMatch(/return\s*\{[\s\S]*ok:\s*false/);
    // Felet ska namnge fälten (block_errors) och peka på describe_blocks.
    expect(window).toContain('block_errors');
    expect(
      window,
      'Bouncen pekar inte på describe_blocks — utan den vet modellen inte var ' +
        'de exakta fältnamnen finns och gissar igen.',
    ).toContain('describe_blocks');
  });
});
