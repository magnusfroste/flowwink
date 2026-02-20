# FlowWink Modules

> **Audience:** Users/Admins
> **Last Updated:** February 2026

This document describes each FlowWink module from a user perspective: what it does, how it works, and how it integrates with other modules.

> **For technical API documentation**, see [MODULE-API.md](./MODULE-API.md)

---

## All Modules (18 total)

### Core Modules (always enabled)

| Module | Description | Status |
|--------|-------------|--------|
| Pages | Create and manage web pages with block editor | Core |
| Media Library | Media assets and file management | Core |

### Content Modules

| Module | Description | Default |
|--------|-------------|---------|
| Blog | Blog posts with categories, tags and RSS feed | Enabled |
| Knowledge Base | Structured FAQ with AI Chat integration | Disabled |
| Forms | Form submissions and contact requests | Enabled |

### Communication Modules

| Module | Description | Default |
|--------|-------------|---------|
| Newsletter | Email campaigns and subscriber management via Resend | Disabled |
| AI Chat | Intelligent chatbot with Context-Augmented Generation | Disabled |
| Live Support | Human agent support with AI handoff and escalation | Disabled |
| Webinars | Plan, promote and follow up webinars and online events | Disabled |

### Data Modules

| Module | Description | Default |
|--------|-------------|---------|
| Leads | AI-driven lead management with automatic qualification | Enabled |
| Deals | Pipeline management for sales opportunities | Enabled |
| Companies | Organization management with multiple contacts | Enabled |
| Products | Product catalog for deals and services | Enabled |
| Orders | Order management and e-commerce transactions | Enabled |
| Bookings | Appointment scheduling with calendar view and email confirmations | Enabled |

### Insights Modules

| Module | Description | Default |
|--------|-------------|---------|
| Analytics | Dashboard with insights on leads, deals, and newsletter performance | Enabled |

### System Modules

| Module | Description | Default |
|--------|-------------|---------|
| Content Hub | REST and GraphQL API for headless CMS | Disabled |
| Global Elements | Header, footer and other reusable components | Enabled |

---

## Module Details

### Pages (Core)

**Purpose**: Create and manage web pages with block editor

**Key features**: 50+ block types, drag-and-drop, scheduling, SEO metadata

**Usage**: `/admin/pages` → Public `/slug`

---

### Blog

**Purpose**: Blog posts with categories, tags, and RSS feed

**Key features**: Rich text editor, AI assistance, scheduling, RSS feed

**Usage**: `/admin/blog` → Public `/blog/slug`

---

### Knowledge Base

**Purpose**: Structured FAQ with AI Chat integration

**Key features**: AI-powered search, categories, feedback system

**Usage**: `/admin/knowledge-base` → Public `/kb/slug`

---

### Newsletter

**Purpose**: Email campaigns and subscriber management via Resend

**Key features**: Create from blog posts, subscriber management, open/click tracking, GDPR tools

**Usage**: `/admin/newsletter` → Public signup forms

---

### AI Chat

**Purpose**: Intelligent chatbot with Context-Augmented Generation

**Key features**: Uses your content as context, multi-provider support (OpenAI, Gemini, Local LLM)

**Killer Feature**: First system to use all modules' content as AI context:
- Pages, blog posts, knowledge base articles
- Instant answers from your own content
- No training required — works immediately
- Saves hours of customer support time

**Usage**: Chat widget on public pages

---

### Live Support

**Purpose**: Human agent support with AI handoff and escalation

**Key features**: Human chat with AI assistance, escalation to humans

**Usage**: Support widget on public pages

---

### Forms

**Purpose**: Form submissions and contact requests

**Key features**: Form builder via blocks, lead capture

**Usage**: Form blocks on pages

---

### Leads

**Purpose**: AI-driven lead management with automatic qualification

**Key features**: Lead scoring, qualification, company enrichment

**Usage**: `/admin/leads`

---

### Deals

**Purpose**: Pipeline management for sales opportunities

**Key features**: Deal stages, value tracking, win/loss reasons

**Usage**: `/admin/crm`

---

### Companies

**Purpose**: Organization management with multiple contacts

**Key features**: Company records, AI enrichment, multiple contacts per company

**Usage**: `/admin/crm`

---

### Products

**Purpose**: Product catalog for deals and services

**Key features**: Product management, Stripe Checkout integration

**Usage**: `/admin/products` → Public product pages

---

### Orders

**Purpose**: Order management and e-commerce transactions

**Key features**: Order tracking, Stripe webhooks, confirmation emails

**Usage**: `/admin/orders`

---

### Bookings

**Purpose**: Appointment scheduling with calendar view and email confirmations

**Key features**: Weekly availability, time slots, booking confirmations

**Usage**: `/admin/bookings` → Public Smart Booking block

**Limitation**: No multi-staff support (global availability)

**Dependencies**: None

---

### Analytics

**Purpose**: Dashboard with insights on leads, deals, and newsletter performance

**Key features**: Page views, conversion tracking, source tracking

**Usage**: `/admin/analytics`

**Dependencies**: None

---

### Content Hub

**Purpose**: REST and GraphQL API for headless CMS

**Key features**: `/content-api` endpoints, GraphQL support

**Usage**: External apps, mobile apps

**Dependencies**: None

---

### Global Elements

**Purpose**: Header, footer and other reusable components

**Key features**: Reusable blocks across all pages

**Usage**: `/admin/global-elements`

**Dependencies**: None (Core infrastructure)

---

### Media Library

**Purpose**: Media assets and file management

**Key features**: Image upload, WebP optimization, public URLs

**Usage**: Media picker in editors

**Dependencies**: None (Core infrastructure)

---

## Module Dependencies

Some modules depend on others:

- **Orders** → Requires **Products**
- **Deals** → Requires **Leads**
- **Live Support** → Requires **AI Chat**

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

## Module Configuration

Modules are configured in the database (`site_settings` → `general` → `modules`).

Enable/disable modules via: `/admin/modules`

---

*Last updated: February 2026*
