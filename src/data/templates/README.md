# Contributing Templates

FlowWink uses a modular template system. Each template is a self-contained TypeScript file that exports a `StarterTemplate` object.

## Directory Structure

```
src/data/templates/
  index.ts              ← Registry: aggregates all templates
  types.ts              ← Shared TypeScript interfaces
  blank.ts              ← Minimal starter template
  launchpad.ts          ← Startup SaaS template
  momentum.ts           ← Single-page dark template
  trustcorp.ts          ← Enterprise template
  securehealth.ts       ← Healthcare/Compliance template
  flowwink-platform.ts  ← CMS showcase (dogfooding)
  helpcenter.ts         ← Help center template
  service-pro.ts        ← Service business template
  digital-shop.ts       ← E-commerce template
  flowwink-agency.ts    ← Agency template
```

## Creating a New Template

### 1. Create the file

Create a new `.ts` file in `src/data/templates/`:

```typescript
// src/data/templates/my-template.ts
import type { StarterTemplate } from './types';

export const myTemplate: StarterTemplate = {
  id: 'my-template',
  name: 'My Template',
  description: 'A great template for...',
  category: 'startup',
  icon: 'Rocket',
  tagline: 'Build fast',
  aiChatPosition: 'bottom-right',
  
  pages: [
    {
      title: 'Home',
      slug: 'home',
      isHomePage: true,
      menu_order: 1,
      showInMenu: true,
      meta: { description: 'Welcome', showTitle: false, titleAlignment: 'center' },
      blocks: [
        // Add blocks here — see docs/TEMPLATE-AUTHORING.md
      ],
    },
  ],

  branding: {
    organizationName: 'My Site',
    primaryColor: '217 91% 60%',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  },
  siteSettings: { homepageSlug: 'home' },
};
```

### 2. Register in index.ts

Add your template to `src/data/templates/index.ts`:

```typescript
export { myTemplate } from './my-template';
import { myTemplate } from './my-template';

// Add to ALL_TEMPLATES array:
export const ALL_TEMPLATES: StarterTemplate[] = [
  // ... existing templates
  myTemplate,
];
```

### 3. Validate

Run the template validation tests:

```bash
bun run test -- template-validation
```

### 4. Submit a PR

Fork the repo, commit your template, and open a Pull Request. Include:
- Screenshot of the template in action
- Brief description of the target audience
- List of block types used

## Template Anatomy

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique lowercase-dashed ID |
| `name` | ✅ | Display name |
| `description` | ✅ | Short description (1-2 sentences) |
| `category` | ✅ | `startup` \| `enterprise` \| `compliance` \| `platform` \| `helpcenter` |
| `icon` | ✅ | [Lucide](https://lucide.dev/icons) icon name |
| `tagline` | ✅ | One-liner for gallery cards |
| `pages` | ✅ | Array of `TemplatePage` objects |
| `branding` | ✅ | Colors, fonts, border radius |
| `siteSettings` | ✅ | `{ homepageSlug: 'home' }` |
| `blogPosts` | ❌ | Pre-configured blog content |
| `kbCategories` | ❌ | Knowledge base articles |
| `products` | ❌ | E-commerce products |
| `chatSettings` | ❌ | AI chat configuration |
| `headerSettings` | ❌ | Header variant and nav |
| `footerSettings` | ❌ | Footer layout |
| `seoSettings` | ❌ | Title template, meta |
| `cookieBannerSettings` | ❌ | GDPR cookie banner |

## Block Reference

See [docs/TEMPLATE-AUTHORING.md](../../docs/TEMPLATE-AUTHORING.md) for the complete block reference with all 58+ block types.

## Alternative: JSON Import

You can also create templates as JSON files and import them via the admin UI (Admin → Settings → Template Export/Import). This is useful for non-developers or for sharing templates without code changes.

The JSON format is identical to the TypeScript structure — just export a `StarterTemplate` as JSON.

## Questions?

- Check existing templates for examples
- Read [TEMPLATE-AUTHORING.md](../../docs/TEMPLATE-AUTHORING.md)
- Open a GitHub issue or Discussion
