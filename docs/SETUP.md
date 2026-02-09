# Supabase Backend Setup

> **Audience:** Developers
> **Last Updated:** February 2026

This guide covers setting up the Supabase backend for FlowWink self-hosting.

> **After completing this guide**, proceed to:
> - [DEPLOYMENT.md](./DEPLOYMENT.md) - Deploy to production (Easypanel, Railway, etc.)
>
> **Already running FlowWink?** See [UPGRADING.md](./UPGRADING.md) for upgrade instructions.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Supabase](https://supabase.com/) account (free tier works)
- **[Supabase CLI](https://supabase.com/docs/guides/cli) (REQUIRED)**

## Quick Start (Recommended)

The setup script handles everything automatically:

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Note your **project ref** (e.g., `abcdefghijklmnop`) from the URL or Settings

### 2. Run the Setup Script

```bash
# Clone the repository
git clone https://github.com/magnusfroste/flowwink.git
cd flowwink

# Run the setup script
./scripts/setup-supabase.sh
```

The script will:
1. Prompt you to login to Supabase CLI (if not logged in)
2. Ask for your project ref
3. **Deploy all edge functions** (~60 seconds)
4. **Run database migrations** (creates tables, RLS policies)
5. **Create your admin user** (prompts for email/password)
6. **Output environment variables** ready to copy-paste

### 3. Copy Environment Variables

The script outputs 3 environment variables at the end:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbG...
VITE_SUPABASE_PROJECT_ID=your-project-ref
```

Copy these to your hosting platform (Easypanel, Railway, etc.) or `.env` file for local development.

### 4. Configure Branding (White-Label)

Before deploying, configure your organization's branding in the Admin panel:

1. **Login** to the admin panel at `/admin`
2. Go to **Settings → Branding**
3. Configure:
   - **Organization Name** - Your company name (appears in headers, emails)
   - **Admin Name** - Name shown on login page (default: "CMS")
   - **Logo** - Upload your logo
   - **Favicon** - Upload your favicon
   - **Colors** - Set your brand colors

4. Go to **Settings → SEO**
5. Configure:
   - **Site Title** - Used in browser tabs and social sharing
   - **Default Description** - Used when sharing links on social media
   - **OG Image** - Image shown when links are shared on Facebook, LinkedIn, Twitter

> **Important for Social Sharing**: When someone shares your site's links on social media, the `Site Title`, `Default Description`, and `OG Image` from SEO settings will be displayed. Make sure these are configured for proper branding!

### 5. Deploy Frontend

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deploying to Easypanel or other platforms.

### 5. Login

Visit your deployed site and login with the admin credentials you created in step 2.

---

## Optional: Configure Integrations

After setup, you can configure optional integrations (AI, email, payments):

```bash
./scripts/configure-secrets.sh
```

This configures:
- **Resend** - Email/newsletters
- **Stripe** - Payments
- **OpenAI** - AI chat
- **Gemini** - AI alternative
- **Firecrawl** - Web scraping
- **Unsplash** - Stock photos
- **Local LLM** - Self-hosted AI
- **N8N** - Workflow automation

---

## Manual Setup (Alternative)

If you prefer manual steps instead of the script:

### 1. Install and Configure Supabase CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Deploy Edge Functions

```bash
# Deploy all functions (recommended)
for func in supabase/functions/*/; do
  supabase functions deploy $(basename $func) --no-verify-jwt
done
```

### 3. Run Database Migrations

```bash
supabase db push
```

### 4. Create Admin User

Use the Supabase Dashboard → Authentication → Users to create a user, then run:

```sql
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'your-email@example.com');
```

### 5. Get Environment Variables

From Supabase Dashboard → Settings → API, copy:
- Project URL → `VITE_SUPABASE_URL`
- Anon/Public key → `VITE_SUPABASE_PUBLISHABLE_KEY`
- Project ref → `VITE_SUPABASE_PROJECT_ID`

---

## Edge Function Secrets

Edge Functions use secrets for API keys. Use `./scripts/configure-secrets.sh` to set them interactively, or manually:

```bash
supabase secrets set SECRET_NAME=value
supabase secrets list
```

### Automatic Secrets (No action needed)

These are automatically available to all Edge Functions:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your project URL |
| `SUPABASE_ANON_KEY` | Public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) |

### Optional Secrets

| Secret | Required For | How to Get |
|--------|--------------|------------|
| `RESEND_API_KEY` | Email/newsletters | [resend.com](https://resend.com) |
| `STRIPE_SECRET_KEY` | Payments | [stripe.com](https://stripe.com) |
| `OPENAI_API_KEY` | AI chat | [openai.com](https://openai.com) |
| `GEMINI_API_KEY` | AI chat (alternative) | [aistudio.google.com](https://aistudio.google.com) |
| `FIRECRAWL_API_KEY` | Web scraping | [firecrawl.dev](https://firecrawl.dev) |
| `UNSPLASH_ACCESS_KEY` | Stock photos | [unsplash.com](https://unsplash.com) |
| `LOCAL_LLM_API_KEY` | Self-hosted AI | Your LLM provider |
| `N8N_API_KEY` | Workflow automation | Your N8N instance |

Use `./scripts/configure-secrets.sh` to set these interactively.

---

## Local Development

After running the setup script, you can run FlowWink locally:

```bash
# Install dependencies
npm install

# Create .env with the values from the setup script output
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_PUBLISHABLE_KEY=...
# VITE_SUPABASE_PROJECT_ID=...

# Start development server
npm run dev
```

Access the app at `http://localhost:5173`

---

## Production Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for deploying to Easypanel, Railway, or other platforms.

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

| Function | Purpose | Auth Required | Secrets Required |
|----------|---------|---------------|------------------|
| `analyze-brand` | Extract branding from URLs | Yes | `FIRECRAWL_API_KEY` |
| `blog-rss` | Generate RSS feed | No | - |
| `chat-completion` | AI chat responses | No | AI API keys (optional) |
| `check-secrets` | Check secrets configuration status | Yes (Admin) | - |
| `content-api` | REST/GraphQL API | No | - |
| `copilot-action` | AI copilot actions | Yes | AI API keys |
| `create-checkout` | Create Stripe checkout sessions | No | `STRIPE_SECRET_KEY` |
| `create-user` | Create users programmatically | No | - |
| `enrich-company` | Enrich company data | Yes | - |
| `firecrawl-search` | Web scraping search | Yes | `FIRECRAWL_API_KEY` |
| `generate-text` | AI text generation | Yes | AI API keys |
| `get-page` | Cached page fetching | No | - |
| `invalidate-cache` | Clear page cache | Yes | - |
| `llms-txt` | LLM text processing | Yes | AI API keys |
| `migrate-page` | AI content migration | Yes | `FIRECRAWL_API_KEY` |
| `newsletter-confirm` | Double opt-in confirmation | No | - |
| `newsletter-export` | GDPR export of subscribers | Yes | - |
| `newsletter-gdpr` | GDPR operations for newsletters | Yes | - |
| `newsletter-link` | Newsletter link processing | No | - |
| `newsletter-send` | Send newsletter campaigns | Yes | `RESEND_API_KEY` |
| `newsletter-subscribe` | Handle newsletter subscriptions | No | - |
| `newsletter-track` | Track newsletter opens/clicks | No | - |
| `newsletter-unsubscribe` | Handle unsubscriptions | No | - |
| `process-image` | WebP conversion | Yes | - |
| `publish-scheduled-pages` | Cron job for scheduling | No | - |
| `qualify-lead` | Lead qualification | Yes | AI API keys |
| `send-booking-confirmation` | Send booking confirmations | Yes | `RESEND_API_KEY` |
| `send-order-confirmation` | Send order confirmations | Yes | `RESEND_API_KEY` |
| `send-webhook` | Trigger webhooks for events | Yes | - |
| `setup-database` | Database setup/initialization | Yes (Admin) | - |
| `sitemap-xml` | Generate sitemap | No | - |
| `stripe-webhook` | Handle Stripe webhooks | No | `STRIPE_WEBHOOK_SECRET` |
| `support-router` | Route support requests | No | - |
| `test-ai-connection` | Test AI provider connections | Yes | AI API keys |
| `track-page-view` | Track page analytics | No | - |
| `unsplash-search` | Search Unsplash for images | Yes | `UNSPLASH_ACCESS_KEY` |
| `update-kb-feedback` | Update knowledge base feedback | Yes | - |

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

### Migration Conflicts

If you see "Remote migration versions not found in local migrations directory", the script will automatically repair the migration history. If it fails:

```bash
# Check migration status
supabase migration list --linked

# If old migrations exist remotely, repair them
supabase migration repair --status reverted <old-migration-versions>

# Then push migrations
supabase db push
```

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

### Pages showing blank (404 errors) - Missing Edge Functions
If your pages show blank or return 404 errors, you likely have missing edge functions. This is common with new Supabase instances.

#### Deploy Critical Functions First
These are the minimum functions needed for pages to work:
1. **`get-page`** - Fetches and caches published pages
2. **`track-page-view`** - Tracks page analytics

#### Deployment Options

**Via Supabase Dashboard:**
1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions** in the left sidebar
3. Click **Deploy new function**
4. For each function:
   - Name: `get-page`
   - Upload the file: `supabase/functions/get-page/index.ts`
   - Click **Deploy**
5. Repeat for `track-page-view`, `content-api`, and `sitemap-xml`

**Via Supabase CLI:**
```bash
# Login and link to project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy critical functions
supabase functions deploy get-page
supabase functions deploy track-page-view
supabase functions deploy content-api
supabase functions deploy sitemap-xml
```

**Deploy All Functions:**
```bash
# Deploy all functions at once
for func in supabase/functions/*/; do
  func_name=$(basename "$func")
  echo "Deploying $func_name..."
  supabase functions deploy "$func_name"
done
```

#### Verify Deployment
Test the functions after deployment:

1. **Test get-page:**
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/get-page?slug=home
   ```
   Should return page data (not 404)

2. **Test track-page-view:**
   ```
   curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/track-page-view \
     -H "Content-Type: application/json" \
     -d '{"pageSlug":"home"}'
   ```
   Should return 200 OK

#### Why This Happens
- Blog posts work: They use direct database queries
- Pages fail: They require the `get-page` edge function for caching and performance
- Once edge functions are deployed, pages will load correctly!

---

## Social Sharing / White-Label Configuration

When links are shared on social media (Facebook, LinkedIn, Twitter, WhatsApp, Slack, etc.), these platforms use "social crawlers" to fetch metadata about your page. 

### How It Works

1. **Social crawlers** (e.g., `facebookexternalhit`, `Twitterbot`, `LinkedInBot`) request your page
2. The **nginx configuration** detects these bots via User-Agent
3. Bots are redirected to the **`render-page` edge function** which returns server-rendered HTML with proper OG tags
4. Regular users get the normal SPA experience

### Configuration Steps

1. **Set SEO Settings** in Admin → Settings → SEO:
   - `Site Title` - Your organization name
   - `Default Description` - Brief description of your site
   - `OG Image` - URL to your social sharing image (1200x630px recommended)
   - `Twitter Handle` - Your Twitter/X handle (optional)

2. **Configure nginx** (for production):
   
   Edit `nginx.conf` and uncomment the proxy configuration:
   ```nginx
   if ($is_social_crawler) {
       rewrite ^(.*)$ /functions/v1/render-page?path=$1 break;
       proxy_pass https://YOUR_PROJECT_REF.supabase.co;
       proxy_set_header Host $proxy_host;
       proxy_set_header X-Real-IP $remote_addr;
   }
   ```
   
   Replace `YOUR_PROJECT_REF.supabase.co` with your actual Supabase project URL.

3. **Test with Facebook Debugger**:
   - Go to [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - Enter your page URL
   - Verify the title, description, and image are correct

### Per-Page Overrides

Each page, blog post, and KB article can have its own meta tags that override the global defaults:

- **Pages**: Edit page → SEO tab → Title, Description, OG Image
- **Blog Posts**: Edit post → Meta fields
- **KB Articles**: Edit article → Meta fields

---

## Support

- **GitHub Issues**: [github.com/magnusfroste/flowwink/issues](https://github.com/magnusfroste/flowwink/issues)
- **Documentation**: See `docs/PRD.md` for full feature documentation

---

## License

MIT License - see `LICENSE` file.
