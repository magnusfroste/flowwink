# Supabase Backend Setup

> **Audience:** Developers
> **Last Updated:** February 2026

This guide covers setting up the Supabase backend for FlowWink self-hosting.

> **After completing this guide**, proceed to:
> - [DEPLOYMENT.md](./deployment.md) - Deploy to production (Easypanel, Railway, etc.)
>
> **Already running FlowWink?** See [UPGRADING.md](./upgrading.md) for upgrade instructions.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A [Supabase](https://supabase.com/) account (free tier works)
- **[Supabase CLI](https://supabase.com/docs/guides/cli) (REQUIRED)**

## Quick Start (Recommended)

The setup script handles everything automatically:

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and create a new project
2. Note your **project ref** (e.g., `abcdefghijklmnop`) from the URL or Settings

### 2. Run the Setup CLI

```bash
npm run cli
```

Then use the interactive menu:
1. `/login` — log in to Supabase CLI
2. `/link` — select and link your project
3. `/install` — runs migrations, sets API keys, deploys edge functions, creates the admin user, outputs env variables

During `/install` you'll be asked **what this site is** — `cms`, `crm` or `erp`.
That choice writes the module configuration and decides which edge functions
get deployed; you can change any module later in `/admin/modules` (then re-run
`/update-funcs`). See [Deploy Edge Functions](#2-deploy-edge-functions) for what
each profile contains and why `erp` needs a paid Supabase plan.

**✨ Auto-Migrations:** After initial setup, future migrations run automatically when you:
- Start dev server: `npm run dev`
- Build for production: `npm run build`
- Pull latest Docker image: migrations included in build

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

See [DEPLOYMENT.md](./deployment.md) for deploying to Easypanel or other platforms.

### 5. Login

Visit your deployed site and login with the admin credentials you created in step 2.

### 6. Configure System AI Settings (Recommended)

After first login, configure your AI preferences:

1. Go to **Admin → Settings → System AI**
2. Set your preferred:
   - **AI Provider** (OpenAI or Gemini)
   - **Model** (gpt-4o-mini recommended for cost)
   - **Default Tone** (professional, friendly, formal)
   - **Default Language** (English, Swedish, Norwegian, Danish, Finnish, German)

> **Important:** The language setting affects ALL AI-generated content including Campaign Manager, blog posts, text generation, and content migration. Default is English.

See [AI_DEPENDENCIES.md](../concepts/ai-dependencies.md) for detailed AI configuration.

---

## Optional: Configure Integrations

After setup, you can configure optional integrations (AI, email, payments):

```bash
npm run cli
# /set-keys
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

**Use the CLI for this — don't loop over the directory.** Two reasons the
obvious loop breaks a site:

- **The function cap is a cliff.** Supabase Free allows 100 functions. Since
  the 2026-07 edge-surface consolidation the repo ships ~75, so a full deploy
  fits — but the failure mode is worth knowing: past the cap every remaining
  call fails with `402 Max number of functions reached` and the site is
  silently missing whichever functions came last in the alphabet. At the cap
  even *updates to existing functions* are rejected.
- **Blanket `--no-verify-jwt` removes the auth gate from admin-only functions.**
  `supabase/config.toml` sets `verify_jwt` per function for a reason; the CLI
  reads it, a hand-rolled loop does not.

```bash
npm run cli        # then: /update-funcs
```

On a project that has no modules configured yet — a fresh install — it asks
what the site is and deploys that profile:

| Profile | What you get |
|---------|--------------|
| `cms` | Pages, blog, media, newsletter, surveys, webinars |
| `crm` | CMS + leads, companies, customer 360, sales intelligence, bookings, live support |
| `erp` | Everything (~75 functions post-consolidation — now fits the Free cap) |

Preset it non-interactively with `FLOWWINK_PROFILE=cms`, or deploy literally
everything with `FLOWWINK_DEPLOY_ALL=1`. Profiles are data, not code — they
live in `supabase/seed/install-profiles.json`; the module→function map behind
them is `src/lib/edge-function-registry.ts`.

**Enabling more modules later is two steps.** Toggling a module in
`/admin/modules` seeds its skills immediately, but the browser cannot deploy
edge functions — re-run `/update-funcs` from the terminal afterwards. The
Modules page flags "module enabled but its function isn't deployed" when you
forget.

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

Edge Functions use secrets for API keys. Use `npm run cli` → `/set-keys` to set them interactively, or manually:

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

Use `npm run cli` → `/set-keys` to set these interactively.

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

See **[DEPLOYMENT.md](./deployment.md)** for deploying to Easypanel, Railway, or other platforms.

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

The deployable surface is ~75 functions after the 2026-07 edge-surface
consolidation. The authoritative, guardrail-tested list — including which
modules own which functions and which are core — is
**`src/lib/edge-function-registry.ts`**; the operator mental model
(mandatory vs optional, align-down rule, deploy flags) is
**`docs/operators/edge-function-tiers.md`**.

A few structural points worth knowing during setup:

- **`chat-completion`** is THE AI endpoint (visitor chat, FlowPilot, all AI
  calls). Public functions like this deploy with `--no-verify-jwt`.
- **`agent-execute`** runs every registered skill, including the many
  `internal:` handlers that used to be standalone edge functions.
- **`comms-send`** handles all transactional outbound email (booking/order/
  invoice/quote confirmations, reminders); requires `RESEND_API_KEY`.
- **`flowpilot-lifecycle`** hosts the operator's lifecycle tasks
  (`?task=briefing|distill|learn|followthrough|curator`).
- **`integrations-account`** consolidates the provider-key management
  endpoints (OpenAI, ElevenLabs, Hunter, Firecrawl, Unsplash).
- Webhooks (`stripe-webhook`, `email-webhook`, `composio-webhook`) need their
  respective secrets (`STRIPE_WEBHOOK_SECRET`, …).

---

## Scheduled jobs (cron)

Scheduled publishing needs **no manual setup**: `publish_scheduled_pages()` is
a plain SQL function registered on pg_cron by migration (there is no edge
function involved). Cron jobs in general are registered idempotently by
migrations and read the instance's own URL/key — never hardcode another
instance's URL in a cron command; the Observability tab's cron-health card
flags foreign-host jobs, never-ran jobs, and recent HTTP errors.

### FlowPilot Autonomous Loop

The heartbeat schedule is managed from **Admin → Autonomy Settings** (it
writes the pg_cron entry for `flowpilot-heartbeat`). Lifecycle tasks
(learn, distill, briefing, curator) run as cron jobs targeting
`flowpilot-lifecycle?task=<task>` and are likewise registered by migration.

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
5. Repeat for `track-page-view`, `content-api`, and `sitemap`

**Via Supabase CLI** — these four are public, so they need `--no-verify-jwt`:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF

supabase functions deploy get-page --no-verify-jwt
supabase functions deploy track-page-view --no-verify-jwt
supabase functions deploy content-api --no-verify-jwt
supabase functions deploy sitemap --no-verify-jwt
```

**To (re)deploy everything the site needs**, use the CLI rather than a loop —
it respects both `config.toml`'s per-function `verify_jwt` and the function cap:

```bash
npm run cli        # then: /update-funcs
```

A loop over `supabase/functions/*/` deploys ~110 functions into a 100-function
Free cap (silently losing the tail) and, if you add `--no-verify-jwt` to all of
them, strips the auth gate from admin-only functions. If you are on a paid plan
and genuinely want everything, use `FLOWWINK_DEPLOY_ALL=1 npm run cli` →
`/update-funcs`.

**If you are already at the cap**, no deploy will succeed — not even an update
to an existing function. Delete what the site doesn't use first:
`/update-funcs --prune` removes functions whose modules are disabled.

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

## FlowPilot Bootstrap — Who Owns What

Understanding what gets seeded where prevents duplicate data and confusion on upgrades.

| Concern | Owner |
|---|---|
| Skills & soul — fresh install | `flowwink.sh /install` (automatic, no menu) |
| Skills & soul — updating existing instance | "Sync Missing Skills" button in Modules UI, or `flowwink.sh /setup-flowpilot` → option 0 |
| Objectives | Engine Room → Objectives tab (admin manages these) |
| Automations & workflows | Engine Room → Automations tab (admin manages these) |
| Heartbeat cron | `flowwink.sh /setup-flowpilot` → option 1 |
| First-time objectives + automations | Auto-seeded by `useFlowPilotBootstrap` on first admin login |

### Updating existing installations

When a new version of FlowWink adds new default skills, existing installations won't get them automatically — only the DB data doesn't auto-update on deploy. To sync:

1. Deploy the new code (git pull + `supabase functions deploy`)
2. Click **"Sync Missing Skills"** in Admin → Modules → FlowPilot

Objectives and automations are intentionally left to the admin — they are business decisions, not infrastructure.

### Default starter config

`src/data/flowpilotDefaults.ts` is the single source of truth for the 3 starter objectives, the Weekly Digest automation, and the Content Pipeline workflow. Both the frontend bootstrap hook and the `setup-flowpilot` edge function (`STARTER_FLOWPILOT`) must stay in sync with this file.

---

## Support

- **GitHub Issues**: [github.com/magnusfroste/flowwink/issues](https://github.com/magnusfroste/flowwink/issues)
- **Documentation**: See `docs/PRD.md` for full feature documentation

---

## License

MIT License - see `LICENSE` file.
