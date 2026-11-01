/**
 * Brand covers — blog.coverStyle 'brand' (Blog settings → Cover images).
 *
 * www.flowwink.com's blog showed a keyword-searched Unsplash photo per post: a
 * Swiss knife, a scanned page, an "EO" sign. The owner chose covers drawn from
 * the branding: consistent, never off-topic, zero cost per image. A per-site
 * dial; other instances keep their photos.
 *
 * The guard at the bottom DISCOVERS every public renderer of featured_image
 * (it scans src/, it does not list files): an <img> or a CSS url() fed from
 * featured_image anywhere but PostPicture is a surface that ignores the dial.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BlogCover } from '@/components/public/BlogCover';
import { blogCardPicture, blogCoverStyle, blogShareImage, coverBand, coverDialFromQuery, coverInitial, coverSeed, hasPostPicture, shortBrandName } from '@/lib/blog-cover';
import { defaultBlogSettings } from '@/hooks/useSiteSettings';
import { PostPicture } from '@/components/public/PostPicture';

// PostPicture reads the site name for the eyebrow; no query client in a unit test.
vi.mock('@/hooks/useSiteSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useSiteSettings')>()),
  useSeoSettings: () => ({ data: { siteTitle: 'FlowWink — The Business Operating System' } }),
  useBrandingSettings: () => ({ data: {} }),
}));

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the dial', () => {
  it('defaults to photo — no behaviour change for an instance that never set it', () => {
    expect(defaultBlogSettings.coverStyle).toBe('photo');
    expect(blogCoverStyle(undefined)).toBe('photo');
    expect(blogCoverStyle({})).toBe('photo');
    expect(blogCoverStyle({ coverStyle: 'nonsense' })).toBe('photo');
    expect(blogCoverStyle({ coverStyle: 'brand' })).toBe('brand');
  });
  it('brand gives every post a picture slot; photo only a post with an image', () => {
    expect(hasPostPicture({ featured_image: null }, 'brand')).toBe(true);
    expect(hasPostPicture({ featured_image: null }, 'photo')).toBe(false);
    expect(hasPostPicture({ featured_image: '  ' }, 'photo')).toBe(false);
    expect(hasPostPicture({ featured_image: 'https://x/y.jpg' }, 'photo')).toBe(true);
  });
  it('the share image: meta.ogImage first; brand → the derived card for the post\'s address; photo → the featured image', () => {
    const base = { origin: 'https://www.flowwink.com', path: '/sv/blog/en-post', featuredImage: 'https://images.unsplash.com/x' };
    expect(blogShareImage({ ...base, style: 'brand', metaOgImage: 'https://cdn/own.png' })).toBe('https://cdn/own.png');
    expect(blogShareImage({ ...base, style: 'brand' })).toBe('https://www.flowwink.com/api/og?path=%2Fsv%2Fblog%2Fen-post');
    expect(blogShareImage({ ...base, style: 'photo' })).toBe('https://images.unsplash.com/x');
    expect(blogShareImage({ ...base, style: 'photo', featuredImage: null })).toBeNull();
  });
  it('the derived card draws no picture in brand mode — the card is the cover', () => {
    expect(blogCardPicture('brand', 'https://images.unsplash.com/x')).toBeNull();
    expect(blogCardPicture('photo', 'https://images.unsplash.com/x')).toBe('https://images.unsplash.com/x');
    expect(blogCardPicture('photo', '')).toBeNull();
  });
});

describe('no stock photo flashes before the dial is known', () => {
  const post = { title: 'Why private AI', slug: 'why', featured_image: 'https://images.unsplash.com/x', featured_image_alt: 'a sign' };
  it('the dial is pending until the settings load; a failed read is photo; a failed refetch keeps the loaded value', () => {
    expect(coverDialFromQuery({ data: undefined, isError: false })).toBe('pending');
    expect(coverDialFromQuery({ data: undefined, isError: true })).toBe('photo');
    expect(coverDialFromQuery({ data: { coverStyle: 'brand' }, isError: false })).toBe('brand');
    expect(coverDialFromQuery({ data: { coverStyle: 'brand' }, isError: true })).toBe('brand');
    expect(coverDialFromQuery({ data: defaultBlogSettings, isError: false })).toBe('photo');
  });
  it('the hook reads the query state, not an assumed photo', () => {
    const hooks = read('src/hooks/useSiteSettings.tsx');
    expect(hooks).toMatch(/export function useBlogCoverStyle\(\): BlogCoverDial \{\s*const \{ data, isError \} = useBlogSettings\(\);\s*return coverDialFromQuery\(\{ data, isError \}\);/);
  });
  it('pending: a placeholder in the cover\'s box on the muted surface — no <img>, no cover', () => {
    expect(hasPostPicture(post, 'pending')).toBe(true);
    expect(hasPostPicture({ featured_image: null }, 'pending')).toBe(false);
    const { container } = render(<PostPicture post={post} style="pending" variant="card" imgClassName="w-full h-full object-cover" coverClassName="w-full aspect-[2/1] rounded-lg" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-blog-cover]')).toBeNull();
    const ph = container.querySelector('[data-post-picture-pending]') as HTMLElement;
    expect(ph.getAttribute('aria-hidden')).toBe('true');
    expect(ph.className).toMatch(/\bbg-muted\b/);
    expect(ph.className).toContain('aspect-[2/1]');
  });
  it('resolved: brand draws the cover (site name as eyebrow), photo the picture', () => {
    const brand = render(<PostPicture post={post} style="brand" variant="card" />).container;
    expect(brand.querySelector('img')).toBeNull();
    // seo.siteTitle is "FlowWink — The Business Operating System": the eyebrow is the short name.
    expect(brand.querySelector('[data-blog-cover-eyebrow]')!.textContent).toBe('FlowWink');
    const photo = render(<PostPicture post={post} style="photo" variant="card" />).container;
    expect(photo.querySelector('img')!.getAttribute('src')).toBe(post.featured_image);
  });
  it('every surface takes the dial from the hook (BlogPostPage no longer derives it from the settings data)', () => {
    expect(read('src/pages/BlogPostPage.tsx')).toMatch(/const coverStyle = useBlogCoverStyle\(\);/);
    expect(read('src/pages/BlogPostPage.tsx')).not.toMatch(/blogCoverStyle\(blogSettings\)/);
    expect(read('src/components/public/BlogPostCard.tsx')).toMatch(/const coverStyle = useBlogCoverStyle\(\);/);
  });
});

describe('the cover', () => {
  it('is deterministic per seed and varies between posts', () => {
    expect(coverSeed('my-post')).toBe(coverSeed('my-post'));
    expect(coverSeed('my-post')).not.toBe(coverSeed('my-post-2'));
    expect(coverSeed('my-post')).toBeGreaterThan(0);
    const a = render(<BlogCover title="Privat AI" seed="privat-ai" variant="card" eyebrow="Guides" />).container.innerHTML;
    const b = render(<BlogCover title="Privat AI" seed="privat-ai" variant="card" eyebrow="Guides" />).container.innerHTML;
    expect(a).toBe(b);
    const heights = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => {
      const el = render(<BlogCover title="T" seed={s} variant="card" />).container.querySelector('[data-pixel-gradient]')!.parentElement as HTMLElement;
      return el.style.getPropertyValue('--cover-band');
    }));
    expect(heights.size).toBeGreaterThan(1);
  });

  it('hero and card: eyebrow + title over the dither band and the primary→accent bar, on the dark cover surface, decorative', () => {
    for (const variant of ['hero', 'card'] as const) {
      const { container } = render(<BlogCover title="Why private AI" seed="why" variant={variant} eyebrow="Guides" className="aspect-[2/1]" />);
      const cover = container.firstElementChild as HTMLElement;
      expect(cover.getAttribute('aria-hidden')).toBe('true');
      expect(cover.getAttribute('data-blog-cover')).toBe(variant);
      expect(cover.className).toMatch(/\bsurface-cover\b/);
      expect(cover.className).toMatch(/\bbg-background\b/);
      expect(cover.className).toContain('aspect-[2/1]');
      expect(container.querySelector('[data-blog-cover-title]')!.textContent).toBe('Why private AI');
      expect(container.querySelector('[data-blog-cover-eyebrow]')!.textContent).toBe('Guides');
      expect(container.querySelector('[data-pixel-gradient="in"]')).not.toBeNull();
      expect(container.querySelector('[data-blog-cover-bar]')!.className).toMatch(/from-\[hsl\(var\(--primary\)\)\].*to-\[hsl\(var\(--cover-accent\)\)\]/);
      expect(container.querySelector('img')).toBeNull();
    }
    const noEyebrow = render(<BlogCover title="X" seed="x" variant="card" />).container;
    expect(noEyebrow.querySelector('[data-blog-cover-eyebrow]')).toBeNull();
  });

  it('a card or hero in a NARROW slot draws only the motif and the letter — by the slot\'s width, not the variant', () => {
    const { container } = render(<BlogCover title="Fragmentation Tax: Why" seed="f" variant="card" eyebrow="FlowWink" />);
    // Both are rendered; index.css decides on the cover's own width which shows.
    const initial = container.querySelector('[data-blog-cover-initial]') as HTMLElement;
    expect(initial.textContent).toBe('F');
    expect(initial.className).toMatch(/\bblog-cover-initial\b/);
    expect((container.querySelector('[data-blog-cover-text]') as HTMLElement).className).toMatch(/\bblog-cover-text\b/);
    const thumb = render(<BlogCover title="X" seed="x" variant="thumb" />).container;
    expect(thumb.querySelector('[data-blog-cover-initial]')!.className).not.toMatch(/blog-cover-initial/); // always shown
    expect(thumb.querySelector('[data-blog-cover-text]')).toBeNull();
    const css = read('src/index.css');
    expect(css).toMatch(/\.surface-cover \.blog-cover-initial \{\s*display: none;/);
    expect(css).toMatch(/@container \(max-width: 14rem\) \{\s*\.surface-cover \.blog-cover-text \{\s*display: none;\s*\}\s*\.surface-cover \.blog-cover-initial \{\s*display: block;/);
    expect(read('src/components/public/BlogCover.tsx')).toMatch(/\[container-type:inline-size\]/);
  });

  it('the eyebrow without a category is the brand\'s SHORT name — on the page and on the share card', () => {
    expect(shortBrandName({ organizationName: 'FlowWink', siteTitle: 'FlowWink — The Business Operating System' })).toBe('FlowWink');
    expect(shortBrandName({ siteTitle: 'FlowWink — The Business Operating System' })).toBe('FlowWink');
    expect(shortBrandName({ siteTitle: 'Nordbrygg | Craft beer' })).toBe('Nordbrygg');
    expect(shortBrandName({ siteTitle: 'Resta Gård' })).toBe('Resta Gård');
    expect(shortBrandName({ organizationName: '  ', siteTitle: '' })).toBe('');
    const og = read('api/og.ts');
    expect(og).toMatch(/const brandName = shortBrandName\(\{ organizationName: branding\.organizationName, siteTitle: seo\.siteTitle \}\);/);
    expect(og).not.toMatch(/eyebrow = siteName;/);
  });

  it('thumb: the motif and the first letter, no title text', () => {
    const { container } = render(<BlogCover title="  ägare och AI" seed="x" variant="thumb" eyebrow="Guides" />);
    expect(container.querySelector('[data-blog-cover-title]')).toBeNull();
    expect(container.querySelector('[data-blog-cover-eyebrow]')).toBeNull();
    expect(container.textContent).toBe('Ä');
    expect(coverInitial('2026: året')).toBe('2');
    expect(coverInitial('')).toBe('');
  });

  it('a row of compact covers is not one picture repeated: the letter skips short lead words, the band spans a wide range', () => {
    // www 2026-10-30: every "The …" title drew a "T" with the same band.
    expect(coverInitial('The Website-to-Workflow Gap')).toBe('W');
    expect(coverInitial('The Fragmentation Tax: Why')).toBe('F');
    expect(coverInitial('Why AI fails')).toBe('F');
    expect(coverInitial('En ny väg')).toBe('E'); // no long word: the first letter, as before
    expect(coverInitial('Är det dags')).toBe('D');
    const heights = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => coverBand(coverSeed(`post-${s}`), 'thumb').compact));
    for (const h of heights) { expect(h).toBeGreaterThanOrEqual(26); expect(h).toBeLessThanOrEqual(72); }
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThanOrEqual(20);
    for (let s = 1; s < 500; s += 37) {
      const { full } = coverBand(s, 'card');
      expect(full).toBeGreaterThanOrEqual(32); expect(full).toBeLessThanOrEqual(40); // under a title: modest, as before
    }
    const thumb = render(<BlogCover title="X" seed="x" variant="thumb" />).container.querySelector('[data-blog-cover-band]') as HTMLElement;
    expect(thumb.className).toMatch(/h-\[var\(--cover-band-compact\)\]/);
    const card = render(<BlogCover title="X" seed="x" variant="card" />).container.querySelector('[data-blog-cover-band]') as HTMLElement;
    expect(card.className).toMatch(/\bblog-cover-band\b/);
    expect(card.style.getPropertyValue('--cover-band-compact')).toMatch(/^\d+%$/);
    expect(read('src/index.css')).toMatch(/@container \(max-width: 14rem\) \{[^}]*\}[^}]*\}\s*\/\*[^*]*\*\/\s*\.surface-cover \.blog-cover-band \{\s*height: var\(--cover-band-compact\);/);
  });

  it('the surface is dark in both themes, by token (index.css)', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/:root:not\(\.dark\) \.surface-cover,\s*\.surface-inverse \{/);
    expect(css).toMatch(/\.dark \.surface-inverse \.surface-cover,\s*\.dark \.surface-inverse \.surface-inverse \{/);
    expect(css).toMatch(/--cover-accent: var\(--accent-inverse, var\(--gradient-highlight, var\(--primary\)\)\)/);
  });
});

// ── Every public renderer of featured_image goes through PostPicture ──────
const SCAN_ROOTS = ['src'];
const SKIP = [/\/__tests__\//, /\/admin\//, /\.test\.tsx?$/, /\/integrations\//];
function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...files(rel));
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
// The SHAPE of a post picture: an image source or a CSS url() fed from featured_image.
const RENDERS_FEATURED_IMAGE = /src=\{[^}]*\bfeatured_image\b|url\([^)]*\bfeatured_image\b|backgroundImage:[^,}]*\bfeatured_image\b/;

describe('every public post picture honours the dial', () => {
  it('the shape catches the renderers this PR replaced', () => {
    expect(RENDERS_FEATURED_IMAGE.test('<img\n  src={post.featured_image}\n  alt="" />')).toBe(true);
    expect(RENDERS_FEATURED_IMAGE.test('style={{ backgroundImage: `url(${post.featured_image})` }}')).toBe(true);
    expect(RENDERS_FEATURED_IMAGE.test('src={post.featured_image as string}')).toBe(true);
    expect(RENDERS_FEATURED_IMAGE.test('hasPostPicture(post, coverStyle)')).toBe(false);
  });
  it('no public component or page renders featured_image except PostPicture', () => {
    const scanned = SCAN_ROOTS.flatMap(files).filter((f) => !SKIP.some((re) => re.test(f)));
    expect(scanned.length).toBeGreaterThan(200); // the scan really walked the tree
    const offenders = scanned
      .filter((f) => f !== 'src/components/public/PostPicture.tsx')
      .filter((f) => RENDERS_FEATURED_IMAGE.test(read(f)))
      .map((f) => relative(ROOT, join(ROOT, f)));
    expect(offenders, 'render a post picture with <PostPicture> (photo or brand cover, blog.coverStyle)').toEqual([]);
    expect(RENDERS_FEATURED_IMAGE.test(read('src/components/public/PostPicture.tsx'))).toBe(true);
  });
  it('the known surfaces use it: cards (thumb/card), the post hero, the latest-posts block', () => {
    const card = read('src/components/public/BlogPostCard.tsx');
    expect(card.match(/<PostPicture/g)?.length).toBe(3);
    expect(card).toMatch(/variant="thumb"/);
    expect(read('src/pages/BlogPostPage.tsx')).toMatch(/<PostPicture[\s\S]*variant="hero"/);
    expect(read('src/components/public/blocks/LatestPostsBlock.tsx')).toMatch(/useBlogCoverStyle\(\)[\s\S]*<PostPicture/);
  });
});

describe('the share card and the agent follow the dial', () => {
  it('the shell reads blog settings and emits the brand card for a post in brand mode', () => {
    const html = read('api/html.ts');
    expect(html).toMatch(/site_settings\?key=in\.\([^)]*\bblog\b[^)]*\)/);
    expect(html).toMatch(/blogShareImage\(\{\s*style: blogCoverStyle\(byKey\.blog\),\s*metaOgImage:/);
    expect(html).not.toMatch(/if \(post\.featured_image\) image = post\.featured_image;/);
  });
  it('the card renderer has a blog branch: /blog/<slug> and /<lang>/blog/<slug>, no picture in brand mode', () => {
    const og = read('api/og.ts');
    expect(og).toMatch(/site_settings\?key=in\.\([^)]*\bsite_languages\b[^)]*\bblog\b[^)]*\)/);
    expect(og).toMatch(/splitLanguagePrefix\(path,/);
    expect(og).toMatch(/picture = blogCardPicture\(blogCoverStyle\(byKey\.blog\), post\.featuredImage\)/);
    expect(og).toMatch(/content_translations\?entity=eq\.blog_post/);
  });
  it('the post page\'s head uses the same rule', () => {
    expect(read('src/pages/BlogPostPage.tsx')).toMatch(/const metaOgImage = blogShareImage\(\{/);
  });
  it('write_blog_post fetches no stock photo, update "auto" fetches none, the audit judges no image — in brand mode', () => {
    const exec = read('supabase/functions/agent-execute/index.ts');
    expect(exec).toMatch(/const brandCovers = isBrandCovers\(blogSettingsRow\?\.value\);/);
    expect(exec).toMatch(/if \(!featuredImage && !brandCovers\) \{\n\s+imageQuery =/);
    expect(exec).toMatch(/if \(brandCovers\) imageStatus = 'brand';/);
    expect(exec).toMatch(/if \(featured_image === 'auto' && isBrandCovers\(blogRow\?\.value\)\) \{/);
    expect(exec).toMatch(/if \(!brandCovers && !p\.featured_image\) findings\.push\(\{ kind: 'no_image'/);
    expect(exec).toMatch(/else if \(!brandCovers && stock && genericAlt\) findings\.push\(\{ kind: 'stock_image'/);
    expect(exec).toMatch(/const text = postBodyText\(p\.content_json\);/);
  });
  it('the live settings tab carries the dial and the word floor (the orphan page is gone)', () => {
    const tab = read('src/components/admin/blog/BlogSettingsTab.tsx');
    expect(tab).toMatch(/updateField\('coverStyle'/);
    expect(tab).toMatch(/updateField\('minWords'/);
    expect(() => read('src/pages/admin/BlogSettingsPage.tsx')).toThrow();
  });
});
