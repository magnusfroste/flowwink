import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GalleryBlock } from '../GalleryBlock';
import { ArticleGridBlock } from '../ArticleGridBlock';

/**
 * Gallery and article-grid always cropped to 16:9 — MJP's waterjet renders
 * (wide transparent PNGs) and dimension drawings came out cut. They now carry
 * the same imageFit dial as two-column: 'contain' shows the whole image.
 */
describe('imageFit on gallery and article-grid', () => {
  it('gallery: contain shows the whole image, cover stays the default', () => {
    const { rerender } = render(<GalleryBlock data={{ layout: 'grid', columns: 2, imageFit: 'contain', images: [{ src: '/jet.png', alt: 'Jet render' }] }} />);
    expect(screen.getByAltText('Jet render').className).toMatch(/object-contain/);
    rerender(<GalleryBlock data={{ layout: 'grid', columns: 2, images: [{ src: '/jet.png', alt: 'Jet render' }] }} />);
    expect(screen.getByAltText('Jet render').className).toMatch(/object-cover/);
  });

  it('article-grid: contain shows the whole card image', () => {
    render(<ArticleGridBlock data={{ columns: 3, imageFit: 'contain', articles: [{ title: 'DRB', image: '/drb.png', url: '/waterjets-drb' }] }} />);
    expect(screen.getByAltText('DRB').className).toMatch(/object-contain/);
  });
});
