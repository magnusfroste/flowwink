# Docker Deployment Guide

Complete guide for deploying Pezcms with Docker on Easypanel, Railway, Fly.io, or any Docker-compatible platform.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Easypanel)](#quick-start-easypanel)
- [Supabase Setup](#supabase-setup)
- [Cloudflare Setup (Optional but Recommended)](#cloudflare-setup-optional-but-recommended)
- [Alternative Platforms](#alternative-platforms)
- [Environment Variables](#environment-variables)
- [Testing Locally](#testing-locally)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Supabase Account** (Cloud or Self-Hosted)
- **Docker-compatible hosting** (Easypanel, Railway, Fly.io, or VPS with Docker)
- **Domain name** (optional, but recommended for production)
- **Cloudflare account** (optional, for CDN and caching)

---

## Quick Start (Easypanel)

### 1. Create Supabase Project

Choose one of the following:

#### Option A: Supabase Cloud (Easiest)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Anon Key** from **Settings → API**

#### Option B: Self-Hosted Supabase (Full Control)

Follow [Supabase Self-Hosting Guide](https://supabase.com/docs/guides/self-hosting/docker) to deploy your own Supabase instance.

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
2. Copy the entire contents of `supabase/schema.sql`
3. Paste and run in the SQL Editor

This creates all tables, RLS policies, and storage buckets.

### 3. Deploy Edge Functions

Edge Functions provide the backend API, AI features, and webhooks.

```bash
# Deploy all functions (run from project root)
supabase functions deploy analyze-brand
supabase functions deploy blog-rss
supabase functions deploy chat-completion
supabase functions deploy content-api
supabase functions deploy create-user
supabase functions deploy generate-text
supabase functions deploy get-page
supabase functions deploy invalidate-cache
supabase functions deploy llms-txt
supabase functions deploy migrate-page
supabase functions deploy newsletter-confirm
supabase functions deploy newsletter-export
supabase functions deploy newsletter-link
supabase functions deploy newsletter-send
supabase functions deploy newsletter-subscribe
supabase functions deploy newsletter-track
supabase functions deploy newsletter-unsubscribe
supabase functions deploy process-image
supabase functions deploy publish-scheduled-pages
supabase functions deploy send-webhook
supabase functions deploy sitemap-xml
```

**Optional Secrets** (only if using AI Brand Analysis or AI Migration):

```bash
supabase secrets set FIRECRAWL_API_KEY=your-firecrawl-api-key
```

### 4. Create First Admin User

After deploying, sign up in the app, then run this SQL in Supabase Dashboard:

```sql
-- Replace with your user's email
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'your-email@example.com'
);
```

### 5. Deploy to Easypanel

#### Via GitHub (Recommended - Auto-deploy on push)

1. Push your code to GitHub
2. In Easypanel, click **Create Service → GitHub**
3. Select your repository
4. Configure:
   - **Build Method**: Dockerfile
   - **Port**: 80
   - **Environment Variables**:
     ```
     VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key-here
     ```
5. Click **Deploy**

Easypanel will:
- Build the Docker image
- Deploy the container
- Provide HTTPS via Traefik (Let's Encrypt)
- Auto-redeploy on git push

#### Via Docker Image (Manual)

```bash
# Build locally
docker build -t pezcms:latest .

# Push to Docker Hub or registry
docker tag pezcms:latest your-registry/pezcms:latest
docker push your-registry/pezcms:latest

# Deploy in Easypanel
# Create Service → Docker Image → your-registry/pezcms:latest
```

### 6. Configure Domain (Optional)

In Easypanel:
1. Go to your service → **Domains**
2. Add your domain (e.g., `cms.example.com`)
3. Update DNS:
   ```
   A record: cms.example.com → Your Easypanel server IP
   ```

Easypanel automatically provisions SSL via Let's Encrypt.

---

## Supabase Setup

### Storage Bucket

Verify the `cms-images` bucket exists:

1. Go to Supabase Dashboard → **Storage**
2. Check for `cms-images` bucket (created by migrations)
3. Ensure it's **public** (for serving images)

### Scheduled Publishing (Optional)

Enable automatic publishing of scheduled pages:

```sql
-- Run in Supabase SQL Editor
SELECT cron.schedule(
  'publish-scheduled-pages',
  '* * * * *',  -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/publish-scheduled-pages',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

Replace `YOUR_PROJECT_REF` and `YOUR_SERVICE_ROLE_KEY` with your values.

---

## Cloudflare Setup (Optional but Recommended)

Cloudflare provides:
- **Global CDN** - Cache static assets worldwide
- **DDoS Protection** - Free tier included
- **Web Application Firewall** - Security rules
- **Analytics** - Traffic insights

### Setup Steps

1. **Add Site to Cloudflare**
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Add your domain
   - Update nameservers at your registrar

2. **DNS Configuration**
   ```
   Type: A
   Name: cms (or @)
   Content: Your Easypanel server IP
   Proxy status: Proxied (orange cloud)
   ```

3. **SSL/TLS Settings**
   - Go to **SSL/TLS** → **Overview**
   - Set to **Full (strict)**

4. **Cache Settings** (Optional - Pezcms already sets Cache-Control headers)
   - Go to **Rules** → **Page Rules**
   - Add rule for `*cms.example.com/assets/*`:
     - Cache Level: Cache Everything
     - Edge Cache TTL: 1 year

5. **Security Settings**
   - **Security** → **WAF** → Enable Managed Rules (Free)
   - **Security** → **Bots** → Enable Bot Fight Mode (Free)

### How Caching Works

```
Browser Request
   ↓
Cloudflare Edge (respects Cache-Control headers)
   ↓
   ├─ /assets/* → Cached 1 year (immutable)
   ├─ /index.html → No cache (always fresh)
   └─ Supabase API → Cached per Pezcms settings (5 min default)
```

**Pezcms cache settings** (in Admin → Settings → Performance) control:
- Edge Function caching (content API)
- TTL duration
- Cache invalidation

**Cloudflare respects these headers automatically** - no extra config needed!

---

## Alternative Platforms

### Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Set environment variables
railway variables set VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
railway variables set VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Deploy
railway up
```

Railway auto-detects the Dockerfile and deploys.

### Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch app
fly launch

# Set secrets
fly secrets set VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
fly secrets set VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Deploy
fly deploy
```

### VPS (Docker Compose)

```bash
# On your VPS
git clone https://github.com/magnusfroste/pezcms.git
cd pezcms

# Create .env file
cat > .env << EOF
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
EOF

# Build and run
docker-compose up -d

# Access at http://your-vps-ip:3000
```

Add Nginx reverse proxy + Let's Encrypt for HTTPS:

```nginx
# /etc/nginx/sites-available/pezcms
server {
    listen 80;
    server_name cms.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then use Certbot for SSL:
```bash
sudo certbot --nginx -d cms.example.com
```

---

## Environment Variables

### Build-Time Variables (Required)

These are baked into the static build:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | `eyJhbGc...` |

**Important**: Changes to these require a rebuild!

### Runtime Variables (Optional)

These are set in Supabase Edge Functions:

| Variable | Description | Required For |
|----------|-------------|--------------|
| `FIRECRAWL_API_KEY` | Web scraping API | AI Brand Analysis, AI Migration |

Set via Supabase CLI:
```bash
supabase secrets set FIRECRAWL_API_KEY=your-key
```

---

## Testing Locally

### Option 1: Docker Compose (Recommended)

```bash
# Create .env file
cp .env.example .env
# Edit .env with your Supabase credentials

# Build and run
docker-compose up --build

# Access at http://localhost:3000
```

### Option 2: Development Mode

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Access at http://localhost:5173
```

### Option 3: Test Production Build Locally

```bash
# Build
docker build -t pezcms:test .

# Run
docker run -p 3000:80 \
  -e VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=your-anon-key-here \
  pezcms:test

# Access at http://localhost:3000
```

---

## Troubleshooting

### Build Fails

**Error**: `npm ci` fails with peer dependency issues

**Solution**: The Dockerfile uses `--legacy-peer-deps` flag. If still failing:
```bash
# Locally test build
docker build --no-cache -t pezcms:debug .
```

### Environment Variables Not Working

**Issue**: Changes to `.env` not reflected

**Cause**: Vite bakes env vars at build time

**Solution**: Rebuild the Docker image:
```bash
docker-compose up --build
```

### Images Not Loading

**Issue**: 404 errors on images from Supabase Storage

**Solution**: 
1. Check bucket exists: Supabase Dashboard → Storage
2. Verify bucket is public
3. Check RLS policies are applied (from migrations)

### Edge Functions Not Working

**Issue**: API calls to Supabase functions fail

**Solution**:
1. Check functions are deployed: `supabase functions list`
2. View logs: Supabase Dashboard → Edge Functions → Logs
3. Verify secrets are set: `supabase secrets list`

### Cache Not Working

**Issue**: Content not updating after changes

**Solution**:
1. Check cache settings in Admin → Settings → Performance
2. Use "Invalidate Cache" button in admin panel
3. If using Cloudflare, purge cache: Cloudflare Dashboard → Caching → Purge Everything

### CORS Errors

**Issue**: Browser console shows CORS errors

**Cause**: Supabase URL mismatch

**Solution**: Verify `VITE_SUPABASE_URL` matches your Supabase project URL exactly

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                        │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare (Optional CDN)                   │
│  - Global edge caching                                   │
│  - DDoS protection                                       │
│  - SSL termination                                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│           Easypanel + Traefik (Reverse Proxy)           │
│  - HTTPS via Let's Encrypt                               │
│  - Load balancing                                        │
│  - Auto-deployment from GitHub                           │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Docker Container (Nginx)                    │
│  - Serves static files from /dist                        │
│  - SPA routing (all routes → index.html)                 │
│  - Gzip compression                                      │
│  - Cache headers for assets                              │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Supabase (Backend)                       │
│  - PostgreSQL database                                   │
│  - Edge Functions (API, AI, webhooks)                    │
│  - Storage (images, media)                               │
│  - Auth (user management)                                │
│  - Realtime (optional)                                   │
└─────────────────────────────────────────────────────────┘
```

---

## Performance Optimization

### Image Optimization

Pezcms automatically converts uploaded images to WebP via the `process-image` Edge Function.

**Manual optimization** (if needed):
```bash
# Install sharp
npm install -g sharp-cli

# Convert images
sharp input.jpg -o output.webp
```

### Bundle Size

Current production build:
- **Gzipped JS**: ~200KB
- **Gzipped CSS**: ~20KB
- **Total initial load**: ~220KB

**Optimization tips**:
- Lazy load routes (already implemented via React Router)
- Tree-shake unused UI components
- Use dynamic imports for heavy features

### Caching Strategy

| Resource | Cache Duration | Header |
|----------|----------------|--------|
| `/assets/*` | 1 year | `public, immutable` |
| `/index.html` | No cache | `no-cache, must-revalidate` |
| Supabase API | 5 min (configurable) | Set by Pezcms admin |
| Images | 1 hour | Set by Supabase Storage |

---

## Security Checklist

- [ ] Enable RLS policies (applied by migrations)
- [ ] Use HTTPS (Easypanel/Traefik handles this)
- [ ] Set strong admin password
- [ ] Enable Cloudflare WAF (optional)
- [ ] Rotate Supabase service role key regularly
- [ ] Review audit logs in Admin → Audit Logs
- [ ] Enable 2FA for Supabase account
- [ ] Restrict Edge Function access (JWT verification enabled by default)

---

## Monitoring

### Easypanel

- **Logs**: Service → Logs tab
- **Metrics**: CPU, Memory, Network usage
- **Health checks**: Automatic via Docker healthcheck

### Supabase

- **Database**: Dashboard → Database → Query Performance
- **Edge Functions**: Dashboard → Edge Functions → Logs
- **Storage**: Dashboard → Storage → Usage

### Cloudflare (if used)

- **Analytics**: Dashboard → Analytics → Traffic
- **Cache Hit Rate**: Dashboard → Caching → Analytics
- **Security Events**: Dashboard → Security → Events

---

## Backup & Recovery

### Database Backup

```bash
# Via Supabase CLI
supabase db dump -f backup.sql

# Restore
supabase db reset --db-url postgresql://...
psql -f backup.sql
```

### Storage Backup

Use Supabase Dashboard → Storage → Download bucket contents

### Docker Image Backup

```bash
# Save image
docker save pezcms:latest | gzip > pezcms-backup.tar.gz

# Restore
docker load < pezcms-backup.tar.gz
```

---

## Scaling

### Horizontal Scaling (Multiple Containers)

Easypanel supports multiple replicas:
1. Service → Settings → Replicas
2. Set to 2+ instances
3. Traefik automatically load balances

### Database Scaling

Supabase Cloud auto-scales. For self-hosted:
- Use read replicas for heavy read workloads
- Enable connection pooling (PgBouncer)
- Add database indexes (already optimized in schema)

### CDN Scaling

Cloudflare automatically scales globally. No config needed.

---

## Cost Estimation

### Supabase Cloud

- **Free tier**: 500MB database, 1GB storage, 2GB bandwidth
- **Pro tier**: $25/month - 8GB database, 100GB storage, 250GB bandwidth

### Easypanel (VPS)

- **Hetzner**: €4.15/month (2 vCPU, 4GB RAM)
- **DigitalOcean**: $6/month (1 vCPU, 1GB RAM)
- **Linode**: $5/month (1 vCPU, 1GB RAM)

### Cloudflare

- **Free tier**: Unlimited bandwidth, basic DDoS, SSL
- **Pro tier**: $20/month (advanced WAF, image optimization)

**Total minimum cost**: ~€10-15/month for full self-hosted stack

---

## Support

- **GitHub Issues**: [github.com/magnusfroste/pezcms/issues](https://github.com/magnusfroste/pezcms/issues)
- **Documentation**: See `docs/PRD.md` for full feature documentation
- **Setup Guide**: See `docs/SETUP.md` for Supabase-only setup

---

## License

MIT License - see `LICENSE` file.
