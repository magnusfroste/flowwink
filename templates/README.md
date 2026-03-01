# FlowWink Templates

This directory contains all starter templates as self-contained JSON files.

## Structure

Each `.json` file is a complete `StarterTemplate` object that can be imported into FlowWink to create a new site. Templates include all pages, blocks, branding, settings, blog posts, and KB articles.

## Available Templates

| File | Category | Description |
|------|----------|-------------|
| `blank.json` | startup | Minimal starting point |
| `launchpad.json` | startup | SaaS / tech startup |
| `momentum.json` | startup | Single-page dark design |
| `trustcorp.json` | enterprise | Enterprise / B2B |
| `securehealth.json` | compliance | Healthcare / HIPAA |
| `flowwink-platform.json` | platform | CMS showcase (dogfooding) |
| `helpcenter.json` | helpcenter | Help center with KB + AI |
| `service-pro.json` | startup | Service business + booking |
| `digital-shop.json` | platform | E-commerce / digital products |
| `flowwink-agency.json` | platform | Agency white-label |

## Generating JSON from TypeScript Sources

The TypeScript source files in `src/data/templates/` are the source of truth. To regenerate JSON files after editing a template:

```bash
bun run scripts/templates-to-json.ts
```

This exports all registered templates (including embedded blog posts and KB articles) to this directory.

## Creating a New Template

### Option A: JSON (recommended for non-developers)

1. Copy `blank.json` as a starting point
2. Edit the JSON with your pages, blocks, and settings
3. Import via Admin → Settings → Template Import
4. Or place in this directory and register in `src/data/templates/index.ts`

### Option B: TypeScript (for contributors)

1. Create a `.ts` file in `src/data/templates/`
2. Export a `StarterTemplate` object
3. Register in `src/data/templates/index.ts`
4. Run `bun run scripts/templates-to-json.ts` to generate JSON

See [TEMPLATE-AUTHORING.md](../docs/TEMPLATE-AUTHORING.md) for the complete block reference.

## JSON Schema

The JSON format mirrors the `StarterTemplate` TypeScript interface exactly. Key fields:

```json
{
  "id": "my-template",
  "name": "My Template",
  "description": "...",
  "category": "startup",
  "icon": "Rocket",
  "tagline": "...",
  "aiChatPosition": "bottom-right",
  "pages": [...],
  "blogPosts": [...],
  "kbCategories": [...],
  "products": [...],
  "branding": {...},
  "chatSettings": {...},
  "headerSettings": {...},
  "footerSettings": {...},
  "seoSettings": {...},
  "cookieBannerSettings": {...},
  "siteSettings": { "homepageSlug": "home" }
}
```
