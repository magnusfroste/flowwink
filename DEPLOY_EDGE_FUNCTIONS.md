# Deploy Edge Functions to New Supabase Instance

## Problem
Your new Supabase instance (`nofzfwxshugalpalbfpw`) is missing the edge functions, which is why pages show blank (404 errors).

## Solution: Deploy Edge Functions via Supabase Dashboard

### Critical Functions (Deploy These First)

These are the minimum functions needed for pages to work:

1. **get-page** - Fetches and caches published pages
2. **track-page-view** - Tracks page analytics

### Deployment Steps

#### Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/nofzfwxshugalpalbfpw
2. Navigate to **Edge Functions** in the left sidebar
3. Click **Deploy new function**
4. For each function below:
   - Name: `get-page`
   - Upload the file: `supabase/functions/get-page/index.ts`
   - Click **Deploy**

Repeat for:
- `track-page-view` (from `supabase/functions/track-page-view/index.ts`)
- `content-api` (from `supabase/functions/content-api/index.ts`)
- `sitemap-xml` (from `supabase/functions/sitemap-xml/index.ts`)

#### Option 2: Via Supabase CLI (If You Have Project Access)

If you have owner/admin access to the project:

```bash
# Make sure you're logged in
supabase login

# Link to the project
supabase link --project-ref nofzfwxshugalpalbfpw

# Deploy critical functions
supabase functions deploy get-page
supabase functions deploy track-page-view
supabase functions deploy content-api
supabase functions deploy sitemap-xml
```

#### Option 3: Deploy All Functions at Once

If you want all features (AI, newsletter, etc.):

```bash
# Deploy all functions
for func in supabase/functions/*/; do
  func_name=$(basename "$func")
  echo "Deploying $func_name..."
  supabase functions deploy "$func_name" --project-ref nofzfwxshugalpalbfpw
done
```

### Verify Deployment

After deploying, test the functions:

1. **Test get-page:**
   ```
   https://nofzfwxshugalpalbfpw.supabase.co/functions/v1/get-page?slug=home
   ```
   Should return page data (not 404)

2. **Test track-page-view:**
   ```
   curl -X POST https://nofzfwxshugalpalbfpw.supabase.co/functions/v1/track-page-view \
     -H "Content-Type: application/json" \
     -d '{"pageSlug":"home"}'
   ```
   Should return 200 OK (not CORS error)

### Update Easypanel Environment Variables

After deploying functions, make sure Easypanel has the correct environment variables:

```
VITE_SUPABASE_URL=https://nofzfwxshugalpalbfpw.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZnpmd3hzaHVnYWxwYWxiZnB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzY4MTIsImV4cCI6MjA4NDAxMjgxMn0.X_Y127hxBXxW8ztBk6r2n89z0RVMhEfyKI0Lx4RYFR8
VITE_SUPABASE_PROJECT_ID=nofzfwxshugalpalbfpw
```

Then **rebuild/redeploy** the app in Easypanel.

## Why This Fixes the Issue

- Old database works: Has edge functions deployed ✓
- New database fails: Missing edge functions ✗
- Blog works: Uses direct DB queries, doesn't need edge functions
- Pages fail: Requires `get-page` edge function

Once edge functions are deployed, pages will load correctly!
