---
description: How to create a new module or add cross-module functionality in FlowWink
---

# New Module Workflow

## Architecture Rules

Before writing any code, read `docs/MODULE-API.md` — especially the **Data Layer Contracts** section.

### Core Principle: Table Ownership

Every database table has ONE owner module. Other modules access shared tables ONLY through contract functions.

### Shared Table Rules

| Table | Owner | Contract | File |
|-------|-------|----------|------|
| `leads` | CRM | `createLeadFrom*()`, `updateLeadStatus()` | `src/lib/lead-utils.ts` |
| `lead_activities` | CRM | `addLeadActivity()` | `src/lib/lead-utils.ts` |
| `companies` | CRM | `findOrCreateCompanyByDomain()` (internal) | `src/lib/lead-utils.ts` |

### NEVER do this from a non-CRM module:

```typescript
// ❌ FORBIDDEN
await supabase.from('leads').insert(...)
await supabase.from('leads').update(...)
await supabase.from('lead_activities').insert(...)
```

### ALWAYS do this instead:

```typescript
// ✅ CORRECT
import { createLeadFromWebinar, addLeadActivity, updateLeadStatus } from '@/lib/lead-utils';
```

## Steps to Create a New Module

### 1. Database Migration

Create `supabase/migrations/YYYYMMDDHHMMSS_create_<module>.sql` with:
- Tables owned by this module
- Indexes
- RLS policies (admins manage, public read where appropriate)

### 2. Types

Add the new block type to `src/types/cms.ts` → `ContentBlockType` union (if module has a block).

### 3. Hooks

Create `src/hooks/use<Module>.ts`:
- CRUD hooks using `@tanstack/react-query`
- If module creates leads → import and use `createLeadFrom*()` from `lead-utils.ts`
- If no matching function exists → create one in `lead-utils.ts` first

### 4. Admin Page

Create `src/pages/admin/<Module>Page.tsx` and add route in `src/App.tsx`.

### 5. Sidebar

Add nav item in `src/components/admin/AdminSidebar.tsx` with `moduleId`.

### 6. Module Registration

In `src/hooks/useModules.tsx`:
- Add to `ModulesSettings` interface
- Add to `defaultModulesSettings`
- Add to `SIDEBAR_TO_MODULE` mapping

### 7. Public Block (if applicable)

- Create `src/components/public/blocks/<Module>Block.tsx`
- Export from `src/components/public/blocks/index.ts`
- Add case in `src/components/public/BlockRenderer.tsx`
- Add to `src/lib/block-reference.ts` (BLOCK_REFERENCE array)
- Add to `src/components/admin/blocks/BlockSelector.tsx` (BLOCK_GROUPS)
- Add to `src/hooks/useBlockModuleStatus.ts` (BLOCK_TO_MODULE)
- Create `src/components/admin/blocks/<Module>BlockEditor.tsx`
- Add case + import in `src/components/admin/blocks/BlockEditor.tsx` (renderBlockContent + DEFAULT_BLOCK_DATA + BlockDataMap)

### 8. Lead Integration (if module captures contacts)

In `src/lib/lead-utils.ts`:
1. Add activity type to `ACTIVITY_POINTS`
2. Create `createLeadFrom<Module>()` following existing pattern
3. Add activity type to `src/hooks/useActivities.ts` → `ActivityType` union + `getActivityTypeInfo()`
4. Add metadata display in `src/components/admin/ActivityTimeline.tsx`

### 9. Verify Modularity

Run this check — no results means clean separation:

```bash
grep -rn "from('leads')\.\(insert\|update\)" src/ --include="*.ts" --include="*.tsx" \
  | grep -v lead-utils.ts | grep -v useLeads.ts | grep -v useActivities.ts \
  | grep -v CreateLeadDialog.tsx | grep -v ResetSiteDialog.tsx | grep -v useCsvImportExport.ts \
  | grep -v module-registry.ts
```

## Design Rules (learned from past bugs)

These rules come from recurring issues found in git history. Follow them to avoid repeating mistakes.

### 1. Content Format: Always Tiptap JSON

All rich text content uses Tiptap JSON as the single source of truth. Never store raw HTML or markdown in the database.

```typescript
// ❌ BAD — storing HTML
await supabase.from('blog_posts').insert({ content: '<p>Hello</p>' });

// ✅ GOOD — Tiptap JSON
import { createDocumentFromMarkdown } from '@/lib/tiptap-utils';
const tiptapDoc = createDocumentFromMarkdown('Hello');
await supabase.from('blog_posts').insert({ content: tiptapDoc });
```

For rendering: `renderToHtml()` from `tiptap-utils.ts`. For public pages: `@tailwindcss/typography` prose classes.

**Past bugs:** 6 fixes related to content format mismatches (blog content render, legacy format, editor sync conflicts).

### 2. Block Registration: ALL 8 Places

When adding a new block type, you MUST update all of these. Missing any one causes "Unknown block type" or invisible blocks:

1. `src/types/cms.ts` → `ContentBlockType` union
2. `src/components/public/blocks/<Name>Block.tsx` → public component
3. `src/components/public/blocks/index.ts` → export
4. `src/components/public/BlockRenderer.tsx` → case in switch
5. `src/lib/block-reference.ts` → `BLOCK_REFERENCE` array
6. `src/components/admin/blocks/BlockSelector.tsx` → `BLOCK_GROUPS`
7. `src/components/admin/blocks/<Name>BlockEditor.tsx` → editor component
8. `src/components/admin/blocks/BlockEditor.tsx` → case in `renderBlockContent` + `DEFAULT_BLOCK_DATA` + `BlockDataMap` type + import

If the block belongs to a module, also:
9. `src/hooks/useBlockModuleStatus.ts` → `BLOCK_TO_MODULE`

**Past bug:** Webinar block showed "Unknown block type" because step 7+8 were missed.

### 3. Image & Photo State: Single Source of Truth

Never store image URLs in multiple places. One field in DB, derive everywhere else.

```typescript
// ❌ BAD — syncing image between two state variables
const [image, setImage] = useState(data.image);
const [previewImage, setPreviewImage] = useState(data.image);

// ✅ GOOD — single state, derive preview
const [image, setImage] = useState(data.image);
const previewImage = image || '/placeholder.png';
```

**Past bugs:** 5 fixes for team photo syncing, member photo drift, image per member, avatar aspect.

### 4. React State: Avoid Stale Closures

Use `useCallback` with correct dependencies. Use functional state updates in event handlers.

```typescript
// ❌ BAD — stale closure in callback
const handleUpdate = () => {
  onChange({ ...data, field: value }); // `data` may be stale
};

// ✅ GOOD — functional update or fresh reference
const handleUpdate = useCallback(() => {
  onChange(prev => ({ ...prev, field: value }));
}, [onChange, value]);
```

**Past bug:** Table cell edits stale closure, editor content sync.

### 5. Module Visibility: Use moduleId, Not Special Cases

Sidebar items use `moduleId` for visibility. Never add special-case filtering logic.

```typescript
// ❌ BAD — special case
if (item.name === 'Webinars' && !webinarsEnabled) return false;

// ✅ GOOD — generic moduleId check (already built into AdminSidebar)
{ name: "Webinars", href: "/admin/webinars", icon: Video, moduleId: "webinars" }
```

Module defaults in `useModules.tsx` → `defaultModulesSettings` control initial state. The merge logic handles DB overrides.

**Past bug:** Webinar sidebar link flickered because default was `enabled: false` and DB had no stored value yet.

### 6. Admin Block Editor: Preview Must Match Public

The admin block editor preview (`isEditing === false`) should visually match the public `BlockRenderer` output. Don't create a simplified preview — use the same structure.

**Past bugs:** 2 commits to enhance block editor previews to match public rendering.

### 7. Edge Functions: Always --no-verify-jwt

All Supabase edge functions deploy with `--no-verify-jwt`. Functions implement their own auth checks internally.

```typescript
// Every edge function must check auth:
const authHeader = req.headers.get('Authorization');
const { data: { user } } = await supabase.auth.getUser(token);
// Check admin role if needed
```

### 8. Naming Conventions

- **Hooks:** `use<Module>.ts` (e.g., `useWebinars.ts`)
- **Admin pages:** `<Module>Page.tsx` (e.g., `WebinarsPage.tsx`)
- **Public blocks:** `<Name>Block.tsx` (e.g., `WebinarBlock.tsx`)
- **Block editors:** `<Name>BlockEditor.tsx` (e.g., `WebinarBlockEditor.tsx`)
- **Migrations:** `YYYYMMDDHHMMSS_create_<module>.sql`
- **Module IDs:** camelCase in code (`webinars`), snake_case in DB

### 9. UI: Less Is More

Follow the user's design principle: clean, functional, minimal. No decorative elements. Use shadcn/ui components consistently. Lucide icons only.

## Checklist

### Data & Architecture
- [ ] Module has its own tables (no writes to other module's tables)
- [ ] Lead interaction goes through `lead-utils.ts`
- [ ] Activity logging goes through `addLeadActivity()`
- [ ] Status changes go through `updateLeadStatus()`

### Block Registration (all 8+1 places)
- [ ] `ContentBlockType` union in `cms.ts`
- [ ] Public block component
- [ ] Export in `blocks/index.ts`
- [ ] Case in `BlockRenderer.tsx`
- [ ] Entry in `block-reference.ts`
- [ ] Entry in `BlockSelector.tsx` (BLOCK_GROUPS)
- [ ] Block editor component
- [ ] Case + default data + type in `BlockEditor.tsx`
- [ ] Module mapping in `useBlockModuleStatus.ts` (if module-dependent)

### Module Registration
- [ ] `ModulesSettings` interface in `useModules.tsx`
- [ ] `defaultModulesSettings` entry
- [ ] `SIDEBAR_TO_MODULE` mapping
- [ ] Admin page + route in `App.tsx`
- [ ] Sidebar nav item with `moduleId`

### Content & UI
- [ ] Rich text stored as Tiptap JSON (never raw HTML)
- [ ] Admin preview matches public rendering
- [ ] Images: single source of truth, no state duplication
- [ ] No stale closures in callbacks

### Documentation
- [ ] `docs/MODULE-API.md` updated
- [ ] Block-to-module table updated
