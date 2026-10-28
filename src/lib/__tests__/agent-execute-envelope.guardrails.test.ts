import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Two seams found by operating a fresh instance through the MCP gateway, both of
 * the silent-failure class this repo keeps relearning.
 *
 * THE ENVELOPE LIE. agent-execute computed handlerFailed, logged 'failed' to
 * agent_activity — and then returned status:'success' unconditionally. Four page
 * updates failed server-side while the caller printed four green checkmarks; the
 * journal and the response disagreed about the same event. An agent that trusts
 * that envelope reports work it never did, which is the incident class the
 * objective-evidence guardrail exists for (objectives close on agent_activity,
 * never on prose — and here the prose-facing side was the lying one).
 *
 * THE IDENTIFIER GAP. manage_page update answered only "page_id is required"
 * although the caller held a perfectly good slug, and although resolvePageId —
 * which accepts either — already existed in the same function for
 * manage_page_blocks. The fix is the established contract (manage_wiki_page,
 * manage_kb_article): accept a slug wherever an id is wanted, except create,
 * where the slug names the new page.
 */

const src = readFileSync(
  resolve(__dirname, '../../../supabase/functions/agent-execute/index.ts'),
  'utf-8',
);

describe('the response envelope tells the same truth as the journal', () => {
  it('computes handlerFailed and logs it', () => {
    expect(src).toMatch(/const handlerFailed = !!\(result as any\)\?\.error/);
    // A refusal (comment_on_task's cadence) is its own verdict, in both places.
    expect(src).toMatch(/status: handlerFailed \? 'failed' : handlerRefused \? 'refused' : 'success',\s*conversation_id/);
  });

  it('returns the SAME verdict it logged — never a hardcoded success', () => {
    expect(src).toMatch(
      /JSON\.stringify\(\{ status: handlerFailed \? 'failed' : handlerRefused \? 'refused' : 'success', result, trust_level/,
    );
    // The exact line that lied. If it comes back, this is the test to argue with.
    expect(src).not.toMatch(
      /JSON\.stringify\(\{ status: 'success', result, trust_level/,
    );
  });
});

describe('manage_page accepts a slug wherever an id is wanted', () => {
  const caseStart = src.indexOf("case 'manage_page':");
  const caseBody = src.slice(caseStart, caseStart + 3000);

  it('resolves before the id-requiring actions run', () => {
    expect(caseBody).toMatch(
      /\['update', 'publish', 'archive', 'delete', 'rollback'\]\.includes\(action\)/,
    );
    expect(caseBody).toMatch(/page_id = await resolvePageId\(String\(page_id\)\)/);
    expect(caseBody).toMatch(/else if \(slug\) page_id = await resolvePageId\(String\(slug\)\)/);
  });

  it('create is excluded — there the slug names the new page', () => {
    // The resolution gate must not list 'create'.
    const gate = caseBody.match(/\[([^\]]*)\]\.includes\(action\)/)?.[1] ?? '';
    expect(gate).not.toContain("'create'");
  });

  it('resolvePageId itself accepts both shapes', () => {
    // UUID passes through; anything else is looked up as a slug — and the slug
    // is normalized first: agents say "/blocks" (the URL path) while slugs are
    // stored bare, and both FlowPilot and FlowWork failed live on the leading
    // slash (2026-08-19).
    expect(src).toMatch(/const resolvePageId = async \(rawPageId: string\)/);
    expect(src).toMatch(/replace\(\/\^\\\/\+\/, ''\)/);
    expect(src).toMatch(/\.eq\('slug', slug\)/);
  });

  it('the seed teaches the contract instead of leaving agents to guess', () => {
    const seed = readFileSync(
      resolve(__dirname, '../modules/pages-module.ts'),
      'utf-8',
    );
    expect(seed).toMatch(/slugs are resolved automatically/);
    expect(seed).not.toMatch(/'Page slug \(for get or create\)'/);
  });
});
