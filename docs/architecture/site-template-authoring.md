# Site templates an agent can author

The contract side already proved that an external operator can author a
FlowWink artifact well. This document records **why** it worked, what the site
template equivalent needs, and carries the finished guide text for the skill
seed — the half that lives in `src/lib/modules/` and is therefore handed over,
not written here.

## Why contract authoring worked

Five mechanisms, and they only work together:

| # | mechanism | contracts |
|---|---|---|
| 1 | the template is **instance data** | `contract_templates` table |
| 2 | an **authoring RPC** with the service_role escape | `manage_contract_template` |
| 3 | a **guide in `instructions`**, fetched lazily via `read_skill` | 4 443 chars |
| 4 | a **machine-readable validation response** | `unrendered_tokens` |
| 5 | **discovery before authoring** | `list_contract_templates` |

Mechanism 3 is the largest lever and the least obvious one. The skill's
*description* explicitly tells the agent to load the full instructions **before**
authoring, so `read_skill` delivers the house style, the vocabulary and the
process couplings into context at the moment they are needed. Mechanism 4 closes
the loop: the agent learns it guessed wrong and fixes itself, with no human in
the path.

## What site templates had

Site templates lived in `src/data/templates/*.ts` — TypeScript compiled into the
bundle. An agent could install one and export the current site as one, but could
never **create** one. Import made the gap concrete: the admin UI parked an
imported template in `sessionStorage`, so "save it and install it on the next
instance" had no durable middle.

There was also a sharper asymmetry. `manage_page_blocks`'s instructions say:

> when unsure what a block supports, ask for its schema rather than guessing from examples

…but no skill returns a block schema. FlowPilot sees the full vocabulary — all
56 block types with their field lists — because `cms-context.ts` injects
`BLOCK_TYPES_SCHEMA` into its prompt. The external operator over the MCP gateway
sees nothing and guesses. The contract guide has no such asymmetry: the token
list sits in the skill's instructions, so both consumers read the same text.

## The storage half (shipped)

`20260808500000_site-templates-authorable.sql`:

- **`site_templates`** — `template_json` holds the StarterTemplate body.
  `created_by` is `ON DELETE SET NULL`: a template outlives the colleague who
  wrote it (business record, not a personal artifact).
- **`manage_site_template(action, …)`** — `list | get | create | update |
  archive`, idempotent on name, resolving by id / exact name / unique prefix
  (ambiguity errors with the candidates listed), guarded by
  `auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')`.
- **`_site_template_structure_report(jsonb)`** — the `unrendered_tokens`
  equivalent. Errors block the write; warnings are advice.

Verified live on optic in rolled-back transactions: create → idempotent re-create
→ list → get-by-prefix all behave; a non-admin authenticated caller is refused
with P0001 while `service_role` passes; and each defect class below is reported
rather than stored.

**Errors** (refuse the write): no pages · page without title or slug · duplicate
slug · block without `type` · `data` that is not an object · a Tiptap document
sent as a **string** · no homepage (no page matching `siteSettings.homepageSlug`
and none marked `isHomePage`).

**Warnings**: a page with no blocks · no tagline.

### One thing deliberately absent

The block **vocabulary**. Which block types exist and what fields they carry has
exactly one home — `src/lib/block-reference.ts`, synced to
`_shared/block-schema.ts` by `scripts/sync-block-schema.ts`. A copy in the
database would be stale within the week; that exact failure produced a third
copy of the contract token list one day after the second was reconciled. So the
DB validates **shape**, and the vocabulary check belongs where the vocabulary
already is, in the edge layer. A guardrail test fails if a block-type list is
ever added to the migration.

## The remaining half (edge layer — `src/lib/modules/`)

Three pieces, all in files owned by the local session:

1. **`manage_site_template` skill seed** — `handler: 'rpc:manage_site_template'`,
   `category: 'content'`, `trust_level: 'notify'`, with the guide below as
   `instructions` and a description that tells the agent to load them first.
2. **`describe_blocks`** — returns `BLOCK_TYPES_SCHEMA`, whole or for one block
   type. This is the skill `manage_page_blocks` already tells agents to call. It
   is a **platform primitive** — an external operator needs it with the
   FlowPilot module switched off — so it belongs in `platform-seeds.ts`, not in
   the pages module.
3. **`install_template` accepting a stored template** — today it takes a catalog
   id. Accepting a `site_templates` row (or an inline body) closes the loop:
   author → stored on the instance → exported as JSON → installed on the next
   instance.

---

## The guide text (for `instructions` on `manage_site_template`)

> THE SITE COMPOSITION GUIDE — FlowWink owns the framework; the INSTANCE owns the content.
>
> STEP 0, GATHER CONTEXT FIRST (never compose from a blank page):
> 1. `manage_site_template action=list` and `list_templates` — the existing templates ARE the house style; mirror their page set, section rhythm and voice.
> 2. `describe_blocks` — the block vocabulary with exact field names. Never guess a field name from an example; a wrong key is silently dropped and the section renders empty.
> 3. `search_kb` / `search_wiki` for the instance's positioning, tone and product language.
> The platform supplies structure; the instance's own material supplies the words. Do not invent claims, customer names, metrics or logos — placeholder copy that reads as placeholder beats fabricated proof.
>
> THE BODY: `template_json` is a StarterTemplate — `{ pages[], blogPosts[], branding, chatSettings, headerSettings, footerSettings, seoSettings, siteSettings{homepageSlug}, requiredModules[] }`. Each page is `{ title, slug, isHomePage?, blocks[], meta{}, menu_order?, showInMenu? }`. Each block is `{ type, data{} }` where `data` matches that block type exactly.
>
> RICH TEXT: fields typed `tiptap` MUST be JSON objects — `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"…"}]}]}` — never strings. A stringified doc renders as nothing and looks correct in the payload; `create` refuses it and names the field.
>
> PAGE RECIPES (a starting rhythm, not a rule):
> - **home**: hero → features or bento-grid → two-column story → social proof (testimonials / logos / stats) → CTA.
> - **services/products**: hero → pricing or comparison → accordion (objections) → CTA.
> - **about**: two-column story → timeline → team → CTA.
> - **contact**: contact or form → map, and nothing else competing for the eye.
> - **support/help**: ai-faq or accordion → quick-links → chat-launcher.
>
> COMPOSITION:
> - Use the blocks' full range. A page written with only title+content looks like the poor cousin of what the renderer can do. `two-column` is the most underused: `eyebrow` + `eyebrowColor`, `titleSize` (default | large | display), `accentText` with `accentPosition`, `imageAspect` / `imageFit` / `imageRounded`, `secondImageSrc`, `stickyColumn`, `ctaText`/`ctaUrl` with `note`.
> - Alternate eyebrows across sections instead of repeating H2-only headers. At most one `accentText` per page — it is seasoning, not sauce.
> - Every page needs one clear next action. Two CTAs competing on the same screen is none.
> - `features` requires an `icon` on every item (PascalCase Lucide names).
> - Full-bleed blocks (hero, parallax-section, marquee, featured-carousel) already span the viewport — do not wrap them in a container-style section.
>
> WHAT BELONGS WHERE: branding, header, footer, SEO and cookie settings are template-level, not page blocks — a logo pasted into a hero is not a header. `requiredModules` lists what the template's pages actually need (a booking block needs the booking module); it is a declaration, not a switch.
>
> MECHANICS: `create` is idempotent on name — an existing name returns `already_existed: true`; use `action=update` to change a body. Every create/update returns `validation` — a non-empty `errors` list means the write was refused; `warnings` are advice worth reading. `archive` deactivates; templates are not deleted, because an installed site's provenance points back at them.
