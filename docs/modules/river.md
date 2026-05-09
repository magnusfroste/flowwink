# River

Internal team social feed — X / Instagram / Slack-inspired. Short messages, images, threaded replies, emoji reactions, realtime.

## What it is
A lightweight internal channel for the staff. Think Slack #general crossed with X: post a status, drop a screenshot, reply in a thread, react with an emoji. Authenticated-only — never exposed to visitors.

## Schema
- `river_posts` — `author_id`, `body`, `media_urls jsonb`, `parent_id` (thread), `pinned`, counters (`reply_count`, `reaction_count`)
- `river_reactions` — `post_id`, `user_id`, `emoji` (unique per triple)
- Storage bucket `river-media` (public read, authenticated upload, owner delete)

## RLS
- Read: any authenticated user
- Insert: `author_id = auth.uid()`
- Update/Delete: author of the row, OR admin
- Pin/Unpin: admin only

## Realtime
Both tables are on the `supabase_realtime` publication. The feed UI subscribes in `useRiverFeed` and invalidates queries on any change so other browsers see new posts/reactions instantly.

## Skills (MCP-exposed)
- `post_to_river` — `action: create | reply | pin | unpin | delete | list`, optional `body`, `parent_id`, `id`, `media_urls[]`
- `search_river` — `query`, `limit`

Both routed via `agent-execute` handler `module:river` → `executeRiverAction`.

## Routes / UI
- `/admin/river` (admin nav: **Content → River**)
- Composer with markdown body, image upload (max 4), `⌘↵` to post
- Pinned posts float to the top with a primary-tinted card
- URLs and `#tags` auto-link in the rendered body
- Click "Reply" to open a thread inline with its own composer

## Files
- `src/lib/modules/river-module.ts` — module manifest + skill seeds
- `src/hooks/useRiver.ts` — queries, mutations, upload helper
- `src/pages/admin/RiverPage.tsx` — the feed UI
- `supabase/functions/agent-execute/index.ts` — `executeRiverAction`
- Migration: creates `river_posts`, `river_reactions`, triggers, RLS, storage bucket

## When to use it
- Team announcements, deploy notes, quick wins, questions, memes, screenshots.
- For SOPs / structured knowledge → use Wiki.
- For external customer chat → use Cowork Chat / Live Support.
