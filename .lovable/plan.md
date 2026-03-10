

# Content Area Header with Pinned Favorites

## Concept

A slim header bar (h-10) that sits **inside the content area** — to the right of the sidebar, not over it. It contains:
- **Pinned favorites** (left side) — user pins pages like "Blog", "Contacts" as quick-access chips, like browser bookmarks
- **Profile avatar** (right side) — compact avatar with dropdown (moved from sidebar footer, or duplicated)
- **Sidebar trigger** — for collapsed state

```text
┌──────────┬──────────────────────────────────────────────┐
│ Sidebar  │ [≡] [⚡FlowPilot] [📝Blog] [👥Contacts]  (👤) │  ← slim header
│          ├──────────────────────────────────────────────┤
│          │                                              │
│          │            Page content                      │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

## Implementation

### 1. Create `AdminContentHeader` component
- Renders inside `AdminLayout`, between sidebar and content
- Left: `SidebarTrigger` + pinned favorites as small chips/buttons
- Right: Profile avatar with dropdown (reuse existing dropdown logic)
- Pinned items stored in `localStorage` (per-user, keyed by user id)
- "Pin this page" action via a small star/pin icon on each page (or right-click in sidebar)
- Uses the same `navigationGroups` data to resolve icons/names from hrefs

### 2. Pin management
- `usePinnedPages` hook — reads/writes `localStorage` key `flowwink-pinned-{userId}`
- Stores array of `{ href, name, icon }` objects
- Max ~8 pins to avoid overflow; overflow scrolls horizontally
- Add pin: from sidebar context menu or a "Pin to header" button in `AdminContentHeader`
- Remove pin: right-click on chip → "Unpin", or drag-off

### 3. Update `AdminLayout`
- Wrap content area in a flex-col: header on top, scrollable content below
- Move `p-8` padding to the content div only
- Header is `h-10 border-b flex items-center px-3`

### 4. Profile in header
- Compact avatar (h-7 w-7) with the same `DropdownMenu` as sidebar footer
- Shows initials; click opens profile/settings/sign-out menu
- Sidebar footer profile remains for when header isn't visible (mobile)

## Files

| File | Action |
|------|--------|
| `src/components/admin/AdminContentHeader.tsx` | **Create** — slim header with pins + profile |
| `src/hooks/usePinnedPages.ts` | **Create** — localStorage-backed pin management |
| `src/components/admin/AdminLayout.tsx` | **Edit** — insert header above content |
| `src/pages/admin/CopilotPage.tsx` | **Edit** — adjust height calc for new header |

## Scope
Pure frontend, no DB changes. Pins in localStorage. ~4 files touched.

