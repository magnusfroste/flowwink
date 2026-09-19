/**
 * Param resolution: `/admin/deals/:id` needs a real deal.
 *
 * Routes are discovered; the ENTITY behind a param cannot be (nothing in the
 * route table says `:id` is a deal). So this file maps a pattern to one SQL
 * query that picks a real row. The contract that keeps it honest:
 *
 *   - a parameterised route with NO resolver is reported `skipped: no resolver`
 *   - a resolver that finds no row is reported `skipped: no data`
 *   - a resolver whose SQL errors is reported `skipped: resolver error`
 *
 * Nothing is skipped silently, so a new `/admin/things/:id` route shows up in
 * the very next report as the one line that needs a resolver.
 *
 * Every query returns ONE row whose columns are named after the route params.
 * Prefer the row a visitor would actually reach (published, not deleted).
 */
import type { Client } from 'pg';

export type Resolution =
  | { ok: true; values: Record<string, string> }
  | { ok: false; reason: string };

const RESOLVERS: Record<string, string> = {
  // ── public ────────────────────────────────────────────────────────────
  '/shop/:id': `select id::text as id from products where is_active order by created_at limit 1`,
  '/track/:id': `select id::text as id from orders order by created_at desc limit 1`,
  '/blog/category/:slug': `select slug from blog_categories order by created_at limit 1`,
  '/blog/tag/:slug': `select slug from blog_tags order by created_at limit 1`,
  '/blog/author/:slug': `select p.id::text as slug from profiles p
     where exists (select 1 from blog_posts b where b.author_id = p.id and b.status = 'published') limit 1`,
  '/blog/:slug': `select slug from blog_posts where status = 'published' order by published_at desc nulls last limit 1`,
  '/kb/:slug': `select slug from kb_articles where is_published order by created_at limit 1`,
  '/jobs/:slug': `select slug from job_postings where status = 'published' order by created_at limit 1`,
  '/docs/:category': `select category from docs_pages where is_published order by sort_order limit 1`,
  '/docs/:category/:slug': `select category, slug from docs_pages where is_published order by sort_order limit 1`,
  '/meet/:slug': `select slug from webmeet_rooms order by created_at desc limit 1`,
  '/quote/:token': `select accept_token::text as token from quotes where accept_token is not null order by created_at desc limit 1`,
  '/quote/:token/certificate': `select accept_token::text as token from quotes
     where accept_token is not null and status = 'accepted' order by created_at desc limit 1`,
  '/invoice/:token': `select public_token::text as token from invoices where public_token is not null order by created_at desc limit 1`,
  '/sign/document/:token': `select token::text as token from document_signature_requests order by created_at desc limit 1`,
  '/s/:token': `select token::text as token from survey_sends where token is not null order by created_at desc limit 1`,
  '/contract/:token': `select accept_token::text as token from contracts where accept_token is not null order by created_at desc limit 1`,
  '/contract/:token/certificate': `select accept_token::text as token from contracts
     where accept_token is not null and status = 'active' order by created_at desc limit 1`,
  '/preview/:id': `select id::text as id from pages where deleted_at is null order by created_at limit 1`,
  '/:slug': `select slug from pages where status = 'published' and deleted_at is null and slug <> 'home' order by created_at limit 1`,
  // A language-prefixed address only exists for a page that HAS a published
  // sibling in another locale; `lang` is that sibling's two-letter prefix and
  // `slug` the base page's slug.
  '/:lang/:slug': `select lower(split_part(sib.locale, '-', 1)) as lang, base.slug as slug
     from pages base join pages sib
       on sib.translation_group_id = base.translation_group_id and sib.id <> base.id
     where base.status = 'published' and sib.status = 'published'
       and base.deleted_at is null and sib.deleted_at is null
       and sib.locale is distinct from base.locale
     order by base.created_at limit 1`,

  // ── admin ─────────────────────────────────────────────────────────────
  '/admin/pages/:id': `select id::text as id from pages where deleted_at is null order by created_at limit 1`,
  '/admin/blog/:id': `select id::text as id from blog_posts order by created_at limit 1`,
  '/admin/leads/:id': `select id::text as id from leads order by created_at desc limit 1`,
  '/admin/contacts/:id': `select id::text as id from leads order by created_at desc limit 1`,
  '/admin/deals/:id': `select id::text as id from deals order by created_at desc limit 1`,
  '/admin/companies/:id': `select id::text as id from companies order by created_at desc limit 1`,
  '/admin/knowledge-base/:id': `select id::text as id from kb_articles order by created_at limit 1`,
  '/admin/wiki/:slug': `select slug from wiki_pages order by created_at limit 1`,
  '/admin/flowtable/:baseSlug': `select slug as "baseSlug" from flowtable_bases order by created_at limit 1`,
  '/admin/flowtable/:baseSlug/:tableSlug': `select b.slug as "baseSlug", t.slug as "tableSlug"
     from flowtable_tables t join flowtable_bases b on b.id = t.base_id order by t.created_at limit 1`,
  '/admin/customer/:identifier': `select id::text as identifier from leads order by created_at desc limit 1`,
  '/admin/contracts/:id': `select id::text as id from contracts order by created_at desc limit 1`,
  '/admin/recruitment/candidates/:id': `select id::text as id from applications order by created_at desc limit 1`,
  '/admin/recruitment/jobs/:id': `select id::text as id from job_postings order by created_at desc limit 1`,
};

export function hasResolver(pattern: string): boolean {
  return pattern in RESOLVERS;
}

export async function resolveParams(db: Client, pattern: string, params: string[]): Promise<Resolution> {
  const sql = RESOLVERS[pattern];
  if (!sql) return { ok: false, reason: 'no resolver (add one in scripts/view-sweep/params.ts)' };
  try {
    const res = await db.query(sql);
    if (res.rows.length === 0) return { ok: false, reason: 'no data' };
    const row = res.rows[0] as Record<string, unknown>;
    const values: Record<string, string> = {};
    for (const p of params) {
      const v = row[p];
      if (v === null || v === undefined || v === '') {
        return { ok: false, reason: `resolver error: query returned no value for :${p}` };
      }
      values[p] = String(v);
    }
    return { ok: true, values };
  } catch (e) {
    return { ok: false, reason: `resolver error: ${(e as Error).message}` };
  }
}
