import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FooterBlockEditor } from '../FooterBlockEditor';
import type { FooterBlockData } from '@/types/cms';

/**
 * Magnus (2026-09-29): "we added things to the footer that I can't reach in
 * the footer — I assume it's generated from the header?" It is. The editor now
 * says so where the operator looks, and links to where the columns are edited.
 */
const base = { variant: 'full' } as FooterBlockData;
const renderEditor = (data: FooterBlockData) =>
  render(<MemoryRouter><FooterBlockEditor data={data} onChange={() => {}} /></MemoryRouter>);

describe('footer menu columns say where they come from', () => {
  it('with menu columns on, the editor links to the header menu', () => {
    renderEditor({ ...base, showMenuColumns: true });
    expect(screen.getByText(/generated from the header menu/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Edit the header menu' });
    expect(links[0]).toHaveAttribute('href', '/admin/pages?tab=header');
  });

  it('with menu columns off, no such line', () => {
    renderEditor(base);
    expect(screen.queryByText(/generated from the header menu/)).not.toBeInTheDocument();
  });
});
