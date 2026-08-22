import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  KNOWN_BLOCK_TYPES,
  DATA_DRIVEN_BLOCK_TYPES,
  BLOCK_CONTRACTS,
  normalizeBlockData,
  normalizeBlocks,
  preflightBlockArgs,
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

describe('block write safety — the schema lookup is reachable from FlowWork', () => {
  it('describe_blocks counts as a read (it returns schema, touches no data)', () => {
    // Without this, an employee's "add a section to the pricing page" had to
    // guess field names: the loop could stage the write but never look up the
    // contract, because describe_* matches no read prefix.
    expect(isReadSkill('describe_blocks')).toBe(true);
    expect(classifyCall('describe_blocks', {})).toBe('read');
  });
});
