# Module API Documentation

> **Version:** 1.0.0  
> **Last Updated:** 2025-01-19

This document defines the formal API contracts for all FlowWink modules. Each module exposes a well-defined interface that enables loose coupling, extensibility, and third-party module development.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        MODULE REGISTRY                          │
│                     (Central Coordinator)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│   │   Blog   │  │Newsletter│  │  Webhook │  │   CRM    │       │
│   │  Module  │  │  Module  │  │  Module  │  │  Module  │       │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│        │             │             │             │              │
│        └─────────────┴─────────────┴─────────────┘              │
│                           │                                     │
│                    Supabase Database                            │
└─────────────────────────────────────────────────────────────────┘
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
