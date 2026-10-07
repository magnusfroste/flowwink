import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A wiki page explains a contract template; the template lives in Contracts. The
 * two must not become two copies of the same wording, so the wiki points at the
 * template with an ordinary link and the Contracts page opens it on arrival:
 * /admin/contracts/templates?template=<id> (add &edit=1 for the editor). The
 * template offers "Copy link" so the author never types an id. The wiki itself
 * is unchanged — its markdown renderer already turns /admin/... hrefs into
 * in-app navigation.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a contract template can be opened from a link', () => {
  const page = read('src/pages/admin/ContractTemplatesPage.tsx');

  it('the templates page opens the template named by ?template=<id>, and consumes the param', () => {
    expect(page).toMatch(/searchParams\.get\('template'\)/);
    expect(page).toMatch(/searchParams\.get\('edit'\) === '1'/);
    expect(page).toMatch(/next\.delete\('template'\)/);
    expect(page).toMatch(/no longer exists/);
  });

  it('every template offers a copy-link button, on the card and in the read sheet', () => {
    expect(page).toMatch(/\/admin\/contracts\/templates\?template=\$\{t\.id\}/);
    expect((page.match(/copyTemplateLink\((t|reading)\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the wiki renders an in-app href as navigation, so the link needs nothing new in the wiki module', () => {
    const md = read('src/components/admin/wiki/WikiMarkdown.tsx');
    expect(md).toMatch(/href\?\.startsWith\('\/'\)[\s\S]*<Link to=\{href\}>/);
  });
});
