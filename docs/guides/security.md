# FlowWink Security Architecture

> **Audience:** Security Review / Developers
> **Last Updated:** February 2026

This document describes the authentication and authorization architecture used in FlowWink, intended for security review and developer reference.

---

## 1. Authentication Overview

FlowWink uses **Supabase Auth** for all user authentication. The frontend is a React SPA that communicates with:

- **Supabase Postgres** (via PostgREST) for data
- **Supabase Edge Functions** (Deno runtime) for server-side logic
- **Supabase Storage** for file uploads

```
┌──────────────┐     JWT Bearer Token     ┌──────────────────┐
│   Frontend   │ ──────────────────────── │  Supabase Auth   │
│  (React SPA) │                          │  (GoTrue)        │
└──────┬───────┘                          └──────────────────┘
       │                                          │
       │  JWT Bearer Token                        │ Signs JWTs
       │                                          │ (asymmetric JWKS)
       ▼                                          ▼
┌──────────────┐                          ┌──────────────────┐
│ Edge Functions│ ◄── verify via ────────│  JWKS Endpoint   │
│ (Deno)       │     getUser() call      │  /.well-known/   │
└──────────────┘                          └──────────────────┘
```

## 2. Edge Function JWT Strategy

### Why `verify_jwt = false`

All FlowWink edge functions are deployed with `verify_jwt = false`. This is **intentional and aligned with Supabase's current recommendation**.

#### Background

Supabase transitioned from **symmetric JWT secrets** to **asymmetric JWT Signing Keys (JWKS)** in 2024-2025. The edge function runtime's built-in `verify_jwt` mechanism was designed for the old symmetric secret and does not support the new JWKS-based verification.

**Result:** `verify_jwt = true` causes authentication failures on projects using the new JWT Signing Keys, even when the user's access token is valid.

#### Supabase Official Guidance

From [Supabase Edge Functions Auth Documentation](https://supabase.com/docs/guides/functions/auth):

> Deploy with `--no-verify-jwt` and implement manual JWT verification using the `jose` library and the project's JWKS endpoint.

#### Our Implementation

Instead of the `jose` JWKS approach, we use `supabase.auth.getUser()` which achieves the same goal through a different mechanism:

```typescript
// 1. Check Authorization header exists
const authHeader = req.headers.get('Authorization');
if (!authHeader) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}

// 2. Create Supabase client with user's token
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: authHeader } }
});

// 3. Verify token via Supabase Auth API
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}

// 4. Check admin role (where required)
const { data: roleData } = await supabase
  .from('user_roles')
  .select('role')
  .eq('user_id', user.id)
  .single();

if (roleData?.role !== 'admin') {
  return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
}
```

### Comparison: Our Approach vs JWKS

| Aspect | Our approach (`getUser()`) | JWKS (`jose` library) |
|--------|---------------------------|----------------------|
| Token verification | Server-side API call to Auth | Local cryptographic verification |
| Latency | ~10-50ms extra (network call) | ~1-5ms (local) |
| Token revocation | Immediate (checks live state) | Delayed (until token expires) |
| Admin role check | Separate DB query | Would need separate DB query too |
| Complexity | Simple, well-understood | More setup, JWKS caching |
| Security | ✅ Strong | ✅ Strong |

**Trade-off:** Our approach has slightly higher latency per request but catches revoked tokens immediately. Since we need a DB query for admin role verification anyway, the practical difference is minimal.

### Future Consideration

If latency becomes a concern, we can migrate to JWKS verification:

```typescript
import * as jose from "jsr:@panva/jose@6";

const JWKS = jose.createRemoteJWKSet(
  new URL(Deno.env.get("SUPABASE_URL") + "/auth/v1/.well-known/jwks.json")
);

async function verifyJWT(jwt: string) {
  return jose.jwtVerify(jwt, JWKS, {
    issuer: Deno.env.get("SUPABASE_URL") + "/auth/v1"
  });
}
```

This is a low-priority optimization, not a security fix.

## 3. Function Authentication Categories

Not all edge functions require the same level of authentication:

### Admin-only functions (require admin role)
- `check-secrets` — Reads secret presence (not values)
- `create-user` — Creates new users
- `generate-text` — AI text generation
- `chat-completion` — AI chat
- `newsletter-send` — Sends newsletters
- `copilot-action` — FlowPilot actions
- `migrate-page` — Content migration
- `analyze-brand` — Brand analysis
- `qualify-lead` — Lead qualification
- `enrich-company` — Company enrichment

### Authenticated user functions (any logged-in user)
- `process-image` — Image processing
- `unsplash-search` — Stock photo search

### Public functions (no auth required)
- `content-api` — Public content API (read-only)
- `get-page` — Public page rendering
- `blog-rss` — RSS feed
- `llms-txt` — LLM discovery file
- `sitemap-xml` — Sitemap
- `track-page-view` — Analytics tracking
- `newsletter-subscribe` — Newsletter signup
- `newsletter-track` — Email open tracking
- `newsletter-link` — Link click tracking
- `stripe-webhook` — Stripe webhook (verified by Stripe signature)

### Public functions with their own auth
- `stripe-webhook` — Verified via `Stripe-Signature` header
- `newsletter-gdpr` — Token-based verification

## 4. Row Level Security (RLS)

All Supabase tables use Row Level Security policies. Key patterns:

### Content tables (pages, blog_posts, etc.)
- **Public read:** Published content is readable by anyone
- **Write:** Only authenticated users with appropriate roles

### Admin tables (user_roles, site_settings, etc.)
- **Read/Write:** Only admin users

### User-specific tables (user_roles)
- **Read own:** Users can read their own role
- **Write:** Only admins can modify roles

## 5. API Key Architecture

### Frontend (client-side)
- Uses `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key)
- This key is **public** and safe to expose
- All access is controlled by RLS policies

### Edge Functions (server-side)
- Have access to `SUPABASE_SERVICE_ROLE_KEY` via environment
- This key **bypasses RLS** — used only for admin operations
- Never exposed to the client

### Third-party secrets
- Stored as Supabase secrets (encrypted at rest)
- Only accessible from edge function runtime
- `check-secrets` function reports presence (not values) to admin UI

## 6. CORS Configuration

All edge functions include CORS headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

**Note:** `Access-Control-Allow-Origin: '*'` is acceptable because:
- Authentication is handled via Bearer tokens, not cookies
- No sensitive data is exposed without valid authentication
- This is the standard Supabase edge function pattern

## 7. Deployment Security

### Edge function deployment
```bash
# All functions deployed with --no-verify-jwt
supabase functions deploy <function-name> --no-verify-jwt

# Configured in supabase/config.toml
[functions.<name>]
verify_jwt = false
```

### Why not per-function verify_jwt?
Even public functions use `verify_jwt = false` because:
1. The built-in verification is incompatible with JWKS
2. Public functions don't need JWT verification at all
3. Consistency — all auth is handled in function code

## 8. Known Limitations

1. **`getUser()` latency** — Each authenticated request makes an API call to verify the token. Could be optimized with JWKS local verification.

2. **CORS wildcard** — `Access-Control-Allow-Origin: '*'` is broad. Could be restricted to specific domains in production, but adds deployment complexity for self-hosters.

3. **No rate limiting on edge functions** — Supabase provides basic rate limiting, but no custom per-function limits are implemented.

## 9. Logging & Debugging

### Production-Safe Logging

FlowWink uses a custom logger utility that automatically disables debug logging in production:

```typescript
import { logger } from '@/lib/logger';

// Only logs in development
logger.log('Debug info');
logger.warn('Warning message');

// Always logs (even in production)
logger.error('Critical error');
```

**Why this matters:**
- Debug logs (`log`, `warn`, `debug`) are **silent in production**
- Error logs (`error`) are always active for critical issues
- No sensitive data leaks through console output
- Improved performance (no unnecessary string interpolation in production)

### Security Checklist for Contributors

When creating new edge functions:

- [ ] Add Authorization header check for protected functions
- [ ] Use `supabase.auth.getUser()` to verify the token
- [ ] Check admin role via `user_roles` table if admin-only
- [ ] Never expose `SUPABASE_SERVICE_ROLE_KEY` in responses
- [ ] Never return secret values (only presence checks)
- [ ] Add CORS headers for browser compatibility
- [ ] Handle errors without leaking internal details
- [ ] Log security events (failed auth, forbidden access)

---

*Last updated: February 2026*
*Applies to: FlowWink v1.x with Supabase cloud backend*
