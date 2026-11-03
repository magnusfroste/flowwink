---
title: "Blog Module"
module_id: "blog"
version: "1.0.0"
category: "content"
autonomy: "config-required"
manual: true
description: Publish content to the blog
---

# Blog

> Publish content to the blog

Ships with **18 agent skills**, an **admin UI**.

## Quick Facts

| Property | Value |
|----------|-------|
| **Module ID** | `blog` |
| **Version** | 1.0.0 |
| **Category** | content |
| **Autonomy** | config-required |
| **Core** | No |
| **Capabilities** | `content:receive`, `data:write`, `webhook:trigger` |
| **MCP-exposed skills** | 18 |
| **Owns tables** | — |

## Integrations

**Optional:** `openai`, `gemini`, `unsplash`

## Cover images (photo or brand)

Blog settings → **Cover images** (`site_settings.blog.coverStyle`, default `photo`) decides
what a post's picture is, everywhere one is shown: post cards, the post page's hero, the
latest-posts block and the social card. **Photo** is the featured image, as always — agents
look one up from Unsplash when a post has none. **Brand** draws every cover from the site's
branding instead (`src/components/public/BlogCover.tsx`): a dark editorial surface in both
themes, the post's title in the heading font, the category (or the site name) as an eyebrow,
the brand's pixel gradient along the bottom edge and a primary→accent bar — the same motif
`api/og.ts` draws for the share card, so a shared link and the page it opens match. In brand
mode `write_blog_post` fetches no stock photo (`image_status: "brand"`), `manage_blog_posts`
`featured_image: "auto"` fetches none, `audit_blog` reports no `no_image`/`stock_image`, and the
post's `og:image` is the derived card at `/api/og?path=/blog/<slug>` unless `meta_json.ogImage`
is set. Every public surface renders a post picture through `src/components/public/PostPicture.tsx`
(a guard scans `src/` for any other renderer of `featured_image`).

<!-- generated:skills:start — written by scripts/generate-module-docs.ts, edits here are overwritten -->
## Skills

These skills are seeded into `agent_skills` when the module is enabled and exposed via MCP.
External operators (FlowPilot, OpenClaw, Claude Desktop, custom MCP clients) can call them directly.

| Skill | Scope | Description |
|-------|-------|-------------|
| `write_blog_post` | internal | Create a blog post with title, topic, tone, and pre-written content. One thesis per post, argued to the end (800–1200 words, ## sections, a closing ask) — pass the identity\ |
| `research_content` | internal | Deep AI research on a topic — audience insights, content angles, hooks, competitive landscape, and recommended structure. Use when: planning content strategy; understanding a topic before writing; … |
| `generate_content_proposal` | internal | Generate multi-channel content (blog, newsletter, LinkedIn, X) from a topic with brand voice and tone control. Use when: a user requests new content for multiple platforms; needing a content strate… |
| `publish_scheduled_content` | internal | Check and publish pages and blog posts that are due for scheduled publishing. Use when: automated publish cycle runs; checking if any content is ready to go live; processing scheduled content queue… |
| `translate_content` | internal | What to translate. "page" is the same as translate_page; "product" translates a product\ |
| `manage_blog_posts` | internal | Manage existing blog posts: list, get, update (title, excerpt, body as markdown `content`, image, category, status, schedule), publish, unpublish, delete. Use when: editing or rewriting an existing… |
| `manage_blog_categories` | internal | Manage blog categories and tags: list, create, delete. Use when: organizing blog content into new categories; listing existing blog categories; cleaning up unused tags. NOT for: managing individual… |
| `audit_blog` | internal | Audit what the blog already holds: every post\ |
| `browse_blog` | both | Browse published blog posts (visitor-facing). Use when: a user asks to see latest blog articles; you need to find existing blog content to link to; displaying content on a public-facing blog page. … |
| `content_calendar_view` | internal | Lists scheduled and draft content, identifies content gaps. Use when: reviewing editorial calendar, checking upcoming content, finding content gaps. NOT for: creating content (use write_blog_post),… |
| `generate_social_post` | internal | Generate social media posts from existing blog content or content proposals. Use when: user wants LinkedIn/X posts from an article, repurposing blog content for social. NOT for: writing blog posts … |
| `product_promoter` | internal | Creates a promotional blog post for a product. Use when: user wants to promote a product via blog, creating product-focused articles. NOT for: general blog writing (use write_blog_post), managing p… |
| `seo_content_brief` | internal | Generates SEO content brief with keywords and outline. Use when: planning SEO-optimized content, keyword research, creating content outlines. NOT for: writing full articles (use write_blog_post), t… |
| `social_post_batch` | internal | Creates social media posts for multiple platforms in batch. Use when: user wants posts for several platforms at once, bulk social content creation. NOT for: single platform post (use generate_socia… |
| `moderate_blog_comment` | internal | Approve, mark as spam, reject, or reset a reader comment on a blog post. Use when: an admin wants to publish a pending comment or purge spam. NOT for: creating comments (public form only) or deleti… |
| `list_blog_comments` | internal | List blog comments filtered by status (pending by default) for moderation review. Use when: showing the moderation queue or auditing comments per post. |
| `get_blog_rss_url` | external | Return the public RSS feed URL for the blog. Use when: a caller asks for the RSS/Atom feed, or when integrating a syndication endpoint. |
| `blog_post_history` | internal | Version history for blog posts: list revisions, read an old revision, restore one. Every content/title/excerpt/image edit and every delete is captured automatically, and the revision survives the p… |
<!-- generated:skills:end -->

## Used in Processes

This module participates in the following end-to-end business processes:

- [content-to-conversion](../processes/content-to-conversion.md)

## File Map

| Purpose | Path |
|---------|------|
| Module definition | `src/lib/modules/blog-module.ts` |
| Admin page | `src/pages/admin/BlogPage.tsx` |
| Migration | `supabase/migrations/20260828190000_f5f20801-public-blog-anon-read.sql` |

## Contributing

To enhance this module, see [Contributing Guide](../contributing/contributing.md).

Key rules:
- Follow `ModuleDefinition<I, O>` contract pattern
- All schema changes require idempotent migrations
- Skills must be self-describing ([Law 2](../concepts/openclaw-law.md))
- Blocks are interfaces, not pipelines ([Law 3](../concepts/openclaw-law.md))
- New skills must pass the [Agent Contract Integrity](../../mem/architecture/agent-contract-integrity.md) checklist (`bun run lint:skills`)

---

*Manually maintained (`manual: true`); the skills table between the generated markers is refreshed by `scripts/generate-module-docs.ts`.*