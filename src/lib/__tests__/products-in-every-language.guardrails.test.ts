import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectAttributeUnits, collectEntityUnits, collectProductUnits, diffOverlay } from '../../../supabase/functions/_shared/i18n/translation-units';
import { attributesInLanguage, productInLanguage, productsInLanguage } from '../../../supabase/functions/_shared/i18n/product-language';
import { productPath, shopAlternates, shopIndexPath, shopVersions } from '../../../supabase/functions/_shared/i18n/shop-address';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** A product as a Swedish shop writes it: name and description, price a fact. */
const sweater = { id: 'p1', name: 'Ulltröja', description: 'Varm, stickad, håller.', price_cents: 129900, locale: 'sv' };
const units = collectProductUnits(sweater, 'product');
const entry = (unit: string, text: string) => ({ text, source_hash: units.find((u) => u.unit === unit)!.hash });

describe('collectProductUnits — a product as the overlay stores it (page-translations.md §10)', () => {
  it('names the product\'s two text fields and nothing else — price, stock, images are facts', () => {
    expect(units.map((u) => u.unit)).toEqual(['product.name', 'product.description']);
    expect(collectProductUnits({ name: 'Stickat', description: null }, 'category').map((u) => u.unit)).toEqual(['category.name']);
  });
  it('is what collectEntityUnits dispatches to for both entities', () => {
    expect(collectEntityUnits('product', sweater).map((u) => u.unit)).toEqual(['product.name', 'product.description']);
    expect(collectEntityUnits('product_category', { name: 'Stickat', description: 'Allt stickat' }).map((u) => u.unit)).toEqual(['category.name', 'category.description']);
  });
});

describe('productInLanguage — the Shopify rule: the same products in every language', () => {
  const overlay = { locale: 'en', status: 'published', slug: null, strings: { 'product.name': entry('product.name', 'Wool sweater') } };

  it('its own language → the product as written', () => {
    const r = productInLanguage(sweater, 'sv', null, 'sv');
    expect(r.source).toBe('product');
    expect(r.product.name).toBe('Ulltröja');
  });
  it('a published overlay → the overlay\'s text, a missing unit falls back to the source and is counted', () => {
    const r = productInLanguage(sweater, 'en', overlay, 'sv');
    expect(r.source).toBe('overlay');
    expect(r.product.name).toBe('Wool sweater');
    expect(r.product.description).toBe('Varm, stickad, håller.');
    expect(r.fallback_units).toEqual(['product.description']);
    expect(r.product.price_cents).toBe(129900);
  });
  it('no overlay → the product as written, never absent (a draft overlay counts as none)', () => {
    expect(productInLanguage(sweater, 'en', null, 'sv').source).toBe('fallback');
    expect(productInLanguage(sweater, 'en', { ...overlay, status: 'draft' }, 'sv').product.name).toBe('Ulltröja');
  });
  it('a changed source leaves the overlay\'s text in place and marks the unit stale', () => {
    const edited = { ...sweater, name: 'Ulltröja, grov' };
    const r = productInLanguage(edited, 'en', overlay, 'sv');
    expect(r.product.name).toBe('Wool sweater');
    expect(r.stale_units).toEqual(['product.name']);
    const d = diffOverlay(collectProductUnits(edited), overlay.strings);
    expect(d.stale.map((u) => u.unit)).toEqual(['product.name']);
  });
  it('a category\'s overlay slug rides along as its address key in that language', () => {
    const cat = { id: 'c1', name: 'Stickat', slug: 'stickat', description: null, locale: 'sv' };
    const u = collectProductUnits(cat, 'category');
    const o = { locale: 'en', status: 'published', slug: 'knitwear', strings: { 'category.name': { text: 'Knitwear', source_hash: u.find((x) => x.unit === 'category.name')!.hash } } };
    const r = productInLanguage(cat, 'en', o, 'sv', 'product_category');
    expect(r.product.name).toBe('Knitwear');
    expect(r.slug).toBe('knitwear');
    expect(productInLanguage(cat, 'sv', o, 'sv', 'product_category').slug).toBeNull();
  });
  it('a list keeps every product in order, each with its own overlay', () => {
    const list = [sweater, { id: 'p2', name: 'Mössa', description: null, locale: 'sv' }];
    const out = productsInLanguage(list, 'en', [{ ...overlay, entity_id: 'p1' }], 'sv');
    expect(out.map((r) => r.product.id)).toEqual(['p1', 'p2']);
    expect(out.map((r) => r.source)).toEqual(['overlay', 'fallback']);
    expect(out[0].product.name).toBe('Wool sweater');
  });
});

describe('variant labels — attribute names and values as overlays, site-wide (§10)', () => {
  const colour = { id: 'a1', name: 'Färg', locale: 'sv', values: [{ id: 'v1', value: 'Röd' }, { id: 'v2', value: 'Blå' }] };
  const aUnits = collectAttributeUnits({ name: colour.name, product_attribute_values: colour.values });
  const hashOf = (unit: string) => aUnits.find((u) => u.unit === unit)!.hash;

  it('names the attribute and each value by the value\'s id, so a renamed value is exactly the stale unit', () => {
    expect(aUnits.map((u) => u.unit)).toEqual(['attribute.name', 'attribute.value.v1', 'attribute.value.v2']);
    expect(collectEntityUnits('product_attribute', { name: 'Size', product_attribute_values: [{ id: 's', value: 'M' }] }).map((u) => u.unit)).toEqual(['attribute.name', 'attribute.value.s']);
    const renamed = collectAttributeUnits({ name: colour.name, product_attribute_values: [{ id: 'v1', value: 'Mörkröd' }, { id: 'v2', value: 'Blå' }] });
    const d = diffOverlay(renamed, { 'attribute.name': { text: 'Colour', source_hash: hashOf('attribute.name') }, 'attribute.value.v1': { text: 'Red', source_hash: hashOf('attribute.value.v1') }, 'attribute.value.v2': { text: 'Blue', source_hash: hashOf('attribute.value.v2') } });
    expect(d.stale.map((u) => u.unit)).toEqual(['attribute.value.v1']);
  });
  it('a published overlay translates the heading and the values; a missing value keeps its source text', () => {
    const overlay = { entity_id: 'a1', locale: 'en', status: 'published', slug: null, strings: { 'attribute.name': { text: 'Colour', source_hash: 'x' }, 'attribute.value.v1': { text: 'Red', source_hash: 'x' } } };
    const [en] = attributesInLanguage([colour], 'en', [overlay], 'sv');
    expect(en.name).toBe('Colour');
    expect(en.values.map((v) => v.value)).toEqual(['Red', 'Blå']);
    const [sv] = attributesInLanguage([colour], 'sv', [overlay], 'sv');
    expect(sv.name).toBe('Färg');
    const [draft] = attributesInLanguage([colour], 'en', [{ ...overlay, status: 'draft' }], 'sv');
    expect(draft.name).toBe('Färg');
  });
  it('the migration adds the entity, the public read, the source locale and the cascade', () => {
    const sql = read('supabase/migrations/20261027160000_variantetiketterna-far-sprak.sql');
    expect(sql).toMatch(/'product_category', 'product_attribute'\)/);
    expect(sql).toMatch(/entity = 'product_attribute' AND EXISTS/);
    expect(sql).toMatch(/ALTER TABLE public\.product_attributes ADD COLUMN IF NOT EXISTS locale text/);
    expect(sql).toMatch(/content_translations_cascade\('product_attribute'\)/);
  });
  it('a product\'s translation carries its labels; the storefront reads them in the shop language; the tab edits them', () => {
    const tc = read('supabase/functions/_shared/handlers/translate-content.ts');
    expect(tc.match(/translateProductAttributes\(supabase/g)!.length).toBe(2);
    expect(read('src/hooks/useProductVariants.ts')).toMatch(/attributesInLanguage\(attributes, language, overlays/);
    expect(read('src/pages/ProductDetailPage.tsx')).toMatch(/useProductVariants\(id, \{ language: shop\.listLanguage/);
    const panel = read('src/components/admin/products/ProductTranslationsPanel.tsx');
    expect(panel).toMatch(/entity: 'product_attribute'/);
    expect(panel).toMatch(/idArg: \{ attribute_id: a\.id \}/);
    for (const seed of ['src/lib/modules/pages-module.ts', 'src/lib/modules/blog-module.ts']) expect(read(seed), seed).toMatch(/attribute_id/);
  });
});

describe('shop-address — /shop in the site language, /<lang>/shop otherwise; the id is the address', () => {
  it('addresses', () => {
    expect(shopIndexPath('sv', 'sv')).toBe('/shop');
    expect(shopIndexPath('en', 'sv')).toBe('/en/shop');
    expect(productPath('p1', 'sv', 'sv')).toBe('/shop/p1');
    expect(productPath('p1', 'en', 'sv')).toBe('/en/shop/p1');
    expect(productPath('p1', null, 'sv')).toBe('/shop/p1');
  });
  it('every enabled language is a version, the site language first, with an x-default', () => {
    const v = shopVersions(['en', 'sv', 'de'], 'sv', (l) => productPath('p1', l, 'sv'));
    expect(v.map((x) => x.locale)).toEqual(['sv', 'en', 'de']);
    const alt = shopAlternates(v, 'sv', 'https://shop.example/');
    expect(alt).toContainEqual({ hreflang: 'x-default', href: 'https://shop.example/shop/p1' });
    expect(alt).toContainEqual({ hreflang: 'en', href: 'https://shop.example/en/shop/p1' });
  });
});

describe('the surfaces agree (guardrails)', () => {
  it('the migration teaches content_translations the two entities, a source locale and the cascade', () => {
    const sql = read('supabase/migrations/20261027150000_produkterna-far-sprak.sql');
    expect(sql).toMatch(/entity IN \('page', 'blog_post', 'product', 'product_category'\)/);
    expect(sql).toMatch(/entity = 'product' AND EXISTS[\s\S]*pr\.is_active = true/);
    expect(sql).toMatch(/ALTER TABLE public\.products ADD COLUMN IF NOT EXISTS locale text/);
    expect(sql).toMatch(/content_translations_cascade\('product'\)/);
    expect(sql).toMatch(/content_translations_cascade\('product_category'\)/);
  });
  it('the skills take the product entities and ids', () => {
    expect(read('src/lib/modules/blog-module.ts')).toMatch(/enum: \['blog_post', 'page', 'product', 'product_category', 'product_attribute'\]/);
    const pages = read('src/lib/modules/pages-module.ts');
    expect(pages).toMatch(/product_id/);
    expect(pages.match(/'product_category'/g)!.length).toBeGreaterThanOrEqual(3);
    const products = read('src/lib/modules/products-module.ts');
    expect(products).toMatch(/languages: \{[\s\S]*enum: \['all'\]/);
    expect(products).toMatch(/retranslate: \{/);
  });
  it('manage_product create/update translate through the one entity path', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src.match(/translateEntityEverywhere\(supabase, 'product'/g)!.length).toBe(2);
  });
  it('the app routes the shop per language and the readers take a language', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('{ path: "/:lang/shop", element: <ShopPage /> }');
    expect(app).toContain('{ path: "/:lang/shop/:id", element: <ProductDetailPage /> }');
    expect(read('src/hooks/useProducts.ts')).toMatch(/productsInLang\(rows, options\.language/);
    expect(read('src/hooks/useProductCategories.ts')).toMatch(/'product_category'\)/);
    for (const page of ['src/pages/ShopPage.tsx', 'src/pages/ProductDetailPage.tsx']) {
      const s = read(page);
      expect(s).toMatch(/useShopLanguage\(\)/);
      expect(s).toMatch(/if \(!shop\.valid\) return <NotFound \/>;/);
      expect(s).toMatch(/<PublicNavigation translations=/);
      expect(s).not.toMatch(/to="\/shop"/);
    }
  });
  it('every product block reads in the page\'s language and links there', () => {
    for (const block of ['ProductsBlock', 'FeaturedProductBlock', 'PricingBlock', 'CategoryNavBlock']) {
      const s = read(`src/components/public/blocks/${block}.tsx`);
      expect(s, block).toMatch(/useUiTextLanguage\(\)/);
      expect(s, block).toMatch(/language: /);
      expect(s, block).not.toMatch(/productHref\(product\.id\)/);
    }
    expect(read('src/hooks/useStorefront.ts')).toMatch(/productPath\(id, lang, defaultLanguage\)/);
  });
  it('the shop resolves ?category= by the translated or the source slug; the writer derives a free slug once', () => {
    const shop = read('src/pages/ShopPage.tsx');
    expect(shop).toMatch(/searchParams\.get\('category'\)/);
    expect(shop).toMatch(/source_slug\?\.toLowerCase\(\) === categoryParam/);
    expect(read('src/lib/product-language.ts')).toMatch(/slug: r\.slug \?\? .*\.slug, source_slug/);
    const overlay = read('supabase/functions/_shared/handlers/content-overlay.ts');
    expect(overlay).toMatch(/async function freeCategorySlug/);
    expect(overlay).toMatch(/existing\?\.slug \? \{ slug: existing\.slug \} : derivedSlug \? \{ slug: derivedSlug \} : \{\}/);
    expect(read('src/components/admin/products/ProductTranslationsPanel.tsx')).toMatch(/translated_slug: slug \|\| null/);
  });
  it('content-api serves products in a language, the admin has a Translations tab, the head filler knows /<lang>/shop', () => {
    const api = read('supabase/functions/content-api/index.ts');
    expect(api).toMatch(/products\(limit: Int, offset: Int, active: Boolean, lang: String\)/);
    expect(api.match(/productsForLang\(/g)!.length).toBe(3);
    expect(read('src/components/admin/ProductDialog.tsx')).toMatch(/<ProductTranslationsPanel product=\{product\} \/>/);
    expect(read('src/components/admin/ProductCategoryManager.tsx')).toMatch(/<ProductTranslationsPanel entity="product_category" product=\{editing\} \/>/);
    expect(read('src/lib/modules/pages-module.ts').match(/category_id: \{/g)!.length).toBe(2);
    expect(read('api/html.ts')).toMatch(/\(blog\|shop\)/);
  });
});
