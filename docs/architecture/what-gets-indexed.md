---
title: "What gets indexed — and who pays"
description: Nothing is indexed silently: a module must be enabled and an admin must run the first sync. 
category: architecture
---

# What gets indexed — and who pays

*The indexing audit: what enters the Knowledge Index, how, for whom, and on
whose bill. Written so no doubt remains (#93).*

## The two rules

**1. Visibility is inherited, never re-declared.**
A chunk is exactly as visible as the row it came from. Retrieval runs *with the
caller's eyes* — an anonymous visitor's client sees only public chunks because
RLS says so, not because a filter list says so. There is no second place where
"is this public?" is decided, and therefore no second place it can go wrong.

**2. The indexing cost follows authorship.**
An instance indexes what its own people wrote. Content that ships *from the
vendor* arrives pre-indexed as an artifact — customers never pay embedding
tokens for FlowWink's own material. The module expresses which case applies:
`docs` (pinned to the vendor repo by default) is vendor content; `handbook`
(points at a repo the admin chooses) is customer content.

## The sources

| Source | Who authors it | Visibility | Indexed |
|---|---|---|---|
| **Pages** (CMS) | The instance | Published = public | Locally, on publish |
| **Blog posts** | The instance | Published = public | Locally, on publish |
| **KB articles** | The instance | Per-article public/internal flag | Locally |
| **Docs** | FlowWink (vendor repo) | Internal tier; served publicly ONLY through the docs surface (the one named exception, `retrieveVendorDocs`) | *Today:* locally, behind an admin sync. *Target (#80):* shipped artifact — chunks + embeddings prebuilt in the repo, hash-gated |
| **Wiki** | The instance | Internal | Locally |
| **Documents** (uploads) | The instance | Inherits the document's own access | Locally, by the document sweeper |

Nothing is indexed silently: a module must be enabled *and* an admin must run
the first sync. A new company cannot accidentally spend money on embeddings.

## What outward-facing AI may ground in

Outward copy (campaign proposals, social posts, the public site chat) grounds
through an **anonymous** client. Internal wiki pages, handbook sections and
uploaded documents are invisible to it — by the same mechanism that hides them
on the website. See
[knowledge-recycling.md](../concepts/knowledge-recycling.md). The docs
assistant is the one exception: it grounds through `retrieveVendorDocs`
(service eyes, source pinned to `docs_pages`) because vendor docs sit on the
internal tier for audience-routing reasons, not secrecy — see
[retrieval-engine.md](retrieval-engine.md).

Internal surfaces (FlowWork, admin chat, FlowPilot) run with the *user's* eyes:
role and module access decide reach, again via RLS.

## Embeddings

Embedding provider config lives in `site_settings` and is read with the service
client — **config only**, never for search. Without a provider the engine falls
back to text ranking (Law 4: the feature still works, it just ranks worse).
Chunks carry a content hash, so re-indexing unchanged content is a no-op.

## The one-sentence version

*Everything an instance publishes becomes searchable to exactly the audience
that could already see it; everything the vendor ships arrives pre-indexed; and
nothing costs money without someone pressing a button.*
