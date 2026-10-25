import { describe, it, expect } from 'vitest';
import {
  collectEntityUnits, collectPostUnits, collectUnits, diffOverlay, type OverlayEntry,
} from '../../../supabase/functions/_shared/i18n/translation-units';
import { resolveContentInLocale } from '../../../supabase/functions/_shared/i18n/resolve-page';
import { assembleOverlay, numberForTranslation, planOverlayWrite } from '../../../supabase/functions/_shared/i18n/overlay-write';
import {
  blogIndexPath, blogPostPath, postAlternates, postVersions,
} from '../../../supabase/functions/_shared/i18n/blog-address';
import { postInLanguage, postsInLanguage } from '../../../supabase/functions/_shared/i18n/post-language';

/** A post as nordbrygg writes them: a Tiptap body, an excerpt, SEO meta, an alt text. */
const doc = (...paras: string[]) => ({
  type: 'doc',
  content: paras.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

const post = {
  id: 'p1', slug: 'vintern-pa-kajen', locale: 'sv', status: 'published',
  title: 'Vintern på kajen',
  excerpt: 'Hur vi håller bryggan öppen när isen lägger sig.',
  meta_json: { seoTitle: 'Vintern på kajen — Nordbrygg', description: 'Isfri brygga hela året.', generated_by: 'external_agent' },
  featured_image: 'https://images.example/kaj.jpg',
  featured_image_alt: 'En brygga i snö',
  content_json: doc('Isen lägger sig i december.', 'Vi bubblar vattnet runt pålarna.'),
};

const fresh = (units: ReturnType<typeof collectPostUnits>, patch: Record<string, string | object>): Record<string, OverlayEntry> =>
  Object.fromEntries(Object.entries(patch).map(([unit, value]) => {
    const u = units.find((x) => x.unit === unit)!;
    return [unit, typeof value === 'string' ? { text: value, source_hash: u.hash } : { doc: value, source_hash: u.hash }];
  }));

describe('collectPostUnits — a blog post as the overlay stores it (page-translations.md §9)', () => {
  it('names the post\'s text fields, the body as ONE doc unit', () => {
    const units = collectPostUnits(post);
    expect(units.map((u) => u.unit)).toEqual([
      'post.title', 'post.excerpt', 'post.meta.seoTitle', 'post.meta.description', 'post.content', 'post.featured_image_alt',
    ]);
    const body = units.find((u) => u.unit === 'post.content')!;
    expect(body.kind).toBe('doc');
    expect(body.path).toEqual(['content_json']);
  });

  it('never offers layout or identifiers: image URL, slug, generated_by', () => {
    const texts = collectPostUnits(post).map((u) => u.text).join(' ');
    expect(texts).not.toContain('https://');
    expect(texts).not.toContain('external_agent');
    expect(texts).not.toContain('vintern-pa-kajen');
  });

  it('a legacy block-array body is keyed per block under post.content.', () => {
    const legacy = { ...post, content_json: [{ id: 'b1', type: 'text', data: { title: 'Rubrik här', content: doc('En mening.') } }] };
    const keys = collectPostUnits(legacy).map((u) => u.unit);
    expect(keys).toContain('post.content.b1.data.title');
    expect(keys).toContain('post.content.b1.data.content');
  });

  it('collectEntityUnits is one walker, entity-aware at the root', () => {
    expect(collectEntityUnits('blog_post', post)).toEqual(collectPostUnits(post));
    const page = { title: 'Tjänster', content_json: [{ id: 'h', type: 'hero', data: { title: 'Våra tjänster' } }] };
    expect(collectEntityUnits('page', page)).toEqual(collectUnits(page));
  });

  it('editing ONE paragraph makes exactly post.content stale, nothing else', () => {
    const units = collectPostUnits(post);
    const strings = fresh(units, {
      'post.title': 'Winter on the quay', 'post.excerpt': 'How we keep the pier open.',
      'post.content': doc('The ice sets in December.', 'We bubble the water around the piles.'),
    });
    const edited = { ...post, content_json: doc('Isen lägger sig i januari.', 'Vi bubblar vattnet runt pålarna.') };
    const d = diffOverlay(collectPostUnits(edited), strings);
    expect(d.stale.map((u) => u.unit)).toEqual(['post.content']);
    expect(d.fresh.map((u) => u.unit)).toEqual(['post.title', 'post.excerpt']);
  });

  it('a mark moved in the body is not a change of text', () => {
    const units = collectPostUnits(post);
    const marked = {
      ...post,
      content_json: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Isen lägger sig i december.', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Vi bubblar vattnet runt pålarna.' }] },
      ] },
    };
    expect(collectPostUnits(marked).find((u) => u.unit === 'post.content')!.hash)
      .toBe(units.find((u) => u.unit === 'post.content')!.hash);
  });
});

describe('the write rule holds for posts: plan → number → assemble', () => {
  it('only the stale body is sent to the model; the polished title is kept', () => {
    const units = collectPostUnits(post);
    const strings = fresh(units, { 'post.title': 'Winter on the quay (polished)', 'post.content': doc('Old.', 'Old.') });
    const edited = { ...post, content_json: doc('Isen lägger sig i januari.', 'Vi bubblar vattnet runt pålarna.') };
    const plan = planOverlayWrite(collectPostUnits(edited), strings);
    expect(plan.translate.map((u) => u.unit).sort()).toEqual(['post.content', 'post.excerpt', 'post.featured_image_alt', 'post.meta.description', 'post.meta.seoTitle'].sort());
    expect(plan.keep['post.title'].text).toBe('Winter on the quay (polished)');

    const numbering = numberForTranslation(plan.translate);
    const translations = new Map(numbering.items.map((it) => [it.i, `EN:${it.text}`]));
    const out = assembleOverlay(plan, numbering, translations, strings);
    expect(out.strings['post.title'].text).toBe('Winter on the quay (polished)');
    expect(out.coverage).toBe(100);
    const body = out.strings['post.content'].doc as ReturnType<typeof doc>;
    expect(body.content[0].content[0].text).toBe('EN:Isen lägger sig i januari.');
    expect(out.strings['post.content'].source_hash).toBe(collectPostUnits(edited).find((u) => u.unit === 'post.content')!.hash);
  });
});

describe('resolveContentInLocale — the post with the overlay\'s text', () => {
  it('replaces title, excerpt, meta, alt and the body; keeps everything else', () => {
    const units = collectPostUnits(post);
    const strings = fresh(units, {
      'post.title': 'Winter on the quay',
      'post.meta.seoTitle': 'Winter on the quay — Nordbrygg',
      'post.featured_image_alt': 'A pier in snow',
      'post.content': doc('The ice sets in December.', 'We bubble the water around the piles.'),
    });
    const r = resolveContentInLocale('blog_post', post, { locale: 'en', status: 'published', slug: 'winter-on-the-quay', strings });
    expect(r.page.title).toBe('Winter on the quay');
    expect((r.page.meta_json as Record<string, string>).seoTitle).toBe('Winter on the quay — Nordbrygg');
    expect(r.page.featured_image_alt).toBe('A pier in snow');
    expect((r.page.content_json as ReturnType<typeof doc>).content[1].content[0].text).toBe('We bubble the water around the piles.');
    // Not text: never touched.
    expect(r.page.slug).toBe(post.slug);
    expect(r.page.featured_image).toBe(post.featured_image);
    // Missing units show the source, visibly counted.
    expect(r.page.excerpt).toBe(post.excerpt);
    expect(r.fallback_units).toEqual(['post.excerpt', 'post.meta.description']);
    expect(r.slug).toBe('winter-on-the-quay');
  });
});

describe('blog addresses — the site language on the root, the others prefixed', () => {
  it('follows the language SHOWN, not the source', () => {
    expect(blogPostPath('x', 'en', 'en')).toBe('/blog/x');
    expect(blogPostPath('x', 'sv', 'en')).toBe('/sv/blog/x');
    expect(blogPostPath('x', null, 'sv')).toBe('/blog/x');
    expect(blogPostPath('x', 'en-gb', 'en')).toBe('/blog/x');
    expect(blogIndexPath('sv', 'en')).toBe('/sv/blog');
    expect(blogIndexPath('en', 'en', '/category/news')).toBe('/blog/category/news');
    expect(blogIndexPath('sv', 'en', 'tag/is')).toBe('/sv/blog/tag/is');
  });

  it('versions: the post in its own language plus each PUBLISHED overlay, with its own slug', () => {
    const v = postVersions({ slug: 'vintern-pa-kajen', locale: 'sv', title: 'Vintern på kajen' }, [
      { locale: 'en', status: 'published', slug: 'winter-on-the-quay', strings: { 'post.title': { text: 'Winter on the quay' } } },
      { locale: 'de', status: 'draft', slug: null, strings: {} },
    ], 'en');
    expect(v).toEqual([
      { locale: 'sv', slug: 'vintern-pa-kajen', title: 'Vintern på kajen', source: 'post', href: '/sv/blog/vintern-pa-kajen' },
      { locale: 'en', slug: 'winter-on-the-quay', title: 'Winter on the quay', source: 'overlay', href: '/blog/winter-on-the-quay' },
    ]);
  });

  it('hreflang: every version lists every version, x-default on the site language, none for one version', () => {
    const v = postVersions({ slug: 'p', locale: 'en', title: 'P' }, [{ locale: 'sv', status: 'published', slug: null, strings: null }], 'en');
    expect(postAlternates(v, 'en', 'https://nordbrygg.se/')).toEqual([
      { hreflang: 'en', href: 'https://nordbrygg.se/blog/p' },
      { hreflang: 'sv', href: 'https://nordbrygg.se/sv/blog/p' },
      { hreflang: 'x-default', href: 'https://nordbrygg.se/blog/p' },
    ]);
    expect(postAlternates(postVersions({ slug: 'p', locale: 'en' }, [], 'en'), 'en', 'https://x.se')).toEqual([]);
  });
});

describe('postInLanguage — the one answer to "is this post in Swedish?"', () => {
  const units = collectPostUnits(post);
  const enOverlay = { entity_id: 'p1', locale: 'en', status: 'published', slug: null, strings: fresh(units, { 'post.title': 'Winter on the quay' }) };

  it('its own language: the post as written', () => {
    const r = postInLanguage(post, 'sv', null, 'en')!;
    expect(r.source).toBe('post');
    expect(r.post).toBe(post);
  });

  it('a published overlay: the post with its text; the overlay\'s slug when it has one', () => {
    const r = postInLanguage(post, 'en', { ...enOverlay, slug: 'winter' }, 'en')!;
    expect(r.source).toBe('overlay');
    expect(r.post.title).toBe('Winter on the quay');
    expect(r.slug).toBe('winter');
  });

  it('a draft overlay or none: absent in that language', () => {
    expect(postInLanguage(post, 'en', { ...enOverlay, status: 'draft' }, 'en')).toBeNull();
    expect(postInLanguage(post, 'en', null, 'en')).toBeNull();
  });

  it('a list in L drops the absent and translates the rest, order kept', () => {
    const other = { ...post, id: 'p2', slug: 'english-one', locale: 'en', title: 'English one' };
    const third = { ...post, id: 'p3', slug: 'bara-svenska', title: 'Bara svenska' };
    const list = postsInLanguage([other, post, third], 'en', [enOverlay], 'en');
    expect(list.map((r) => r.post.title)).toEqual(['English one', 'Winter on the quay']);
  });
});
