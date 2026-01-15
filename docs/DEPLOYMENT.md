# Production Deployment Guide

Complete guide for deploying FlowWink to production with Docker on Easypanel, Railway, Fly.io, or any Docker-compatible platform.

> **⚠️ Prerequisites**: You must complete [SETUP.md](./SETUP.md) first to set up your Supabase backend (database + edge functions).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start (Easypanel)](#quick-start-easypanel)
- [Cloudflare Setup (Optional but Recommended)](#cloudflare-setup-optional-but-recommended)
- [Alternative Platforms](#alternative-platforms)
- [Environment Variables](#environment-variables)
- [Testing Locally](#testing-locally)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **✅ Completed [SETUP.md](./SETUP.md)** - Supabase backend must be configured first
- **Docker-compatible hosting** (Easypanel, Railway, Fly.io, or VPS with Docker)
- **Domain name** (optional, but recommended for production)
- **Cloudflare account** (optional, for CDN and caching)

> **⚠️ Important**: If you haven't set up Supabase yet, complete [SETUP.md](./SETUP.md) first. The app requires:
> - Supabase project created
> - Edge functions deployed (via CLI)
> - Database migrations run
> - Environment variables noted (URL + anon key)

---

## Quick Start (Easypanel)

> **Before starting**: Complete [SETUP.md](./SETUP.md) to set up your Supabase backend.

### 1. Prepare Environment Variables

From your Supabase project (Settings → API), note:
- **Project URL**: `https://YOUR_PROJECT_REF.supabase.co`
- **Anon/Public Key**: `eyJhbGc...`

You'll need these for Easypanel configuration.

### 2. Deploy to Easypanel


#### Via GitHub (Recommended - Auto-deploy on push)

1. **Fork or push** FlowWink code to your GitHub repository
2. In Easypanel, click **Create Service → GitHub**
3. **Select your repository**
4. **Configure**:
   - **Build Method**: Dockerfile
   - **Port**: 80
   - **Environment Variables**:
     ```
     VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
     VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
     VITE_SUPABASE_PROJECT_ID=YOUR_PROJECT_REF
     ```
   > **Note**: Easypanel automatically passes environment variables as Docker build arguments.
5. Click **Deploy**

Easypanel will:
- Build the Docker image
- Deploy the container
- Provide HTTPS via Traefik (Let's Encrypt)
- Auto-redeploy on git push

#### Via Docker Image (Manual)

```bash
# Build locally
docker build -t flowwink:latest .

# Push to Docker Hub or registry
docker tag flowwink:latest your-registry/flowwink:latest
docker push your-registry/flowwink:latest

# Deploy in Easypanel
# Create Service → Docker Image → your-registry/flowwink:latest
```

### 3. Create First Admin User

After deployment:

1. Visit your deployed app
2. Sign up with email/password
3. In Supabase Dashboard → **SQL Editor**, run:

```sql
-- Replace with your user's email
UPDATE public.user_roles 
SET role = 'admin' 
WHERE user_id = (
  SELECT id FROM auth.users WHERE email = 'your-email@example.com'
);
```

### 4. Configure Domain (Optional)

In Easypanel:
1. Go to your service → **Domains**
2. Add your domain (e.g., `cms.example.com`)
3. Update DNS:
   ```
   A record: cms.example.com → Your Easypanel server IP
   ```

Easypanel automatically provisions SSL via Let's Encrypt.

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

4. **Cache Settings** (Optional - FlowWink already sets Cache-Control headers)
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
   └─ Supabase API → Cached per FlowWink settings (5 min default)
```

**FlowWink cache settings** (in Admin → Settings → Performance) control:
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
git clone https://github.com/magnusfroste/flowwink.git
cd flowwink

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
# /etc/nginx/sites-available/flowwink
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
docker build -t flowwink:test .

# Run
docker run -p 3000:80 \
  -e VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=your-anon-key-here \
  flowwink:test

# Access at http://localhost:3000
```

---

## Troubleshooting

### Build Fails

**Error**: `npm ci` fails with peer dependency issues

**Solution**: The Dockerfile uses `--legacy-peer-deps` flag. If still failing:
```bash
# Locally test build
docker build --no-cache -t flowwink:debug .
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

FlowWink automatically converts uploaded images to WebP via the `process-image` Edge Function.

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
| Supabase API | 5 min (configurable) | Set by FlowWink admin |
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
docker save flowwink:latest | gzip > flowwink-backup.tar.gz

# Restore
docker load < flowwink-backup.tar.gz
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

- **GitHub Issues**: [github.com/magnusfroste/flowwink/issues](https://github.com/magnusfroste/flowwink/issues)
- **Documentation**: See `docs/PRD.md` for full feature documentation
- **Setup Guide**: See `docs/SETUP.md` for Supabase-only setup

---

## License

MIT License - see `LICENSE` file.
