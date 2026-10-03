import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, fireEvent } from '@testing-library/react';
import {
  YOUTUBE_EMBED_HOST_PLAIN,
  YOUTUBE_EMBED_HOST_PRIVACY,
  buildYouTubeEmbedUrl,
  extractYouTubeId,
} from '@/lib/youtube-embed';
import { YouTubeBlock } from '@/components/public/blocks/YouTubeBlock';
import { BLOCK_REFERENCE } from '@/lib/block-reference';

/**
 * A YouTube embed is a third-party request on a first-party page. Hermes
 * (synclairvision, #619 point 5) asked for two things an EU site needs: the
 * privacy-enhanced host, and a first-party poster so YouTube is not contacted
 * at all until the visitor chooses to play.
 *
 * The embed host has ONE writer (`src/lib/youtube-embed.ts`). Before, the public
 * block, its admin preview and the hero each spelled out the URL, which is why
 * the host could not change in one place — the scanner below keeps it that way
 * by refusing a literal embed URL anywhere else in src.
 */

const root = join(__dirname, '../../..');

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name !== 'node_modules') srcFiles(join(dir, e.name), out); }
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(join(dir, e.name));
  }
  return out;
}

describe('the embed host has one writer', () => {
  it('no component spells out a YouTube embed URL itself', () => {
    const LITERAL = /https:\/\/www\.youtube(-nocookie)?\.com\/embed\//;
    // Negative test: the shape the scanner exists for.
    expect(LITERAL.test('src={`https://www.youtube.com/embed/${id}`}')).toBe(true);
    const offenders = srcFiles('src')
      .filter((f) => f !== 'src/lib/youtube-embed.ts')
      .filter((f) => LITERAL.test(readFileSync(join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('privacy-enhanced by default, plain host only on explicit opt-out', () => {
    expect(buildYouTubeEmbedUrl('dQw4w9WgXcQ', {})).toBe(`${YOUTUBE_EMBED_HOST_PRIVACY}/embed/dQw4w9WgXcQ`);
    expect(buildYouTubeEmbedUrl('dQw4w9WgXcQ', { privacyMode: true })).toContain('youtube-nocookie.com');
    expect(buildYouTubeEmbedUrl('dQw4w9WgXcQ', { privacyMode: false })).toBe(`${YOUTUBE_EMBED_HOST_PLAIN}/embed/dQw4w9WgXcQ`);
    expect(buildYouTubeEmbedUrl('dQw4w9WgXcQ', { autoplay: true, mute: true, loop: true, controls: false }))
      .toBe(`${YOUTUBE_EMBED_HOST_PRIVACY}/embed/dQw4w9WgXcQ?autoplay=1&loop=1&playlist=dQw4w9WgXcQ&mute=1&controls=0`);
  });

  it('reads every URL shape an operator pastes', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10',
      'https://youtu.be/dQw4w9WgXcQ?si=abc',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'dQw4w9WgXcQ',
      '  dQw4w9WgXcQ  ',
    ]) expect(extractYouTubeId(url), url).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://vimeo.com/123456')).toBeNull();
    expect(extractYouTubeId('')).toBeNull();
  });
});

describe('a first-party poster keeps YouTube out until the visitor clicks', () => {
  const base = { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Launch film' };

  it('without a poster the iframe loads at once, from the privacy host', () => {
    const { container } = render(createElement(YouTubeBlock, { data: base }));
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(`${YOUTUBE_EMBED_HOST_PRIVACY}/embed/dQw4w9WgXcQ`);
  });

  it('with a poster nothing from YouTube is in the DOM before the click, and the click plays', () => {
    const { container } = render(createElement(YouTubeBlock, { data: { ...base, poster: 'https://cdn.example.com/poster.jpg' } }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.innerHTML).not.toMatch(/youtube/);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/poster.jpg');
    expect(img?.getAttribute('alt')).toBe('Launch film');
    fireEvent.click(container.querySelector('button')!);
    const iframe = container.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe(`${YOUTUBE_EMBED_HOST_PRIVACY}/embed/dQw4w9WgXcQ?autoplay=1`);
  });

  it('the catalogue documents both fields so describe_blocks can offer them', () => {
    const fields = BLOCK_REFERENCE.find((b) => b.type === 'youtube')!.fields.map((f) => f.name);
    expect(fields).toContain('privacyMode');
    expect(fields).toContain('poster');
  });
});
