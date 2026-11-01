---
title: "Web search & reading — one layer, any provider"
description: FlowWink is search-agnostic — every web search and page read (the chat, Flowwork, FlowPilot, research, enrichment, page migration, an agent over MCP) goes through one layer and the providers you choose, in your order: SearXNG, Firecrawl (cloud or self-hosted), Jina, or the built-in reader.
category: operators
---

# Web search & reading — one layer, any provider

FlowWink does not depend on one search service. Every server-side web search and
page read goes through **one web layer** (`supabase/functions/_shared/web/`):

| Capability | What it does | Providers |
|---|---|---|
| **Search** | A question → web results | SearXNG · Firecrawl · Jina |
| **Read** | A URL → the page as text (markdown) | Firecrawl · Jina · the built-in reader |

Everything that searches or reads the web uses this layer: the visitor chat
(*Web search* under AI Chat → Advanced), Flowwork, FlowPilot, the `search_web`
and `scrape_url` skills, prospect research, company enrichment, page migration,
and an agent over MCP. Change the order once, and all of them follow it.

## Managing it — Integrations → Web search & reading

The card at the top of **Integrations** shows, for each capability:

- **the order** the providers are tried in. Move a provider up or down with the
  arrows; the change applies to the next search.
- **whether each provider is in use**: answered at (time), failed at (time and
  error), or not in use and why (*Switched off*, *No SearXNG URL set*, *No
  FIRECRAWL_API_KEY and no self-hosted URL*).
- **a Test button** that runs a search or read with that one provider and says
  what came back.
- **the built-in reader switch**. The built-in reader is the last resort for
  reading: it reads plain HTML without any service or key, but cannot read
  pages that need JavaScript to paint.

When a provider fails, the next one is tried. A provider that failed within
the last five minutes, and has not succeeded since, is tried last instead of
first. It is never dropped: when everything else fails, it is still the last
resort.

## Setting up each provider

| Provider | What it needs | Notes |
|---|---|---|
| **SearXNG** | Its URL (Integrations → SearXNG) | Self-hosted, free, private. The JSON format must be enabled in its `settings.yml`; `check_integrations` names the fix when it is not. |
| **Firecrawl** | `FIRECRAWL_API_KEY`, **or** the URL of a self-hosted Firecrawl (Integrations → Firecrawl → *Self-hosted Firecrawl URL*) | Firecrawl is open source. With a self-hosted URL the key is optional. |
| **Jina** | Nothing — works without a key; `JINA_API_KEY` raises the limits | *Prefer free tier* tries the keyless tier first. |
| **Built-in reader** | Nothing | Reading only. Switch on the card. |

Two features still need Firecrawl, because only Firecrawl extracts colours,
fonts, logos and screenshots: **brand analysis** and the **branding and
screenshots in page migration**. Page migration reads the text through the
layer's other readers when Firecrawl is not available.

## What an agent sees

- `search_web` and `scrape_url` answer with `provider` (which provider
  answered) and `attempts` (each provider tried, whether it answered, and the
  error).
- `provider: 'none'` means every provider failed. That is not evidence that
  nothing exists.
- `web_providers_status` (read-only) returns the order and the chain the next
  call will try, per capability, plus each provider's state.

## Where it is stored

| Setting | Holds |
|---|---|
| `site_settings.web_layer` | `search_order`, `read_order`, `builtin_enabled` (written by the card) |
| `site_settings.integrations.<provider>` | Switched on/off, SearXNG `config.url`, Firecrawl `config.baseUrl`, Jina `config.preferFreeTier` |
| `site_settings.web_provider_status` | Each provider's `last_ok_at`, `last_error_at`, `last_error` |

An instance that set the older per-provider *priority* keeps that order until
the card is saved.

## Files

| Purpose | Path |
|---|---|
| The order and the cooldown (pure) | `supabase/functions/_shared/web/order.ts` |
| Providers, search, read, status | `supabase/functions/_shared/web/layer.ts` |
| The built-in reader | `supabase/functions/_shared/web/html-to-markdown.ts` |
| The functions over it | `supabase/functions/web-search/index.ts`, `supabase/functions/web-scrape/index.ts` |
| The admin card | `src/components/admin/integrations/WebLayerCard.tsx` |
| Guardrail | `src/lib/__tests__/web-layer-is-provider-agnostic.guardrails.test.ts` |
