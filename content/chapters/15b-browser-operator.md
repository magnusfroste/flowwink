---
title: "The Browser Operator"
description: "How an autonomous agent navigates the real web — public scraping, login-walled relay via Chrome Extension, and the Signal Capture pattern for manual ingestion."
order: 17.3
icon: "globe"
---

# The Browser Operator — Giving Your Agent Eyes on the Web

> **An agent that can only process text is blind to 90% of the internet. An agent that can browse the web — read competitor pages, check LinkedIn profiles, scan product listings — becomes a genuine digital employee. This chapter describes the hybrid architecture that makes it possible without violating terms of service.**

---

## The Problem: Two Kinds of Web

The web has two distinct zones, and each requires a different approach:

```
┌─────────────────────────────────────────────────────────┐
│                    THE WEB                               │
│                                                         │
│  PUBLIC ZONE                    WALLED GARDENS           │
│  ┌──────────────────┐          ┌──────────────────┐     │
│  │ Blog posts       │          │ LinkedIn profiles│     │
│  │ Product pages    │          │ X/Twitter feeds  │     │
│  │ News articles    │          │ Facebook pages   │     │
│  │ Documentation    │          │ Private GitHub   │     │
│  │ Wikipedia        │          │ Gmail inbox      │     │
│  │ Public APIs      │          │ Instagram        │     │
│  └──────────────────┘          └──────────────────┘     │
│  Strategy: Server-side         Strategy: Browser        │
│  scraping (Firecrawl)          relay (user's session)   │
└─────────────────────────────────────────────────────────┘
```

Server-side scraping works for public content. But login-walled sites — LinkedIn, X, Facebook — require an authenticated browser session. Scraping these server-side is both technically impossible (blocked) and legally questionable (ToS violation).

---

## The Hybrid Architecture

FlowPilot's `browser_fetch` skill uses a **smart routing strategy** that automatically picks the right approach:

```typescript
const RELAY_DOMAINS = [
  'linkedin.com', 'www.linkedin.com',
  'x.com', 'twitter.com',
  'github.com',          // private repos
  'facebook.com',
  'instagram.com',
  'mail.google.com',
];

function requiresRelay(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  return RELAY_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
}
```

### Path A: Public URL → Server-Side Scraping

```
Agent calls browser_fetch("https://competitor.com/pricing")
     │
     ├── requiresRelay() → false
     ├── Delegate to scrape-url (Firecrawl)
     ├── Returns: { title, markdown, links }
     └── Agent processes content immediately
```

Fast, cheap, no user involvement. The agent reads public pages the same way a human would.

### Path B: Walled Garden → Chrome Extension Relay

```
Agent calls browser_fetch("https://linkedin.com/in/prospect")
     │
     ├── requiresRelay() → true
     ├── Returns: { action: "relay_required", url, relay_instruction }
     │
     ▼
Admin Panel receives "relay_required"
     │
     ├── Chrome Extension detected? (sidebar indicator)
     ├── Opens target URL in active foreground tab
     ├── Extension extracts page content using user's authenticated session
     ├── Sends content back to browser_fetch with relay_result
     │
     ▼
Agent receives content → processes as normal
```

The critical distinction: **the agent doesn't log in to anything.** It uses the human's existing browser session, through their own Chrome Extension, to access content they already have access to. This is the difference between "scraping LinkedIn" (ToS violation) and "reading a page the user is viewing" (legitimate).

### Path C: Force Relay

Sometimes a public page renders poorly with server-side scraping (heavy JavaScript, client-side rendering). The agent can request relay even for public URLs:

```typescript
browser_fetch({ url: "https://some-spa.com", force_relay: true })
```

This forces the Chrome Extension path, which gets fully-rendered content.

---

## The Chrome Extension

The extension serves two purposes:

### 1. Relay Mode (Agent-Initiated)

When the agent needs to fetch a walled-garden URL, the extension:
- Opens the URL in an active foreground tab (visible to the user — no hidden browsing)
- Waits for page load
- Extracts structured content (title, description, markdown, HTML, links)
- Sends the content back to the `browser_fetch` edge function
- Agent continues its task with the fetched content

The foreground tab is intentional. The user sees what the agent is reading. This is a transparency decision — the agent never browses secretly.

### 2. Signal Capture (User-Initiated)

The user can manually feed content to the agent using a keyboard shortcut:

```
⌘⇧S (Mac) / Ctrl+Shift+S (Windows)
```

This captures the current page content and sends it to FlowPilot as an inbound signal. Use cases:

- "I'm reading this article — add it to our content research"
- "This competitor just launched a new feature — analyze it"
- "This LinkedIn profile is a perfect lead — qualify them"

Signal Capture turns the human's browsing into agent input. The human discovers, the agent processes.

---

## The Grounding Rule

FlowPilot has one absolute rule about web content:

> **ALWAYS fetch explicit URLs live. NEVER answer from training data about what a website contains.**

This prevents a dangerous failure mode: the agent *thinks* it knows what's on a website because it saw similar content during training. Training data is stale, incomplete, and often wrong. Live fetching ensures accuracy.

```
User: "What does competitor.com offer?"

WRONG: "Based on my knowledge, competitor.com offers..."
RIGHT: [calls browser_fetch("https://competitor.com")] → reads live content → answers
```

This rule is enforced in the skill instructions for `browser_fetch`:

```
Use when: The user asks about any website, URL, online resource, 
competitor, or external page. ALWAYS fetch the URL — never guess 
or answer from training data.

NOT for: Internal CMS operations, database queries, or content 
that exists in FlowPilot's own memory.
```

---

## Connection Status

The admin sidebar shows the Chrome Extension connection status:

```
🟢 Browser Connected    — Extension detected, relay available
🔴 Browser Offline      — Extension not installed or inactive
```

This status is auto-detected on mount. When the extension is offline, the agent can still browse public URLs via server-side scraping, but walled-garden requests will return an error with a suggestion to install the extension.

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| Agent accessing unauthorized content | Extension uses user's own session — no additional access |
| Content leaving the browser | Sent directly to user's own Supabase backend |
| Hidden browsing | All relay pages open in visible foreground tabs |
| Extension permissions | Minimal: active tab content extraction only |
| Data retention | Fetched content is processed and discarded unless agent explicitly saves to memory |

The architecture is designed so that the agent never has *more* access than the human. It sees what the user could see by opening the same tab.

---

## The Pattern for Other Agents

This hybrid browser pattern is reusable beyond FlowPilot:

1. **Maintain a domain list** of sites that require relay
2. **Build a thin extension** that extracts page content on demand
3. **Route automatically** — public URLs go server-side, walled gardens go through the extension
4. **Show the work** — open tabs visibly so the user maintains oversight
5. **Never cache credentials** — use the existing browser session, never store login tokens

The browser operator turns an agent from a text-processing engine into something that can actually *see* the internet the way a human employee would — by looking at pages.

---

*An agent without web access is like an employee who's never allowed to look anything up. The browser operator is how you give an agent access to the real world while keeping the human informed, the ToS respected, and the data secure.*
