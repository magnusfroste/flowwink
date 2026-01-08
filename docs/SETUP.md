# Self-Hosting Setup Guide

This guide walks you through setting up FlowWink on your own Supabase instance.

> **Already running FlowWink?** See [UPGRADING.md](./UPGRADING.md) for upgrade instructions.
> 
> **Want to contribute?** See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Supabase](https://supabase.com/) account (free tier works)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for local development)

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Note your project URL and anon key from **Settings → API**

### 2. Run Database Migrations

You have two options:

#### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run all migrations
supabase db push
```

#### Option B: Manual SQL Execution

1. Go to your Supabase Dashboard → **SQL Editor**
2. Run the combined schema from `supabase/schema.sql` (or run each migration file in order from `supabase/migrations/`)

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Deploy Edge Functions

Edge Functions provide AI chat, content API, image processing, and more.

```bash
# Deploy all functions
supabase functions deploy analyze-brand
supabase functions deploy blog-rss
supabase functions deploy chat-completion
supabase functions deploy content-api
supabase functions deploy create-user
supabase functions deploy generate-text
supabase functions deploy get-page
supabase functions deploy invalidate-cache
supabase functions deploy migrate-page
supabase functions deploy process-image
supabase functions deploy publish-scheduled-pages
supabase functions deploy send-webhook
supabase functions deploy newsletter-send
supabase functions deploy newsletter-export
supabase functions deploy newsletter-subscribe
supabase functions deploy newsletter-confirm
supabase functions deploy newsletter-unsubscribe
supabase functions deploy newsletter-track-open
supabase functions deploy newsletter-track-click
```

---

## Edge Function Secrets

Edge Functions use secrets for API keys and sensitive configuration. See `.env.example` for a complete reference.

### Automatic Secrets (No action needed)

These are automatically available to all Edge Functions — Supabase sets them for you:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) |

### Manual Secrets

| Secret | Required For | How to Get |
|--------|--------------|------------|
| `FIRECRAWL_API_KEY` | AI Brand Analysis, AI Page Migration (web scraping) | [firecrawl.dev](https://firecrawl.dev) |

```bash
# Set secrets via CLI (optional)
supabase secrets set FIRECRAWL_API_KEY=your-firecrawl-api-key

# List current secrets
supabase secrets list
```

### AI Chat Configuration

#### Option A: Lovable AI Gateway (Lovable Cloud only)

The `LOVABLE_API_KEY` is **automatically provided** when you remix the project on Lovable:

[![Remix on Lovable](https://img.shields.io/badge/Remix%20on-Lovable-ff69b4)](https://lovable.dev/projects/fac5f9b2-2dc8-4cce-be0a-4266a826f893)

This key is injected by Lovable Cloud and is **not available for full self-hosting**.

#### Option B: Private LLM (Self-Hosting)

For full self-hosting, configure a **Private LLM** in the CMS:

1. Go to **Admin → Settings → AI Chat**
2. Select **Private LLM** as provider
3. Enter your OpenAI-compatible endpoint (e.g., `https://api.openai.com/v1`, Ollama, LM Studio, etc.)
4. Enter model name and API key (if required)

This keeps all AI data on your own infrastructure — no external secrets needed.

---

### 5. Create Storage Bucket

The migration creates a `cms-images` bucket automatically. Verify it exists in **Storage** in your Supabase Dashboard.

### 6. Install Dependencies & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### 7. Create Your First Admin User

1. Go to your app and sign up with email/password
2. In Supabase Dashboard → **SQL Editor**, run:

```sql
-- Replace with your user's email
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'your-email@example.com'
);
```

Or use the `create-user` Edge Function to create admin users programmatically.

---

## Production Deployment

### Build for Production

```bash
npm run build
```

The `dist/` folder contains your static site, ready for deployment to:
- **Vercel**
- **Netlify**
- **Cloudflare Pages**
- **Any static hosting**

### Environment Variables for Production

Set these in your hosting provider:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

---

## Database Schema Overview

### Core Tables

| Table | Description |
|-------|-------------|
| `pages` | CMS pages with content blocks |
| `page_versions` | Version history for pages |
| `profiles` | User profiles |
| `user_roles` | Role assignments (writer/approver/admin) |
| `site_settings` | Global settings (SEO, performance) |
| `global_blocks` | Reusable blocks (footer, header) |
| `audit_logs` | GDPR-compliant activity logging |

### Blog Tables

| Table | Description |
|-------|-------------|
| `blog_posts` | Blog articles with SEO, featured images, reading time |
| `blog_categories` | Hierarchical categories |
| `blog_tags` | Flat tags |
| `blog_post_categories` | Post-category relations |
| `blog_post_tags` | Post-tag relations |

### Newsletter Tables

| Table | Description |
|-------|-------------|
| `newsletter_subscribers` | Email subscribers with double opt-in |
| `newsletters` | Email campaigns with status tracking |
| `newsletter_email_opens` | Open tracking per recipient |
| `newsletter_link_clicks` | Click tracking per link |

### Webhook Tables (Integration Module)

| Table | Description |
|-------|-------------|
| `webhooks` | Webhook configurations with events |
| `webhook_logs` | Delivery logs with response tracking |

### Chat Tables

| Table | Description |
|-------|-------------|
| `chat_conversations` | AI chat sessions |
| `chat_messages` | Messages in conversations |

### Other Tables

| Table | Description |
|-------|-------------|
| `form_submissions` | Form data from contact forms |

---

## Edge Functions Reference

| Function | Purpose | Auth Required |
|----------|---------|---------------|
| `analyze-brand` | Extract branding from URLs | Yes |
| `blog-rss` | Generate RSS feed | No |
| `chat-completion` | AI chat responses | No |
| `content-api` | REST/GraphQL API | No |
| `create-user` | Create users programmatically | No |
| `generate-text` | AI text generation | Yes |
| `get-page` | Cached page fetching | No |
| `invalidate-cache` | Clear page cache | Yes |
| `migrate-page` | AI content migration | Yes |
| `process-image` | WebP conversion | Yes |
| `publish-scheduled-pages` | Cron job for scheduling | No |
| `send-webhook` | Trigger webhooks for events | Yes |
| `newsletter-send` | Send newsletter campaigns | Yes |
| `newsletter-export` | GDPR export of subscribers | Yes |
| `newsletter-subscribe` | Handle newsletter subscriptions | No |
| `newsletter-confirm` | Double opt-in confirmation | No |
| `newsletter-unsubscribe` | Handle unsubscriptions | No |
| `newsletter-track-open` | Track email opens | No |
| `newsletter-track-click` | Track link clicks | No |

---

## Scheduled Publishing Setup

To enable scheduled publishing, set up a cron job that calls the `publish-scheduled-pages` function:

### Using Supabase pg_cron

```sql
-- Run every minute
SELECT cron.schedule(
  'publish-scheduled-pages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-scheduled-pages',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

### Using External Cron (e.g., cron-job.org)

Set up an HTTP POST request to:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-scheduled-pages
```

---

## Local Development with Supabase CLI

For a fully local development environment:

```bash
# Start local Supabase
supabase start

# This gives you local URLs for:
# - API: http://localhost:54321
# - Studio: http://localhost:54323
# - Database: postgresql://postgres:postgres@localhost:54322/postgres

# Update .env for local development
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-start>
```

---

## Troubleshooting

### "Permission denied" errors
- Check that RLS policies are correctly applied
- Verify the user has the correct role in `user_roles`

### Edge Functions not working
- Check function logs in Supabase Dashboard → Edge Functions → Logs
- Verify secrets are set correctly

### Images not uploading
- Verify the `cms-images` bucket exists and is public
- Check storage policies are applied

### Scheduled publishing not working
- Verify pg_cron extension is enabled
- Check the cron job is scheduled correctly
- Verify the service role key is correct

---

## Support

- **GitHub Issues**: [github.com/magnusfroste/flowwink/issues](https://github.com/magnusfroste/flowwink/issues)
- **Documentation**: See `docs/PRD.md` for full feature documentation

---

## License

MIT License - see `LICENSE` file.
