import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ModelViewerBlock } from '../ModelViewerBlock';
import { BLOCK_REFERENCE } from '@/lib/block-reference';
import { planImport, isGlb, MAX_MODEL_BYTES } from '../../../../../supabase/functions/_shared/media/import-plan.ts';

/**
 * Guardrail: a 3D model is a block — { src } and dials — not a hand-written
 * three.js canvas. The agency's MOSS page draws its aperture.glb with scene
 * code; here the same picture is a model-viewer element the agent can place,
 * with a poster for reduced motion and an import rail that accepts the file.
 */
vi.mock('@google/model-viewer', () => ({}));

describe('model-viewer block', () => {
  it('renders the element with the dials as attributes, auto-rotate on by default, camera controls on', () => {
    const { container } = render(<ModelViewerBlock data={{ src: 'https://x/moss.glb', poster: '/p.jpg', alt: 'MOSS', height: 'lg', caption: 'MOSS One' }} />);
    const el = container.querySelector('model-viewer')!;
    expect(el).not.toBeNull();
    expect(el.getAttribute('src')).toBe('https://x/moss.glb');
    expect(el.getAttribute('poster')).toBe('/p.jpg');
    expect(el.hasAttribute('auto-rotate')).toBe(true);
    expect(el.hasAttribute('camera-controls')).toBe(true);
    expect((container.querySelector('figure > div') as HTMLElement).style.height).toBe('480px');
    expect(container.textContent).toMatch(/MOSS One/);
  });
  it('without a source it renders nothing; dials off remove the attributes', () => {
    expect(render(<ModelViewerBlock data={{ src: '' }} />).container.innerHTML).toBe('');
    const { container } = render(<ModelViewerBlock data={{ src: 'https://x/m.glb', autoRotate: false, cameraControls: false }} />);
    const el = container.querySelector('model-viewer')!;
    expect(el.hasAttribute('auto-rotate')).toBe(false);
    expect(el.hasAttribute('camera-controls')).toBe(false);
  });
  it('the import rail accepts a .glb by its magic bytes and caps it; the catalogue carries the block', () => {
    expect(isGlb(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]))).toBe(true);
    expect(isGlb(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(planImport({ bytes: 304_000, contentType: 'application/octet-stream', header: null, model: true })).toMatchObject({ verdict: 'keep' });
    expect(planImport({ bytes: 304_000, contentType: 'model/gltf-binary', header: null }).reason).toMatch(/model-viewer block/);
    expect(planImport({ bytes: MAX_MODEL_BYTES + 1, contentType: 'model/gltf-binary', header: null }).verdict).toBe('refuse');
    const ref = BLOCK_REFERENCE.find((b) => b.type === 'model-viewer')!;
    expect(ref.fields.find((f) => f.name === 'src')!.required).toBe(true);
    expect(ref.description).toMatch(/NOT for: a video/);
  });
});
