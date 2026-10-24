import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GalleryBlock } from '../GalleryBlock';
import type { GalleryBlockData } from '@/types/cms';

/**
 * gallery.title and gallery.gap were advertised by the registry and accepted by
 * the write gate, but the renderer read neither: an agent's section heading was
 * stored and never shown, and every gallery used the same spacing.
 */

const images = [
  { src: '/a.jpg', alt: 'A' },
  { src: '/b.jpg', alt: 'B' },
];
const gallery = (data: Partial<GalleryBlockData>) =>
  ({ images, layout: 'grid', columns: 3, ...data }) as GalleryBlockData;

describe('gallery title and gap', () => {
  it('renders the section title as a heading', () => {
    render(<GalleryBlock data={gallery({ title: 'Från verkstaden' })} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Från verkstaden');
  });

  it('renders no heading without a title', () => {
    render(<GalleryBlock data={gallery({})} />);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('the grid spacing follows gap, and defaults to the old spacing', () => {
    const grid = (data: Partial<GalleryBlockData>) => {
      const { container, unmount } = render(<GalleryBlock data={gallery(data)} />);
      const cls = container.querySelector('.grid')!.className;
      unmount();
      return cls;
    };
    expect(grid({ gap: 'sm' })).toMatch(/\bgap-2\b/);
    expect(grid({ gap: 'lg' })).toMatch(/\bgap-6\b/);
    expect(grid({})).toMatch(/\bgap-4\b/);
  });

  it('masonry spaces its rows by the same step', () => {
    const { container } = render(<GalleryBlock data={gallery({ layout: 'masonry', gap: 'sm' })} />);
    const tile = container.querySelector('button')!;
    expect(tile.className).toMatch(/\bmb-2\b/);
    expect(tile.parentElement!.className).toMatch(/\bgap-2\b/);
  });
});
