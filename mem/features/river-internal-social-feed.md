---
name: river-internal-social-feed
description: River-modulen — intern X/Instagram/Slack-inspirerad social feed för teamet
type: feature
---

# River

Intern social kanal för personalen — inspirerad av X/Instagram/Slack. Korta meddelanden, bilder, trådade svar, emoji-reaktioner, realtime.

## Tabeller
- `river_posts` (id, author_id, body, media_urls jsonb, parent_id, pinned, reply_count, reaction_count)
- `river_reactions` (post_id, user_id, emoji) UNIQUE(post_id, user_id, emoji)

## Storage
- Bucket `river-media` (public read, authed insert, owner delete)

## RLS
- Authenticated read all
- Insert kräver author_id = auth.uid()
- Update/delete: egen post; admin kan ta bort allt och pinna

## Realtime
- `river_posts` + `river_reactions` är på `supabase_realtime`-publication. UI lyssnar i `useRiverFeed`.

## Skills (handler `module:river`)
- `post_to_river` — create/reply/pin/unpin/delete/list
- `search_river` — ILIKE på body

## UI
- `/admin/river` — feed med composer, bildupload, threads (öppna inline), emoji-reaktioner. Pinned-poster överst.

## Filer
- `src/lib/modules/river-module.ts`
- `src/hooks/useRiver.ts`
- `src/pages/admin/RiverPage.tsx`
- agent-execute: `executeRiverAction`
