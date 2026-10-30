/**
 * Flowwork's artifact: ask for a wiki page and it opens beside the chat; edit
 * it there; ask the assistant to read it through and it reads what is on
 * screen; save it to the wiki yourself (2026-10-30). The model never writes
 * the page — Save is the person's write, under their permissions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const edge = read('supabase/functions/workspace-chat/index.ts');
const hook = read('src/hooks/useWorkspaceChat.ts');
const page = read('src/pages/admin/WorkspaceChatPage.tsx');
const panel = read('src/components/admin/chat/DocumentPanel.tsx');

describe('the assistant writes the document beside the chat, never to the database', () => {
  it('write_document is a surface tool that only records the document', () => {
    expect(edge).toMatch(/name: 'write_document'/);
    expect(edge).toMatch(/const tools = \[\.\.\.\(webSearchOn \? \[WEB_SEARCH_TOOL\] : \[\]\), WRITE_DOCUMENT_TOOL, \.\.\.DISPATCH_TOOLS\]/);
    const branch = edge.slice(edge.indexOf("if (toolName === 'write_document') {"), edge.indexOf("if (toolName === 'web_search') {"));
    expect(branch).toMatch(/documentOut = \{/);
    expect(branch).not.toMatch(/agent-execute|\.from\(|runExecuteSkill/);
  });

  it('the prompt sends documents there, not to a staged manage_wiki_page', () => {
    expect(edge).toMatch(/Do NOT stage manage_wiki_page for that: the user saves it/);
  });

  it('the document travels back as its own event', () => {
    expect(edge).toMatch(/return streamFinal\(citations, finalText, contextMeta, consulted, stagedActions, documentOut\)/);
    expect(edge).toMatch(/event: document\\ndata:/);
    expect(hook).toMatch(/if \(currentEvent === 'document'\) \{/);
  });
});

describe('the open document is what the assistant reads', () => {
  it('every message carries the document as it is now, edits included', () => {
    expect(hook).toMatch(/\.\.\.\(document \? \{ document \} : \{\}\)/);
    expect(page).toMatch(/document: doc,\s*onDocument: handleDocument,/);
    expect(edge).toMatch(/--- OPEN DOCUMENT \(beside the chat; the user may have edited it — this is its current text\)/);
  });

  it('review means discussing this text, not rewriting it', () => {
    expect(edge).toMatch(/When they ask you to read, review or discuss it, answer in the chat about THIS text/);
  });
});

describe('the person edits and saves', () => {
  it('the panel saves through the wiki upsert under the person’s session', () => {
    expect(panel).toMatch(/const upsert = useUpsertWikiPage\(\)/);
    expect(panel).toMatch(/<Textarea[\s\S]{0,80}value=\{doc\.content_md\}/);
  });

  it('a revision keeps the previous version one Undo away, and opens the Document tab', () => {
    expect(page).toMatch(/if \(prev\) setDocUndo\(\(u\) => \[\.\.\.u\.slice\(-9\), prev\]\)/);
    expect(page).toMatch(/setDocFocus\(true\)/);
    expect(page).toMatch(/focus=\{doc && docFocus/);
  });

  it('the chat shows a card that points at the document', () => {
    expect(page).toMatch(/\{m\.document && \(/);
  });
});
