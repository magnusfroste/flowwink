# Deployment

FlowWink is a self-hosted SaaS. The recommended stack is **Supabase Cloud** for the backend (database, auth, edge functions, storage) and **Vercel** for the frontend (static React + Vite build). It works on free tiers for getting started.

```
┌────────────────────┐        ┌──────────────────────────┐
│  Vercel            │ HTTPS  │  Supabase Cloud project  │
│  (this repo)       │ ─────▶ │  • Postgres + RLS        │
│  React + Vite SPA  │        │  • Auth                  │
└────────────────────┘        │  • Edge Functions        │
                              │  • Storage               │
                              └──────────────────────────┘
```

You can swap Vercel for Netlify, Cloudflare Pages, or any static host. You can swap Supabase Cloud for a self-hosted Supabase instance — the app only talks to the standard Supabase API.

---

## 1. Create the Supabase project

1. Sign up at [supabase.com](https://supabase.com/) and create a new project.
2. Pick a region close to your users. The free tier is enough to start.
3. From **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Project ref** (the subdomain of the URL) → `VITE_SUPABASE_PROJECT_ID`

---

## 2. Push schema and edge functions

Install the Supabase CLI ([docs](https://supabase.com/docs/guides/cli)), then from the repo root:

```bash
supabase login
supabase link --project-ref <your-ref>

# Database schema
supabase db push

# All edge functions
supabase functions deploy --project-ref <your-ref>
```

Public-facing functions (the ones called from anonymous visitors) must be deployed with `--no-verify-jwt`. The `scripts/flowwink.sh` helper does this automatically — see [`setup.md`](./setup.md).

After functions are deployed, set runtime secrets (OpenAI, Hunter, etc.) in **Supabase → Project Settings → Edge Functions → Secrets** or via:

```bash
supabase secrets set OPENAI_API_KEY=sk-... --project-ref <your-ref>
```

---

## 3. Deploy the frontend to Vercel

1. Push this repo to your own GitHub account.
2. Go to [vercel.com](https://vercel.com/), **Add New → Project**, and import the repo.
3. Framework preset: **Vite**. Build command: `npm run build`. Output: `dist`.
4. Add the three env vars from step 1:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
5. **Deploy.** Vercel auto-rebuilds on every push to `main`.

Add your custom domain under **Vercel → Project → Domains**. Update Supabase **Auth → URL Configuration** with the production URL so login redirects work.

---

## 4. Create the first admin

After the first deploy:

```bash
bash scripts/flowwink.sh
# choose: create admin
```

Or sign up through the UI, then promote yourself with:

```sql
insert into public.user_roles (user_id, role)
values ('<your-auth-uid>', 'admin');
```

---

## 5. Enable Demo Mode (optional)

If you're running a public demo instance (like `demo.flowwink.com`), go to **`/admin/settings` → General → Demo Mode** and flip the switch. It schedules an hourly reset cron that wipes dynamic module data and re-seeds the demo template.

---

## Alternative frontend hosts

| Host | Notes |
|---|---|
| **Netlify** | Same flow as Vercel. Build: `npm run build`, publish: `dist`. |
| **Cloudflare Pages** | Build: `npm run build`, output: `dist`. Free tier is generous. |
| **Static S3/CDN** | Run `npm run build`, upload `dist/`. Configure SPA fallback to `index.html`. |
| **Your own VPS + nginx** | `npm run build`, serve `dist/` behind nginx with a single-page-app fallback. |

The app is a pure static SPA — there is no Node server to run. All backend logic lives in Supabase edge functions.

---

## Updating

```bash
git pull
supabase db push
supabase functions deploy --project-ref <your-ref>
```

Vercel rebuilds the frontend automatically on push. See [`upgrading.md`](./upgrading.md) for release notes.

---

## Troubleshooting

- **`Remote migration versions not found in local migrations directory`** during `db push` — a stray remote migration row. Safe to ignore if push completes, or run `supabase migration repair --status reverted <version> --project-ref <ref>`.
- **401 from edge functions on the public site** — the function was deployed without `--no-verify-jwt`. Redeploy with the flag.
- **Login redirects to wrong URL** — update **Auth → URL Configuration** in Supabase with your production domain.
- **Integration card shows "No API key" but secret is set** — make sure the secret is set in Supabase Edge Function secrets (not just frontend env), then hard-refresh the integrations page.
