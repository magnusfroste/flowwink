import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pagesModule } from '@/lib/modules/pages-module';
import { buildUnknownParameterBounce } from '../../../supabase/functions/_shared/skills/parameter-contract';
import {
  suggestClosestNames,
  suggestEnumValueFix,
} from '../../../supabase/functions/_shared/suggest-names';

/**
 * Spärr: en preflight-bounce på en okänd parameter bär sin egen lösning.
 *
 * Verifierat förlopp, hela orsakskedjan avläst i agent_activity på en
 * live-instans (2026-08-22):
 *
 *   19:40:44  manage_page           failed  → "[preflight-bounce] unknown parameter(s) is_published"
 *   19:41:21  landing_page_compose  success → en sida med fyra rena textblock
 *
 * Modellen skickade `is_published` — en rimlig gissning, för manage_docs_page
 * och manage_kb_article tar faktiskt emot just det namnet. Preflighten hade
 * RÄTT som bouncade: manage_page deklarerar ingen sådan parameter och handlern
 * läser aldrig någon; publicering där är `action: "publish"`.
 *
 * Men meddelandet namngav bara felet, inte fixen: "Not staged: unknown
 * parameter(s) is_published for skill manage_page." Modellen rättade INTE
 * parametern. Trettiosju sekunder senare hade den bytt till en sämre skill och
 * byggt en sämre sida.
 *
 * Lärdomen, och det den här filen pinnar: en vakt på den bra vägen gör den
 * ovaktade vägen mer attraktiv. Ett bouncemeddelande som inte bär sin egen
 * lösning är en återvändsgränd, och en modell i en loop letar då efter en
 * annan dörr i stället för att rätta den parameter den redan håller i.
 *
 * Fixen har samma röst som fältvakten på block ("did you mean …", giltiga
 * fält, rätt struktur) och samma likhetsberäkning — extraherad till
 * _shared/suggest-names.ts, inte kopierad. Två kopior av en matchare är den
 * driftklass den här kodbasen redan har blött för.
 *
 * Förslaget räknas fram ur skillens EGET schema, aldrig ur ett hårdkodat par:
 * inget giltigt parameternamn på manage_page ligger nära `is_published`, men
 * `action`-enumet bär värdet "publish", som är stammen i ordet anroparen
 * använde. Law 1 håller — vilken skill som helst med ett enum får samma hjälp
 * gratis.
 */

const managePage = (pagesModule.skillSeeds ?? []).find((s) => s.name === 'manage_page');
const PARAMS = (managePage?.tool_definition as any)?.function?.parameters;
const PROPS = PARAMS?.properties as Record<string, unknown>;

const WORKSPACE_CHAT = join(__dirname, '../../../supabase/functions/workspace-chat/index.ts');
const NORMALIZE_BLOCKS = join(__dirname, '../../../supabase/functions/_shared/normalize-blocks.ts');

describe('A. faktakollen — var is_published verkligen fel?', () => {
  it('manage_page deklarerar ingen is_published-parameter', () => {
    expect(managePage, 'manage_page saknas i pages-module').toBeTruthy();
    expect(Object.keys(PROPS)).not.toContain('is_published');
  });

  it('publicering uttrycks som action="publish", inte som en flagga', () => {
    // Om detta någon gång slutar gälla är det BOUNCEN som är buggen och ska
    // lagas åt andra hållet — inte meddelandet.
    expect((PROPS.action as any)?.enum).toContain('publish');
  });
});

describe('B. bouncen bär förslag OCH de giltiga namnen', () => {
  const bounce = buildUnknownParameterBounce({
    skillName: 'manage_page',
    unknown: ['is_published'],
    args: { action: 'update', slug: 'om-oss', is_published: true },
    properties: PROPS,
    hasInstructions: true,
  });

  it('namnger den okända parametern', () => {
    expect(bounce.body.error).toContain('is_published');
  });

  it('föreslår den närmaste giltiga vägen — action: "publish"', () => {
    expect(bounce.body.error).toContain('action: "publish"');
    expect(bounce.body.did_you_mean.is_published).toEqual(['action: "publish"']);
  });

  it('listar varje giltigt parameternamn', () => {
    for (const name of Object.keys(PROPS)) {
      expect(bounce.body.valid_parameters).toContain(name);
      expect(bounce.body.error).toContain(name);
    }
  });

  it('säger att skillens instructions finns och kan läsas', () => {
    expect(bounce.body.hint).toContain('read_skill');
    expect(bounce.body.hint).toContain('manage_page');
  });

  it('säger uttryckligen att man inte ska byta skill — det var just det som hände', () => {
    expect(bounce.body.hint).toMatch(/not a dead end/i);
  });

  it('spåret i agent_activity bär förslaget, inte bara felet', () => {
    expect(bounce.summary).toContain('is_published');
    expect(bounce.summary).toContain('action: "publish"');
  });
});

describe('C. negativtest — förslaget hittas på ur schemat, aldrig ur en tabell', () => {
  it('utan action-enumet finns inget att föreslå, och med det tillbaka finns det igen', () => {
    const action = PROPS.action as { enum?: string[] };
    const original = action.enum;
    try {
      delete action.enum;
      expect(suggestEnumValueFix('is_published', PROPS, true)).toEqual([]);
      const blind = buildUnknownParameterBounce({
        skillName: 'manage_page',
        unknown: ['is_published'],
        args: { is_published: true },
        properties: PROPS,
        hasInstructions: true,
      });
      // Utan förslag ska den ändå aldrig tiga om vad som ÄR giltigt.
      expect(blind.body.error).toContain('no declared parameter');
      expect(blind.body.valid_parameters).toEqual(Object.keys(PROPS));
    } finally {
      action.enum = original; // exakt återställning
    }
    expect((PROPS.action as any).enum).toEqual(original);
    expect(suggestEnumValueFix('is_published', PROPS, true))
      .toEqual([{ parameter: 'action', value: 'publish' }]);
  });

  it('is_published:false betyder inte action:"publish" — vakten sätter inga ord i modellens mun', () => {
    expect(suggestEnumValueFix('is_published', PROPS, false)).toEqual([]);
  });

  it('en referensnyckel ger inget enum-förslag (list_id är inte action:"list")', () => {
    const bounce = buildUnknownParameterBounce({
      skillName: 'manage_page',
      unknown: ['list_id'],
      args: { list_id: 'x' },
      properties: PROPS,
      hasInstructions: false,
    });
    expect(bounce.body.did_you_mean.list_id ?? []).not.toContain('action: "list"');
  });

  it('utan instructions utlovas inga — read_skill nämns bara när det finns något att läsa', () => {
    const bounce = buildUnknownParameterBounce({
      skillName: 'manage_page',
      unknown: ['is_published'],
      args: { is_published: true },
      properties: PROPS,
      hasInstructions: false,
    });
    expect(bounce.body.hint).not.toContain('read_skill');
  });
});

describe('D. namnlikheten svarar när enumet inte gör det', () => {
  it('page_title → "title"', () => {
    const bounce = buildUnknownParameterBounce({
      skillName: 'manage_page',
      unknown: ['page_title'],
      args: { page_title: 'Om oss' },
      properties: PROPS,
      hasInstructions: false,
    });
    expect(bounce.body.did_you_mean.page_title?.[0]).toBe('title');
    expect(bounce.body.error).toContain('did you mean "title"');
  });

  it('samma namn i annan skiftläge svarar ensamt', () => {
    expect(suggestClosestNames('Page_ID', ['action', 'page_id', 'slug'])).toEqual(['page_id']);
  });
});

describe('E. en matchare, inte två', () => {
  it('workspace-chat bygger bouncen ur det delade kontraktet', () => {
    const src = readFileSync(WORKSPACE_CHAT, 'utf-8');
    expect(src).toContain("from '../_shared/skills/parameter-contract.ts'");
    expect(src).toContain('buildUnknownParameterBounce(');
    // Den gamla åtgärdslösa formuleringen får inte leva kvar bredvid den nya.
    expect(src).not.toMatch(/unknown parameter\(s\) \$\{unknown\.join\(', '\)\} for skill/);
  });

  it('normalize-blocks har ingen egen kopia av likhetsberäkningen', () => {
    const src = readFileSync(NORMALIZE_BLOCKS, 'utf-8');
    expect(src).toContain("from './suggest-names.ts'");
    expect(src).not.toContain('function normalizeFieldName');
    expect(src).not.toContain('function fieldWords');
  });
});

/**
 * Samma klass, svept på samma yta. Ett svep efter åtgärdslösa bouncar i
 * workspace-chat gav två till — båda på vägen en modell går när den försöker
 * SKRIVA något, alltså precis där en återvändsgränd får den att välja en
 * sämre skill:
 *
 *   1. "Unknown tool: manage_page" — modellen anropar ett SKILL-namn som om
 *      det vore ett verktyg (klassikern på en 3-verktygsyta) och får ingen
 *      korrigering alls. mcp-server svarar redan med available_tools; nu gör
 *      den här ytan det också.
 *   2. Missing-required-bouncen bar en åtgärd men inte pekaren till skillens
 *      eget kontrakt — read_skill nämndes inte, trots att instructions finns.
 *
 * (Filen körs i Deno och kan inte importeras härifrån — textkoppling.)
 */
describe('F. inga åtgärdslösa bouncar kvar i workspace-chat', () => {
  const src = readFileSync(WORKSPACE_CHAT, 'utf-8');

  it('"Unknown tool" listar ytans verktyg och pekar på execute_skill', () => {
    expect(src).toContain('available_tools: DISPATCH_TOOLS.map');
    expect(src).toContain('Skills are not tools here');
    expect(src).toContain('Do not abandon the task over this.');
  });

  it('missing-required-bouncen pekar på instructions när skillen har dem', () => {
    const gate = src.slice(src.indexOf('missing required parameter(s)'));
    expect(gate.slice(0, 2000)).toContain('read_skill({ name:');
    expect(gate.slice(0, 2000)).toContain('do not switch to a different skill');
  });
});
