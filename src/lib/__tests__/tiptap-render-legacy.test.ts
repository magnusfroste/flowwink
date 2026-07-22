import { describe, it, expect } from 'vitest';
import { renderToHtml } from '@/lib/tiptap-utils';
describe('renderToHtml legacy strings', () => {
  it('renders a legacy HTML string as HTML, not escaped text', () => {
    const html = renderToHtml('<p>Hello <strong>world</strong></p>');
    expect(html).toContain('<strong>world</strong>');
    expect(html).not.toContain('&lt;strong&gt;');
  });
  it('still renders markdown strings', () => {
    const html = renderToHtml('## Rubrik\n\nEn **fet** rad');
    expect(html).toContain('<h2>');
    expect(html).toContain('<strong>fet</strong>');
  });
});
