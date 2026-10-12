import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findMeetLink, startedCallPost } from '@/lib/meet-link';

/**
 * "Start video call" where the team already is.
 *
 *   1. River: one button in the composer. It makes a room, posts the link to
 *      the feed (so everyone gets "Join video call") and opens the room for the
 *      caller. Any post or reply that carries a /meet/ link — a started call,
 *      an unanswered ring from Here now, a link an agent pasted — gets the
 *      same one-tap button.
 *   2. FlowWork: one icon in the header; the room is named after the chat you
 *      are in, so the colleague you pull in knows what it is about.
 *   3. One component for both, hidden when the WebMeet module is off; it opens
 *      the room in a new tab so the page you were on stays.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const button = read('src/components/meet/StartVideoCallButton.tsx');
const river = read('src/pages/admin/RiverPage.tsx');
const flowwork = read('src/pages/admin/WorkspaceChatPage.tsx');

describe('the matcher', () => {
  it('finds a meeting link in free text and nothing else', () => {
    expect(findMeetLink('Called Peter on video, no answer. Join here when you can: https://x.flowwink.com/meet/bold-solar-326')).toEqual({ slug: 'bold-solar-326', url: 'https://x.flowwink.com/meet/bold-solar-326' });
    expect(findMeetLink('see http://localhost:8080/meet/Swift-Wild-305, thanks')?.slug).toBe('swift-wild-305');
    expect(findMeetLink('the meeting room is booked')).toBeNull();
    expect(findMeetLink('https://example.com/meetings/weekly')).toBeNull();
    expect(findMeetLink(null)).toBeNull();
  });

  it('writes the post a started call leaves', () => {
    expect(startedCallPost('Anna', 'https://x/meet/a-b-1')).toBe('Anna started a video call. Join: https://x/meet/a-b-1');
    expect(startedCallPost('Anna', 'https://x/meet/a-b-1', 'the Q4 budget')).toBe('Anna started a video call about the Q4 budget. Join: https://x/meet/a-b-1');
    expect(findMeetLink(startedCallPost('Anna', 'https://x/meet/a-b-1'))?.slug).toBe('a-b-1');
  });
});

describe('one button, both places', () => {
  it('makes a room with the defaults, copies the link and opens the room in a new tab; hidden without WebMeet', () => {
    expect(button).toMatch(/useIsModuleEnabled\('webmeet'\)/);
    expect(button).toMatch(/if \(!enabled\) return null;/);
    expect(button).toMatch(/supabase\.rpc\('create_webmeet_room', \{ p_name: roomName/);
    expect(button).toMatch(/navigator\.clipboard\?\.writeText\(url\)/);
    expect(button).toMatch(/window\.open\(`\/meet\/\$\{slug\}`, '_blank', 'noopener'\)/);
    expect(button).toMatch(/await onStarted\?\.\(\{ slug, url \}\);/);
  });

  it('River: the composer starts a call and posts it; posts and replies with a meeting link get Join', () => {
    expect(river).toMatch(/<StartVideoCallButton[\s\S]*onStarted=\{async \(\{ url \}\) => \{\s*await create\.mutateAsync\(\{ body: startedCallPost\(myName, url, body\.trim\(\) \|\| null\)/);
    expect(river).toMatch(/\{!parentId && \(/); // not inside a reply thread
    expect(river).toMatch(/<LinkifiedText text=\{post\.body\} \/>\s*<\/div>\s*<JoinCallLink text=\{post\.body\}/);
    expect(river).toMatch(/<LinkifiedText text=\{r\.body\} \/>\s*<\/div>\s*<JoinCallLink text=\{r\.body\}/);
  });

  it('FlowWork: one icon in the header, the room named after the chat', () => {
    expect(flowwork).toMatch(/<StartVideoCallButton\s+iconOnly[\s\S]*roomName=\{sessions\.find\(\(s\) => s\.id === activeSessionId\)\?\.title \?\? null\}/);
  });

  it('the Here-now fallback post is one the Join button understands', () => {
    const provider = read('src/components/admin/TeamPresenceProvider.tsx');
    const m = provider.match(/body: `Called \$\{to\.name\} on video, no answer\. Join here when you can: \$\{window\.location\.origin\}\/meet\/\$\{slug\}`/);
    expect(m).not.toBeNull();
    expect(findMeetLink('Called Peter on video, no answer. Join here when you can: https://www.flowwink.com/meet/calm-river-12')?.slug).toBe('calm-river-12');
  });
});
