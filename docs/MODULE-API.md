# Module API Documentation

> **Version:** 1.1.0  
> **Last Updated:** 2025-01-20

This document defines the formal API contracts for all FlowWink modules. Each module exposes a well-defined interface that enables loose coupling, extensibility, and third-party module development.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MODULE REGISTRY                                │
│                       (Central Coordinator)                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│   │   Blog   │  │Newsletter│  │   CRM    │  │  Pages   │  │    KB    │ │
│   │  Module  │  │  Module  │  │  Module  │  │  Module  │  │  Module  │ │
│   │  v1.0.0  │  │  v1.0.0  │  │  v1.0.0  │  │  v1.0.0  │  │  v1.0.0  │ │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
│        │             │             │             │             │        │
│        └─────────────┴─────────────┴─────────────┴─────────────┘        │
│                                   │                                     │
│                            Supabase Database                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Documented Contracts** - Every module has explicit input/output schemas
2. **Validation First** - All data is validated at module boundaries using Zod
3. **Loose Coupling** - Modules communicate through the Registry, not directly
4. **Traceability** - All cross-module data includes source metadata

---

## Module Capabilities

Each module declares its capabilities:

| Capability | Description |
|------------|-------------|
| `content:receive` | Can receive content from other modules |
| `content:produce` | Produces content that can be consumed by others |
| `webhook:trigger` | Triggers outbound webhooks on events |
| `webhook:receive` | Can receive inbound webhooks |
| `data:read` | Reads data from the database |
| `data:write` | Writes data to the database |

---

## Registered Modules

| Module | ID | Version | Capabilities |
|--------|-----|---------|--------------|
| Blog | `blog` | 1.0.0 | `content:receive`, `data:write`, `webhook:trigger` |
| Newsletter | `newsletter` | 1.0.0 | `content:receive`, `data:write` |
| CRM | `crm` | 1.0.0 | `content:receive`, `data:write`, `webhook:trigger` |
| Pages | `pages` | 1.0.0 | `content:receive`, `data:write`, `webhook:trigger` |
| Knowledge Base | `kb` | 1.0.0 | `content:receive`, `data:write` |

---

## Module Dependencies

Some modules have dependencies on other modules. When a parent module is disabled, dependent modules are automatically disabled as well. When enabling a dependent module, its parent is automatically enabled.

| Dependent Module | Requires |
|------------------|----------|
| Orders | Products |
| Deals | Leads |
| Live Support | Chat |

### Block-to-Module Mapping

Certain content blocks require their associated module to be enabled. When the required module is disabled, the block remains visible in the Block Selector but shows a warning indicator. Users can still add the block, but it may not function correctly.

| Block Type | Required Module |
|------------|-----------------|
| `article-grid` | Blog |
| `chat` | AI Chat |
| `newsletter` | Newsletter |
| `booking` | Bookings |
| `products`, `cart` | Products |
| `kb-featured`, `kb-hub`, `kb-search`, `kb-accordion` | Knowledge Base |
| `webinar` | Webinars |

This "hybrid guard" approach provides visual feedback without blocking the user, keeping the system flexible while preventing silent errors.

---

## Module Definitions

### Blog Module

**ID:** `blog`  
**Capabilities:** `content:receive`, `data:write`, `webhook:trigger`

#### Input Schema

```typescript
interface BlogModuleInput {
  // Required
  title: string;                    // Post title (max 200 chars)
  content: TiptapDocument | string; // Rich text content
  
  // Optional
  excerpt?: string;                 // Summary (max 500 chars)
  featured_image?: string;          // Image URL
  featured_image_alt?: string;      // Image alt text
  
  // Metadata
  meta?: {
    keywords?: string[];            // SEO keywords
    description?: string;           // Meta description
    source_module?: string;         // Originating module ID
    source_id?: string;             // Original content ID
  };
  
  // Publishing options
  options?: {
    status: 'draft' | 'published';  // Default: 'draft'
    schedule_at?: string;           // ISO 8601 datetime
    author_id?: string;             // Author profile ID
    category_ids?: string[];        // Category UUIDs
    tag_ids?: string[];             // Tag UUIDs
  };
}
```

#### Output Schema

```typescript
interface BlogModuleOutput {
  success: boolean;
  id: string;           // Created post UUID
  slug: string;         // URL slug
  url: string;          // Full URL path
  status: string;       // Final status
  published_at?: string; // If published
  error?: string;       // If success is false
}
```

#### Example Usage

```typescript
import { moduleRegistry } from '@/lib/module-registry';

const result = await moduleRegistry.publish('blog', {
  title: 'How to Build Modular Systems',
  content: tiptapDocument,
  excerpt: 'A guide to building maintainable software...',
  meta: {
    source_module: 'content-campaign',
    source_id: 'proposal-123'
  },
  options: {
    status: 'published'
  }
});

console.log(result);
// { success: true, id: 'uuid', slug: 'how-to-build-modular-systems', url: '/blog/how-to-build-modular-systems' }
```

---

### Newsletter Module

**ID:** `newsletter`  
**Capabilities:** `content:receive`, `data:write`

#### Input Schema

```typescript
interface NewsletterModuleInput {
  // Required
  subject: string;                  // Email subject (max 150 chars)
  
  // Content (one of these)
  content_html?: string;            // Pre-rendered HTML
  content_json?: NewsletterBlock[]; // Structured blocks
  content_tiptap?: TiptapDocument;  // Rich text document
  
  // Optional
  preview_text?: string;            // Email preview text
  
  // Metadata
  meta?: {
    source_module?: string;
    source_id?: string;
  };
  
  // Options
  options?: {
    status: 'draft' | 'scheduled';  // Default: 'draft'
    send_at?: string;               // ISO 8601 datetime (for scheduled)
  };
}
```

#### Output Schema

```typescript
interface NewsletterModuleOutput {
  success: boolean;
  id: string;           // Newsletter UUID
  status: string;       // Final status
  subscriber_count?: number; // If sending
  error?: string;
}
```

---

### Webhook Module

**ID:** `webhook`  
**Capabilities:** `webhook:trigger`, `webhook:receive`

#### Input Schema (Outbound)

```typescript
interface WebhookModuleInput {
  // Required
  event: WebhookEventType;          // Event type to trigger
  payload: Record<string, unknown>; // Event-specific data
  
  // Optional
  channel?: string;                 // Specific webhook name filter
  
  // Metadata
  meta?: {
    source_module: string;
    trace_id?: string;              // For request tracing
  };
}

type WebhookEventType = 
  | 'page.published'
  | 'page.deleted'
  | 'blog_post.published'
  | 'blog_post.updated'
  | 'blog_post.deleted'
  | 'form.submitted'
  | 'newsletter.subscribed'
  | 'newsletter.unsubscribed'
  | 'order.created'
  | 'order.paid'
  | 'order.shipped'
  | 'order.cancelled'
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'lead.created'
  | 'lead.qualified'
  | 'content.published';  // Generic content event
```

#### Output Schema

```typescript
interface WebhookModuleOutput {
  success: boolean;
  triggered_count: number;  // Number of webhooks triggered
  results: Array<{
    webhook_id: string;
    webhook_name: string;
    success: boolean;
    status_code?: number;
    error?: string;
  }>;
}
```

---

### CRM Module

**ID:** `crm`  
**Capabilities:** `content:receive`, `data:write`, `webhook:trigger`

#### Lead Input Schema

```typescript
interface CRMLeadInput {
  // Required
  email: string;
  
  // Optional
  name?: string;
  phone?: string;
  source: string;         // Where lead came from
  source_id?: string;     // Reference to source record
  
  // Scoring
  initial_score?: number;
  
  // Metadata
  meta?: {
    source_module?: string;
    form_data?: Record<string, unknown>;
  };
}
```

#### Output Schema

```typescript
interface CRMLeadOutput {
  success: boolean;
  lead_id: string;
  is_new: boolean;        // True if created, false if existing
  score: number;
  status: LeadStatus;
  error?: string;
}
```

---

### Pages Module

**ID:** `pages`  
**Capabilities:** `content:receive`, `data:write`, `webhook:trigger`

#### Input Schema

```typescript
interface PageModuleInput {
  // Required
  title: string;                              // Page title (max 200 chars)
  content: ContentBlock[] | TiptapDocument | string; // Page content
  
  // Optional
  slug?: string;                              // Auto-generated if not provided
  
  // Metadata
  meta?: {
    source_module?: string;
    source_id?: string;
    seo_title?: string;                       // SEO title (max 60 chars)
    seo_description?: string;                 // Meta description (max 160 chars)
  };
  
  // Options
  options?: {
    status: 'draft' | 'published';            // Default: 'draft'
    show_in_menu: boolean;                    // Default: false
    menu_order?: number;
    schedule_at?: string;                     // ISO 8601 datetime
  };
}
```

#### Output Schema

```typescript
interface PageModuleOutput {
  success: boolean;
  id: string;           // Created page UUID
  slug: string;         // URL slug
  url: string;          // Full URL path (e.g., "/about-us")
  status: string;       // Final status
  error?: string;
}
```

#### Example Usage

```typescript
const result = await moduleRegistry.publish('pages', {
  title: 'About Our Company',
  content: [
    { id: 'uuid', type: 'hero', data: { title: 'About Us', subtitle: 'Our story' } },
    { id: 'uuid', type: 'text', data: { content: tiptapDoc } }
  ],
  meta: {
    seo_title: 'About Us - Company Name',
    seo_description: 'Learn about our company history and values.'
  },
  options: {
    status: 'published',
    show_in_menu: true,
    menu_order: 2
  }
});
```

---

### Knowledge Base Module

**ID:** `kb`  
**Capabilities:** `content:receive`, `data:write`

#### Input Schema

```typescript
interface KBArticleModuleInput {
  // Required
  title: string;                    // Article title (max 200 chars)
  question: string;                 // FAQ question (max 500 chars)
  category_id: string;              // KB category UUID
  answer: TiptapDocument | string;  // Answer content
  
  // Optional
  slug?: string;                    // Auto-generated if not provided
  
  // Metadata
  meta?: {
    source_module?: string;
    source_id?: string;
    seo_title?: string;
    seo_description?: string;
  };
  
  // Options
  options?: {
    is_published: boolean;          // Default: true
    is_featured: boolean;           // Default: false
    include_in_chat: boolean;       // Include in AI chat context (Default: true)
  };
}
```

#### Output Schema

```typescript
interface KBArticleModuleOutput {
  success: boolean;
  id: string;           // Created article UUID
  slug: string;         // URL slug
  url: string;          // Full URL path (e.g., "/kb/how-to-reset-password")
  error?: string;
}
```

#### Example Usage

```typescript
const result = await moduleRegistry.publish('kb', {
  title: 'Password Reset Guide',
  question: 'How do I reset my password?',
  category_id: 'category-uuid',
  answer: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Follow these steps...' }] }
    ]
  },
  options: {
    is_published: true,
    include_in_chat: true
  }
});
```

---

## Content Campaign → Module Flow

The Content Campaign module orchestrates publishing to multiple channels:

```
┌────────────────────┐
│  Content Campaign  │
│                    │
│  Proposal with:    │
│  - Pillar content  │
│  - Channel variants│
└─────────┬──────────┘
          │
          │ User clicks "Publish to Blog"
          ▼
┌────────────────────┐
│  Module Registry   │
│                    │
│  1. Get 'blog'     │
│  2. Validate input │
│  3. Execute        │
└─────────┬──────────┘
          │
          │ BlogModuleInput {
          │   title: variant.title,
          │   content: variant.content,
          │   meta: { source_module: 'content-campaign', source_id: proposal.id }
          │ }
          ▼
┌────────────────────┐
│   Blog Module      │
│                    │
│  1. Transform      │
│  2. Insert to DB   │
│  3. Trigger hooks  │
└─────────┬──────────┘
          │
          │ BlogModuleOutput {
          │   success: true,
          │   id: 'new-post-id',
          │   slug: 'generated-slug',
          │   url: '/blog/generated-slug'
          │ }
          ▼
┌────────────────────┐
│  Content Campaign  │
│                    │
│  Update proposal:  │
│  - published_channels │
│  - status          │
└────────────────────┘
```

---

## Data Layer Contracts

Beyond the Module Registry, FlowWink enforces **data ownership boundaries** at the database level. Shared tables (like `leads` and `lead_activities`) have a single owner module that exposes utility functions. Other modules **must** use these functions — never write directly.

### Table Ownership

| Table | Owner | Contract File |
|-------|-------|---------------|
| `leads` | CRM | `src/lib/lead-utils.ts` |
| `lead_activities` | CRM | `src/lib/lead-utils.ts` |
| `companies` | CRM | `src/lib/lead-utils.ts` |
| `blog_posts` | Blog | `src/lib/module-registry.ts` (blog module) |
| `pages` | Pages | `src/lib/module-registry.ts` (pages module) |

### Lead Utils Contract (`src/lib/lead-utils.ts`)

All modules that interact with leads **must** use these functions:

| Function | Purpose | Used By |
|----------|---------|---------|
| `createLeadFromForm()` | Create/update lead from form submission | FormBlock |
| `createLeadFromBooking()` | Create/update lead from booking | BookingBlock |
| `createLeadFromWebinar()` | Create/update lead from webinar registration | WebinarBlock, useWebinars |
| `addLeadActivity()` | Log activity on a lead | All modules via createLeadFrom*, Deals |
| `updateLeadStatus()` | Change lead status | Deals module |
| `trackNewsletterActivity()` | Track email opens/clicks | Newsletter |
| `qualifyLead()` | Trigger AI qualification | Called internally by createLeadFrom* |

Each `createLeadFrom*` function handles:
1. Find or create lead by email
2. Auto-match company by email domain
3. Trigger company enrichment for new companies
4. Log activity with correct points
5. Trigger AI qualification

### Activity Points

Defined in `ACTIVITY_POINTS` within `lead-utils.ts`:

| Activity | Points |
|----------|--------|
| `webinar_register` | 15 |
| `form_submit` | 10 |
| `booking` | 10 |
| `newsletter_subscribe` | 8 |
| `link_click` | 5 |
| `call` | 5 |
| `email_open` | 3 |
| `page_visit` | 2 |

### Rules

1. **Never** write directly to `leads` or `lead_activities` from hooks or components outside CRM
2. **Never** import `supabase` and query `leads` table from a non-CRM module — use the contract functions
3. **Reading** shared tables for analytics/display is OK (e.g., `useAnalytics.ts`)
4. When adding a new lead source, create a `createLeadFrom*()` function in `lead-utils.ts`
5. When a module needs to change lead status, use `updateLeadStatus()` — not a direct update

### Anti-Patterns

```typescript
// ❌ BAD — Direct write from webinar module
await supabase.from('leads').insert({ email, source: 'webinar' });
await supabase.from('lead_activities').insert({ lead_id, type: 'webinar_register' });

// ✅ GOOD — Via contract
import { createLeadFromWebinar } from '@/lib/lead-utils';
const { leadId } = await createLeadFromWebinar({ email, name, webinarId, webinarTitle });

// ❌ BAD — Direct status update from deals module
await supabase.from('leads').update({ status: 'customer' }).eq('id', leadId);

// ✅ GOOD — Via contract
import { updateLeadStatus } from '@/lib/lead-utils';
await updateLeadStatus(leadId, 'customer', { convertedAt: true });
```

### Allowed Direct Access

These files **may** access `leads`/`lead_activities` directly because they are CRM-owned:

- `src/hooks/useLeads.ts` — CRM CRUD hooks
- `src/hooks/useActivities.ts` — CRM activity hooks
- `src/components/admin/CreateLeadDialog.tsx` — Admin manual creation (uses `addLeadActivity`)
- `src/hooks/useCsvImportExport.ts` — Bulk import
- `src/components/admin/ResetSiteDialog.tsx` — System reset (delete all)
- `src/lib/module-registry.ts` (CRM module only) — CRM module's publish()

---

## Creating a New Module

### Step 1: Define Types

Add your module's input/output types to `src/types/module-contracts.ts`:

```typescript
// 1. Define input schema
export const myModuleInputSchema = z.object({
  required_field: z.string(),
  optional_field: z.string().optional(),
  meta: moduleMetaSchema.optional(),
});

export type MyModuleInput = z.infer<typeof myModuleInputSchema>;

// 2. Define output schema
export const myModuleOutputSchema = z.object({
  success: z.boolean(),
  id: z.string(),
  error: z.string().optional(),
});

export type MyModuleOutput = z.infer<typeof myModuleOutputSchema>;
```

### Step 2: Implement Module

Create your module implementation:

```typescript
import { ModuleDefinition } from '@/lib/module-registry';
import { MyModuleInput, MyModuleOutput, myModuleInputSchema, myModuleOutputSchema } from '@/types/module-contracts';

export const myModule: ModuleDefinition<MyModuleInput, MyModuleOutput> = {
  id: 'my-module',
  name: 'My Module',
  version: '1.0.0',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: myModuleInputSchema,
  outputSchema: myModuleOutputSchema,
  
  async publish(input: MyModuleInput): Promise<MyModuleOutput> {
    // Your implementation here
    return {
      success: true,
      id: 'created-id',
    };
  }
};
```

### Step 3: Register Module

Add to the registry in `src/lib/module-registry.ts`:

```typescript
import { myModule } from './modules/my-module';

moduleRegistry.register(myModule);
```

---

## Webhook Integration for External Modules

External systems can act as modules via webhooks:

### Inbound Webhook (External → FlowWink)

```
POST /functions/v1/module-webhook
Content-Type: application/json
X-Module-Secret: your-secret

{
  "module_id": "external-crm",
  "action": "lead.created",
  "payload": {
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Outbound Webhook (FlowWink → External)

Configure a webhook with event `content.published`:

```json
{
  "event": "content.published",
  "timestamp": "2025-01-19T12:00:00Z",
  "data": {
    "module": "blog",
    "id": "post-uuid",
    "title": "New Post Title",
    "url": "/blog/new-post"
  },
  "meta": {
    "source_module": "content-campaign",
    "source_id": "proposal-uuid"
  }
}
```

---

## Error Handling

All modules return consistent error structures:

```typescript
interface ModuleError {
  success: false;
  error: string;           // Human-readable message
  error_code?: string;     // Machine-readable code
  validation_errors?: Array<{
    field: string;
    message: string;
  }>;
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input failed schema validation |
| `NOT_FOUND` | Referenced resource doesn't exist |
| `PERMISSION_DENIED` | User lacks required permissions |
| `DUPLICATE` | Resource already exists |
| `EXTERNAL_ERROR` | Third-party service failed |

---

## Migration Guide

### From Direct Database Access

**Before:**
```typescript
const { data } = await supabase
  .from('blog_posts')
  .insert({ title, content: contentJson });
```

**After:**
```typescript
const result = await moduleRegistry.publish('blog', {
  title,
  content: contentJson,
  meta: { source_module: 'my-feature' }
});
```

### Benefits

1. **Validation** - Input is validated before database write
2. **Consistency** - All blog posts created same way
3. **Hooks** - Webhooks triggered automatically
4. **Traceability** - Origin tracked in metadata
