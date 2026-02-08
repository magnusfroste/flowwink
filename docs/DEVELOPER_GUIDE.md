# FlowWink Developer Guide

> **Version:** 1.0.0  
> **Last Updated:** February 2026

This guide helps developers understand FlowWink's architecture and how to extend it with new features, integrations, and blocks.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Creating Custom Blocks](#creating-custom-blocks)
4. [Creating Edge Functions](#creating-edge-functions)
5. [Creating Integrations](#creating-integrations)
6. [Webhook Events](#webhook-events)
7. [Module System](#module-system)
8. [Best Practices](#best-practices)

---

## Quick Start

### Prerequisites

- Node.js 18+
- TypeScript
- Supabase account (for local development)
- Basic React knowledge

### Setup

```bash
# Clone the repository
git clone https://github.com/flowwink/flowwink.git
cd flowwink

# Install dependencies
npm install

# Start development server
npm run dev
```

### Project Structure

```
flowwink/
├── src/
│   ├── components/
│   │   ├── admin/blocks/      # Block editors
│   │   ├── public/blocks/     # Public block renderers
│   │   └── ui/                # Reusable UI components
│   ├── hooks/                 # React hooks
│   ├── lib/                   # Utilities and helpers
│   ├── pages/                 # Page components
│   └── types/                 # TypeScript definitions
├── supabase/
│   └── functions/             # Edge functions
└── docs/                      # Documentation
```

---

## Architecture Overview

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Pages     │  │   Blocks    │  │   Admin UI           │ │
│  │             │  │             │  │                      │ │
│  │ - Home      │  │ - Hero      │  │ - Page Editor        │ │
│  │ - Blog      │  │ - Features  │  │ - Block Selector     │ │
│  │ - Contact   │  │ - CTA       │  │ - Settings           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Business Logic (Hooks)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Data Hooks  │  │ Webhooks    │  │ Module Registry      │ │
│  │             │  │             │  │                      │ │
│  │ usePages()  │  │ triggerWebhook() │ moduleRegistry.publish() │ │
│  │ useBlog()   │  │             │  │                      │ │
│  │ useForms()  │  │             │  │                      │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Supabase (Backend)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Database   │  │   Storage   │  │   Edge Functions     │ │
│  │             │  │             │  │                      │ │
│  │ - pages     │  │ - Images    │  │ - content-api        │ │
│  │ - blog_posts│  │ - Files     │  │ - send-webhook       │ │
│  │ - forms     │  │             │  │ - chat-completion    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

1. **Blocks** - Reusable content components (Hero, Features, CTA, etc.)
2. **Hooks** - Data fetching and state management (`usePages`, `useBlog`, etc.)
3. **Webhooks** - Event-driven integrations
4. **Modules** - Pluggable business logic (Blog, Newsletter, CRM, etc.)
5. **Edge Functions** - Serverless functions for API endpoints

---

## Creating Custom Blocks

### Step 1: Define Block Type

Add your block type to `src/types/cms.ts`:

```typescript
export type ContentBlockType = 
  | 'hero'
  | 'text'
  | 'features'
  | 'your-custom-block'; // Add your block here
```

### Step 2: Define Block Data Interface

```typescript
export interface YourCustomBlockData {
  title?: string;
  description?: string;
  items?: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  variant?: 'default' | 'minimal' | 'card';
}
```

### Step 3: Create Public Block Renderer

Create `src/components/public/blocks/YourCustomBlock.tsx`:

```tsx
import { cn } from '@/lib/utils';
import type { YourCustomBlockData } from '@/types/cms';

interface YourCustomBlockProps {
  data: YourCustomBlockData;
}

export function YourCustomBlock({ data }: YourCustomBlockProps) {
  const { title, description, items = [], variant = 'default' } = data;

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        {title && (
          <h2 className="text-3xl font-bold mb-4">{title}</h2>
        )}
        {description && (
          <p className="text-muted-foreground mb-8">{description}</p>
        )}
        
        <div className={cn(
          'grid gap-4',
          variant === 'card' && 'md:grid-cols-3',
          variant === 'minimal' && 'grid-cols-1'
        )}>
          {items.map((item) => (
            <div
              key={item.id}
              className={cn(
                'p-4 rounded-lg',
                variant === 'card' && 'bg-card border'
              )}
            >
              <h3 className="font-semibold">{item.label}</h3>
              <p className="text-sm text-muted-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

### Step 4: Create Block Editor

Create `src/components/admin/blocks/YourCustomBlockEditor.tsx`:

```tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { YourCustomBlockData } from '@/types/cms';

interface YourCustomBlockEditorProps {
  data: YourCustomBlockData;
  onChange: (data: YourCustomBlockData) => void;
  isEditing: boolean;
}

export function YourCustomBlockEditor({ 
  data, 
  onChange, 
  isEditing 
}: YourCustomBlockEditorProps) {
  const addItem = () => {
    onChange({
      ...data,
      items: [
        ...(data.items || []),
        {
          id: crypto.randomUUID(),
          label: 'New Item',
          value: 'Value',
        }
      ]
    });
  };

  const removeItem = (id: string) => {
    onChange({
      ...data,
      items: data.items?.filter(item => item.id !== id)
    });
  };

  const updateItem = (id: string, field: 'label' | 'value', value: string) => {
    onChange({
      ...data,
      items: data.items?.map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    });
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <Label>Title</Label>
        <Input
          value={data.title || ''}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          placeholder="Enter title"
        />
      </div>

      {/* Description */}
      <div>
        <Label>Description</Label>
        <Input
          value={data.description || ''}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          placeholder="Enter description"
        />
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Items</Label>
          <Button size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
        
        <div className="space-y-2">
          {data.items?.map((item) => (
            <div key={item.id} className="flex gap-2">
              <Input
                value={item.label}
                onChange={(e) => updateItem(item.id, 'label', e.target.value)}
                placeholder="Label"
              />
              <Input
                value={item.value}
                onChange={(e) => updateItem(item.id, 'value', e.target.value)}
                placeholder="Value"
              />
              <Button
                size="icon"
                variant="destructive"
                onClick={() => removeItem(item.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 5: Register Block in BlockRenderer

Update `src/components/public/BlockRenderer.tsx`:

```tsx
import { YourCustomBlock } from './blocks/YourCustomBlock';

// In the switch statement:
case 'your-custom-block':
  return <YourCustomBlock data={block.data as YourCustomBlockData} />;
```

### Step 6: Register Block in BlockEditor

Update `src/components/admin/blocks/BlockEditor.tsx`:

```tsx
import { YourCustomBlockEditor } from './YourCustomBlockEditor';

// In the switch statement:
case 'your-custom-block':
  return <YourCustomBlockEditor {...props} />;
```

### Step 7: Add Block to Selector (Optional)

Update `src/components/admin/BlockSelector.tsx` to include your block in the UI.

---

## Creating Edge Functions

### Step 1: Create Edge Function

Create `supabase/functions/your-function/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface RequestBody {
  // Define your request interface
  action?: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  try {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Parse request
    const { action, data } = await req.json() as RequestBody;

    // Route based on action
    switch (action) {
      case 'process':
        return handleProcess(data);
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: corsHeaders }
        );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function handleProcess(data: Record<string, unknown>) {
  // Your logic here
  return new Response(
    JSON.stringify({ success: true, result: data }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Step 2: Deploy Edge Function

```bash
# Deploy to local Supabase
supabase functions deploy your-function

# Or deploy to production
supabase functions deploy your-function --project-ref <project-id>
```

### Step 3: Call Edge Function from Frontend

```typescript
const { data, error } = await supabase.functions.invoke('your-function', {
  body: { action: 'process', data: { key: 'value' } },
});
```

---

## Creating Integrations

### Webhook Integration

Create a webhook integration to send data to external services:

```typescript
import { triggerWebhook } from '@/lib/webhook-utils';

// Trigger webhook when an event occurs
await triggerWebhook({
  event: 'your-custom-event',
  data: {
    id: 'entity-id',
    title: 'Entity Title',
    timestamp: new Date().toISOString(),
  },
});
```

### External API Integration

Create a service to interact with external APIs:

```typescript
// src/services/external-api.ts
export class ExternalAPIService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createResource(data: Record<string, unknown>) {
    const response = await fetch(`${this.baseUrl}/resources`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create resource: ${response.statusText}`);
    }

    return response.json();
  }

  async getResource(id: string) {
    const response = await fetch(`${this.baseUrl}/resources/${id}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get resource: ${response.statusText}`);
    }

    return response.json();
  }
}
```

---

## Webhook Events

### Available Events

```typescript
export type WebhookEventType = 
  // Pages
  | 'page.published'
  | 'page.updated'
  | 'page.deleted'

  // Blog
  | 'blog_post.published'
  | 'blog_post.updated'
  | 'blog_post.deleted'

  // Forms & Bookings
  | 'form.submitted'
  | 'booking.submitted'
  | 'booking.confirmed'
  | 'booking.cancelled'

  // Newsletter
  | 'newsletter.subscribed'
  | 'newsletter.unsubscribed'

  // E-commerce
  | 'order.created'
  | 'order.paid'
  | 'order.cancelled'
  | 'order.refunded'

  // Products
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'

  // CRM
  | 'deal.created'
  | 'deal.updated'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'company.created'
  | 'company.updated'

  // Media
  | 'media.uploaded'
  | 'media.deleted'

  // Content
  | 'global_block.updated'
  | 'kb_article.published'
  | 'kb_article.updated';
```

### Triggering Webhooks

```typescript
import { webhookEvents } from '@/lib/webhook-utils';

// Example: Trigger when a page is published
webhookEvents.pagePublished({
  id: page.id,
  slug: page.slug,
  title: page.title,
});
```

### Creating Custom Webhook Events

1. Add event type to `src/lib/webhook-utils.ts`:

```typescript
export type WebhookEventType = 
  | 'existing.event'
  | 'your-custom-event'; // Add your event
```

2. Create convenience function:

```typescript
export const webhookEvents = {
  // Existing events...
  
  yourCustomEvent: (data: { id: string; name: string }) => 
    triggerWebhook({ 
      event: 'your-custom-event', 
      data 
    }),
};
```

3. Trigger in your code:

```typescript
webhookEvents.yourCustomEvent({ id: '123', name: 'Custom Entity' });
```

---

## Module System

### What is a Module?

A module is a self-contained piece of business logic with:
- Defined input/output schemas
- Validation
- Webhook triggers
- Traceability

### Creating a New Module

See `docs/MODULE-API.md` for complete documentation.

### Quick Example

```typescript
// 1. Define types
export const myModuleInputSchema = z.object({
  required_field: z.string(),
  optional_field: z.string().optional(),
});

export type MyModuleInput = z.infer<typeof myModuleInputSchema>;

// 2. Implement module
export const myModule: ModuleDefinition<MyModuleInput, MyModuleOutput> = {
  id: 'my-module',
  name: 'My Module',
  version: '1.0.0',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: myModuleInputSchema,
  outputSchema: myModuleOutputSchema,
  
  async publish(input: MyModuleInput): Promise<MyModuleOutput> {
    // Your implementation
    return { success: true, id: 'created-id' };
  }
};

// 3. Register module
moduleRegistry.register(myModule);
```

---

## Developer Tools

### Accessing Developer Tools

Developer Tools are accessible via URL: `/admin/developer-tools`

**Note:** Developer Tools are not visible in the side panel. Access them directly via the URL or search with `#developer-tools`.

### Available Tools

#### Webhook Logger

Test webhooks without sending to external endpoints:

```typescript
// Enable webhook logging
developerSettings: {
  mockWebhooks: true,  // Log instead of send
}

// Usage
await triggerWebhook({
  event: 'page.published',
  data: { id: '123', slug: 'test' },
});
// Logs to console and UI, doesn't send to external URL
```

**Features:**
- Log all webhook events
- View payload structure
- Test event triggers
- No external API calls

#### Block Previewer

Test custom blocks without creating pages:

```tsx
// /admin/developer-tools/block-previewer
import { BlockPreviewer } from '@/components/admin/developer-tools/BlockPreviewer';

<BlockPreviewer
  blockType="your-custom-block"
  data={{
    title: 'Test Block',
    description: 'This is a test',
    items: [...],
  }}
/>
```

**Features:**
- Preview blocks in isolation
- Test different variants
- Hot reload support
- Mock data generator

#### Mock Data Generator

Generate test data for development:

```typescript
import { generateMockData } from '@/lib/mock-data';

const mockPages = generateMockData.pages(5);
const mockBlocks = generateMockData.blocks(10);
const mockWebhooks = generateMockData.webhooks(3);
```

**Features:**
- Generate test pages
- Generate test blocks
- Generate test webhooks
- Customizable data sets

---

## Best Practices

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Keep components focused and single-responsibility
- Use Tailwind CSS for styling
- Use design system tokens (not raw colors)

### Testing

- Write tests for critical logic
- Test edge functions locally before deploying
- Use TypeScript to catch errors at compile time

### Performance

- Lazy load heavy components
- Use React Query for data fetching
- Implement caching where appropriate
- Optimize images (WebP, proper sizing)

### Security

- Never expose API keys in frontend code
- Use Supabase RLS for data access control
- Validate all user input
- Use environment variables for sensitive data

### Documentation

- Document your blocks with examples
- Add JSDoc comments for complex functions
- Keep README files up to date
- Use clear, descriptive names

---

## Getting Help

- Check existing code for examples
- Read the PRD for system overview
- Review MODULE-API.md for module development
- Join the community Discord
- Open an issue on GitHub

---

*Happy coding! 🚀*
