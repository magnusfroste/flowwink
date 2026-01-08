# Headless API Documentation

FlowWink provides a powerful headless API for multi-channel content delivery. Access your content via REST or GraphQL endpoints.

## Base URL

```
https://<project-id>.supabase.co/functions/v1/content-api
```

## Authentication

The API is public and does not require authentication for read operations.

---

## REST API

### Pages

#### List all published pages
```http
GET /content-api/pages
```

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "Home",
    "slug": "home",
    "status": "published",
    "content_json": [...],
    "meta_json": {...},
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

#### Get a single page by slug
```http
GET /content-api/page/:slug
```

**Example:**
```http
GET /content-api/page/about
```

#### Get a page as Markdown
```http
GET /content-api/page/:slug.md
```

Returns the page content rendered as Markdown with YAML frontmatter. Useful for static site generators, documentation systems, or any system that consumes Markdown.

**Example:**
```http
GET /content-api/page/about.md
```

**Response:**
```markdown
---
title: "About Us"
slug: "about"
description: "Learn more about our company"
updatedAt: "2024-01-15T10:30:00Z"
---

# Welcome to Our Company

We are passionate about building great products...

## Our Mission

To deliver exceptional value to our customers.
```

---

### Blog

#### List all published blog posts
```http
GET /content-api/blog/posts
GET /content-api/blog/posts?limit=10
GET /content-api/blog/posts?category=news
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Maximum number of posts to return |
| `category` | string | Filter by category slug |

**Response:**
```json
[
  {
    "id": "uuid",
    "title": "My First Post",
    "slug": "my-first-post",
    "excerpt": "A brief summary...",
    "featured_image": "https://...",
    "content_json": [...],
    "reading_time_minutes": 5,
    "published_at": "2024-01-01T00:00:00Z",
    "author": {
      "full_name": "John Doe",
      "avatar_url": "https://..."
    },
    "categories": [...],
    "tags": [...]
  }
]
```

#### Get a single blog post
```http
GET /content-api/blog/post/:slug
```

#### List blog categories
```http
GET /content-api/blog/categories
```

#### List blog tags
```http
GET /content-api/blog/tags
```

---

### Products

#### List all active products
```http
GET /content-api/products
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Premium Plan",
    "description": "Full access to all features",
    "price_cents": 9900,
    "currency": "USD",
    "type": "recurring",
    "image_url": "https://..."
  }
]
```

#### Get a single product
```http
GET /content-api/product/:id
```

---

### Booking Services

#### List all active booking services
```http
GET /content-api/booking/services
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Consultation",
    "description": "1-hour consultation session",
    "duration_minutes": 60,
    "price_cents": 15000,
    "currency": "USD"
  }
]
```

---

### Knowledge Base

#### List all categories with articles
```http
GET /content-api/kb/categories
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Getting Started",
    "slug": "getting-started",
    "description": "Learn the basics",
    "icon": "BookOpen",
    "articles": [
      {
        "id": "uuid",
        "title": "Quick Start Guide",
        "slug": "quick-start",
        "question": "How do I get started?"
      }
    ]
  }
]
```

#### Get a single article
```http
GET /content-api/kb/article/:slug
```

---

### Global Blocks

#### Get global blocks by slot
```http
GET /content-api/global-blocks/:slot
```

**Slots:** `header`, `footer`, `popup`

---

### Site Settings

#### Get all site settings
```http
GET /content-api/settings
```

---

## POST Endpoints

### Form Submission

Submit form data for processing and storage.

```http
POST /content-api/form/submit
Content-Type: application/json
```

**Request Body:**
```json
{
  "block_id": "contact-form-1",
  "data": {
    "name": "John Doe",
    "email": "john@example.com",
    "message": "Hello, I have a question..."
  },
  "page_id": "uuid (optional)",
  "form_name": "Contact Form (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "submission_id": "uuid"
}
```

---

### Newsletter Subscription

Subscribe an email address to the newsletter.

```http
POST /content-api/newsletter/subscribe
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "subscriber@example.com",
  "name": "Jane Doe (optional)"
}
```

**Response (new subscription):**
```json
{
  "success": true,
  "message": "Successfully subscribed to newsletter",
  "subscriber_id": "uuid"
}
```

**Response (reactivated):**
```json
{
  "success": true,
  "message": "Subscription reactivated",
  "subscriber_id": "uuid"
}
```

**Response (already subscribed):**
```json
{
  "success": true,
  "message": "Already subscribed",
  "subscriber_id": "uuid"
}
```

---

### Create Booking

Create a new booking for a service.

```http
POST /content-api/booking/create
Content-Type: application/json
```

**Request Body:**
```json
{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+46701234567 (optional)",
  "start_time": "2024-01-15T10:00:00Z",
  "service_id": "uuid (optional)",
  "duration_minutes": 60,
  "notes": "First-time consultation (optional)"
}
```

**Note:** If `service_id` is provided and `duration_minutes` is not, the duration will be automatically fetched from the service.

**Response:**
```json
{
  "success": true,
  "booking": {
    "id": "uuid",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "start_time": "2024-01-15T10:00:00Z",
    "end_time": "2024-01-15T11:00:00Z",
    "status": "pending",
    "service_id": "uuid"
  }
}
```

---

## GraphQL API

### Endpoint
```http
POST /content-api/graphql
Content-Type: application/json
```

### Schema

```graphql
type Query {
  # Pages
  pages: [Page]
  page(slug: String!): Page
  
  # Blog
  blogPosts(limit: Int, category: String): [BlogPost]
  blogPost(slug: String!): BlogPost
  blogCategories: [BlogCategory]
  blogTags: [BlogTag]
  
  # Products
  products: [Product]
  product(id: ID!): Product
  
  # Booking
  bookingServices: [BookingService]
  
  # Knowledge Base
  kbCategories: [KbCategory]
  kbArticle(slug: String!): KbArticle
  
  # Global
  globalBlocks(slot: String!): [GlobalBlock]
  siteSettings: [SiteSetting]
}
```

### Example Queries

#### Get all pages
```graphql
query {
  pages {
    id
    title
    slug
    content_json
  }
}
```

#### Get blog posts with author
```graphql
query {
  blogPosts(limit: 5) {
    title
    slug
    excerpt
    featured_image
    author {
      full_name
      avatar_url
    }
    categories {
      name
      slug
    }
  }
}
```

#### Get a single blog post
```graphql
query {
  blogPost(slug: "my-first-post") {
    title
    content_json
    reading_time_minutes
    published_at
    tags {
      name
    }
  }
}
```

#### Get products
```graphql
query {
  products {
    id
    name
    description
    price_cents
    currency
    type
  }
}
```

#### Get knowledge base
```graphql
query {
  kbCategories {
    name
    slug
    icon
    articles {
      title
      slug
      question
    }
  }
}
```

---

## Code Examples

### JavaScript/TypeScript (Fetch)

```typescript
// REST
const response = await fetch(
  'https://<project-id>.supabase.co/functions/v1/content-api/pages'
);
const pages = await response.json();

// GraphQL
const response = await fetch(
  'https://<project-id>.supabase.co/functions/v1/content-api/graphql',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        query {
          blogPosts(limit: 10) {
            title
            slug
            excerpt
          }
        }
      `
    })
  }
);
const { data } = await response.json();
```

### React with TanStack Query

```tsx
import { useQuery } from '@tanstack/react-query';

const API_URL = 'https://<project-id>.supabase.co/functions/v1/content-api';

export function useBlogPosts(limit = 10) {
  return useQuery({
    queryKey: ['blog-posts', limit],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/blog/posts?limit=${limit}`);
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json();
    }
  });
}

// Usage
function BlogList() {
  const { data: posts, isLoading } = useBlogPosts(10);
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <ul>
      {posts.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

### Next.js (App Router)

```tsx
// app/blog/page.tsx
async function getBlogPosts() {
  const res = await fetch(
    'https://<project-id>.supabase.co/functions/v1/content-api/blog/posts',
    { next: { revalidate: 60 } }
  );
  return res.json();
}

export default async function BlogPage() {
  const posts = await getBlogPosts();
  
  return (
    <main>
      {posts.map(post => (
        <article key={post.id}>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </article>
      ))}
    </main>
  );
}
```

### cURL

```bash
# Get all pages
curl https://<project-id>.supabase.co/functions/v1/content-api/pages

# Get a specific blog post
curl https://<project-id>.supabase.co/functions/v1/content-api/blog/post/my-first-post

# GraphQL query
curl -X POST \
  https://<project-id>.supabase.co/functions/v1/content-api/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ pages { title slug } }"}'
```

---

## Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (invalid query or parameters) |
| 404 | Resource not found |
| 500 | Server error |

---

## Caching

Responses include standard HTTP caching headers. For production use, consider implementing edge caching with services like Cloudflare or Vercel Edge.

---

## Rate Limiting

The API does not currently enforce rate limits, but excessive usage may be throttled. For high-traffic applications, implement client-side caching.
