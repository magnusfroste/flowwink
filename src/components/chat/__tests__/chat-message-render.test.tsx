import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../ChatMessage';
import { parseMarkdown } from '@/lib/chat-markdown';
import { sourcesFromGrounding } from '@/hooks/useChat';

/**
 * What a visitor sees in the chat (MJP demo, 2026-09-28): a "- item" list
 * arrived as literal hyphens, every answer opened with two empty rows, an
 * internal link opened a new tab, and the grounding receipt's sources were
 * saved but never shown — in a chat whose greeting promises "sources shown".
 */
vi.mock('@/lib/ui-text', () => ({ useUiText: () => (_k: string, fallback: string) => fallback }));
vi.mock('../ChatFeedback', () => ({ ChatFeedback: () => null }));

describe('chat markdown', () => {
  it('a list is a list, not hyphens', () => {
    const html = parseMarkdown('It depends:\n\n- **Axial-flow** — low speed\n- **Mixed-flow** — high speed');
    expect(html).toMatch(/<ul><li><strong>Axial-flow<\/strong> — low speed<\/li><li><strong>Mixed-flow<\/strong> — high speed<\/li><\/ul>/);
    expect(html).not.toMatch(/>- /);
  });
  it('numbered steps are an ordered list; a heading is bold, not "##"', () => {
    const html = parseMarkdown('### Steps\n1. Download\n2. Connect');
    expect(html).toMatch(/<p><strong>Steps<\/strong><\/p><ol><li>Download<\/li><li>Connect<\/li><\/ol>/);
  });
  it('an answer does not open with empty rows', () => {
    expect(parseMarkdown('\n\nMJP recommends annual service.')).toBe('<p>MJP recommends annual service.</p>');
  });
  it('a link on this site stays in the tab; the outside world opens a new one', () => {
    expect(parseMarkdown('See [contact](/contact-us).')).toMatch(/<a href="\/contact-us" class="text-primary underline">contact<\/a>/);
    expect(parseMarkdown('See [Scania](https://scania.com).')).toMatch(/target="_blank"/);
  });
  it('raw HTML in the text is escaped, never rendered', () => {
    expect(parseMarkdown('<img src=x onerror=alert(1)>')).not.toMatch(/<img/);
  });
});

describe('the answer shows what it was built on', () => {
  it('sources are titled, one per address, at most three', () => {
    const g = { sources: [
      { title: 'Service intervals', url: '/kb/service' }, { title: 'Service intervals', url: '/kb/service' },
      { title: 'Warranty', url: '/kb/warranty' }, { title: 'X-HT', url: '/waterjets-x-ht' }, { title: 'Fourth', url: '/x' }, { title: '', url: '/y' }] };
    expect(sourcesFromGrounding(g)).toEqual([
      { title: 'Service intervals', url: '/kb/service' }, { title: 'Warranty', url: '/kb/warranty' }, { title: 'X-HT', url: '/waterjets-x-ht' }]);
    expect(sourcesFromGrounding(null)).toEqual([]);
  });
  it('the message renders them as links under the answer', () => {
    render(<ChatMessage role="assistant" content="Annual service." sources={[{ title: 'Service intervals', url: '/kb/service' }]} showFeedback={false} />);
    expect(screen.getByText('Sources:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Service intervals' })).toHaveAttribute('href', '/kb/service');
  });
});
