import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kbModule } from '@/lib/modules/kb-module';
import { wikiModule } from '@/lib/modules/wiki-module';

/**
 * FlowWork content QA (2026-08-19) drove KB + wiki authoring end-to-end through
 * the gateway and found three ways the write surface lies to the operator:
 *
 *   (a) `manage_kb_article` create saved a DRAFT and said nothing about it, so
 *       the agent reported "published" — and drafts are skipped by the
 *       retrieval indexer, so the article was invisible to the chat that was
 *       the whole point of writing it.
 *   (b) `manage_wiki_page` update is whole-body replacement. Asked to "keep
 *       everything and add a section", the model regenerated the body from
 *       memory and silently deleted two sections.
 *   (c) `manage_wiki_page` get answered `{found:false}` with status success and
 *       zero guidance — no title→slug fallback even though update had one.
 *
 * These are text-scan guards (same technique as
 * block-write-safety.guardrails.test.ts): the handler lives in a Deno edge
 * function that cannot be imported into vitest, so the pin is on the source.
 */

const root = resolve(__dirname, '../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const agentExecute = read('supabase/functions/_shared/execute/core.ts');
const kbHandler = agentExecute.slice(
  agentExecute.indexOf('async function executeKbAction'),
  agentExecute.indexOf('async function executeWikiAction'),
);
const wikiHandler = agentExecute.slice(
  agentExecute.indexOf('async function executeWikiAction'),
  agentExecute.indexOf('async function executeRiverAction'),
);

type ToolDef = {
  function: {
    description: string;
    parameters: { properties: Record<string, { type?: string; description?: string }> };
  };
};

const kbSkill = kbModule.skillSeeds!.find((s) => s.name === 'manage_kb_article')!;
const wikiSkill = wikiModule.skillSeeds!.find((s) => s.name === 'manage_wiki_page')!;
const kbTool = kbSkill.tool_definition as unknown as ToolDef;
const wikiTool = wikiSkill.tool_definition as unknown as ToolDef;
const kbParams = kbTool.function.parameters.properties;
const wikiParams = wikiTool.function.parameters.properties;

describe('(a) KB create: publish is explicit and drafts announce themselves', () => {
  it('the seed exposes a boolean publish param that names the draft consequence', () => {
    expect(kbParams.publish, 'publish param missing from manage_kb_article tool_definition').toBeTruthy();
    expect(kbParams.publish.type).toBe('boolean');
    const d = String(kbParams.publish.description);
    expect(d).toContain('Publish immediately');
    expect(d).toMatch(/DRAFT/);
    // The consequence, not just the default — "default false" alone taught the
    // model nothing about why it mattered.
    expect(d).toMatch(/not indexed/i);
    expect(d).toMatch(/visitors/i);
    expect(d).toMatch(/chat/i);
  });

  it('the pre-call description carries the rule (description = the tier the model reads before choosing)', () => {
    for (const text of [kbSkill.description, kbTool.function.description]) {
      expect(text).toMatch(/publish:\s*true/);
      expect(text).toMatch(/DRAFT/);
      expect(text).toMatch(/is_published/);
    }
  });

  it('instructions forbid reporting a draft as published', () => {
    const i = String(kbSkill.instructions);
    expect(i).toMatch(/Never tell the user an article is published/i);
    expect(i).toMatch(/is_published/);
    expect(i).toMatch(/publish:\s*true/);
  });

  const kbCreate = kbHandler.slice(
    kbHandler.indexOf("if (action === 'create')"),
    kbHandler.indexOf('async function resolveArticleId'),
  );

  it('the handler honours publish instead of hardcoding is_published: false', () => {
    expect(kbCreate).toMatch(/publish\s*=\s*false/);
    expect(kbCreate).toMatch(/shouldPublish/);
    expect(kbCreate).toMatch(/is_published:\s*shouldPublish/);
    expect(
      /is_published:\s*false,/.test(kbCreate),
      'create still hardcodes is_published: false — the publish flag would be inert',
    ).toBe(false);
  });

  it('the create response always states is_published, and notes the draft consequence', () => {
    const create = kbCreate;
    expect(create).toMatch(/is_published:\s*data\.is_published === true/);
    expect(create).toContain('Saved as DRAFT — not indexed, invisible to visitors and chat. Re-run with publish:true or ask an admin to publish.');
  });

  it('kb_articles really has no published_at column — is_published is the whole state', () => {
    // If a published_at column is ever added, the handler must set it too; this
    // guard makes that a failing test rather than a silent half-write.
    const types = read('src/integrations/supabase/types.ts');
    const kbRow = types.slice(types.indexOf('      kb_articles: {'), types.indexOf('      kb_articles: {') + 1400);
    expect(kbRow).toContain('is_published');
    expect(
      kbRow.includes('published_at'),
      'kb_articles gained a published_at column — teach executeKbAction to set it on publish',
    ).toBe(false);
  });

  it('drafts are genuinely unindexed — the premise the note states', () => {
    const indexer = read('supabase/functions/_shared/retrieval/indexer.ts');
    const kb = indexer.slice(indexer.indexOf("case 'kb_articles'"), indexer.indexOf("case 'wiki_pages'"));
    expect(kb).toMatch(/!data\.is_published/);
  });
});

describe('(b) wiki update: append_md concatenates, it does not replace', () => {
  it('the seed exposes append_md and says what content_md does instead', () => {
    expect(wikiParams.append_md, 'append_md param missing from manage_wiki_page tool_definition').toBeTruthy();
    expect(wikiParams.append_md.type).toBe('string');
    const d = String(wikiParams.append_md.description);
    expect(d).toMatch(/append/i);
    expect(d).toMatch(/ADDITIVE/);
    expect(d).toMatch(/REPLACES/);
    // The counterpart warning must live on content_md too, or a model that
    // never reads append_md keeps clobbering.
    expect(String(wikiParams.content_md.description)).toMatch(/REPLACES the entire body/);
  });

  it('the pre-call description warns before the call, not only in instructions', () => {
    for (const text of [wikiSkill.description, wikiTool.function.description]) {
      expect(text).toMatch(/append_md/);
      expect(text).toMatch(/REPLACE|replaces/);
    }
  });

  it('instructions steer additions to append_md', () => {
    const i = String(wikiSkill.instructions);
    expect(i).toMatch(/whole-body replacement/i);
    expect(i).toMatch(/append_md/);
    expect(i).toMatch(/Nothing existing\s+can be lost/);
  });

  it('the handler reads the stored body and concatenates with a blank line', () => {
    const update = wikiHandler.slice(wikiHandler.indexOf("if (action === 'update')"));
    expect(update).toMatch(/append_md/);
    // Read-before-write: without the select there is nothing to append to.
    expect(update).toMatch(/select\('content_md'\)/);
    expect(update).toMatch(/\$\{base\}\\n\\n\$\{appendMd\}/);
    // Guard the mode: append must NOT engage when a full body was supplied.
    expect(update).toMatch(/appendMd\s*&&\s*!hasContentMd/);
  });

  it('the append write goes through the same UPDATE the revision trigger watches', () => {
    const update = wikiHandler.slice(wikiHandler.indexOf("if (action === 'update')"));
    // One update call for both modes — the append path builds patch.content_md
    // and falls into the shared write, so trg_wiki_pages_revision fires exactly
    // as it does for a replacement. A separate write path would bypass history.
    expect(update).toMatch(/patch\.content_md\s*=\s*base\s*\?/);
    const writes = [...update.matchAll(/\.from\('wiki_pages'\)\.update\(/g)];
    expect(writes.length, 'more than one wiki update write — history capture must not fork').toBe(1);
  });

  it('the revision trigger still exists on wiki_pages UPDATE', () => {
    const mig = read('supabase/migrations/20260708070000_wiki-parity-r7.sql');
    expect(mig).toMatch(/CREATE TRIGGER trg_wiki_pages_revision/);
    expect(mig).toMatch(/BEFORE UPDATE OR DELETE ON public\.wiki_pages/);
  });
});

describe('(c) wiki get: title fallback and a hint instead of a silent miss', () => {
  it('get and update share one slug resolver (the read surface is no longer pickier)', () => {
    expect(wikiHandler).toMatch(/const resolveWikiSlug\s*=/);
    const get = wikiHandler.slice(
      wikiHandler.indexOf("if (action === 'get')"),
      wikiHandler.indexOf("if (action === 'create')"),
    );
    const update = wikiHandler.slice(wikiHandler.indexOf("if (action === 'update')"));
    expect(get).toMatch(/resolveWikiSlug/);
    expect(update).toMatch(/resolveWikiSlug/);
  });

  it('the resolver walks slug → exact title → derived PascalCase slug', () => {
    const resolver = wikiHandler.slice(
      wikiHandler.indexOf('const resolveWikiSlug'),
      wikiHandler.indexOf("if (action === 'list')"),
    );
    expect(resolver).toMatch(/\.eq\('slug', slug\)/);
    expect(resolver).toMatch(/\.ilike\('title', title\)/);
    expect(resolver).toMatch(/toWikiSlug\(title\)/);
  });

  it('a miss carries error + a hint naming the way out, not a bare found:false', () => {
    const get = wikiHandler.slice(
      wikiHandler.indexOf("if (action === 'get')"),
      wikiHandler.indexOf("if (action === 'create')"),
    );
    expect(get).toMatch(/error:/);
    expect(get).toContain('No page with that slug or title. Use action=list or search_wiki to find the right slug.');
    // Every not-found return must carry the hint — one silent branch is enough
    // to reproduce the original finding.
    // Match the returned property (`found: false,`), not the prose in comments.
    const notFound = [...get.matchAll(/^\s*found: false,$/gm)];
    expect(notFound.length).toBeGreaterThanOrEqual(1);
    const hints = [...get.matchAll(/^\s*hint:/gm)];
    expect(hints.length, 'a found:false branch has no hint').toBe(notFound.length);
  });

  it('get accepts a title at all (it used to demand a slug)', () => {
    const get = wikiHandler.slice(
      wikiHandler.indexOf("if (action === 'get')"),
      wikiHandler.indexOf("if (action === 'create')"),
    );
    expect(get).toMatch(/rawTitle/);
    expect(
      /if \(!slug\) throw new Error\('slug is required'\)/.test(get),
      'get rejects title-only calls again',
    ).toBe(false);
  });
});
