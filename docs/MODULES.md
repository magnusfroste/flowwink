# FlowWink Modules

> **Audience:** Users/Admins
> **Last Updated:** March 2026

This document describes each FlowWink module from a user perspective: what it does, how it works, and how it integrates with other modules.

> **For technical API documentation**, see [MODULE-API.md](./MODULE-API.md)

---

## All Modules (22 total)

### Core Modules (always enabled)

| Module | Description | Status |
|--------|-------------|--------|
| Pages | Create and manage web pages with 61+ block types | Core |
| Media Library | Media assets and file management with WebP optimization | Core |

### Content Modules

| Module | Description | Default |
|--------|-------------|---------|
| Blog | Blog posts with categories, tags, RSS feed, and AI writing | Enabled |
| Knowledge Base | Structured FAQ with AI Chat integration and gap analysis | Disabled |
| Forms | Form submissions and contact requests with lead capture | Enabled |
| Content Hub | REST, GraphQL, and Markdown Content API for multi-channel delivery | Disabled |

### Communication Modules

| Module | Description | Default |
|--------|-------------|---------|
| Newsletter | Email campaigns and subscriber management via Resend | Disabled |
| AI Chat | Intelligent chatbot with Context-Augmented Generation (CAG) | Disabled |
| Live Support | Human agent support with AI handoff, escalation, and sentiment detection | Disabled |
| Webinars | Plan, promote, and follow up webinars and online events | Disabled |

### Data Modules

| Module | Description | Default |
|--------|-------------|---------|
| Leads | AI-driven lead management with automatic qualification and scoring | Enabled |
| Deals | Pipeline management for sales opportunities with stage tracking | Enabled |
| Companies | Organization management with AI enrichment and domain detection | Enabled |
| Products | Product catalog with Stripe Checkout integration | Enabled |
| Orders | Order management and e-commerce transactions | Enabled |
| Bookings | Appointment scheduling with calendar view, services, and email confirmations | Enabled |

### Insights Modules

| Module | Description | Default |
|--------|-------------|---------|
| Analytics | Dashboard with insights on leads, deals, newsletter, and page performance | Enabled |
| Sales Intelligence | Prospect research, fit analysis, and competitor monitoring | Disabled |

### CRM Extensions

| Module | Description | Default |
|--------|-------------|---------|
| Resume / Consultant Profiles | Team expertise management with AI-powered resume matching | Disabled |

### System Modules

| Module | Description | Default |
|--------|-------------|---------|
| Global Elements | Header, footer, announcement bars, and other reusable components | Enabled |
| Federation | Agent-to-Agent (A2A) peer management for cross-agent collaboration | Disabled |

---

## Module Details

### Pages (Core)

**Purpose**: Create and manage web pages with a block editor

**Key features**: 61+ block types, drag-and-drop reordering, scheduling, SEO metadata, version history, page rollback, anchor links, hide/show toggle

**Usage**: `/admin/pages` → Public `/slug`

---

### Blog

**Purpose**: Blog posts with categories, tags, and RSS feed

**Key features**: Rich text Tiptap editor, AI content generation via FlowPilot, scheduling, RSS feed, categories and tags, featured images, reading time

**Usage**: `/admin/blog` → Public `/blog/slug`

---

### Knowledge Base

**Purpose**: Structured FAQ with AI Chat integration

**Key features**: AI-powered search, hierarchical categories, article feedback (helpful/not helpful), gap analysis skill, featured articles, chat integration toggle per article

**Usage**: `/admin/knowledge-base` → Public `/kb/slug`

---

### Newsletter

**Purpose**: Email campaigns and subscriber management via Resend

**Key features**: Create from blog posts, subscriber management, open/click tracking, GDPR tools (export, unsubscribe), segmentation

**Usage**: `/admin/newsletter` → Public signup forms

---

### AI Chat

**Purpose**: Intelligent chatbot with Context-Augmented Generation

**Key features**: Uses your content as context (pages, blog, KB), multi-provider support (OpenAI, Gemini, Local LLM), skill-based actions (book appointments, capture leads, search web, check orders)

**Killer Feature**: First system to use all modules' content as AI context — works immediately with zero training.

**Usage**: Chat widget on public pages, `/chat` dedicated page

---

### Live Support

**Purpose**: Human agent support with AI handoff and escalation

**Key features**: Sentiment detection (1-10 scale), automatic escalation triggers, agent presence system, queue management, AI-suggested responses

**Usage**: Support widget on public pages

---

### Forms

**Purpose**: Form submissions and contact requests

**Key features**: Form builder via blocks (default/card/minimal variants), automatic lead capture, webhook triggers

**Usage**: Form blocks on pages → `/admin/forms`

---

### Leads

**Purpose**: AI-driven lead management with automatic qualification

**Key features**: Lead scoring, AI qualification with summaries, company enrichment via Firecrawl, activity tracking with point values, assignment to team members

**Usage**: `/admin/contacts`

---

### Deals

**Purpose**: Pipeline management for sales opportunities

**Key features**: Deal stages (prospect → qualified → proposal → negotiation → won/lost), value tracking, activity log, linked products

**Usage**: `/admin/deals`

---

### Companies

**Purpose**: Organization management with multiple contacts

**Key features**: Company records, AI enrichment (scrapes website for industry/size/description), domain-based auto-matching, multiple contacts per company

**Usage**: `/admin/companies`

---

### Products

**Purpose**: Product catalog for deals and e-commerce

**Key features**: Product management, Stripe Checkout integration, product images, pricing (one-time and recurring), back-in-stock notifications

**Usage**: `/admin/products` → Public product blocks

---

### Orders

**Purpose**: Order management and e-commerce transactions

**Key features**: Order tracking, Stripe webhooks, confirmation emails, status management

**Usage**: `/admin/orders`

---

### Bookings

**Purpose**: Appointment scheduling with calendar view and email confirmations

**Key features**: Weekly availability per service, time slot management, multi-step booking flow, blocked dates, confirmation/reminder emails

**Usage**: `/admin/bookings` → Public Smart Booking block

---

### Analytics

**Purpose**: Dashboard with insights on leads, deals, and content performance

**Key features**: Page views, conversion tracking, source tracking, newsletter open/click rates

**Usage**: `/admin/analytics`

---

### Sales Intelligence

**Purpose**: Prospect research and competitive analysis

**Key features**: Prospect research (company + contact discovery), AI fit analysis, competitor monitoring, business signals

**Usage**: `/admin/sales-intelligence`

**Dependencies**: Leads, Companies

---

### Resume / Consultant Profiles

**Purpose**: Team expertise management with AI-powered matching

**Key features**: Consultant profiles (skills, certifications, experience, languages, hourly rates), Resume Matcher block for public sites (visitors upload CV → AI matches to best consultant), education and portfolio tracking

**Usage**: `/admin/resume` → Public Resume Matcher block

---

### Webinars

**Purpose**: Plan, promote, and follow up webinars and online events

**Key features**: Webinar management, platform integration (Zoom, Google Meet, custom), registration tracking, follow-up automation

**Usage**: `/admin/webinars` → Public Webinar block

---

### Content Hub

**Purpose**: REST, GraphQL, and Markdown Content API for multi-channel delivery

**Key features**: `/content-api` endpoints, GraphQL support, Markdown export (optimized for LLM consumption), API explorer, code snippets (React, Next.js, vanilla JS)

**Usage**: `/admin/content-api` → External apps, mobile apps, LLM agents

---

### Global Elements

**Purpose**: Header, footer, and other reusable components

**Key features**: Announcement bars, customizable header/footer, slot-based system, active/inactive toggle

**Usage**: `/admin/global-blocks`

---

### Federation (A2A)

**Purpose**: Agent-to-Agent peer management for cross-agent collaboration

**Key features**: Peer registration with URL and capabilities, token-authenticated communication, inbound/outbound activity tracking, specialist delegation (SEO, content, sales, analytics, email agents)

**Usage**: `/admin/federation`

---

## Module Dependencies

Some modules depend on others:

- **Orders** → Requires **Products**
- **Deals** → Requires **Leads**
- **Live Support** → Requires **AI Chat**
- **Sales Intelligence** → Requires **Leads**, **Companies**

When enabling a dependent module, the parent is automatically enabled. When disabling a parent, dependents are automatically disabled.

---

## Webhooks

Modules trigger webhooks on events:

| Module | Events |
|--------|--------|
| Pages | `page.published`, `page.updated`, `page.deleted` |
| Blog | `blog_post.published`, `blog_post.updated`, `blog_post.deleted` |
| Newsletter | `newsletter.subscribed`, `newsletter.unsubscribed` |
| Leads | `form.submitted` (lead created) |
| Deals | `deal.created`, `deal.updated`, `deal.won`, `deal.lost` |
| Bookings | `booking.submitted`, `booking.confirmed`, `booking.cancelled` |

---

## FlowPilot Integration

Every module is connected to FlowPilot through the skill engine. FlowPilot can:

- **Create and publish** pages, blog posts, KB articles
- **Manage** leads, companies, deals, products, bookings
- **Send** newsletters, manage webinars
- **Analyze** analytics, perform SEO audits, identify KB gaps
- **Research** content topics, prospects, competitors
- **Automate** recurring tasks via cron/event/signal triggers

Skills are hot-reloadable from the `agent_skills` table. See [flowpilot.md](./flowpilot.md) for the full skill inventory.

---

## Module Configuration

Modules are configured in the database (`site_settings` → `general` → `modules`).

Enable/disable modules via: `/admin/modules`

---

*Last updated: March 2026*
