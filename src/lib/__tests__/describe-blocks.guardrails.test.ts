import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * describe_blocks — the block vocabulary, served to whoever asks.
 *
 * The finding (#173): manage_page_blocks' instructions say "when unsure what a
 * block supports, ask for its schema rather than guessing from examples" — and
 * there was no skill to ask. BLOCK_TYPES_SCHEMA reached FlowPilot through its
 * prompt (cms-context) but the gateway exposed it nowhere, so FlowPilot saw the
 * vocabulary and every external agent guessed. That is precisely the asymmetry
 * the contract authoring guide does not have.
 */

const handler = readFileSync(
  resolve(__dirname, '../../../supabase/functions/_shared/handlers/describe-blocks.ts'), 'utf-8');
const seeds = readFileSync(resolve(__dirname, '../../../src/lib/platform-seeds.ts'), 'utf-8');
const agentExecute = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'), 'utf-8');
const pagesModule = readFileSync(
  resolve(__dirname, '../../../src/lib/modules/pages-module.ts'), 'utf-8');

const seed = seeds.slice(seeds.indexOf("name: 'describe_blocks'"), seeds.indexOf("name: 'check_integrations'"));

describe('it is a PLATFORM primitive, not a pages-module feature', () => {
  it('lives in platform-seeds so an external operator has it with FlowPilot off', () => {
    expect(seeds).toMatch(/name: 'describe_blocks'/);
    expect(pagesModule).not.toMatch(/name: 'describe_blocks'/);
  });

  it('is wired as an internal handler in agent-execute', () => {
    expect(seed).toMatch(/handler: 'internal:describe_blocks'/);
    expect(agentExecute).toMatch(/handler === 'internal:describe_blocks'/);
    expect(agentExecute).toMatch(/import \{ executeDescribeBlocks \}/);
  });

  it('is free to call — a reference lookup must never be gated behind approval', () => {
    expect(seed).toMatch(/trust_level: 'auto'/);
  });
});

describe('the vocabulary has ONE home, and it is not the database', () => {
  it('reads the generated artifact instead of carrying its own copy', () => {
    expect(handler).toMatch(/import \{ BLOCK_TYPES_SCHEMA, IMPORTABLE_BLOCK_TYPES \} from '\.\.\/block-schema\.ts'/);
  });

  it('hardcodes no block type of its own', () => {
    // A second list would drift within a week — the same mistake that gave the
    // contract token list two copies. Only the parser's own regex may name the
    // shape, never a specific type.
    const code = handler.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n');
    for (const t of ['two-column', 'testimonials', 'parallax-section', "'hero'"]) {
      expect(code).not.toContain(t);
    }
  });
});

describe('two levels, so the catalogue never floods a context', () => {
  it('no argument returns the catalogue without the field specs', () => {
    const cat = handler.slice(handler.indexOf('if (!requested)'), handler.indexOf('const match ='));
    expect(cat).toMatch(/type: e\.type, name: e\.name, description: e\.description/);
    expect(cat).not.toMatch(/data: e\.data/);
  });

  it('points the caller at the second level explicitly', () => {
    expect(handler).toMatch(/Call again with block_type=<type>/);
  });

  it('an unknown type answers with the valid ones — a self-correcting error', () => {
    expect(handler).toMatch(/error: `Unknown block type: \$\{requested\}`/);
    expect(handler).toMatch(/available_types: IMPORTABLE_BLOCK_TYPES/);
  });
});

describe('it teaches the error agents actually make', () => {
  it('warns that Tiptap fields are objects, never strings — in the response itself', () => {
    // The single most common agent failure on pages: rich text sent as a
    // string saves fine and renders nothing.
    expect(handler).toMatch(/must be objects \(\{"type":"doc",…\}\), never strings/);
  });

  it('and in the instructions', () => {
    expect(seed).toMatch(/never strings/);
    expect(seed).toMatch(/renders nothing/);
  });

  it('names the silent-failure mode: unknown keys are ignored', () => {
    expect(seed).toMatch(/the block ignores keys it does not know, silently/);
  });
});

/**
 * The composition tier (#173 follow-up).
 *
 * The field contract was correct and the page was still wrong: FlowWork asked for
 * a landing page and got hero > text > features > two-column > text > cta — an
 * essay with headings. Everything the seed taught was CORRECTNESS (which types
 * exist, which fields are required, kebab-case, fail-closed) and nothing said what
 * a good page IS. Law 2 says the fix is metadata, never a routing hack, so the
 * seed now carries a composition tier alongside the field tier.
 *
 * Its authority is a measurement of the 11 hand-built templates, not general web
 * design advice — so these tests re-derive that measurement from the shipped
 * template JSON and fail when the seed's claims stop being true of the corpus.
 */
const TEMPLATE_DIR = resolve(__dirname, '../../../templates');

/**
 * The seed is a TS template literal, so every backtick in the guidance is escaped
 * in the source. Read the prose the agent will actually receive, not its escaping.
 */
const seedText = seed.replace(/\\`/g, '`');

/** The renderer's own list, read from the generated artifact rather than re-typed. */
const IMPORTABLE_BLOCK_TYPES: string[] = JSON.parse(
  readFileSync(resolve(__dirname, '../../../supabase/functions/_shared/block-schema.ts'), 'utf-8')
    .match(/export const IMPORTABLE_BLOCK_TYPES = (\[[^\]]*\])/)![1]);

interface TemplatePage { types: string[] }

/** Overlays float above the flow — they are not the page's opening or closing act. */
const OVERLAY = new Set(['announcement-bar', 'chat-launcher', 'floating-cta', 'notification-toast']);

function templatePages(): TemplatePage[] {
  const pages: TemplatePage[] = [];
  for (const f of readdirSync(TEMPLATE_DIR)) {
    // blank is the empty template — it has nothing to say about composition.
    if (!f.endsWith('.json') || f === 'blank.json') continue;
    const tpl = JSON.parse(readFileSync(resolve(TEMPLATE_DIR, f), 'utf-8'));
    for (const p of tpl.pages ?? []) pages.push({ types: (p.blocks ?? []).map((b: { type: string }) => b.type) });
  }
  return pages;
}

describe('it teaches composition, not only the field contract', () => {
  it('names text as the last resort and routes prose to the blocks that carry it', () => {
    expect(seedText).toMatch(/Choosing the block/);
    expect(seedText).toMatch(/three claims in a row → `features`/);
    expect(seedText).toMatch(/questions and objections → `accordion`/);
    expect(seedText).toMatch(/an argument in steps, a "how it works" → `timeline`/);
  });

  it('names the two-of-the-same-type-in-a-row smell', () => {
    expect(seedText).toMatch(/Two blocks of the same type back to back/);
  });

  it('recommends no block the renderer does not have', () => {
    // Guidance that names an invented type is worse than no guidance: the write
    // is refused, or the type is stored and renders as a hole in the page.
    const section = seedText.slice(seedText.indexOf('### Choosing the block'), seedText.indexOf('### Workflow'));
    for (const t of section.match(/`([a-z][a-z0-9-]*)(?:\.[A-Za-z]+)?`/g) ?? []) {
      const type = t.slice(1, -1).split('.')[0];
      expect(IMPORTABLE_BLOCK_TYPES, `composition guidance names \`${type}\``).toContain(type);
    }
  });
});

describe('the composition claims are a measurement of the shipped templates', () => {
  const pages = templatePages();
  const blocks = pages.flatMap((p) => p.types);

  it('the corpus it cites is the corpus that exists', () => {
    // The seed quotes "(70 hand-built pages, 444 blocks)". Change the templates
    // and this fails — which is correct: re-measure, then re-word the guidance.
    const cited = seedText.match(/\((\d+) hand-built pages, (\d+) blocks\)/);
    expect(cited, 'the seed must state the corpus it measured').toBeTruthy();
    expect(Number(cited![1])).toBe(pages.length);
    expect(Number(cited![2])).toBe(blocks.length);
  });

  it('text really is marginal — the claim the whole tier rests on', () => {
    const text = blocks.filter((t) => t === 'text').length;
    const cited = seedText.match(/`text` is (\d+) blocks — ([\d.]+)% of everything/);
    expect(cited).toBeTruthy();
    expect(Number(cited![1])).toBe(text);
    expect(Number(cited![2])).toBe(Number(((100 * text) / blocks.length).toFixed(1)));

    const none = pages.filter((p) => !p.types.includes('text')).length;
    const citedNone = seedText.match(/(\d+) of the (\d+) pages contain none/);
    expect(citedNone).toBeTruthy();
    expect(Number(citedNone![1])).toBe(none);
    expect(Number(citedNone![2])).toBe(pages.length);
  });

  it('NOT ONE hand-built page uses two text blocks', () => {
    // The observed failure used two. This is the assertion that makes the
    // guidance evidence rather than taste.
    const offenders = pages.filter((p) => p.types.filter((t) => t === 'text').length > 1);
    expect(offenders).toHaveLength(0);
    expect(seedText).toMatch(/NOT ONE page anywhere contains two/);
  });

  it('pages open on hero and close on cta, in the proportions cited', () => {
    const flow = pages.map((p) => p.types.filter((t) => !OVERLAY.has(t))).filter((t) => t.length > 0);
    const hero = flow.filter((t) => t[0] === 'hero').length;
    const cta = flow.filter((t) => t[t.length - 1] === 'cta').length;
    expect(seedText).toContain(`open on \`hero\` (${hero}/${pages.length})`);
    expect(seedText).toContain(`close on \`cta\` (${cta}/${pages.length})`);
  });
});

describe('manage_page points at the composition tier, not only the field tier', () => {
  it('sends the caller to describe_blocks before composing, not just before writing', () => {
    expect(pagesModule).toMatch(/WHICH block a piece of content belongs in/);
  });
});
