/**
 * FlowChat and Flowwork look the same: one frame (ChatShell), one text box
 * (ChatComposer), sessions on the LEFT beside an admin menu that folds to
 * icons while you chat, and on the right the session's overview in folding
 * sections — Running, Outputs, Changes, Context, Sources — where an opened
 * output (a document) takes the whole panel (2026-10-30, after comparing
 * with the Claude Code app's session panel).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { stepSummary } from '../step-summary';

const read = (p: string) => readFileSync(p, 'utf8');
const flowchat = read('src/pages/admin/FlowChatPage.tsx');
const flowwork = read('src/pages/admin/WorkspaceChatPage.tsx');
const operate = read('src/components/admin/copilot/OperateChat.tsx');
const shell = read('src/components/admin/chat/ChatShell.tsx');

describe('one chat layout', () => {
  it('both pages render inside ChatShell: sessions left, the side panel right', () => {
    for (const page of [flowchat, flowwork]) {
      expect(page).toMatch(/<ChatShell\b/);
      expect(page).toMatch(/sessions=\{\s*<SessionsAside\s+side="left"/);
      expect(page).toMatch(/aside=\{\s*<ChatSidePanel/);
      expect(page).not.toMatch(/h-\[calc\(100vh/);
    }
    expect(existsSync('src/components/admin/chat/ContextAside.tsx')).toBe(false);
  });

  it('the admin menu folds to icons on the way into a chat (once, desktop only)', () => {
    expect(shell).toMatch(/const \{ open, setOpen, isMobile \} = useSidebar\(\)/);
    expect(shell).toMatch(/if \(!isMobile && open\) setOpen\(false\)/);
  });

  it('both type into ChatComposer — no pill input of their own', () => {
    expect(operate).toMatch(/<ChatComposer\b/);
    expect(operate).not.toMatch(/from '@\/components\/ui\/input'/);
    expect(flowwork).toMatch(/<ChatComposer\b/);
    expect(flowwork).not.toMatch(/<Textarea\b/);
  });

  it('an empty chat is a hero with the box in the middle, a running one has it in the bar', () => {
    expect(operate).toMatch(/<ChatHero\b/);
    expect(operate).toMatch(/\{!isEmpty && <ChatComposerBar>\{composer\(\)\}<\/ChatComposerBar>\}/);
  });

  it('the shell fills the admin main exactly, edge to edge', () => {
    expect(shell).toMatch(/-m-8 flex h-\[calc\(100%\+4rem\)\]/);
  });
});

describe('the right side is an overview of the session', () => {
  it('Flowwork: Running, Outputs, Changes, Context, Sources — an opened document fills the panel', () => {
    for (const id of ["id: 'running'", "id: 'outputs'", "id: 'changes'", "id: 'context'", "id: 'sources'"]) expect(flowwork).toContain(id);
    expect(flowwork).toMatch(/focus=\{doc && docFocus \? \{/);
  });

  it('FlowChat: Running, Steps, Context', () => {
    for (const id of ["id: 'running'", "id: 'steps'", "id: 'context'"]) expect(flowchat).toContain(id);
  });

  it('a turn’s steps are one line in the chat that opens in place', () => {
    expect(operate).toMatch(/Ran \{stepSummary\(results\)\}/);
    expect(stepSummary([{ status: 'failed' }, { status: 'success' }, { status: 'refused' }, { status: 'success' }])).toBe('4 steps · 1 failed · 1 refused');
    expect(stepSummary([{ status: 'pending_approval' }])).toBe('1 step · 1 awaiting approval');
  });
});
