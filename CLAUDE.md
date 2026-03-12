# FlowWink — Development Guide

## Core Architecture Principle: Blocks are interfaces to FlowPilot

**Blocks have two responsibilities only:**
1. **Intent capture** — structured UI that makes the visitor's intent explicit
2. **Response rendering** — display FlowPilot's answer in a visual format

**FlowPilot is always the intelligence layer.** Blocks never build their own AI pipelines.

```
WRONG:  Block → dedicated edge function → AI model
RIGHT:  Block → FlowPilot (chat-completion) → structured response → Block renders
```

Why: FlowPilot has soul, objectives, knowledge base, CRM context, and full site awareness.
A block that bypasses it breaks the "website is a consultant" narrative.

### Auth pattern for public blocks
Public blocks (visible to anonymous visitors) must NOT use `supabase.functions.invoke()` —
it sends the user JWT and returns 401 for unauthenticated visitors.

Use the same pattern as `useChat.tsx`:
```ts
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-completion`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ ... }),
  }
);
```

---

## Block System

Each block has:
- **Public renderer**: `src/components/public/blocks/[Name]Block.tsx`
- **Admin editor**: `src/components/admin/blocks/[Name]BlockEditor.tsx`
- **Registration**: `src/components/admin/blocks/BlockEditor.tsx`

Admin editors use the `isEditing` prop:
- `isEditing=false` → visual preview (should look almost identical to public block)
- `isEditing=true` → settings/edit panel

---

## Template System

Templates live in `src/data/templates/` as TypeScript, registered in `index.ts → ALL_TEMPLATES`.

When a template is installed (`NewSitePage`), it seeds:
- Pages, blog posts, KB articles, products, consultant profiles
- FlowPilot soul + objectives → `agent_objectives` table via `setup-flowpilot` edge function

To add a new template:
1. Create `src/data/templates/my-template.ts`
2. Export and add to `ALL_TEMPLATES` in `index.ts`
3. Run `bun run scripts/templates-to-json.ts`

---

## Deployment

Frontend (Vercel/Easypanel) auto-deploys from GitHub push.

Manual steps per Supabase project after migrations or new edge functions:
```bash
supabase db push --project-ref <ref>
supabase functions deploy <function-name> --no-verify-jwt --project-ref <ref>
```

Public-facing edge functions must be deployed with `--no-verify-jwt`.
Admin-only functions can use default JWT verification.
