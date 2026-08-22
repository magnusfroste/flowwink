/**
 * Identitetsblocket projicerade nio fält av fyrtiofyra.
 *
 * FlowWork ombads bygga en landningssida. Texten blev välskriven och helt
 * generisk, byggd av två rena prosablock. Modellen var inte problemet: blocket
 * hade gett den PÅSTÅENDEN — vad vi gör, för vem, vad vi inte påstår — och
 * inget MATERIAL. På den mätta instansen låg 44 fält / 8 380 tecken i
 * site_settings.company_profile, och `about_us` (706 tecken) och
 * `delivered_value` (578 tecken) — den rikaste prosan företaget äger — nådde
 * aldrig prompten. 1 284 tecken av företagets egen berättelse.
 *
 * Och när FlowWork skriver en landningssida är de andra kunskapskällorna
 * AVSLAGNA med flit (en landningssida ska vila på Business Identity, inte på
 * tolv chunks ur den interna wikin). Identiteten är då inte en kontextkälla
 * bland flera — den är hela indatan. En smal identitet gör inte uppgiften
 * sämre, den gör den omöjlig.
 *
 * Samtidigt är identiteten ALLTID-PÅ: varje publik chattur, varje FlowWork-tur,
 * varje varv i en heartbeat som går dygnet runt. Alla 44 fälten vore ett
 * företagsREGISTER, debiterat per tur för evigt.
 *
 * Därav två bredder, satta av ANROPAREN (Law 1: en parameter anropssidan väljer
 * statiskt utifrån vad ytan ÄR, aldrig en gissning ur användarens text). Det
 * här testet pinnar tre saker som annars tyst driver isär igen:
 *   1. att materialet faktiskt emitteras i 'narrative',
 *   2. att tomma fält utelämnas HELT — aldrig som tom rubrik,
 *   3. vilken bredd varje anropare begär, så en skrivande yta som glömmer
 *      opt-in:en faller i CI i stället för att skeppa generisk copy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadBusinessIdentity,
  loadBusinessIdentityBlock,
  IDENTITY_FIELDS,
} from '../../../supabase/functions/_shared/domains/business-identity-block.ts';
import { executeCompanyProfile } from '../../../supabase/functions/_shared/handlers/company-profile.ts';
import {
  normalizeCompanyProfileShapes,
  normalizeNamedItems,
  normalizePrimaryCta,
  normalizeProofPoints,
  normalizeTestimonials,
} from '../company-profile-shapes';
import { defaultProfile } from '../../hooks/useCompanyInsights';

// ─── En fejkad site_settings-läsning ────────────────────────────────────────

function fakeSupabase(rows: Array<{ key: string; value: unknown }>) {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  };
}

function failingSupabase() {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
      }),
    }),
  };
}

/** Profilen som den faktiskt ser ut på en ifylld instans (förkortad prosa). */
const FILLED_PROFILE = {
  company_name: 'Optic Tunnels AB',
  tagline: 'Fiber utan avbrott',
  industry: 'Fiber infrastructure',
  business_purpose: 'Vi finns för att svensk fiber ska sluta grävas av.',
  about_us:
    'Optic Tunnels bygger och underhåller passiv fiberinfrastruktur i Mälardalen sedan 2015. '
    + 'Vi arbetar med kommuner och stadsnät och tar ansvar för hela kedjan från projektering till drift.',
  founded_year: '2015',
  employees: '25',
  value_proposition: 'Passiv fiber som håller i trettio år.',
  delivered_value:
    'Under 2025 levererade vi 412 km kanalisation med 99,98 % tillgänglighet och noll avbrottsviten.',
  icp: 'Kommunala stadsnät och regionala fiberoperatörer i Mellansverige.',
  differentiators: ['Egen projektering', 'Dokumenterad förläggning', 'Jour dygnet runt'],
  services: [
    { id: '1', name: 'Kanalisation', description: 'Schakt, rör och brunnar enligt Robust Fiber.' },
    { id: '2', name: 'Blåsning och svetsning', description: 'Fiberblåsning med dokumenterad OTDR-mätning.' },
  ],
  target_industries: ['Stadsnät', 'Kommun'],
  clients: 'Västerås Stadsnät, Eskilstuna Energi',
  client_testimonials: '"De levererade tre veckor före tidplan." — Västerås Stadsnät',
  claim_stance: 'Beskriv vad vi bygger; tolka aldrig regelverk åt kunden.',
  boundaries: 'Nätvägar, ägarstruktur och namngivna konkurrenter besvaras av en människa.',
  // Företagsregistret — får aldrig ut i någon bredd.
  competitors: 'Eltel, Transtema',
  pricing_notes: 'Timpris 1 150 kr, rabatt över 50 km.',
  revenue: '48 MSEK',
  financial_health: 'God likviditet, ingen belåning.',
  org_number: '556777-1234',
  legal_name: 'Optic Tunnels Aktiebolag',
  board_members: ['A. Andersson'],
  contact_email: 'info@optictunnels.se',
  contact_phone: '+46 21 123 45',
  address: 'Kopparbergsvägen 8, Västerås',
  domain: 'optictunnels.se',
  enrichment_log: [{ source: 'web', timestamp: '2026-01-01', fields_updated: ['about_us'] }],
};

// ─── 1. Materialet når prompten ─────────────────────────────────────────────

describe('den breda projektionen bär materialet, inte bara påståendena', () => {
  it('emitterar about_us och delivered_value — de 1 284 tecken som saknades', async () => {
    const { block } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: FILLED_PROFILE },
    ]), 'narrative');

    expect(block).toContain('Optic Tunnels bygger och underhåller passiv fiberinfrastruktur');
    expect(block).toContain('412 km kanalisation');
  });

  it('bär de konkreta detaljerna en landningssida behöver: syfte, ålder, storlek, proof', async () => {
    const { block, fields } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: FILLED_PROFILE },
    ]), 'narrative');

    for (const key of [
      'business_purpose', 'about_us', 'founded_year', 'employees',
      'delivered_value', 'clients', 'client_testimonials',
    ]) {
      expect(fields).toContain(key);
    }
    expect(block).toContain('Västerås Stadsnät');
    expect(block).toContain('2015');
  });

  it('tar med tjänsternas BESKRIVNINGAR i bred projektion — namnen ensamma är påståenden', async () => {
    const wide = await loadBusinessIdentityBlock(
      fakeSupabase([{ key: 'company_profile', value: FILLED_PROFILE }]), 'narrative');
    const narrow = await loadBusinessIdentityBlock(
      fakeSupabase([{ key: 'company_profile', value: FILLED_PROFILE }]), 'core');

    expect(wide).toContain('Schakt, rör och brunnar enligt Robust Fiber.');
    expect(narrow).toContain('Kanalisation');
    expect(narrow).not.toContain('Schakt, rör och brunnar');
  });

  it('säger åt skribenten att spendera detaljerna men inte hitta på nya', async () => {
    // En generös identitet som bjuder in fabricering byter ett fel mot ett värre.
    const wide = await loadBusinessIdentityBlock(
      fakeSupabase([{ key: 'company_profile', value: FILLED_PROFILE }]), 'narrative');
    expect(wide).toMatch(/never invent a customer, a number, a date or a result/);
  });
});

// ─── 2. Den smala projektionen förblir smal ─────────────────────────────────

describe('den smala projektionen är konstitutionen, inte registret', () => {
  it('bär det en supportsvar inte får motsäga', async () => {
    const { fields } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: FILLED_PROFILE },
    ]), 'core');

    for (const key of [
      'company_name', 'industry', 'value_proposition', 'icp',
      'differentiators', 'services', 'target_industries', 'claim_stance', 'boundaries',
    ]) {
      expect(fields).toContain(key);
    }
  });

  it('utelämnar berättelsen — den kostar per tur på plattformens största yta', async () => {
    const { block, fields } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: FILLED_PROFILE },
    ]), 'core');

    for (const key of ['about_us', 'delivered_value', 'clients', 'client_testimonials']) {
      expect(fields).not.toContain(key);
    }
    expect(block).not.toContain('412 km');
  });

  it('core är default — en yta som glömmer att välja betalar ingenting extra', async () => {
    const explicit = await loadBusinessIdentityBlock(
      fakeSupabase([{ key: 'company_profile', value: FILLED_PROFILE }]), 'core');
    const implicit = await loadBusinessIdentityBlock(
      fakeSupabase([{ key: 'company_profile', value: FILLED_PROFILE }]));
    expect(implicit).toBe(explicit);
  });
});

// ─── 3. Registret läcker aldrig, i någon bredd ──────────────────────────────

describe('företagsregistret är inte identiteten', () => {
  const FORBIDDEN: Array<[string, string]> = [
    // Blocket bär själv en boundaries-regel som pekar ut konkurrenter som
    // off-limits. Att recitera dem varje tur bjuder in exakt det resonemang
    // regeln förbjuder.
    ['competitors', 'Eltel'],
    ['pricing_notes', '1 150 kr'],
    ['revenue', '48 MSEK'],
    ['financial_health', 'God likviditet'],
    ['org_number', '556777-1234'],
    ['legal_name', 'Optic Tunnels Aktiebolag'],
    ['board_members', 'A. Andersson'],
    ['contact_phone', '+46 21 123 45'],
    ['address', 'Kopparbergsvägen'],
    ['contact_email', 'info@optictunnels.se'],
  ];

  for (const depth of ['core', 'narrative'] as const) {
    it(`${depth}: släpper inte igenom register- eller routingfält`, async () => {
      const { block, fields } = await loadBusinessIdentity(fakeSupabase([
        { key: 'company_profile', value: FILLED_PROFILE },
      ]), depth);

      for (const [key, needle] of FORBIDDEN) {
        expect(fields).not.toContain(key);
        expect(block).not.toContain(needle);
      }
    });
  }

  it('är en tillåtlista, inte en förbudslista — update_company_profile mergar VILKEN nyckel som helst', async () => {
    // Profilen är ett öppet objekt: en agent som skickar in en ny nyckel ska
    // inte därmed ha skrivit in sig i varje prompt på instansen.
    const { block } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: { ...FILLED_PROFILE, internal_runbook: 'Rotera nycklarna varje kvartal.' } },
    ]), 'narrative');
    expect(block).not.toContain('Rotera nycklarna');
  });
});

// ─── 4. Tomma fält blir aldrig brus ─────────────────────────────────────────

describe('ett tomt fält utelämnas helt, aldrig som tom rubrik', () => {
  // "Notable customers: " får modellen att dra slutsatsen att företaget saknar
  // kunder och skriva runt ett hål den själv hittat på.
  it('tom sträng, blanksteg och null ger ingen rubrik', async () => {
    const { block, fields } = await loadBusinessIdentity(fakeSupabase([
      {
        key: 'company_profile',
        value: {
          company_name: 'Nordbrygg AB',
          about_us: '',
          delivered_value: '   ',
          clients: null,
          client_testimonials: undefined,
        },
      },
    ]), 'narrative');

    expect(fields).toEqual(['company_name']);
    expect(block).not.toMatch(/:\s*$/m);
    expect(block).not.toContain('Notable customers');
    expect(block).not.toContain('About the company');
  });

  it('den tomma LISTAN utelämnas också — [] är truthy i JS', async () => {
    // Exakt buggen i den gamla koden: `if (cp.differentiators)` var sant för []
    // och emitterade "Differentiators: ".
    const { block, fields } = await loadBusinessIdentity(fakeSupabase([
      {
        key: 'company_profile',
        value: { company_name: 'Nordbrygg AB', differentiators: [], target_industries: [], services: [] },
      },
    ]), 'core');

    expect(fields).toEqual(['company_name']);
    expect(block).not.toContain('Differentiators');
    expect(block).not.toContain('Target industries');
    expect(block).not.toContain('Services');
  });

  it('listor med tomma poster tappar posterna, inte rubriken', async () => {
    const { block } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: { company_name: 'X', differentiators: ['', '  ', 'Egen projektering'] } },
    ]), 'core');
    expect(block).toContain('Differentiators: Egen projektering');
    expect(block).not.toContain('Differentiators: , ');
  });

  it('namnlösa tjänster droppas i stället för att bli tomma rader', async () => {
    const { block } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: { company_name: 'X', services: [{ description: 'utan namn' }, { name: 'Drift' }] } },
    ]), 'narrative');
    expect(block).toContain('Drift');
    expect(block).not.toContain('utan namn');
  });
});

// ─── 5. Den tysta catchen ───────────────────────────────────────────────────

describe('ett fel ger inte tyst tom identitet', () => {
  it('en misslyckad läsning signalerar — ok:false och en markör i prompten', async () => {
    const result = await loadBusinessIdentity(failingSupabase(), 'narrative');

    expect(result.ok).toBe(false);
    expect(result.degraded).toBe(true);
    // Modellen ska veta att den INTE vet vem företaget är — annars svarar den
    // lika självsäkert generiskt som med en tunn profil, oskiljbart utifrån.
    expect(result.block).toContain('UNAVAILABLE');
    expect(result.block).toMatch(/Do not invent company facts/);
  });

  it('en TOM profil är inget fel — en färsk instans har ingen identitet än', async () => {
    const result = await loadBusinessIdentity(fakeSupabase([]), 'narrative');

    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.block).toBe('');
    expect(result.block).not.toContain('UNAVAILABLE');
  });

  it('en profil som BARA bär reglerna tappas inte', async () => {
    // Gamla vakten returnerade '' när det inte fanns några faktarader, och
    // släppte då claim_stance och boundaries på golvet.
    const { block } = await loadBusinessIdentity(fakeSupabase([
      { key: 'company_profile', value: { claim_stance: 'Tolka aldrig regelverk åt kunden.' } },
    ]), 'core');
    expect(block).toContain('Tolka aldrig regelverk åt kunden.');
  });

  it('anroparnas .catch(() => "") kan inte längre svälja felet — det loggas inifrån', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/domains/business-identity-block.ts'),
      'utf-8',
    );
    expect(src).toMatch(/console\.error\('\[business-identity\] settings read FAILED/);
    // Och den yttre catchen får inte återinföras runt hela funktionen: felet
    // ska särskiljas från "ingen profil", inte klumpas ihop med det igen.
    expect(src).not.toMatch(/\}\s*catch\s*\{\s*return '';\s*\}/);
  });
});

// ─── 6. Vem begär vilken bredd ──────────────────────────────────────────────

describe('bredden sätts av anroparen, statiskt per yta (Law 1)', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '../../../supabase/functions/', p), 'utf-8');

  const WRITERS: Array<[string, string]> = [
    // Ytan som ombads bygga landningssidan.
    ['workspace-chat/index.ts', 'FlowWork'],
    // Skapar sidor och block; skrev en bento-grid som pitchade FlowPilot.
    ['agent-operate/index.ts', 'FlowChat-operatören'],
    // content_proposal + social_post.
    ['ai-task/tasks.ts', 'ai-task'],
    // Skriver blogg och kampanjer obevakat, dygnet runt.
    ['flowpilot-heartbeat/index.ts', 'heartbeat'],
  ];

  for (const [file, why] of WRITERS) {
    it(`${why} begär 'narrative' — den skriver utåtriktat`, () => {
      const src = read(file);
      const calls = src.match(/loadBusinessIdentityBlock\(([^)]*)\)/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call).toContain("'narrative'");
    });
  }

  const READERS: Array<[string, string]> = [
    // Plattformens största yta: varje meddelande från varje anonym besökare.
    ['chat-completion/index.ts', 'publika chatten'],
    // Kör en gång per prospect i bulkanrikning.
    ['_shared/handlers/company-distill.ts', 'company-distill'],
  ];

  for (const [file, why] of READERS) {
    it(`${why} begär 'core' — den svarar, den författar inte`, () => {
      const src = read(file);
      const calls = src.match(/loadBusinessIdentityBlock\(([^)]*)\)/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call).toContain("'core'");
    });
  }

  it('heartbeaten skickar identiteten hela vägen in i prompt-kompilatorn', () => {
    // Den fanns i Promise.all men nådde aldrig buildSystemPrompt vore samma
    // tysta klass en gång till.
    const src = read('flowpilot-heartbeat/index.ts');
    expect(src).toMatch(/businessIdentityContext:\s*businessIdentityCtx/);
  });

  it('ingen anropare gissar bredden ur användarens text (Law 1)', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../supabase/functions/_shared/domains/business-identity-block.ts'),
      'utf-8',
    );
    // Inga regexliteraler, ingen nyckelordslista, ingen matchning i modulen.
    expect(src).not.toMatch(/\.test\(|\.match\(|includes\(['"](write|create|landing|page)/);
  });
});

// ─── 7. Vad det kostar ──────────────────────────────────────────────────────

describe('vad de alltid-på ytorna betalar', () => {
  // ~4 tecken per token. Siffrorna är dokumentation lika mycket som grind:
  // core betalas varje tur på varje yta, narrative en gång per artefakt.
  const approxTokens = (s: string) => Math.round(s.length / 4);

  it('core håller sig under ~600 tokens på en fullt ifylld profil', async () => {
    const block = await loadBusinessIdentityBlock(
      fakeSupabase([{ key: 'company_profile', value: FILLED_PROFILE }, { key: 'brand_tone', value: 'saklig, teknisk' }]),
      'core',
    );
    expect(approxTokens(block)).toBeLessThan(600);
  });

  it('narrative kostar mer än core men förblir en identitet, inte ett register', async () => {
    const rows = [{ key: 'company_profile', value: FILLED_PROFILE }, { key: 'brand_tone', value: 'saklig, teknisk' }];
    const core = await loadBusinessIdentityBlock(fakeSupabase(rows), 'core');
    const wide = await loadBusinessIdentityBlock(fakeSupabase(rows), 'narrative');

    expect(approxTokens(wide)).toBeGreaterThan(approxTokens(core));
    // Hela profilen på instansen var 8 380 tecken (~2 100 tokens). Den breda
    // projektionen ska ligga långt under den — annars är det registret igen.
    expect(approxTokens(wide)).toBeLessThan(1400);
  });

  it('varje allowlistat fält har en bredd och en etikett', () => {
    for (const spec of IDENTITY_FIELDS) {
      expect(['core', 'narrative']).toContain(spec.depth);
      expect(spec.label.length).toBeGreaterThan(0);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 8. Formerna materialet hålls i
//
// Att bredda projektionen avslöjade andra halvan: flera fält bar bara HÄLFTEN
// av vad ett block behöver, så en sidbyggande agent fick skriva resten själv.
// Fem hål, samma klass — och botten i varje: tomt går att fylla i, påhittat
// går inte att ta tillbaka.
// ═══════════════════════════════════════════════════════════════════════════

const profileWith = (extra: Record<string, unknown>) =>
  fakeSupabase([{ key: 'company_profile', value: { company_name: 'Optic Tunnels AB', ...extra } }]);

describe('hål 1 — en differentiator bär sin egen förklaring', () => {
  it('tar samma {name, description}-form som services', () => {
    expect(normalizeNamedItems([{ name: 'Egen projektering', description: 'Vi ritar själva' }]))
      .toEqual([{ id: expect.any(String), name: 'Egen projektering', description: 'Vi ritar själva' }]);
  });

  it('migrerar den gamla string[]-formen på läsning — och lämnar beskrivningen TOM', () => {
    // Tomheten är poängen: etiketten överlever, och ingenting hittar på den
    // halva som aldrig skrevs ner.
    const items = normalizeNamedItems(['Egen projektering', 'Jour dygnet runt']);
    expect(items.map((i) => i.name)).toEqual(['Egen projektering', 'Jour dygnet runt']);
    expect(items.every((i) => i.description === '')).toBe(true);
  });

  it('droppar namnlösa poster — de renderas som tomma kort', () => {
    expect(normalizeNamedItems([{ description: 'föräldralös' }])).toEqual([]);
  });

  it('bred projektion bär beskrivningarna, smal bara etiketterna', async () => {
    const rows = { differentiators: [{ name: 'Egen projektering', description: 'Vi ritar själva' }] };
    const wide = await loadBusinessIdentityBlock(profileWith(rows), 'narrative');
    const narrow = await loadBusinessIdentityBlock(profileWith(rows), 'core');

    expect(wide).toContain('Egen projektering — Vi ritar själva');
    expect(narrow).toContain('Egen projektering');
    expect(narrow).not.toContain('Vi ritar själva');
  });

  it('en profil ingen har sparat om går inte mörk — och skriver aldrig [object Object]', async () => {
    const block = await loadBusinessIdentityBlock(profileWith({ differentiators: ['Egen projektering'] }), 'narrative');
    expect(block).toContain('Differentiators: Egen projektering');
    expect(block).not.toContain('[object Object]');
  });
});

describe('hål 2 — ett tal lagras SOM ett tal, aldrig läst tillbaka ur prosa', () => {
  it('bär {value, label, context}', () => {
    expect(normalizeProofPoints([{ value: '99,98 %', label: 'tillgänglighet', context: '2025' }])[0])
      .toMatchObject({ value: '99,98 %', label: 'tillgänglighet', context: '2025' });
  });

  it('delar en naken sträng bara på en LEDANDE siffra', () => {
    expect(normalizeProofPoints(['412 km kanalisation'])[0]).toMatchObject({ value: '412 km', label: 'kanalisation' });
  });

  it('lämnar value TOMT när texten inte börjar med en siffra', () => {
    // Ingen siffra hittas på ur ord; texten förblir en etikett.
    expect(normalizeProofPoints(['marknadsledande'])[0]).toMatchObject({ value: '', label: 'marknadsledande' });
  });

  it('minerar aldrig delivered_value — prosa förblir prosa', async () => {
    const block = await loadBusinessIdentityBlock(
      profileWith({ delivered_value: 'Vi levererade 412 km kanalisation med 99,98 % tillgänglighet.' }),
      'narrative',
    );
    // Prosan når prompten (det var hela poängen med narrative), men den blir
    // aldrig proof points: att befordra en siffra ur en mening är ett beslut
    // mot källan, inte en regex.
    expect(block).toContain('412 km kanalisation');
    expect(block).not.toContain('Proof points');
  });

  it('projicerar figurerna ordagrant, en per rad, och bara i bred projektion', async () => {
    const rows = { proof_points: [{ value: '412 km', label: 'kanalisation byggd', context: 'sedan 2014' }] };
    const wide = await loadBusinessIdentityBlock(profileWith(rows), 'narrative');
    const narrow = await loadBusinessIdentityBlock(profileWith(rows), 'core');

    expect(wide).toContain('412 km kanalisation byggd (sedan 2014)');
    expect(wide).toMatch(/Proof points \(verbatim figures/);
    expect(narrow).not.toContain('412 km');
  });

  it('säger åt skribenten att inte härleda en enda siffra till', async () => {
    const wide = await loadBusinessIdentityBlock(profileWith({ proof_points: [{ value: '412 km', label: 'x' }] }), 'narrative');
    expect(wide).toMatch(/do not derive, round or convert one out of prose/);
  });
});

describe('hål 3 — sidan har en uppmaning', () => {
  it('normaliserar {label, destination, intent}', () => {
    expect(normalizePrimaryCta({ label: 'Boka möte', url: '/kontakt', goal: 'scoping' }))
      .toEqual({ label: 'Boka möte', destination: '/kontakt', intent: 'scoping' });
  });

  it('är null utan etikett — en knapp utan text är ingen knapp', () => {
    expect(normalizePrimaryCta({ destination: '/kontakt' })).toBeNull();
    expect(normalizePrimaryCta('')).toBeNull();
  });

  it('projicerar label → destination (intent) i bred projektion', async () => {
    const rows = { primary_cta: { label: 'Boka möte', destination: '/kontakt', intent: '30 min scoping' } };
    const wide = await loadBusinessIdentityBlock(profileWith(rows), 'narrative');
    const narrow = await loadBusinessIdentityBlock(profileWith(rows), 'core');

    expect(wide).toContain('Primary call to action: Boka möte → /kontakt (30 min scoping)');
    // De alltid-på ytorna ruttar via boundaries och kanalen de redan sitter i.
    expect(narrow).not.toContain('Primary call to action');
  });

  it('en CTA utan etikett blir ingen rubrik alls', async () => {
    const block = await loadBusinessIdentityBlock(profileWith({ primary_cta: { destination: '/kontakt' } }), 'narrative');
    expect(block).not.toContain('Primary call to action');
  });
});

describe('hål 4 — ett omdöme är ett citat MED den som sa det', () => {
  it('migrerar den gamla klumpen till ETT oattribuerat citat', () => {
    const items = normalizeTestimonials('De löste på en vecka vad vi dragit på i ett år.');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quote: 'De löste på en vecka vad vi dragit på i ett år.', author: '', role: '' });
  });

  it('håller attributionen tom hellre än gissad', () => {
    expect(normalizeTestimonials([{ text: 'Bra jobbat', by: 'Anna', position: 'CTO', organization: 'Nordbrygg' }])[0])
      .toMatchObject({ quote: 'Bra jobbat', author: 'Anna', role: 'CTO', company: 'Nordbrygg' });
    expect(normalizeTestimonials([{ author: 'Anna' }])).toEqual([]); // inget citat, inget omdöme
  });

  it('projicerar attributionen — och lånar aldrig ett namn till ett citat som saknar det', async () => {
    const block = await loadBusinessIdentityBlock(profileWith({
      clients: 'Västerås Stadsnät',
      client_testimonials: [
        { quote: 'Tre veckor före tidplan', author: 'Anna Ek', role: 'projektledare', company: 'Västerås Stadsnät' },
        { quote: 'Snabbt och prydligt' },
      ],
    }), 'narrative');

    expect(block).toContain('"Tre veckor före tidplan" — Anna Ek, projektledare, Västerås Stadsnät');
    expect(block).toContain('"Snabbt och prydligt"');
    expect(block).toMatch(/attribute no quote to a person the identity does not name/);
  });

  it('den gamla strängklumpen släpps igenom orörd — den bär ofta sin egen attribution', async () => {
    const block = await loadBusinessIdentityBlock(
      profileWith({ client_testimonials: '"Tre veckor före tidplan." — Västerås Stadsnät' }),
      'narrative',
    );
    expect(block).toContain('"Tre veckor före tidplan." — Västerås Stadsnät');
  });
});

describe('hål 5 — ett fält som når en prompt går att rätta av en människa', () => {
  const page = readFileSync(resolve(__dirname, '../../pages/admin/CompanyInsightsPage.tsx'), 'utf-8');

  it('tagline och business_purpose projiceras', async () => {
    const { block } = await loadBusinessIdentity(profileWith({
      tagline: 'Fiber utan avbrott',
      business_purpose: 'Så att kritisk infrastruktur inte tystnar.',
    }), 'narrative');

    expect(block).toContain('Tagline: Fiber utan avbrott');
    expect(block).toContain('Så att kritisk infrastruktur inte tystnar.');
  });

  it('...och varje projicerat fält är deklarerat på CompanyProfile', () => {
    // Buggklassen: agentskrivet (update_company_profile mergar vilken nyckel
    // som helst), promptläst, men osynligt i typ och UI.
    for (const spec of IDENTITY_FIELDS) {
      expect(Object.keys(defaultProfile)).toContain(spec.key);
    }
  });

  it('...och varje projicerat fält går att redigera på Business Identity-sidan', () => {
    for (const key of [
      'tagline', 'business_purpose', 'proof_points', 'primary_cta',
      'differentiators', 'client_testimonials', 'services',
    ]) {
      expect(page).toContain(`update("${key}"`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Skrivvägen coercar det agenter gissar
// ═══════════════════════════════════════════════════════════════════════════

describe('update_company_profile formar det den tar emot', () => {
  /** site_settings-stub som fångar det som upsertas. */
  function writableDb(current: Record<string, unknown>) {
    const captured: { value?: Record<string, unknown> } = {};
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.upsert = (row: { value: Record<string, unknown> }) => {
      captured.value = row.value;
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve({ data: { value: current } });
    chain.single = () => Promise.resolve({ data: { value: captured.value, updated_at: 'now' } });
    return { db: { from: () => chain } as never, captured };
  }

  const update = async (current: Record<string, unknown>, data: Record<string, unknown>) => {
    const { db, captured } = writableDb(current);
    await executeCompanyProfile(db, { data }, 'update_company_profile');
    return captured.value as Record<string, unknown>;
  };

  it('gissade differentiator-strängar blir den kanoniska formen', async () => {
    expect(await update({}, { differentiators: ['Egen projektering'] })).toMatchObject({
      differentiators: [{ id: expect.any(String), name: 'Egen projektering', description: '' }],
    });
  });

  it('en proof point skickad som naken sträng coercas', async () => {
    expect(await update({}, { proof_points: ['99,98 % tillgänglighet'] })).toMatchObject({
      proof_points: [{ id: expect.any(String), value: '99,98 %', label: 'tillgänglighet', context: '' }],
    });
  });

  it('en etikettlös CTA vägras, och en citatklump behåller sin text', async () => {
    const saved = await update({}, { primary_cta: { destination: '/kontakt' }, client_testimonials: 'Bra jobbat' });
    expect(saved.primary_cta).toBeNull();
    expect(saved.client_testimonials).toEqual([
      { id: expect.any(String), quote: 'Bra jobbat', author: '', role: '', company: '' },
    ]);
  });

  it('rör bara nycklarna som skickas — mergen förblir grund', async () => {
    const saved = await update(
      { icp: 'Stadsnät', services: [{ id: 'x', name: 'Drift', description: '' }] },
      { tagline: 'Fiber utan avbrott' },
    );
    expect(saved.icp).toBe('Stadsnät');
    expect(saved.services).toEqual([{ id: 'x', name: 'Drift', description: '' }]);
    expect(saved.tagline).toBe('Fiber utan avbrott');
  });

  it('normalizeCompanyProfileShapes lämnar frånvarande nycklar frånvarande', () => {
    expect(Object.keys(normalizeCompanyProfileShapes({ tagline: 'x' }))).toEqual(['tagline']);
  });
});

describe('agentytan beskriver formerna den bedöms på', () => {
  const seed = readFileSync(resolve(__dirname, '../modules/company-insights-module.ts'), 'utf-8');

  it('update_company_profile dokumenterar varje strukturerat fält', () => {
    for (const key of ['proof_points', 'primary_cta', 'client_testimonials', 'differentiators']) {
      expect(seed).toContain(`${key}: {`);
    }
  });

  it('säger åt operatören att tomt slår påhittat', () => {
    expect(seed).toMatch(/Never fill an attribution or a figure you cannot source/);
  });
});
