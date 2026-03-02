

# Fix: Pages Not Visible in Docker/Easypanel Admin

## Problem Analysis

The pages list in `/admin/pages` appears empty after Docker deployment, even though template generation succeeds and pages exist in the database. Pages created manually also don't appear in admin but DO show on the public site.

### Root Cause

This is an **authentication timing issue**, not a nginx/JWT proxy problem. The Supabase JS client communicates directly with the Supabase API -- nginx never handles those requests.

When the app loads in a Docker container (different domain, cold start), the Supabase auth session takes longer to restore from localStorage. During this window, queries execute as `anon` instead of `authenticated`. The RLS policy for `anon` only returns published pages, making drafts invisible.

The existing `usePages` fix (`enabled: !authLoading`) is correct but incomplete -- several other hooks lack the same guard. Additionally, `docker-compose.yml` has configuration bugs.

## Plan

### 1. Fix docker-compose.yml configuration

Move Vite variables from runtime `environment` to build-time `args` (Vite bakes env vars at build time). Fix variable naming to match what the Dockerfile expects.

**Before:**
```yaml
environment:
  - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
  - VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
```

**After:**
```yaml
build:
  context: .
  dockerfile: Dockerfile
  args:
    - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
    - VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
    - VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}
```

### 2. Add auth guards to ALL admin query hooks in usePages.tsx

Currently only `usePages` waits for auth. These hooks also need the guard:

- `usePage` -- single page fetch (used in page editor)
- `useDeletedPages` -- trash view
- `usePageVersions` -- version history

Pattern applied to each:
```typescript
export function useDeletedPages() {
  const { loading: authLoading, session } = useAuth();
  return useQuery({
    queryKey: ['deleted-pages', session?.user?.id ?? 'anon'],
    enabled: !authLoading,
    // ...existing queryFn
  });
}
```

### 3. Fix ChatFeedback Swedish text

`ChatFeedback.tsx` has hardcoded Swedish strings. Change to English per project requirements:
- "Tack for din feedback!" -> "Thanks for your feedback!"
- "Tack! Vi anvander detta for att forbattra." -> "Thanks! We'll use this to improve."
- "Kunde inte spara feedback" -> "Could not save feedback"
- "Tack!" -> "Thanks!"

### 4. Update Docker quickstart docs

Update `docs/DOCKER-QUICKSTART.md` to use correct variable name (`VITE_SUPABASE_PUBLISHABLE_KEY` not `VITE_SUPABASE_ANON_KEY`) and add `VITE_SUPABASE_PROJECT_ID`.

## Files Modified

| File | Change |
|------|--------|
| `docker-compose.yml` | Fix build args, variable names |
| `src/hooks/usePages.tsx` | Add auth guards to `usePage`, `useDeletedPages`, `usePageVersions` |
| `src/components/chat/ChatFeedback.tsx` | English text |
| `docs/DOCKER-QUICKSTART.md` | Correct env var names |

## Important Note for Easypanel

If Easypanel passes the env vars as runtime environment variables rather than Docker build arguments, the Vite build won't pick them up. In Easypanel's settings, ensure these are configured as **build arguments**, not just environment variables. The variable names must be exactly:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## Edge Functions Consideration

Edge functions deployed to Lovable Cloud (`rzhjotxffjfsdlhrdkpj`) are NOT available on the Docker Supabase (`urjdzmenjvkergjrzjvs`). Features like AI chat, brand analysis, image processing, and webhooks will not work in Docker unless edge functions are also deployed to the production Supabase. This is a separate concern and does not affect the pages visibility issue.

