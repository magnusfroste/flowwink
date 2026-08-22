import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeBlockData,
  validateBlockData,
} from '../../../supabase/functions/_shared/normalize-blocks';
import {
  RETIRED_SKILLS,
  retiredSkillResult,
} from '../../../supabase/functions/_shared/skills/retired-skills';
import { pagesModule } from '@/lib/modules/pages-module';

/**
 * `landing_page_compose` byggde sin EGEN AI-pipeline (2026-08-22).
 *
 * Förloppet, verifierat mot en sida den faktiskt skapade på optic: modellen
 * bouncades från `manage_page` på en parameter, föll tillbaka till
 * `landing_page_compose` — och den skillen körde en egen prompt med hårdkodad
 * utdataform, `{hero_headline, hero_sub, cta, sections[]}`, som göts i ett fast
 * skelett: ett hero-block, sections[] i en loop till `type:'text'`, ett cta.
 * Fyra fel i samma kodväg:
 *
 *   1. Den kunde STRUKTURELLT bara producera `text`. Modellen fick aldrig välja
 *      block. Utfallet blev hero + text + text + text + text + cta, medan
 *      husets egna mallar har `text` på 2,9 % av 444 block och aldrig två i rad.
 *   2. `cta_label` — ett påhittat fältnamn, hårdkodat i plattformen. HeroBlock
 *      läser `primaryButton: {text,url}`. Knappen försvann varje gång.
 *   3. `text`-blocken fick `heading`/`body`. `text` kräver `content`.
 *   4. Misslyckades AI-anropet skrevs en stub — "Add your content here." — som
 *      en riktig sida, med bara ett console.warn. Framgång för anroparen.
 *
 * Asymmetrin är pudelns kärna: exakt de fältnamn plattformen VÄGRAR från en
 * agent skrev den själv, i kod, för att den gick förbi normalizeBlocks/
 * validateBlockData. Rättningen var att ta bort skillen — `manage_page` +
 * `describe_blocks` gör jobbet, med validering och namngivna fel — och att
 * lämna en gravsten som PEKAR, eftersom sync-skills disablar men aldrig raderar
 * en borttagen rad.
 *
 * Testerna nedan pinnar: pipelinen är borta, ingen kodväg skriver block förbi
 * grinden, och den försvunna skillen är ingen tyst återvändsgränd.
 */

const EDGE = join(process.cwd(), 'supabase/functions');
const AGENT_EXECUTE = readFileSync(join(EDGE, 'agent-execute/index.ts'), 'utf-8');

/** executePagesAction — allt som skriver pages.content_json bor här. */
const PAGES_REGION = AGENT_EXECUTE.slice(
  AGENT_EXECUTE.indexOf('async function executePagesAction'),
  AGENT_EXECUTE.indexOf('// SEO Maintenance helpers'),
);

describe('landing_page_compose — pipelinen är borta, inte bara avstängd', () => {
  it('agent-execute har ingen case-gren kvar för någon av de två namnen', () => {
    expect(AGENT_EXECUTE).not.toContain("case 'landing_page_compose'");
    expect(AGENT_EXECUTE).not.toContain("case 'generate_site_from_identity'");
  });

  it('den egna prompten och dess hårdkodade utdataform finns inte i koden', () => {
    // Utdataformen VAR pipelinen: så länge de fälten finns i en sträng finns
    // en modell som ombeds svara i ett skelett plattformen sedan gjuter block ur.
    for (const token of ['hero_headline', 'hero_sub', 'Compose a landing page in JSON']) {
      expect(AGENT_EXECUTE, `"${token}" är kvar i agent-execute`).not.toContain(token);
    }
  });

  it('den tysta stubben är borta — ingen skriver "Add your content here"', () => {
    // Dagens dominerande buggklass: ett misslyckat AI-anrop som ser ut som
    // framgång för anroparen. En sida med platshållartext är inte ett svar.
    expect(AGENT_EXECUTE).not.toContain('Add your content here');
    expect(AGENT_EXECUTE).not.toContain('AI compose failed, using stub');
  });

  it('generateShortText används inte längre för att producera BLOCK', () => {
    // Hjälparen lever kvar för generate_meta_description / generate_alt_text —
    // ren text på ett befintligt objekt, inte komposition. Den får inte krypa
    // tillbaka in i sidskrivandet.
    expect(PAGES_REGION).not.toContain('generateShortText');
  });
});

describe('landing_page_compose — ingen kodväg skriver block förbi grinden', () => {
  it('pages-exekutorn skriver content_json bara ur variabler grinden har sett', () => {
    // Populationen pinnas, inte en regel: en NY skrivare ändrar mängden och
    // fäller testet, så författaren måste motivera den här. Det var precis den
    // motiveringen landing_page_compose aldrig behövde ge.
    const written = new Set<string>();
    for (const m of PAGES_REGION.matchAll(/content_json:\s*([^,\n]+)/g)) written.add(m[1].trim());
    for (const m of PAGES_REGION.matchAll(/\.content_json\s*=\s*([^;\n]+)/g)) written.add(m[1].trim());

    /** Varje skrivare, och varför den är säker. */
    const ALLOWED: Record<string, string> = {
      // normalizeBlocks(pageBlocks) körs precis före insert (manage_page create)
      pageBlocks: 'normalizeBlocks körs på arrayen före insert',
      // normalizeBlocks(effectiveBlocks) före update (manage_page update)
      effectiveBlocks: 'normalizeBlocks körs på arrayen före update',
      // manage_page_blocks: det ÄNDRADE blocket går genom normalizeBlockData +
      // validateBlockData; resten av arrayen är redan lagrad och godkänd.
      blocks: 'muterad array — det tillagda/ändrade blocket valideras enskilt',
      existingBlocks: 'batch-läget — varje kandidat normaliseras och valideras enskilt',
      reordered: 'omordning av redan lagrade block — inga nya fält uppstår',
      // Versionshantering flyttar en redan lagrad, redan godkänd array.
      'current.content_json': 'snapshot till page_versions av redan lagrat innehåll',
      'version.content_json': 'rollback av en tidigare lagrad version',
    };

    expect([...written].sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it('varje validateBlockData i skrivytan föregås av en normalizeBlockData', () => {
    // Ordningen är inte kosmetisk: validering före normalisering underkänner
    // alias som normaliseraren hade räddat (se cta_label nedan).
    const order = [...PAGES_REGION.matchAll(/normalizeBlockData|validateBlockData/g)].map((m) => m[0]);
    expect(order.length).toBeGreaterThanOrEqual(6);
    let normalized = 0;
    for (const call of order) {
      if (call === 'normalizeBlockData') normalized++;
      else expect(normalized, 'validateBlockData kördes före all normalizeBlockData').toBeGreaterThan(0);
    }
  });

  it('inget hårdkodat block-fältnamn som renderaren inte läser finns i edge-koden', () => {
    // cta_label var plattformens egen gissning — samma klass av fel vi lagar
    // hos agenter. Den får inte återuppstå någonstans i edge-ytan.
    const offenders: string[] = [];
    for (const file of ['agent-execute/index.ts', 'migrate-page/index.ts', '_shared/normalize-blocks.ts']) {
      const src = readFileSync(join(EDGE, file), 'utf-8');
      // `ctalabel` (nyckeln i aliaskartan) är legitim — den är RÄDDNINGEN.
      if (/\bcta_label\b/.test(src)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe('landing_page_compose — negativtest: vad förbipasseringen kostade', () => {
  it('hero-blocket den faktiskt skrev underkänns av grinden den hoppade över', () => {
    // Ordagrant vad koden gjöt: { title: c.hero_headline, subtitle: c.hero_sub,
    // cta_label: c.cta }. Det sparades, och knappen fanns aldrig på sidan.
    const written = { title: 'Nordbrygg', subtitle: 'Kaffe till kontoret', cta_label: 'Kom igång' };
    const before = structuredClone(written);

    // Normaliseraren först — samma ordning som alla riktiga skrivvägar. Den
    // räddar INTE cta-namnen: husets linje är att de refuseras så modellen
    // lär sig det riktiga namnet i stället för att få det tyst utbytt.
    const block: Record<string, unknown> = { type: 'hero', data: { ...written } };
    normalizeBlockData(block);
    const verdict = validateBlockData('hero', block.data as Record<string, unknown>);

    expect(verdict.valid).toBe(false);
    // Ett självrättande fel: det NAMNGER både det som är fel och det som är rätt.
    const said = `${verdict.errors.join(' ')} ${verdict.hint ?? ''}`;
    expect(said).toContain('cta_label');
    expect(said).toContain('primaryButton');

    // Anroparens objekt är orört — grinden dömer, den skriver inte.
    expect(written).toEqual(before);
  });

  it('det RÄTTADE blocket sparas — och ingenting annat ändrades', () => {
    // Andra halvan av negativtestet: bevisa att grinden släpper igenom rätt
    // form, annars är refusalen ovan bara en vägg med bättre ordval.
    const corrected = {
      title: 'Nordbrygg',
      subtitle: 'Kaffe till kontoret',
      primaryButton: { text: 'Kom igång', url: '/kontakt' },
    };
    const before = structuredClone(corrected);

    const block: Record<string, unknown> = { type: 'hero', data: { ...corrected } };
    normalizeBlockData(block);
    const data = block.data as Record<string, unknown>;

    expect(validateBlockData('hero', data).valid).toBe(true);
    expect(data).toEqual(corrected);
    expect(corrected).toEqual(before);
  });

  it('text-blocken den gjöt i loopen underkänns också — text vill ha content', () => {
    const section = { type: 'text', data: { heading: 'Om oss', body: 'Add your content here.' } };
    const result = validateBlockData('text', { ...section.data });
    expect(result.valid).toBe(false);
    // Felet ska NAMNGE det som saknas, inte bara säga "invalid".
    expect(`${result.errors.join(' ')} ${result.hint ?? ''}`).toContain('content');
  });
});

describe('landing_page_compose — den försvunna skillen är ingen tyst återvändsgränd', () => {
  it('båda namnen är borta ur pages-modulens seeds och skill-lista', () => {
    const seeded = (pagesModule.skillSeeds ?? []).map((s) => s.name);
    expect(pagesModule.skills).not.toContain('landing_page_compose');
    expect(pagesModule.skills).not.toContain('generate_site_from_identity');
    expect(seeded).not.toContain('landing_page_compose');
    expect(seeded).not.toContain('generate_site_from_identity');

    const artifact = JSON.parse(
      readFileSync(join(process.cwd(), 'supabase/seed/module-skills.json'), 'utf-8'),
    ) as { modules: Array<{ skills: Array<{ name: string }> }> };
    const all = artifact.modules.flatMap((m) => m.skills.map((s) => s.name));
    expect(all).not.toContain('landing_page_compose');
    expect(all).not.toContain('generate_site_from_identity');
  });

  it('varje pensionerat namn svarar med en ERSÄTTARE, inte med en vägg', () => {
    for (const name of Object.keys(RETIRED_SKILLS)) {
      const result = retiredSkillResult(name) as Record<string, string>;
      expect(result.error).toContain(name);
      expect(result.use_instead).toBe('manage_page');
      // Vägledningen måste bära den konkreta vägen vidare, inte bara ett namn.
      expect(result.guidance).toContain('describe_blocks');
      expect(result.guidance.length).toBeGreaterThan(120);
    }
    expect(retiredSkillResult('manage_page')).toBeNull();
  });

  it('varje ersättare är en skill som faktiskt finns', () => {
    const artifact = JSON.parse(
      readFileSync(join(process.cwd(), 'supabase/seed/module-skills.json'), 'utf-8'),
    ) as { modules: Array<{ skills: Array<{ name: string }> }> };
    const live = new Set(artifact.modules.flatMap((m) => m.skills.map((s) => s.name)));
    for (const [name, entry] of Object.entries(RETIRED_SKILLS)) {
      expect(live.has(entry.replacement), `${name} → ${entry.replacement} finns inte`).toBe(true);
      expect(live.has(name), `${name} är pensionerad men fortfarande seedad`).toBe(false);
    }
  });

  it('gravstenen svarar HTTP 200 — annars når vägledningen aldrig modellen', () => {
    // reason.ts slänger BODYN på varje icke-2xx svar från agent-execute och
    // rapporterar bara "HTTP <status>". Ett 410 hade kastat bort just det
    // pekfingret gravstenen finns för.
    const reason = readFileSync(join(EDGE, '_shared/pilot/reason.ts'), 'utf-8');
    expect(reason).toContain('failed: HTTP ${response.status}');

    const guard = AGENT_EXECUTE.slice(
      AGENT_EXECUTE.indexOf('const retired = skill_name ? retiredSkillResult'),
      AGENT_EXECUTE.indexOf('// 1. Look up the skill'),
    );
    expect(guard).toContain('status: 200');
  });

  it('gravstenen står FÖRE uppslaget — samma svar synkad som osynkad instans', () => {
    // sync-skills sätter enabled=false, den raderar aldrig. agent-execute
    // filtrerar på enabled=true. Ligger kontrollen efter uppslaget svarar en
    // synkad instans "Skill not found" och en osynkad kör den gamla koden.
    const guardAt = AGENT_EXECUTE.indexOf('retiredSkillResult(String(skill_name))');
    const lookupAt = AGENT_EXECUTE.indexOf("supabase.from('agent_skills').select('*').eq('enabled', true)");
    expect(guardAt).toBeGreaterThan(0);
    expect(lookupAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(lookupAt);
  });
});

/**
 * Andra halvan av samma kväll: modellen bouncades på `manage_page` och BYTTE
 * skill i stället för att rätta sig — det var därför den hamnade i
 * landing_page_compose. `content_json`-fallet är samma fälla men grövre: där
 * har modellen RÄTT. Handlern hedrar `content_json` (alias för blocks) och
 * `version_id` (rollback), skillens egna instructions säger uttryckligen åt
 * modellen att skicka `content_json` — och ingetdera stod i
 * `tool_definition.parameters.properties`. Preflighten avvisade alltså två
 * argument som handlern läser, på skillens egen uppmaning.
 *
 * En bounce är rätt när modellen har fel. Den här bouncade när modellen hade
 * rätt, och en ovaktad väg blev attraktiv för att den bra vägen blev strängare.
 */
/** Bara den bit av tool_definition dessa tester läser. */
type ToolDefinition = {
  function: {
    parameters: {
      required?: string[];
      properties: Record<string, unknown>;
    };
  };
};

describe('pages — schemat får inte dölja ett argument handlern hedrar', () => {
  const PAGES_CASES: Record<string, [string, string]> = {
    manage_page: ["case 'manage_page':", "case 'manage_page_blocks':"],
    manage_page_blocks: ["case 'manage_page_blocks':", "case 'create_page_block':"],
    create_page_block: ["case 'create_page_block':", "case 'generate_meta_description':"],
  };

  /** Varje argumentnamn kodgrenen faktiskt läser ur `args`. */
  function argsReadBy(body: string): Set<string> {
    const names = new Set<string>();
    const marker = '} = args as any';
    for (let i = body.indexOf(marker); i !== -1; i = body.indexOf(marker, i + 1)) {
      let depth = 0;
      let j = i;
      for (; j >= 0; j--) {
        const c = body[j];
        if (c === '}') depth++;
        else if (c === '{') { depth--; if (depth === 0) break; }
      }
      let d = 0;
      let cur = '';
      const parts: string[] = [];
      for (const ch of body.slice(j + 1, i)) {
        if ('{[('.includes(ch)) d++;
        if ('}])'.includes(ch)) d--;
        if (ch === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += ch;
      }
      parts.push(cur);
      for (const p of parts) {
        const n = p.split('=')[0].split(':')[0].trim();
        if (/^[A-Za-z_]\w*$/.test(n)) names.add(n);
      }
    }
    for (const m of body.matchAll(/\(args as any\)\.([A-Za-z_]\w*)/g)) names.add(m[1]);
    for (const m of body.matchAll(/args\[['"]([A-Za-z_]\w*)['"]\]/g)) names.add(m[1]);
    return names;
  }

  const declaredProps = (() => {
    const artifact = JSON.parse(
      readFileSync(join(process.cwd(), 'supabase/seed/module-skills.json'), 'utf-8'),
    ) as { modules: Array<{ skills: Array<{ name: string; tool_definition?: ToolDefinition }> }> };
    const map = new Map<string, Set<string>>();
    for (const m of artifact.modules) {
      for (const s of m.skills) {
        const props = s.tool_definition?.function?.parameters?.properties ?? {};
        map.set(s.name, new Set(Object.keys(props)));
      }
    }
    return map;
  })();

  for (const [skill, [from, to]] of Object.entries(PAGES_CASES)) {
    it(`${skill} deklarerar varje argument den läser`, () => {
      const body = PAGES_REGION.slice(PAGES_REGION.indexOf(from), PAGES_REGION.indexOf(to));
      expect(body.length, `hittade inte case-grenen för ${skill}`).toBeGreaterThan(200);

      const declared = declaredProps.get(skill);
      expect(declared, `${skill} saknas i skills-artefakten`).toBeDefined();

      // `_`-prefix är serverinjicerad plumbing (_caller_email, _company_id) —
      // modellen får aldrig sätta dem, så de ska inte stå i schemat.
      const read = [...argsReadBy(body)].filter((n) => !n.startsWith('_')).sort();
      const hidden = read.filter((n) => !declared!.has(n));
      expect(hidden, `${skill}: handlern läser ${hidden.join(', ')} men schemat döljer dem`).toEqual([]);
    });
  }

  it('create och update löser content_json på SAMMA ställe — de kan inte driva isär', () => {
    // De hade drivit isär: update foldade aliaset, create läste bara `blocks`.
    // En create med content_json — precis den form instruktionerna ber om —
    // skapade därför en TOM sida och svarade "created".
    const manage = PAGES_REGION.slice(
      PAGES_REGION.indexOf("case 'manage_page':"),
      PAGES_REGION.indexOf("case 'manage_page_blocks':"),
    );
    // Aliaset löses en enda gång, före grenarna.
    expect(manage.match(/const effectiveBlocks =/g)).toHaveLength(1);
    const resolvedAt = manage.indexOf('const effectiveBlocks =');
    expect(resolvedAt).toBeLessThan(manage.indexOf("if (action === 'create')"));
    // Och båda skrivgrenarna använder den upplösta variabeln.
    expect(manage).toContain('const pageBlocks = effectiveBlocks || [];');
    expect(manage).toContain('updates.content_json = effectiveBlocks;');
  });

  it('manage_page deklarerar de två namnen dess egna instruktioner ber om', () => {
    const props = declaredProps.get('manage_page')!;
    expect(props.has('content_json')).toBe(true);
    expect(props.has('meta_json')).toBe(true);
    expect(props.has('version_id')).toBe(true);
  });

  it('instruktionerna namnger ingen action som enum:et inte har', () => {
    // "unpublish" stod i instructions i månader utan att finnas i enum:et
    // eller i handlern — samma fälla, andra fältet.
    const seed = (pagesModule.skillSeeds ?? []).find((s) => s.name === 'manage_page')!;
    const params = (seed.tool_definition as ToolDefinition).function.parameters;
    const enumValues = (params.properties.action as { enum: string[] }).enum;
    const instructions = String(seed.instructions ?? '');
    const listed = /One of:\s*([^.\n]+)/.exec(instructions);
    expect(listed, 'instruktionen räknar inte längre upp action-värdena').not.toBeNull();
    const claimed = listed![1].split(',').map((w) => w.trim()).filter(Boolean);
    expect(claimed.length).toBeGreaterThan(3);
    expect(claimed.sort()).toEqual([...enumValues].sort());
  });

  it('create_page_block kräver inget namn som är valfritt i praktiken', () => {
    // page_id ELLER slug, block_type+block_data ELLER blocks[] — antingen-eller
    // som JSON Schema inte kan uttrycka. En required-lista som ändå påstår det
    // bouncar två anrop handlern dokumenterar och hedrar.
    const seed = (pagesModule.skillSeeds ?? []).find((s) => s.name === 'create_page_block')!;
    expect((seed.tool_definition as ToolDefinition).function.parameters.required).toEqual([]);
  });
});
