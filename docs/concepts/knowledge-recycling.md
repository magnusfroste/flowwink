---
title: "Knowledge recycling"
description: Retrieval always runs with the caller's eyes — and for outward copy, the caller is a visitor.
category: concepts
---

# Knowledge recycling

*How outward communication stays consistent, tight and grounded — automatically.*

## The idea

Everything a company publishes — KB articles, website pages, blog posts — is
crystallized knowledge someone already paid for: research done, wording argued
over, claims checked. **Knowledge recycling** means every NEW piece of outward
content grounds itself in that existing body before a single word is generated.
The message stays consistent across campaigns, outreach and marketing because
they all draw from the same well — and the well is curated in one place.

This is how processes optimize in the agentic world: not by writing more rules,
but by making the system's own published output the raw material for its next
output. Each approved piece makes the next one better grounded.

## The three grounding layers

Content generation (campaign proposals, social post batches) loads, in order:

| Layer | What | How |
|---|---|---|
| **Identity** | Business Identity: company name, industry, value proposition, ICP, differentiators, services, brand tone | Always injected whole — it is small, curated and always relevant. The constitution. |
| **Published knowledge** | The company's existing public content relevant to the topic | Retrieved per topic via the Retrieval Engine (top-k chunks). Large and unevenly relevant, so it is *fetched*, never dumped. |
| **Anti-repetition** | The last 15 published pieces | So proposals extend the body of work instead of repeating it. |

The brief the human (or agent) writes always wins over identity defaults:
grounding informs, it never overrides intent.

## The confidentiality rule — enforced by construction

Outward content is maximally public, so only public sources may ground it
verbatim. FlowWink does not enforce this with a source allowlist — it enforces
it with **eyes**: the knowledge retrieval for outward generation runs on an
anonymous client, and row-level security decides what that client can see.
Internal wiki pages, handbook sections and uploaded documents are invisible to
it by the same mechanism that hides them on the website.

> Retrieval always runs with the caller's eyes — and for outward copy, the
> caller is a visitor.

Nothing to configure, nothing to forget: a source becomes eligible for
recycling exactly when (and only when) it is published.

## Transparency over settings

There are deliberately **no knobs** for source weighting. Instead, every
generation states its grounding: the AI dialog explains the contract before you
generate, and the task response carries `grounding_sources` — the exact public
pieces that grounded the run. You cannot meaningfully change what you cannot
see; conversely, once you see that a campaign grounded in a stale KB article,
you know exactly which page to fix — and the fix improves every future
campaign, chat answer and search result at once.

## Where the loop closes

1. Someone curates **Business Identity** (sales, marketing, accounting — the
   people who own the message).
2. Content ships through the campaign flow: proposal → approve → channel rails.
3. Published content lands in the **Knowledge Index**.
4. The next generation grounds in it. The next outreach letter reuses it. The
   public chat answers from it.

One identity, one knowledge body, many mouths — all saying the same thing.
