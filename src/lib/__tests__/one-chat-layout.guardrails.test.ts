/**
 * FlowChat and Flowwork look the same: one frame (ChatShell — header,
 * hero or conversation, sessions on the right), one text box (ChatComposer).
 * They built their own and drifted — different heights (Flowwork overflowed
 * the admin padding), a pill input against a card, different headers and
 * empty states (2026-10-30). The cards inside the conversation differ on
 * purpose; the frame and the box do not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const flowchat = read('src/pages/admin/FlowChatPage.tsx');
const flowwork = read('src/pages/admin/WorkspaceChatPage.tsx');
const operate = read('src/components/admin/copilot/OperateChat.tsx');

describe('one chat layout', () => {
  it('both pages render inside ChatShell, sessions in its right aside', () => {
    for (const page of [flowchat, flowwork]) {
      expect(page).toMatch(/<ChatShell\b/);
      expect(page).toMatch(/aside=\{\s*<SessionsAside/);
      expect(page).not.toMatch(/h-\[calc\(100vh/);
    }
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
    expect(read('src/components/admin/chat/ChatShell.tsx')).toMatch(/-m-8 flex h-\[calc\(100%\+4rem\)\]/);
  });
});
