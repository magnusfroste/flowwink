import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WikiGroups } from '../WikiGroups';
import type { WikiPageListItem } from '@/hooks/useWiki';

/**
 * The left column, grouped by tag. The grouping rule is unit-tested in
 * wiki-tags.test.ts; here: the groups are on screen and always open, a chip
 * narrows to one, and a page with two tags is in both places.
 */
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useWikiPins', () => ({
  useWikiPins: () => ({ pins: [], isPinned: () => false, toggle: () => {}, atLimit: false, maxPins: 8 }),
}));

const page = (slug: string, all_tags: string[], updated_at: string): WikiPageListItem =>
  ({ slug, title: slug, all_tags, updated_at, parent_slug: null, updated_by: null, created_at: updated_at });

const pages = [
  page('Tisdagsmöte v39', ['tisdagsmöte', 'möte'], '2026-09-22'),
  page('Tisdagsmöte v38', ['tisdagsmöte', 'möte', 'sälj'], '2026-09-15'),
  page('Produkt - Fiber', ['produkt'], '2026-08-21'),
  page('Lead-Vinge', [], '2026-09-07'),
];

describe('WikiGroups', () => {
  it('shows every group open, with the untagged page named last', () => {
    render(<MemoryRouter><WikiGroups pages={pages} activeSlug="x" /></MemoryRouter>);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((e) => e.firstChild?.textContent);
    expect(headings).toEqual(['möte', 'tisdagsmöte', 'produkt', 'sälj', 'Untagged']);
    expect(screen.getAllByText('Tisdagsmöte v38')).toHaveLength(3); // möte, tisdagsmöte, sälj
    expect(screen.getByText('Lead-Vinge')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Expand|Collapse/)).not.toBeInTheDocument();
  });

  it('a chip narrows the column to one tag', () => {
    render(<MemoryRouter><WikiGroups pages={pages} activeSlug="x" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /^produkt/ }));
    expect(screen.getByText('Produkt - Fiber')).toBeInTheDocument();
    expect(screen.queryByText('Tisdagsmöte v39')).not.toBeInTheDocument();
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument();
    const chip = screen.getByRole('button', { name: /^produkt/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(screen.getAllByText('Tisdagsmöte v39').length).toBeGreaterThan(0);
  });

  it('inside a group the newest comes first — the series reads itself', () => {
    render(<MemoryRouter><WikiGroups pages={pages} activeSlug="x" /></MemoryRouter>);
    const heading = screen.getAllByRole('heading', { level: 3 }).find((h) => h.firstChild?.textContent === 'tisdagsmöte')!;
    const list = heading.parentElement!.querySelector('ul')!;
    expect(within(list).getAllByRole('link').map((l) => l.textContent)).toEqual(['Tisdagsmöte v39', 'Tisdagsmöte v38']);
  });
});
