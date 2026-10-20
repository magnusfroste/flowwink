import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SectionDividerBlock } from '../SectionDividerBlock';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * Guardrail: a texture band between two sections is a block, not a stylesheet.
 *
 * Synclair, 2026-10-19: the agency's grain texture (white → blue grain →
 * transparent) that makes the dark→light "paper" transition was painted onto
 * `main:before` with CSS in custom_scripts, masked at a pixel offset per page.
 * section-divider had five SVG shapes and no way to carry an image. Now shape
 * "texture" draws an image band at a height over whatever surface the block's
 * sectionBackground gives it — composable, visible to describe_blocks, and
 * served through the import rail that makes the image web-sized.
 */
describe('section-divider texture', () => {
  it('shape "texture" renders the image as a full-width band at the chosen height', () => {
    const { container } = render(
      <SectionDividerBlock data={{ shape: 'texture', imageSrc: '/grain.png', height: 'xl', fit: 'cover', position: 'bottom', opacity: 0.8 }} />,
    );
    const band = container.firstElementChild as HTMLElement;
    expect(band.style.height).toBe('200px');
    expect(band.getAttribute('aria-hidden')).toBe('true');
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/grain.png');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.className).toMatch(/object-cover/);
    expect(img.style.objectPosition).toBe('bottom');
    expect(img.style.opacity).toBe('0.8');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('contain letterboxes, invert turns the band upside down, and a texture without an image is still a band', () => {
    const { container, rerender } = render(<SectionDividerBlock data={{ shape: 'texture', imageSrc: '/grain.png', fit: 'contain', invert: true }} />);
    expect(container.querySelector('img')!.className).toMatch(/object-contain/);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/rotate-180/);
    rerender(<SectionDividerBlock data={{ shape: 'texture', bgColor: '#05080e' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(5, 8, 14)');
  });

  it('the shapes are untouched', () => {
    const { container } = render(<SectionDividerBlock data={{ shape: 'wave', height: 'md' }} />);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('the catalogue an agent reads says texture, its fields, and where the image comes from', () => {
    const ref = BLOCK_REFERENCE.find((b) => b.type === 'section-divider')!;
    const field = (n: string) => ref.fields.find((f) => f.name === n);
    expect(field('shape')!.options).toContain('texture');
    expect(field('height')!.options).toEqual(['sm', 'md', 'lg', 'xl']);
    expect(field('imageSrc')!.description).toMatch(/import_from_url/);
    expect(field('fit')!.options).toEqual(['cover', 'contain']);
    expect(field('position')!.options).toEqual(['top', 'center', 'bottom']);
    expect(field('opacity')!.type).toBe('number');
    expect(ref.description).toMatch(/never as CSS in custom_scripts/);
    expect(ref.description).toMatch(/sectionBackground/);
  });
});
