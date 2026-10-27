import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectEntityUnits, collectProductUnits, diffOverlay } from '../../../supabase/functions/_shared/i18n/translation-units';
import { productInLanguage, productsInLanguage } from '../../../supabase/functions/_shared/i18n/product-language';
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
  it('a list keeps every product in order, each with its own overlay', () => {
    const list = [sweater, { id: 'p2', name: 'Mössa', description: null, locale: 'sv' }];
    const out = productsInLanguage(list, 'en', [{ ...overlay, entity_id: 'p1' }], 'sv');
    expect(out.map((r) => r.product.id)).toEqual(['p1', 'p2']);
    expect(out.map((r) => r.source)).toEqual(['overlay', 'fallback']);
    expect(out[0].product.name).toBe('Wool sweater');
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
    expect(read('src/lib/modules/blog-module.ts')).toMatch(/enum: \['blog_post', 'page', 'product', 'product_category'\]/);
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
