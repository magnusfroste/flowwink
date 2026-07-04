---
title: "EPIC-06 — Content & website cluster to publishable"
status: planned
sprint: R1
owner: unassigned
---

# EPIC-06 — Content & website cluster to publishable

## Why
The website/content cluster (templates, global-blocks, media, surveys, chat
widget) carries the **numerically cheapest gains in the entire matrix**:
`templates#install` alone is +20pp for one module; global-blocks jumps 42→92
from three flips. These modules are also the front door of the
**content-marketing / campaign-to-lead** process — the site a visitor actually
sees. Odoo's Website app treats blocks, themes and media as one editing
experience; ours is the same cluster, mostly built, awaiting verification and
a handful of small closures.

Most items here are `partial` because the scorecards flag pending verification
or one missing sub-thread — read each capability's `notes` before coding;
several may be EPIC-05-style verify-only flips.

## Outcome (Definition of Done for the whole epic)
- [ ] global-blocks ≥ 85%, templates ≥ 85%, media ≥ 85%, chat widget verified
- [ ] Template install → seeded site verified end-to-end on a live instance
- [ ] All flips carry dated evidence in the scorecards
- [ ] `npx vitest run` + parity check green

## Capabilities delivered
| File | Capability id | From → To |
|---|---|---|
| `capabilities/templates.json` | `install`, `preview`, `theme_settings` | partial → done |
| `capabilities/global-blocks.json` | `block_crud`, `reuse`, `sync_updates` | partial → done |
| `capabilities/global-blocks.json` | `categories` | missing → partial |
| `capabilities/media.json` | `upload`, `image_optimization`, `alt_text` | partial → done |
| `capabilities/surveys.json` | `builder` | partial → done |
| `capabilities/chat.json` | `widget` | partial → done |
| `capabilities/chat.json` | `lead_capture` | missing → partial |

## Issues

- [ ] **06.1 — Template install & theming** *(templates)*
  - Install a template on a clean instance → pages/posts/KB/products/objectives
    seeded per the manifest; live-preview a second template without installing;
    change theme settings (colors/fonts) and confirm they apply site-wide.

- [ ] **06.2 — Global blocks lifecycle** *(global-blocks)*
  - Create/edit/delete a global block from the admin; reuse it on two pages;
    edit the source block → both usages update (`sync_updates`). Small build:
    a `category` field + filter in the block picker (missing → partial).

- [ ] **06.3 — Media pipeline** *(media)*
  - Upload via admin + via skill; confirm optimization (resize/WebP) actually
    runs on the live bucket; AI alt-text suggestion stored and editable.

- [ ] **06.4 — Survey builder** *(surveys)*
  - Author a multi-question survey in the builder, publish, submit a public
    response, see it in results. Flip on live evidence.

- [ ] **06.5 — Chat widget as lead gate** *(chat)*
  - Verify the public widget end-to-end on a live page (anon visitor,
    publishable-key auth path per CLAUDE.md). Small build: optional
    email-capture step that creates/associates a `lead` (missing → partial) —
    the campaign-to-lead entry point Odoo Livechat gets via its CRM bridge.
