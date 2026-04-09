/**
 * Generate template-audit.json for MCP consumption.
 * Run: bun run /tmp/gen_template_audit.ts
 */
import { ALL_TEMPLATES } from '../src/data/templates/index';

const audit = ALL_TEMPLATES.map(t => {
  const pages = t.pages.map(p => ({
    slug: p.slug,
    title: p.title,
    isHomePage: p.isHomePage || false,
    blockCount: p.blocks.length,
    blockTypes: p.blocks.map(b => b.type),
    hasMeta: !!p.meta,
    metaDescription: p.meta?.description || null,
    metaTitle: p.meta?.title || null,
    titleLength: (p.meta?.title || p.title).length,
    hasMetaDescription: !!(p.meta?.description),
    metaDescriptionLength: (p.meta?.description || '').length,
  }));

  const blogPosts = (t.blogPosts || []).map(bp => ({
    slug: bp.slug,
    title: bp.title,
    titleLength: bp.title.length,
    hasExcerpt: !!bp.excerpt,
    excerptLength: (bp.excerpt || '').length,
    hasFeaturedImage: !!bp.featured_image,
    hasFeaturedImageAlt: !!bp.featured_image_alt,
    hasMetaDescription: !!bp.meta?.description,
    blockCount: bp.content.length,
    blockTypes: bp.content.map(b => b.type),
  }));

  const products = (t.products || []).map(p => ({
    name: p.name,
    hasImage: !!p.image_url,
    hasDescription: !!p.description,
    priceCents: p.price_cents,
    currency: p.currency,
  }));

  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    tagline: t.tagline,
    helpStyle: t.helpStyle || 'none',
    requiredModules: t.requiredModules || [],
    hasHeaderSettings: !!t.headerSettings,
    hasFooterSettings: !!t.footerSettings,
    hasSeoSettings: !!t.seoSettings,
    hasCookieBanner: !!t.cookieBannerSettings,
    branding: {
      primaryColor: (t.branding as any)?.primaryColor || null,
      accentColor: (t.branding as any)?.accentColor || null,
      fontFamily: (t.branding as any)?.fontFamily || null,
    },
    pages,
    blogPosts,
    products,
    consultants: (t.consultants || []).length,
    bookingServices: (t.bookingServices || []).length,
    summary: {
      totalPages: pages.length,
      totalBlogPosts: blogPosts.length,
      totalProducts: products.length,
      pagesWithoutMetaDesc: pages.filter(p => !p.hasMetaDescription).length,
      pagesWithShortTitles: pages.filter(p => p.titleLength < 20).length,
      pagesWithLongTitles: pages.filter(p => p.titleLength > 60).length,
      blogPostsWithoutMetaDesc: blogPosts.filter(bp => !bp.hasMetaDescription).length,
      blogPostsWithLongTitles: blogPosts.filter(bp => bp.titleLength > 60).length,
      blogPostsWithoutImages: blogPosts.filter(bp => !bp.hasFeaturedImage).length,
      productsWithoutImages: products.filter(p => !p.hasImage).length,
    },
  };
});

const output = JSON.stringify(audit, null, 2);
await Bun.write('public/template-audit.json', output);
console.log(`Generated audit for ${audit.length} templates`);
console.log(output.substring(0, 500));
