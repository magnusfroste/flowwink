import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EmbedBlock } from '../EmbedBlock';
import { isVideoFileUrl } from '@/lib/embed-video';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * Guardrail: a direct video file is an embed with provider "video" — { url }
 * alone — rendered as a native <video>, never an iframe and never hand-written
 * HTML in customEmbed.
 *
 * Synclair, 2026-10-21: the only road to an inline mp4 was customEmbed, so the
 * connected agent wrote a <video> tag by hand around a 7 MB base64 data-URI.
 * The media library already imports and serves the file; the block now plays it.
 */
const MP4 = 'https://x.supabase.co/storage/v1/object/public/cms-images/imports/moss-final-loop.mp4';

describe('embed provider video', () => {
  it('a direct mp4/webm URL is detected as a video file; page URLs are not', () => {
    expect(isVideoFileUrl(MP4)).toBe(true);
    expect(isVideoFileUrl('https://cdn.example.com/clip.webm?v=2')).toBe(true);
    expect(isVideoFileUrl('https://vimeo.com/123456')).toBe(false);
    expect(isVideoFileUrl('https://example.com/mp4-guide')).toBe(false);
    expect(isVideoFileUrl(undefined)).toBe(false);
  });

  it('{ url } alone renders a native muted, looping, autoplaying <video> — no iframe', () => {
    const { container } = render(<EmbedBlock data={{ url: MP4, caption: 'Synclair Vision · MOSS' }} />);
    const video = container.querySelector('video[data-embed-video]') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(video.getAttribute('src')).toBe(MP4);
    expect(video.hasAttribute('autoplay')).toBe(true);
    expect(video.hasAttribute('loop')).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('muted')).toBe(true); // the attribute is what the autoplay policy reads
    expect(video.hasAttribute('controls')).toBe(false);
    expect(container.textContent).toMatch(/MOSS/);
  });

  it('autoplay off means controls on and sound allowed; a poster and a forced provider are honoured', () => {
    const { container } = render(<EmbedBlock data={{ url: 'https://cdn.example.com/clip', provider: 'video', autoplay: false, posterUrl: '/still.jpg' }} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.hasAttribute('autoplay')).toBe(false);
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.muted).toBe(false);
    expect(video.getAttribute('poster')).toBe('/still.jpg');
  });

  it('other providers still render the iframe road', () => {
    const { container } = render(<EmbedBlock data={{ url: 'https://vimeo.com/123456' }} />);
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://player.vimeo.com/video/123456');
    expect(container.querySelector('video')).toBeNull();
  });

  it('the catalogue tells an agent so: provider video, the four dials, customEmbed is NOT the road', () => {
    const embed = BLOCK_REFERENCE.find((b) => b.type === 'embed')!;
    expect(embed.description).toMatch(/direct mp4\/webm FILE/);
    expect(embed.description).toMatch(/provider "video"/);
    expect(embed.description).toMatch(/no custom HTML/);
    const f = (n: string) => embed.fields.find((x) => x.name === n);
    expect(f('provider')!.options).toContain('video');
    for (const n of ['posterUrl', 'autoplay', 'loop', 'controls']) expect(f(n), n).toBeTruthy();
    expect(f('customEmbed')!.description).toMatch(/NOT for a video file/);
  });
});
