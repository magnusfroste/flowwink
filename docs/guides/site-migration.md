# Site Migration with Firecrawl

> **Audience:** Users/Admins  
> **Last Updated:** February 25, 2026

This document describes FlowWink's site migration feature, which allows you to import content from existing websites using Firecrawl integration.

---

## Overview

FlowWink's Site Migration feature helps you migrate content from existing websites to FlowWink. It uses a combination of direct sitemap parsing and Firecrawl API to discover pages, then allows you to select which pages to import.

## How It Works

### 1. Page Discovery

When you provide a website URL, FlowWink uses a multi-step approach to discover all pages:

**Primary Method: Direct Sitemap Parsing**
- Attempts to fetch `sitemap.xml` from the target site
- Tries multiple variants: `www` vs non-`www`, `sitemap.xml` vs `sitemap_index.xml`
- Handles nested sitemaps (sitemap index files that reference other sitemaps)
- Extracts all URLs from `<loc>` tags

**Fallback Method: Firecrawl Map API**
- If sitemap parsing finds fewer than 5 URLs, uses Firecrawl Map API
- Discovers pages through crawling and link following
- Limit: 500 URLs per site

### 2. URL Normalization

All discovered URLs are normalized to ensure consistency:
- Removes query parameters (`?param=value`)
- Removes hash fragments (`#section`)
- Removes trailing slashes
- Handles `www` vs non-`www` variants as the same domain
- Deduplicates URLs

### 3. Page Categorization

Each discovered page is automatically categorized:

| Type | Detection Pattern | Examples |
|------|------------------|----------|
| **Blog** | `/blog/`, `/news/`, `/articles/`, date patterns (`/2024/01/15/`) | `/blog/post-title`, `/2024/01/article` |
| **Knowledge Base** | `/help/`, `/faq/`, `/support/`, `/docs/`, `/kb/` | `/help/getting-started`, `/faq/pricing` |
| **Skip** | Pagination, archives, feeds, admin pages, search | `/page/2`, `/feed`, `/wp-admin`, `/search/` |
| **Page** | Everything else | `/about`, `/services`, `/contact` |

### 4. Page Selection

- All non-skip pages are pre-selected by default
- You can review and deselect pages you don't want to import
- Duplicate slugs are flagged for your attention

### 5. Content Scraping

For each selected page, FlowWink:
- Uses Firecrawl Scrape API to extract content
- Converts HTML to markdown
- Processes images (downloads and uploads to your media library)
- Creates pages/blog posts in FlowWink with the imported content

## Configuration

### Required API Keys

To use Site Migration, you need a Firecrawl API key:

1. Sign up at [firecrawl.dev](https://firecrawl.dev)
2. Get your API key from the dashboard
3. Add it to FlowWink:
   - Go to **Settings** → **Integrations**
   - Find **Firecrawl** section
   - Enter your API key
   - Or run `npm run cli` → `/set-keys`

### Checking Configuration

Run the CLI and check secrets:
```bash
npm run cli
# /set-keys  — shows live ✓/○ status for all integrations
```

## Usage

### Via FlowPilot (AI Assistant)

1. Open FlowPilot (chat icon in admin panel)
2. Say: "I want to migrate my existing website"
3. Provide the URL when prompted
4. Review discovered pages
5. Select pages to migrate
6. Confirm migration

### Via Admin Panel

1. Go to **Admin** → **Pages**
2. Click **Import from Website** (if available)
3. Enter website URL
4. Review and select pages
5. Click **Migrate Selected Pages**

## Supported Sites

### Works Best With

- **WordPress sites** — Full support via sitemap
- **Static sites** (Hugo, Jekyll, 11ty) — Full support via sitemap
- **Server-rendered sites** (Next.js SSR, Nuxt SSR) — Full support
- **Sites with sitemaps** — Most reliable method

### May Have Issues

- **Client-side SPAs** (React/Vue/Angular without SSR) — Limited discovery
- **Sites behind bot protection** (Cloudflare, Imperva) — May be blocked
- **Sites without sitemaps** — Relies on Firecrawl crawling
- **Password-protected sites** — Cannot access content

### Known Limitations

- **Rate limits:** Firecrawl API has rate limits based on your plan
- **Large sites:** Sites with >500 pages may require multiple imports
- **Dynamic content:** JavaScript-heavy content may not be fully captured
- **Authentication:** Cannot import content behind login walls

## Troubleshooting

### "Found 0 pages"

**Causes:**
- Site blocks Firecrawl's user agent
- No sitemap.xml exists
- Sitemap is behind authentication
- Site uses non-standard sitemap location

**Solutions:**
1. Check if sitemap exists: `curl https://yoursite.com/sitemap.xml`
2. Try the non-www variant: `https://site.com` vs `https://www.site.com`
3. Check Firecrawl API key is configured
4. Contact support if site should be accessible

### "Only found sitemap files"

This usually means the sitemap was discovered but couldn't be parsed. This is now automatically handled by FlowWink's sitemap parser.

### "Duplicate slugs detected"

Multiple pages generate the same URL slug. Review and manually adjust slugs for affected pages.

### "Failed to scrape content"

**Causes:**
- Page is behind authentication
- Page blocks Firecrawl
- Page has malformed HTML

**Solutions:**
- Skip the problematic page
- Manually copy content for that page
- Contact Firecrawl support for persistent issues

## Technical Details

### Architecture

**Edge Function:** `firecrawl-map`
- Location: `supabase/functions/firecrawl-map/`
- Handles page discovery and URL extraction
- No JWT verification (uses internal auth checks)

**Frontend Integration:**
- `useCopilot.ts` — FlowPilot integration
- Handles user interaction and page selection

### Sitemap Parsing Logic

```typescript
// 1. Try multiple sitemap URLs
const sitemapUrls = [
  `${baseUrl}/sitemap.xml`,
  `${baseUrl}/sitemap_index.xml`,
  baseUrl.replace('://www.', '://') + '/sitemap.xml',
  baseUrl.replace('://', '://www.') + '/sitemap.xml',
];

// 2. Extract URLs from <loc> tags
const urlMatches = sitemapXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g);

// 3. Handle nested sitemaps recursively
if (url.includes('sitemap') && url.endsWith('.xml')) {
  // Fetch and parse nested sitemap
}

// 4. Normalize host comparison (www vs non-www)
const normalizeHost = (host: string) => host.replace(/^www\./, '');
```

### URL Categorization

```typescript
function suggestPageType(url: string, baseUrl: string): 'page' | 'blog' | 'kb' | 'skip' {
  const path = url.replace(baseUrl, '').toLowerCase();
  
  // Skip patterns
  if (/\/page\/\d+\/?$/.test(path)) return 'skip'; // Pagination
  if (/\/(feed|rss|atom)\/?/.test(path)) return 'skip';
  
  // Blog patterns
  if (/^\/(blog|news|articles)(?:\/|$)/i.test(path)) return 'blog';
  if (/^\/\d{4}\/\d{2}\/\d{2}\//.test(path)) return 'blog'; // Date-based
  
  // Knowledge base patterns
  if (/^\/(help|faq|support|kb|docs)(?:\/|$)/i.test(path)) return 'kb';
  
  return 'page';
}
```

## Best Practices

### Before Migration

1. **Review the source site** — Understand its structure
2. **Check sitemap** — Verify it exists and is accessible
3. **Plan content structure** — Decide which pages to import
4. **Backup** — FlowWink doesn't modify the source site, but backup your FlowWink instance

### During Migration

1. **Start small** — Test with a few pages first
2. **Review categories** — Verify page type suggestions are correct
3. **Check for duplicates** — Resolve duplicate slug warnings
4. **Monitor progress** — Watch for errors during scraping

### After Migration

1. **Review imported content** — Check formatting and images
2. **Update internal links** — May need manual adjustment
3. **Set up redirects** — If replacing an old site
4. **Test thoroughly** — Verify all pages render correctly

## Future Improvements

Planned enhancements for Site Migration:

- [ ] Jina Reader integration as scraping fallback
- [ ] Manual URL input for sites without sitemaps
- [ ] Batch content scraping (parallel processing)
- [ ] Link rewriting (update internal links automatically)
- [ ] Custom categorization rules
- [ ] Migration templates for common platforms
- [ ] Progress tracking and resume capability
- [ ] Dry-run mode (preview without importing)

## Related Documentation

- [Integrations Strategy](./INTEGRATIONS-STRATEGY.md) — Overview of external integrations
- [Setup Guide](./SETUP.md) — Initial FlowWink setup
- [Module API](./MODULE-API.md) — Technical API documentation
- [Developer Guide](./DEVELOPER_GUIDE.md) — Development workflows

## Support

For issues with Site Migration:

1. Check this documentation
2. Review Firecrawl API status: [status.firecrawl.dev](https://status.firecrawl.dev)
3. Check function logs in Supabase Dashboard
4. Open an issue on GitHub with:
   - Source site URL (if public)
   - Error messages
   - Expected vs actual behavior
