

# Plan: Full White-Label Social Sharing for Self-Hosted Instances

## Summary
Enable complete rebranding of social sharing metadata so self-hosted instances show their own company name, logo, and description when links are shared on social media - not FlowWink branding.

## The Core Problem
Social media crawlers (Facebook, LinkedIn, Twitter) read the initial server-side HTML before JavaScript executes. The current `index.html` has hardcoded FlowWink branding that will appear when links are shared, even if the React `SeoHead` component renders the correct values client-side.

## Solution Overview
Two-pronged approach:
1. **Server-side rendering for meta tags** - Create an edge function that serves dynamic HTML with proper OG tags based on CMS settings
2. **Remove all hardcoded branding** - Clean up remaining FlowWink references and make them configurable

---

## Technical Implementation

### Phase 1: Dynamic SSR Meta Tags via Edge Function

**New edge function: `supabase/functions/render-page/index.ts`**

This function will:
1. Intercept requests from known social media crawlers (Facebook, Twitter, LinkedIn bots via User-Agent)
2. Fetch SEO settings from the database
3. Fetch page-specific meta data if a specific slug is requested
4. Return a complete HTML document with correct OG tags pre-rendered

```text
Request Flow:
                                                  
  Social Bot Request                              
  (User-Agent: facebookexternalhit)              
           |                                      
           v                                      
  +------------------+                            
  | Nginx/CDN        |                            
  +------------------+                            
           |                                      
           v                                      
  +------------------+     Yes    +----------------+
  | Is Social Bot?   |---------->| Edge Function  |
  +------------------+            | render-page    |
           | No                   +----------------+
           v                             |
  +------------------+                   v
  | Static SPA       |           +----------------+
  | (index.html)     |           | Return HTML    |
  +------------------+           | with dynamic   |
                                 | OG tags        |
                                 +----------------+
```

**Key features:**
- Reads SEO settings (`siteTitle`, `ogImage`, `defaultDescription`)
- Reads page-specific meta if slug is provided (title, description, featured image)
- Returns fully formed HTML with correct meta tags for crawlers
- Falls through to normal SPA for regular users

### Phase 2: Clean Up Hardcoded Branding

**Files to modify:**

| File | Current State | Change |
|------|--------------|--------|
| `index.html` | Hardcoded FlowWink | Use generic placeholders that get replaced or leave minimal defaults |
| `src/pages/AuthPage.tsx` | Hardcoded "FlowWink" | Use `branding.adminName` from settings |
| `src/pages/PricingPage.tsx` | Hardcoded FlowWink in title | Use `seoSettings.siteTitle` |
| `src/hooks/useSiteSettings.tsx` | `adminName: 'FlowWink'` default | Change to generic "CMS" or empty string |

### Phase 3: Nginx Configuration Update

**Modify `nginx.conf`** to route social bot requests to the edge function:

```nginx
# Detect social media crawlers
map $http_user_agent $is_crawler {
    default                             0;
    "~*facebookexternalhit"             1;
    "~*Twitterbot"                      1;
    "~*LinkedInBot"                     1;
    "~*WhatsApp"                        1;
    "~*Slackbot"                        1;
    "~*Discordbot"                      1;
}

server {
    # ... existing config ...

    location / {
        # Route crawlers to SSR endpoint
        if ($is_crawler) {
            rewrite ^(.*)$ /functions/v1/render-page?path=$1 break;
            proxy_pass https://YOUR_SUPABASE_URL;
        }
        
        # Normal SPA routing
        try_files $uri $uri/ /index.html;
    }
}
```

### Phase 4: Documentation Update

**Update `docs/SETUP.md`** with:
- Instructions for configuring branding before first deploy
- How social sharing works
- Testing OG tags with Facebook Sharing Debugger

---

## Files to Create/Modify

### New Files
1. `supabase/functions/render-page/index.ts` - SSR for social crawlers

### Modified Files
1. `index.html` - Remove hardcoded FlowWink branding
2. `nginx.conf` - Add crawler detection and routing  
3. `src/pages/AuthPage.tsx` - Use dynamic branding
4. `src/pages/PricingPage.tsx` - Use dynamic site title
5. `src/hooks/useSiteSettings.tsx` - Change default adminName
6. `docs/SETUP.md` - Add branding configuration section

---

## User Benefit

After implementation, when a self-hosted customer (e.g., "Acme Corp") shares a link on LinkedIn:
- **Before**: Shows "FlowWink - Flow into Content Creation" with FlowWink's OG image
- **After**: Shows "Acme Corp" with Acme's configured OG image from their SEO settings

The branding is 100% controlled via the admin UI with zero code changes required for rebranding.

