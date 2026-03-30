

## Migration Quality Fix — Full-Site Interactive Migration Plan

### Problem Analysis

After reviewing the entire migration pipeline, I found **three root causes** for poor migration quality:

1. **TipTap format mismatch in `migrate-page`**: The AI prompt in `migrate-page/index.ts` (line 1069) shows `"content": "<p>...</p>"` as an example — raw HTML. But `text` and `two-column` blocks require TipTap JSON (`{ type: "doc", content: [...] }`). The `BLOCK_TYPES_SCHEMA` correctly marks these as `tiptap`, but the example contradicts it.

2. **Two parallel migration systems**: There are TWO completely separate migration paths:
   - **Copilot path** (old): `CopilotChat` → `copilot-action` → `create_block` tool → client-side block assembly
   - **FlowPilot path** (new): `agent-operate` → `agent-execute` → `manage_page` → server-side page creation
   
   The FlowPilot path creates pages in one shot with no interactive review. The Copilot path has interactive block-by-block review but uses a simpler AI prompt without the detailed extraction logic.

3. **No interactive dialog during FlowPilot migration**: When FlowPilot runs `manage_page(create, blocks=[...])`, it dumps all blocks at once. No preview, no approval, no iterative refinement.

### Plan

#### Step 1: Fix TipTap format in `migrate-page` prompt
**File**: `supabase/functions/migrate-page/index.ts`

- Replace the raw HTML example on line 1069 with proper TipTap JSON example
- Add explicit "NEVER use raw HTML strings for content fields" warning near the response format section
- This fixes the root data quality issue for both migration paths

#### Step 2: Unify migration under `migrate-page` edge function (Copilot path)
**File**: `src/hooks/useCopilot.ts`

The Copilot path (`analyzeSite` → `startMigration` → `migrate-page`) already has excellent interactive UX:
- Discovers all pages via sitemap + nav
- Shows page selector (CopilotSiteOverview)
- Migrates page-by-page with block-by-block review
- Auto-continues to next page

This is the correct path. The problem is it goes through `migrate-page` which already has the full schema. **The issue is purely the TipTap format bug in Step 1.**

#### Step 3: Enhance FlowPilot's migration to use interactive dialog
**Files**: `supabase/functions/copilot-action/index.ts`, `supabase/functions/agent-execute/index.ts`

Currently FlowPilot (Engine Room) migration creates pages silently. Enhance it to:
- After scraping, present a summary in chat: "Found X sections. Here's what I'll create..."
- Use `manage_page` with `action: 'create'` for the page, then `manage_page_blocks` to add blocks incrementally
- Report progress per block in the chat stream: `✦ Created hero section`, `✦ Created features grid`, etc.
- At the end, provide a link to preview the page

#### Step 4: Add migration progress feedback in Copilot chat
**File**: `src/components/admin/copilot/CopilotChat.tsx`

- Show a migration progress indicator when `discoveryStatus === 'migrating'`
- Display which page is being processed (e.g., "Migrating 2/5: About Us")
- Show block creation steps as they happen (leveraging existing `toolCall` badge display)

#### Step 5: Add post-migration quality check
**File**: `supabase/functions/migrate-page/index.ts`

- After AI returns blocks, validate that all `tiptap` fields contain proper JSON objects (not strings)
- Auto-fix any raw HTML strings by wrapping them: `{ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: stripped }] }] }`
- Log quality warnings for blocks with missing required fields

### Technical Details

```text
Migration Flow (Fixed):

URL input → migrate-page (analyze-site)
         → Page selector UI (CopilotSiteOverview)
         → For each selected page:
            1. migrate-page (scrape + AI mapping)
            2. Validate TipTap fields (new)
            3. Present blocks one-by-one in chat
            4. User approves/skips/edits
            5. Auto-save page to DB
            6. Set first page as homepage
         → Migration complete summary
```

### Priority Order
1. **Step 1** (TipTap fix) — immediate quality improvement, single file change
2. **Step 5** (validation) — safety net for any AI format errors
3. **Steps 3-4** (interactive feedback) — UX polish for FlowPilot path

