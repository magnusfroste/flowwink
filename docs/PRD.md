# FlowWink - Product Requirements Document (PRD)

> **Version:** 3.0  
> **Last Updated:** March 2026  
> **Status:** Autonomous Agentic Web Platform — v2.0 Complete

---

## Executive Summary

**FlowWink** is an autonomous agentic web platform — a self-hosted CMS + AI business operating system that runs your entire digital presence. Built for organizations that need:

- ✅ A complete website without developers
- ✅ Headless API for multi-channel distribution (REST/GraphQL/Markdown for LLMs)
- ✅ An autonomous AI agent (FlowPilot) that writes content, qualifies leads, runs campaigns
- ✅ 37+ agent skills with self-healing, plan decomposition, and workflow DAGs
- ✅ Agent-to-Agent (A2A) delegation protocol for specialist sub-agents
- ✅ GDPR and WCAG compliance built-in
- ✅ Self-hostable with Docker, private LLM support (HIPAA-ready)

### Unique Positioning: "Agentic CMS" — Head + Headless + Autonomous

to skillnad from traditionella CMS (that/which bara levererar webbplats) or rena headless-lösningar (that/which require separate frontend development), offers FlowWink **båda**:

```
┌─────────────────────────────────────────────────────────────┐
│                     FLOWWINK CONTENT                        │
│                    (Single Source of Truth)                 │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │   HEAD   │       │ HEADLESS │       │  FUTURE  │
    │ Website  │       │   API    │       │ Channels │
    │ (Built-in)│      │(REST/GQL)│       │          │
    └──────────┘       └──────────┘       └──────────┘
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │  Public  │       │  Mobile  │       │Newsletter│
    │ Website  │       │   App    │       │  Signage │
    └──────────┘       └──────────┘       └──────────┘
```

---

## 1. Content Management

### 1.1 Blocks-based page builder

FlowWink uses a modular Blocks-architecture for flexible innehållshantering:

#### Available Blocks (58+ types)

| Category | Block | Description |
|----------|-------|-------------|
| **Text & Media** | Text | Rich text with Tiptap editor (eyebrow, title, accent text) |
| | Image | Image with alt text and caption |
| | Gallery | Gallery with grid/carousel/masonry + lightbox |
| | Quote | Quote with author and source |
| | YouTube | Embedded YouTube video with autoplay settings |
| | Embed | Custom iframe/HTML embed with aspect ratio |
| | Table | Structured data with columns and rows |
| | Lottie | Lottie animation player |
| **Layout** | Two-Column | Two-column layout with text, image, eyebrow, title, accent, CTA |
| | Separator | Visual divider (line/dots/ornament/spacing) |
| | Section Divider | Decorative section dividers (wave, angle, curve) |
| | Tabs | Tab-based content with icons and variants |
| | Bento Grid | Bento-style grid layout for feature showcases |
| | Parallax Section | Full-bleed parallax scrolling sections |
| **Navigation** | Link Grid | Grid with link cards and icons |
| | Hero | Page header with background (image/video/color), title and CTA |
| | Announcement Bar | Top banner for messages and offers |
| | Quick Links | Quick navigation link cards |
| | Category Nav | Category navigation for e-commerce/content |
| **Information** | Info Box | Info box with variant (info/success/warning/highlight) |
| | Stats | Key metrics and statistics with icons and cards |
| | Accordion | Expandable FAQ/content with images (Tiptap rich text) |
| | Article Grid | Grid with article cards |
| | Features | Features/services with icons, hover effects, card styles |
| | Timeline | Step-by-step process or history with icons |
| | Progress | Progress indicators and progress bars |
| | Countdown | Countdown timer to specific date (cards/hero/minimal) |
| | Marquee | Scrolling text/icons for attention |
| | Trust Bar | Trust indicators and security badges |
| | Shipping Info | Shipping and delivery information |
| **Social Proof** | Testimonials | Customer reviews with star ratings, quotes, avatars |
| | Logos | Client/partner logos with grayscale/scroll variants |
| | Team | Team members with bio, photo and social links |
| | Badge | Certifications and trust icons (SOC2, GDPR, etc.) |
| | Social Proof | Live counters, ratings and activity notifications |
| **Conversion** | CTA | Call-to-action with buttons and gradient |
| | Pricing | Pricing table with tiers, features and badges |
| | Comparison | Comparison table for products/plans |
| | Booking | Booking form or embed (Calendly/Cal.com/HubSpot) |
| | Smart Booking | Built-in booking system with services, availability and calendar |
| | Form | Customizable form with field validation (default/card/minimal) |
| | Newsletter | Newsletter signup with GDPR consent (default/card/minimal) |
| | Floating CTA | Scroll-triggered CTA (bar/card/pill) |
| | Notification Toast | Dynamic activity notifications (purchases, registrations) |
| | Featured Carousel | Carousel for featured content/products |
| | Featured Product | Single product spotlight |
| **Contact** | Contact | Contact information with address and opening hours |
| | Map | Google Maps embed with address |
| **Interactive** | Chat | Embedded AI chat with context awareness |
| | Chat Launcher | ChatGPT-style launcher that routes to /chat with initial prompt |
| | AI Assistant | Inline AI assistant block |
| | Popup | Triggered popups (scroll/time/exit intent) |
| | Webinar | Webinar registration and countdown |
| | Resume Matcher | AI-powered resume/CV matching for consultant profiles |
| **Knowledge Base** | KB Hub | Knowledge base landing page with categories |
| | KB Search | Search block for knowledge base |
| | KB Featured | Featured KB articles |
| | KB Accordion | FAQ in accordion format |
| **E-commerce** | Products | Product grid from database with cart |
| | Cart | Cart with summary and checkout |

#### Blocks-features

- **drag & drop**: Omordna Blocks fritt with @dnd-kit
- **duplicate/remove**: Snabb handling
- **animations**: Per-Blocks animeringar (fade, slide, scale)
- **Spacing**: configurablepadding andmargin
- **Anchor ID**: Sätt a ID for in-pagenavigation (t.ex. `#kontakta-oss`)
- **Hide/Show**: Dölj Blocks from publika sidan without att remove (Webflow-stil)
- **Richpreviews**: Blocks editors shows realistiskapreviews that/which matches public rendering
- **Responsivt**: Alla Blocks anpassas automatiskt

#### Hide/Show Blocks (Webflow-stil)

Varje Blocks can döljas from publika sidan without att tas bort:

**features:**
- **Toggle-knapp**: Ögon-icon in Blocks-toolbaren (👁/🙈)
- **visual feedback**: Dolda Blocks visas with 40% opacity and "Hidden" badge in editorn
- **Persistens**: `hidden`-egenskapen sparas in Blockets JSON
- **Public rendering**: Dolda Blocks renderas not alls on publika sidor

**Användningsfall:**
- Dölj Blocks that/which not is klara for publicering
- Testa olika Blocks-kombinationer without att delete
- Behåll Blocks for framtida usage

#### Blockseditorpreviews

Alla Blocks editors shows rikapreviews that/which matches the publika renderingen:

**enhanced Blocks (Feb 2026):**
- **FormBlockEditor** — shows fields, labels, submit button, variant-support
- **AccordionBlockEditor** — rich Accordion-components withexpand/collapse
- **TwoColumnBlockEditor** — eyebrow, title with accenttext, CTA, andra bilden
- **TextBlockEditor** — eyebrow, title with accent/size inpreview
- **ChatBlockEditor** — message bubbles, input-fields, send button
- **ChatLauncherBlockEditor** — sparkles-input, quick actionpills
- **NewsletterBlockEditor** — email-input, subscribe button, variant-support
- **CountdownBlockEditor** — countdown boxes with numbers, variant-support
- **FloatingCTABlockEditor** — CTA bar/card/pill with buttons
- **NotificationToastBlockEditor** — toast-mockup with icon, title, meddelande
- **FeaturesBlockEditor** — Richpreview with icons, hovereffects
- **TestimonialsBlockEditor** — quote, avatar, star ratings
- **PricingBlockEditor** — pricing cards, features, badges
- **TimelineBlockEditor** — step-by-stepprocess with icons
- **SocialProofBlockEditor** — live counters, ratings
- **StatsBlockEditor** — statistics with icons and cards
- **TeamBlockEditor** — team members withbio, photo
- **ContactBlockEditor** — Kontaktinfo, opening hours, 2-column

**Övriga Blocks:**
- Alla andra Blocks has already rikapreviews or is DB-beroende (can not show staticpreview)

#### Anchor-links (in-pagenavigation)

Varje Blocks can assigned a **Anchor ID** for att enable in-pagenavigation:

1. **set Anchor ID**: click on `#`-ikonen in Blocks-toolbaren
2. **Länka to Blocks**: useURL:er that/which `#kontakta-oss` in buttons ornavigation
3. **Smoothscroll**: automatic smooth scrolling vid klick on anchor-links
4. **URL-support**: direct links that/which `/page#kontakta-oss` fungerar vid page load

**Användningsfall:**
- navigation inom a long page (t.ex. hero → kontaktformulär)
- Header-menu with quick links to sektioner
- CTA-buttons that/which scrollar to form

### 1.2 Mediabibliotek

- **upload**: drag & drop or file picker
- **WebP-conversion**: automatic optimization
- **Unsplash-integration**: search and use stock photos
- **folders**: automatic organization (pages/imports)
- **search & filter**: find bilder quickly with folder tabs
- **Bulk-handling**: mark multiple, delete simultaneously
- **Lightbox**: Fullskärmsvisning with tangentbordsnavigering
- **Återanvändning**: Välj from biblioteket in alla Blocks
- **alttext**: WCAG-compatible image handling

### 1.3editor-architecture

FlowWink uses två olikaeditor-types beroende on innehållstyp:

| Innehållstyp | editor | Focus |
|--------------|--------|-------|
| **Pages** | Blocks-system | Layout composition (Hero, Features, CTA, etc.) |
| **Blog** | Tiptap Richtext | Document-focused (text, bilder, quote) |
| **Newsletter** | Tiptap Richtext | email-formaterat content |

**Fördelar:**
- Blog and Newsletter delar sammaeditor-upplevelse
- Content Campaigns can publish direkt to Blog without conversion
- Enklare for skribenter - Focus on content, notlayout
- AI-genererat content passar naturligt

---

## 2. Editorial Workflow

### 2.1 Rollbaserat System

| Roll | Rättigheter |
|------|-------------|
| **Writer** | Create drafts, edit own pages, skicka for granskning |
| **Approver** | Everything Writer + Review, approve/reject, publish |
| **Admin** | Full access + User management, system settings |

### 2.2 Statusflöde

```
┌─────────┐     ┌───────────┐     ┌───────────┐
│  DRAFT  │ ──► │ REVIEWING │ ──► │ PUBLISHED │
│ (Draft)│     │(Reviewing) │     │(Published)│
└─────────┘     └───────────┘     └───────────┘
      ▲               │
      │               │ Rejected
      └───────────────┘
```

### 2.3 Versionshantering

- **Automatic versions**: Created on publish
- **Version history**: View all previous versions
- **Restoration**: Återgå to tidigare version
- **Comparison**: View differences between versions

### 2.4 Scheduled Publishing

- **Future publishing**: Välj date and time
- **automatic aktivering**: Cron-jobb publishr vid rätt time
- **visual indikator**: Klocka shows schemalagda sidor
- **Cancel/Change**: Justera or remove schema

### 2.5 Preview

- **Livepreview**: View page before publishing
- **New window**: Öppnas separat from admin
- **Time-limited**: data deleted after 1 hour
- **Banner**: Clear marking "Preview"

---

## 3. Branding & Design System

### 3.1 Templates (Complete Packages)

Templates are complete packages that include:
- **Pre-configured pages** (homepage, about us, services, contact, etc.)
- **Block content** (pre-filled with relevant text and images)
- **Branding settings** (colors, typography, logo, etc.)
- **Blog posts** (pre-written content for SEO and marketing)
- **KB articles** (knowledge base content for support)
- **FlowPilot configuration** (soul, objectives, priority skills)
- **Consultant profiles** (for agency/consulting templates)
- **Products** (for e-commerce templates)

| Template | Category | Pages | Target |
|----------|----------|-------|--------|
| **Launchpad** | Startup | 5 | SaaS/Tech startups |
| **Momentum** | Startup | 4 | Single-page dark design |
| **TrustCorp** | Enterprise | 5 | B2B companies |
| **SecureHealth** | Compliance | 7 | Healthcare providers |
| **FlowWink Platform** | Platform | 5 | CMS showcase (dogfooding) |
| **Help Center** | Help Center | 4 | Help center with KB + AI |
| **Service Pro** | Startup | 5 | Service business + booking |
| **Digital Shop** | Platform | 5 | E-commerce / digital products |
| **FlowWink Agency** | Platform | 5 | Agency white-label |
| **Consult Agency** | Platform | 5 | Consulting agency with AI matching |

#### Template Selection
Each template has its own branding settings. When you choose a template:
- All pages are created automatically with pre-configured content
- Blog posts, KB articles, products, and consultant profiles are seeded
- FlowPilot soul and objectives are configured via `setup-flowpilot`
- Branding settings applied (colors, typography, logo)
- Everything can be customized after installation

#### Reset to Template Defaults
BrandingSettingsPage shows which template is active and offers a "Reset to Template Defaults" button.

### 3.2 Custom Themes (Brand Guide Assistant)

**function**: Analysera befintlig webbplats and extrahera branding automatiskt.

**process**:
1. AngeURL to befintlig webbplats
2. AI analyserar Colors, typografi, logos
3. Review mapping to CMS variables
4. Applicera direkt or spara that/which eget tema

**Requires**: FIRECRAWL_API_KEY

### 3.3 Customization options

#### Colors (HSL-format with WCAG-validering)
- **Primärfärg** — with kontrastvalidering (AA/AAA)
- **Sekundärfärg** — with kontrastvalidering
- **Accentfärg** — with kontrastvalidering
- **Background color**
- **Förgrundsfärg**

**WCAG Color Contrast Validation:**
- Alla färgpickers has built-in kontrastvalidering
- visual indikator for AA (4.5:1) and AAA (7:1) kompatibilitet
- Hjälp-text shows kontrastförhållande and status

#### Typografi
- Rubrikfont (Google Fonts)
- Brödtextfont (Google Fonts)
- Dynamisk fontladdning

#### Utseende
- Kantradier (rounded corners)
- Skuggintensitet
- Mörkt/Ljust läge

---

## 4. SEO & Performance

### 4.1 Globala SEO-inställningar

| Inställning | description |
|-------------|-------------|
| Site Title Template | Mall for sidtitlar (t.ex. "%s | Företagsnamn") |
| default Meta Description | StandardDescription for sidor |
| Open Graph Image | Standardbild for delning in social medier |
| Twitter Handle | @användarnamn for Twitter Cards |
| Google Verification | Verifieringskod for Search Console |
| Robots Indexing | Global indexeringsinställning |

### 4.2 Per-page SEO

- **Anpassad title**: Override for specifik page
- **Meta description**: Unik description per page
- **noindex/nofollow**: Exkludera from sökmotorer
- **CanonicalURL**: Förhindra duplicerat content

### 4.3 Performance-optimization

| function | description |
|----------|-------------|
| **Edge Caching** | In-memory cache with configurable TTL |
| **Lazy Loading** | Bilder laddas vidscroll |
| **WebP-conversion** | automatic bildoptimering |
| **Link Prefetching** | Förladdning of links |

### 4.4 Cache-strategi

```
Request → Edge Cache Hit? 
           │
    ┌──────┴──────┐
    │ YES         │ NO
    ▼             ▼
  Return      Fetch from DB
  Cached      → Store in Cache
              → Return
```

**TTL**: configurable (standard 5 minuter)  
**Invalidering**: automatic vid publicering/avpublicering

---

## 5. Public Site Features

### 5.0 Developer Tools (Hidden)

Developer Tools is a dold sektion for utvecklare att testa and debugga:

**Åtkomst:** `/admin/developer-tools` or search with `#developer-tools`

**Not synlig in side panel** - Endast direktURL-åtkomst or sökbar via `#`

#### Webhook Logger
- Logga webhooks istället for att skicka to externa API:er
- show payload-struktur
- Testa event triggers
- Inga externa API-anrop

#### Blocks Previewer
- FörhandsReview custom Blocks without att skapa sidor
- Testa olika variants
- Hot reload support
- Mock data generator

#### Mock data Generator
- Generera test data for utveckling
- Test sidor, Blocks, webhooks
- Anpassningsbara data sets

---

### 5.1 Dynamisknavigation

- **automatic menu**: based on Publishede sidor
- **Menyordning**: drag & drop in admin
- **show/Dölj**: Kontrollera synlighet per page
- **Mobil-menu**: Responsiv hamburger-menu
- **configurable startsida**: Valfri page that/which hem

### 5.2 Footer

#### Anpassningsbara Sektioner
- Varumärke & Logotyp
- quick links
- contact information
- opening hours

#### features
- drag & drop-ordning
- show/dölj sektioner
- social medier-links (Facebook, Instagram, LinkedIn, Twitter, YouTube)
- dynamic juridiska links

### 5.3 Cookie Banner (GDPR)

- **consent**: "Acceptera alla" / "Endast nödvändiga"
- **Lagring**: localStorage with status
- **Anpassningsbar**: text, buttons, link to policy
- **Standardpolicy**: Svensk GDPR-mall inkluderad

### 5.4 Underhållslägen

| Läge | Effekt |
|------|--------|
| **Blockera sökmotorer** | noindex/nofollow on alla sidor |
| **Kräv inloggning** | Blockerar all public åtkomst |
| **Underhållsläge** | shows underhållsmeddelande with förväntad sluttid |

### 5.5 Mörkt Läge

- **Tema-växlare**: Ljus/Mörk/System
- **Alternativ logotyp**: Separat logo for mörkt läge
- **CSS-variabler**: automatic anpassning
- **Persistence**: Sparas mellan sessioner

---

## 6. AI-Powered Features

### 6.1 AI Chat System

#### Multi-Provider architecture

FlowWink stödjer fem olika AI-providers for maximal flexibilitet:

| Provider | usage | data Location | Setup |
|----------|------------|---------------|-------|
| **Lovable AI** | Standard molntjänst, ingen setup krävs | Moln (EU) | Ingen API-nyckel behövs |
| **OpenAI** | GPT-modeller with anpassad konfiguration | OpenAI Cloud | API-nyckel (secret) |
| **Google Gemini** | Google AI-modeller | Google Cloud | API-nyckel (secret) |
| **Private LLM** | Självhostad OpenAI-kompatibel endpoint | On-premise/Privat | EndpointURL, valfri API-nyckel |
| **N8N Webhook** | Agentic workflows with AI-agent | Konfigurerbart | WebhookURL |

#### integration Testing

Alla AI-providers has built-in testfunktioner:
- **Test Connection**: Verifiera att anslutningen fungerar
- **Active Provider Indicator**: show vilken provider that/which is aktiv
- **Error Handling**: Tydliga felmeddelanden vid konfigurationsproblem

#### Private/Local LLM (HIPAA-kompatibel)

for organisationer with strikta datakrav (HIPAA, GDPR, interna policies):

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CMS Chat UI   │ ──► │  Edge Function  │ ──► │  Private LLM    │
│   (Frontend)    │     │ (chat-completion)│     │ (OpenAI API)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │ Your Infrastructure │
                                              │ - Ollama         │
                                              │ - LM Studio      │
                                              │ - vLLM           │
                                              │ - Custom API     │
                                              └─────────────────┘
```

**Konfiguration**:
- **Endpoint**: OpenAI-kompatibelURL (t.ex. `https://api.autoversio.ai/v1`)
- **Model**: Modellnamn (t.ex. `llama3`, `mistral`, custom)
- **API Key**: Valfri autentisering

**Fördelar**:
- ✅ data lämnar aldrig din infrastruktur
- ✅ Full kontroll över modell and inferens
- ✅ HIPAA/GDPR-kompatibel by design
- ✅ Ingen vendor lock-in

#### N8N AI Agentintegration

Koppla chatten to N8N for avancerade AI-agenter with verktyg:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Chat     │ ──► │  Edge Function  │ ──► │  N8N Workflow   │
│   "Boka time"    │     │ + sessionId     │     │  AI Agent Node  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │   Agent Tools   │
                                              │ - Cal.com       │
                                              │ - Google Sheets │
                                              │ - email         │
                                              │ - Custom APIs   │
                                              └─────────────────┘
```

**Webhook Types**:
- **Chat Webhook**: N8N Chat node with session memory (rekommenderad)
- **Generic Webhook**: OpenAI-kompatibeltformat with full history

**Session Memory**: SessionId skickas automatiskt for konversationsminne in N8N.

#### Leveranslägen

- **Dedikerad page**: /chat
- **CMS-Blocks**: Inbäddat in sidor
- **Floating Widget**: Flytande icon on alla sidor

#### Context Augmented Generation (CAG)

**Killer Feature: Multi-Module Context**

Första systemet that/which uses **alla modulers content that/which AI-kontext:**

- **Pages** — Landings pages and kampanjsidor
- **Blog** — Blogginlägg with SEO
- **Knowledge Base** — knowledge base-articles
- **Forms** — form and leads

**Värde:**
- Omedelbara svar from eget content
- Ingen träning krävs — fungerar direkt
- Spara timmar with kundsupport
- AI chat ger värde from dag 1

**knowledge base**: Publishede sidor that/which kontext
- **Selektiv**: Välj vilka sidor that/which inkluderas
- **Token-limit**: configurable maxgräns
- **Per-page toggle**: Inkludera/exkludera specifika sidor

#### Human Handoff & Live Agent Support

FlowWink supports seamless escalation from AI to human agents:

| Feature | Description |
|---------|-------------|
| **Automatic Escalation** | AI detects frustration signals (caps, repeated questions, negative words) |
| **Explicit Request** | User says "speak to human", "talk to agent", etc. |
| **Sentiment Detection** | Real-time sentiment scoring (1-10 scale) with configurable threshold |
| **Agent Avatars** | Live agents display with profile photos in chat widget |
| **Presence System** | Real-time agent online/offline/away/busy status |
| **Queue Management** | Waiting conversations ordered by priority and time |

**Sentiment Analysis Flow:**
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Message  │ ──► │  AI Analysis    │ ──► │  Handoff Check  │
│   "THIS IS BAD" │     │  Score: 7/10    │     │  Threshold: 5   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │  Human Handoff  │
                                              │  Agent Notified │
                                              └─────────────────┘
```

**Live Support Dashboard:**
- Active conversation count
- Waiting queue size
- Online agent count
- Average sentiment indicator (green/yellow/red)
- Quick access to support queue


### 6.2 AI-driven Page Import

**Intelligent Content Migration** from valfri webbplats:

| Feature | Description |
|---------|-------------|
| **Platform Detection** | Auto-detects WordPress, Wix, Squarespace, Webflow, Shopify, Ghost, HubSpot, Drupal, SiteVision, Episerver |
| **video Extraction** | YouTube, Vimeo and embedded iframes |
| **Image Extraction** | Regular images, lazy-loaded, background-images |
| **Screenshot Analysis** | Visual context for AI Blocks mapping |
| **22+ Blocks Types** | Hero, text, gallery, team, stats, testimonials, pricing, features, accordion, etc. |
| **Local Storage** | Optional download of all images to media library |
| **Smart Page Filtering** | Excludes pagination, archives, admin pages, search results, feed URLs |
| **Date-based Filtering** | Filters out old content (lastmod > 24 months) from sitemap |
| **Duplicate Detection** | URL normalization and slug deduplication prevents duplicate imports |
| **Sitemap Limit** | Max 50 sitemap pages to focus on active content |

**Usage:** Admin → Pages → Import Page → EnterURL → AI analyzes and maps to Blocks

## 7. Headless Content API

### 7.1 REST Endpoints

#### Lista alla Publishede sidor
```bash
GET /content-api/pages
```

**Response**:
```json
{
  "pages": [
    {
      "id": "uuid",
      "title": "Startsida",
      "slug": "hem",
      "status": "published",
      "meta": { ... },
      "Blocks": [ ... ]
    }
  ]
}
```

#### Hämta specifik page
```bash
GET /content-api/page/:slug
```

### 7.2 GraphQL Endpoint

```bash
POST /content-api/graphql
```

#### Schema
```graphql
type Query {
  pages: [Page!]!
  page(slug: String!): Page
  Blocks(pageSlug: String!, type: String): [Blocks!]!
}

type Page {
  id: ID!
  title: String!
  slug: String!
  status: String!
  meta: JSON
  Blocks: [Blocks!]!
}

type Blocks {
  id: ID!
  type: String!
  data: JSON!
}
```

#### Exempelquery
```graphql
query {
  page(slug: "hem") {
    title
    Blocks {
      type
      data
    }
  }
}
```

### 7.3 Richtextformat

Alla richtext-fields (text, Two-Column, Accordion, InfoBox) serialiseras that/which **Tiptap JSON** for maximal portabilitet:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello world" }
      ]
    }
  ]
}
```

---

## 8. Content Hub Dashboard

### 8.1 Multi-Channel Visualization

Visuellt diagram that/which demonstrerar innehållsflöde from CMS to olika kanaler:

- ✅ **Website** (Live)
- ✅ **AI Chat** (Live)
- ✅ **Newsletter** (Live)
- ✅ **Webhooks/N8N** (Live)
- ✅ **Booking System** (Live)
- 🔮 **Mobile App** (Framtida)
- 🔮 **Digital Signage** (Framtida)

### 8.2 API Explorer

- **GraphQL Query Runner**: Testa queries direkt
- **REST Examples**: curl-kommandon
- **Code Snippets**: React, Next.js, vanilla JS

### 8.3 Content Model Overview

Översikt of alla 50+ Blocks-types with:
- Antal instanser in Publishede sidor
- JSON-preview of Blocks-struktur
- Dokumentation of data-format

### 8.4 Blocks data Structures

#### KonverteringsBlock

**Testimonials Blocks**
```typescript
interface TestimonialsBlockData {
  title?: string;
  subtitle?: string;
  testimonials: {
    id: string;
    content: string;
    author: string;
    role?: string;
    company?: string;
    avatar?: string;
    rating?: number; // 1-5 stars
  }[];
  layout: 'grid' | 'carousel' | 'single';
  columns?: 2 | 3;
  showRating?: boolean;
  showAvatar?: boolean;
  variant?: 'default' | 'cards' | 'minimal';
  autoplay?: boolean;
  autoplaySpeed?: number;
}
```

**Pricing Blocks**
```typescript
interface PricingBlockData {
  title?: string;
  subtitle?: string;
  tiers: {
    id: string;
    name: string;
    price: string;
    period?: string;
    description?: string;
    features: string[];
    buttonText?: string;
    buttonUrl?: string;
    highlighted?: boolean;
    badge?: string;
  }[];
  columns?: 2 | 3 | 4;
  variant?: 'default' | 'cards' | 'compact';
}
```

**Comparison Blocks**
```typescript
interface ComparisonBlockData {
  title?: string;
  subtitle?: string;
  products: {
    id: string;
    name: string;
    price?: string;
    highlighted?: boolean;
    buttonText?: string;
    buttonUrl?: string;
  }[];
  features: {
    id: string;
    name: string;
    values: (boolean | string)[]; // One value per product
  }[];
  variant?: 'default' | 'striped' | 'bordered';
}
```

**Booking Blocks (Enhanced)**
```typescript
interface BookingBlockData {
  title?: string;
  description?: string;
  mode: 'embed' | 'form';
  // embed mode
  provider?: 'calendly' | 'cal' | 'hubspot' | 'custom';
  embedUrl?: string;
  height?: 'sm' | 'md' | 'lg' | 'xl';
  // Form mode
  submitButtonText?: string;
  successMessage?: string;
  showPhoneField?: boolean;
  showDatePicker?: boolean;
  // Service selection
  services?: {
    id: string;
    name: string;
    duration?: string;
    description?: string;
  }[];
  showServiceSelector?: boolean;
  // Webhookintegration
  triggerWebhook?: boolean;
  variant?: 'default' | 'card' | 'minimal';
}
```

#### Social Proof Blocks

**Team Blocks**
```typescript
interface TeamBlockData {
  title?: string;
  subtitle?: string;
  members: {
    id: string;
    name: string;
    role: string;
    bio?: string;
    photo?: string;
    social?: {
      linkedin?: string;
      twitter?: string;
      email?: string;
    };
  }[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'carousel';
  variant?: 'default' | 'cards' | 'compact';
  showBio?: boolean;
  showSocial?: boolean;
}
```

**Logos Blocks**
```typescript
interface LogosBlockData {
  title?: string;
  subtitle?: string;
  logos: {
    id: string;
    name: string;
    logo: string;
    URL?: string;
  }[];
  columns?: 3 | 4 | 5 | 6;
  layout?: 'grid' | 'carousel' | 'scroll';
  variant?: 'default' | 'grayscale' | 'bordered';
  logoSize?: 'sm' | 'md' | 'lg';
}
```

**Features Blocks**
```typescript
interface FeaturesBlockData {
  title?: string;
  subtitle?: string;
  features: {
    id: string;
    icon: string;
    title: string;
    description: string;
    URL?: string;
  }[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'list';
  variant?: 'default' | 'cards' | 'minimal' | 'centered';
  iconStyle?: 'circle' | 'square' | 'none';
}
```

**Timeline Blocks**
```typescript
interface TimelineBlockData {
  title?: string;
  subtitle?: string;
  steps: {
    id: string;
    icon?: string;
    title: string;
    description: string;
    date?: string;
  }[];
  variant?: 'vertical' | 'horizontal';
  showDates?: boolean;
  showIcons?: boolean;
}

---

## 9. Compliance & Security

### 9.1 GDPR

| function | Implementation |
|----------|----------------|
| **Audit Logging** | Alla användaråtgärder loggas |
| **Cookie Consent** | Samtyckesbanner with val |
| **data Retention** | configurable lagringstid |
| **Privacy Policy** | Mall for integritetspolicy |
| **Right to Erasure** | support for radering of data |

### 9.2 WCAG 2.1 AA

- **Semantisk HTML**: Korrekt usage of element
- **alttext**: Obligatorisk for bilder
- **Kontrastförhållanden**: Verifierade färgkombinationer
- **Tangentbordsnavigering**: Full support
- **Focus States**: Synliga Focusindikatorer

### 9.3 Row Level Security (RLS)

Supabase RLS säkerställer dataåtkomst per användare:

```sql
-- Endast Publishede sidor for anonyma användare
CREATE POLICY "Public can view published pages" 
ON public.pages 
FOR SELECT 
TO anon 
USING (status = 'published');

-- Writers can bara redigera sina Draft
CREATE POLICY "Writers can edit own drafts"
ON public.pages
FOR UPDATE
USING (
  created_by = auth.uid() 
  AND status = 'draft'
);
```

### 9.4 HIPAA-kompatibilitet

for vårdorganisationer that/which Requires HIPAA:

- **Lokal AI**: Självhostad OpenAI-kompatibel endpoint
- **Ingen molndata**: chat-konversationer stannar lokalt
- **Audit Trail**: Komplett loggning of åtkomst

---

## 10. Technical Architecture

### 10.1 Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│                                                             │
│   React 18 + Vite + TypeScript + Tailwind CSS              │
│   React Query + React Router + React Hook Form              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                        BACKEND                              │
│                                                             │
│   Supabase (Self-hosted via Docker)                        │
│   ├── PostgreSQL + pgvector (semantic memory)              │
│   ├── Row Level Security (RLS)                             │
│   ├── Edge Functions (Deno)                                │
│   ├── Storage (S3-compatible)                              │
│   └── Realtime Subscriptions                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                      EDGE FUNCTIONS                         │
│                                                             │
│   CORE CMS:                                                │
│   ├── get-page (Cached page fetch)                         │
│   ├── content-api (REST/GraphQL/Markdown)                  │
│   ├── migrate-page (AI import)                             │
│   ├── analyze-brand (Brand extraction)                     │
│   ├── process-image (WebP conversion)                      │
│   ├── publish-scheduled-pages (Cron job)                   │
│   │                                                         │
│   FLOWPILOT AGENT:                                         │
│   ├── agent-reason (Core reasoning module — shared)        │
│   ├── agent-execute (Unified skill router)                 │
│   ├── agent-operate (SSE streaming interactive)            │
│   ├── flowpilot-heartbeat (12h autonomous loop)            │
│   ├── flowpilot-learn (Daily feedback distillation)        │
│   ├── setup-flowpilot (Bootstrap skills/soul/objectives)   │
│   │                                                         │
│   AI & CHAT:                                               │
│   ├── chat-completion (Public AI chat)                     │
│   │                                                         │
│   AUTOMATION:                                              │
│   ├── automation-dispatcher (Cron trigger)                 │
│   ├── signal-dispatcher (Signal condition eval)            │
│   ├── signal-ingest (External webhook endpoint)            │
│   ├── send-webhook (Webhook delivery)                      │
│   │                                                         │
│   CRM & COMMERCE:                                          │
│   ├── qualify-lead (AI lead scoring)                       │
│   ├── enrich-company (Domain enrichment)                   │
│   ├── prospect-research (Company research)                 │
│   ├── prospect-fit-analysis (AI fit scoring)               │
│   │                                                         │
│   CONTENT:                                                 │
│   ├── research-content (AI topic research)                 │
│   ├── generate-content-proposal (Multi-channel content)    │
│   ├── web-search / web-scrape (Jina/Firecrawl)           │
│   ├── business-digest (Weekly cross-module summary)        │
│   └── newsletter-send (Email via Resend)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Database Schema

#### Core Tables

| Tabell | description |
|--------|-------------|
| `pages` | Sidor with content_json, meta_json, status |
| `page_versions` | Version history for sidor |
| `profiles` | Användarprofiler |
| `user_roles` | Roll-tilldelningar (writer/approver/admin) |
| `site_settings` | Globala inställningar (key-value) |
| `audit_logs` | Händelselogg for GDPR |
| `chat_conversations` | AI-chattkonversationer |
| `chat_messages` | messages in konversationer |

### 10.3 Key Dependencies

| Paket | usage |
|-------|------------|
| `@tiptap/*` | Richtexteditor |
| `@dnd-kit/*` | drag anddrop |
| `@tanstack/react-query` | data fetching & caching |
| `react-helmet-async` | SEO meta tags |
| `next-themes` | Dark mode |
| `lucide-react` | Icons |
| `sonner` | toast notifications |

---

## 11. Unique Selling Points

### 11.1 Jämfört with Contentful/Sanity

| FlowWink | Contentful/Sanity |
|--------|-------------------|
| ✅ built-in webbplats | ❌ Requires separat frontend |
| ✅ Svensk lokalisering | ❌ Engelska UI |
| ✅ VårdFocuserad | ❌ Generisk |
| ✅ Ingen utvecklare behövs | ❌ Requires utvecklare |

### 11.2 Jämfört with WordPress

| FlowWink | WordPress |
|--------|-----------|
| ✅ Modern React-stack | ❌ PHP/Legacy |
| ✅ Blocks-based native | ❌ Gutenberg addon |
| ✅ Headless API built-in | ❌ REST API begränsat |
| ✅ GDPR/WCAG built-in | ❌ Requires plugins |

### 11.3 Jämfört with Strapi

| FlowWink | Strapi |
|--------|--------|
| ✅ Komplett lösning | ❌ Bara backend |
| ✅ Zero-config | ❌ Requires hosting |
| ✅ AI-features | ❌ Ingen AI |
| ✅ Managed | ❌ Self-hosted |

---

## 12. Target Users

### 12.1 Primär Target audience

**Svenska vårdgivare**
- Vårdcentraler
- Privata kliniker
- Tandläkarmottagningar
- Rehabiliteringscentra

**Krav**:
- GDPR-efterlevnad
- WCAG-availability
- Svenskt språk
- Professionell design
- Enkel administration

### 12.2 Sekundär Target audience

**Organisationer with liknande behov**
- Non-profit organisationer
- Utbildningsinstitutioner
- Myndigheter and kommuner
- Professionella tjänsteföretag

---

## Appendix A: Roadmap

### Phase 1: MVP ✅ (Complete)
- Block-based page builder (46 block types)
- Editorial workflow (Draft → Review → Published)
- Branding & SEO
- AI Chat & Import
- Headless API (REST + GraphQL)

### Phase 2: Core Modules ✅ (Complete)
- **Blog Module** — Posts, categories, tags, author profiles, RSS feed
- **Newsletter Module** — Subscribers, campaigns, open/click tracking, GDPR export
- **Integration Module** — Webhooks, N8N templates, event system

### Phase 3: Process Automation ✅ (Complete)
- Booking/scheduling, Lead CRM, conversion blocks, interactive blocks

### Phase 4: FlowPilot Agent v1 ✅ (Complete — Jan 2025)
- 20 default skills, persistent memory, objectives, self-healing
- Public chat with context-augmented generation
- Skill registry with hot-reload

### Phase 5: Autonomous Agentic Web v2.0 ✅ (Complete — March 2026)

| Feature | Status |
|---------|--------|
| **37+ skills** across CMS, CRM, Commerce, Communication | ✅ Complete |
| **Workflow DAGs** — multi-step chains with conditional branching | ✅ Complete |
| **A2A Delegation** — specialist sub-agents (SEO, content, sales, analytics, email) | ✅ Complete |
| **Skill Packs** — bundle and distribute capability sets | ✅ Complete |
| **pgvector Memory** — semantic search across all learned context | ✅ Complete |
| **Plan Decomposition** — AI-generated 3-7 step plans from any objective | ✅ Complete |
| **Proactive Proposals** — FlowPilot surfaces gaps before you notice them | ✅ Complete |
| **Soul Evolution** — personality, values, and tone update as brand evolves | ✅ Complete |
| **Content Authority** — competitor monitoring, content research pipeline | ✅ Complete |
| **Sales Intelligence** — prospect research and fit analysis | ✅ Complete |
| **Consultant Profiles** — team expertise management with AI matching | ✅ Complete |
| **Resume Matcher** — AI-powered CV-to-consultant matching block | ✅ Complete |
| **Federation** — A2A peer management and cross-agent collaboration | ✅ Complete |
| **Campaigns** — multi-channel content proposals with pillar content | ✅ Complete |
| **Webinars** — plan, promote, and follow up online events | ✅ Complete |
| **Content API v2** — REST + GraphQL + Markdown export for LLM consumption | ✅ Complete |
| **10 starter templates** with blog posts, KB, FlowPilot config | ✅ Complete |
| **61+ block types** | ✅ Complete |

#### Booking Module Features

**Basic Booking Block**:
- **Form Mode**: Built-in appointment request form
- **embed Mode**: Calendly, Cal.com, HubSpotintegration
- **Webhook Trigger**: Automatic `booking.submitted` event for n8n workflows

**Smart Booking Blocks** (Native System):
- **Service Management**: Create services with name, duration, price, description
- **Availability Calendar**: Configure available days and time slots per service
- **Multi-step Flow**: Service selection → Date/time picker → Customer details → Confirmation
- **Week View**: Visual calendar with available slots
- **Real-time Availability**: Shows only bookable time slots
- **Admin Dashboard**: View, manage, and track all bookings
- **Status Tracking**: Pending, confirmed, cancelled, completed
- **Webhookintegration**: Triggers `booking.created` event for automation

#### Conversion Blocks Added
- **Testimonials**: Customer reviews with star ratings, carousel/grid layouts
- **Pricing**: Tiered pricing tables with features and CTA buttons
- **Comparison**: Feature comparison tables for plans/products
- **Team**: Staff profiles with photos, bio, and social links
- **Logos**: Client/partner logos with grayscale andscroll variants
- **Features**: Service/feature grids with icons
- **Timeline**: Step-by-stepprocess visualization

#### Interactive Blocks Added (January 2025)
- **Badge**: Trustbadges and certifications (SOC2, GDPR, ISO)
- **Social Proof**: Live counters, ratings, and activity indicators
- **Notificationtoast**: Dynamic activity notifications (purchases, signups)
- **Floating CTA**: scroll-triggered call-to-action bars
- **Marquee**: Scrollingtext/icons for announcements
- **Tabs**: Tabbed content with multiple orientations and variants
- **Countdown**: Live countdown timers with customizablelabels
- **Progress**: Progress bars and circular indicators
- **embed**: Custom iframe/HTML embeds with aspect ratio control
- **Table**: Structured data tables with styling options
- **Announcement Bar**: Top banner for important messages

#### Blockseditorpreviews (February 2026)
**Objective**: Ensure all Blocks editors show richpreviews matching public rendering

**Completed Blocks (18)**:
- FormBlockEditor — Fields, labels, submit button, variant support
- AccordionBlockEditor — Real Accordion components withexpand/collapse
- TwoColumnBlockEditor — eyebrow, title with accenttext, CTA, second image
- TextBlockEditor — eyebrow, title with accent/size inpreview
- ChatBlockEditor — Message bubbles, input field, send button
- ChatLauncherBlockEditor — sparkles input, quick actionpills
- NewsletterBlockEditor — email input, subscribe button, variant support
- CountdownBlockEditor — Countdown boxes with numbers, variant support
- FloatingCTABlockEditor — CTA bar/card/pill with buttons
- NotificationToastBlockEditor — toastmockup with icon, title, message
- FeaturesBlockEditor — Richpreview with icons, hovereffects
- TestimonialsBlockEditor — Quotes, avatar, star ratings
- PricingBlockEditor — Pricing cards, features, badges
- TimelineBlockEditor — Step-by-stepprocess with icons
- SocialProofBlockEditor — Live counters, ratings
- StatsBlockEditor — Stats with icons and cards
- TeamBlockEditor — Team members withbio, photo
- ContactBlockEditor — Contact info, opening hours, 2-columnlayout

**Other Blocks**: Already have richpreviews or are DB-dependent (Booking, Cart, Products, KB Blocks, etc.)

#### Lead Generation Loop (Flowwink Loop)

The Flowwink Loop is the unified lead capture and enrichment pipeline that automatically converts all visitor interactions into enriched CRM contacts:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LEAD GENERATION LOOP                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│   │  Forms   │  │Newsletter│  │ Bookings │  │   Chat   │               │
│   │  Blocks   │  │  Blocks   │  │  Blocks   │  │  Widget  │               │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│        │             │             │             │                      │
│        └─────────────┴──────┬──────┴─────────────┘                      │
│                             ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    LEAD CAPTURE ENGINE                          │  │
│   │  • Auto-create lead if newemail                                │  │
│   │  • Auto-match company by domain                                 │  │
│   │  • Add activity with source + points                            │  │
│   │  • Trigger enrichment if new company                            │  │
│   │  • Trigger AI qualification                                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                             │                                           │
│                             ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    ENRICHMENT PIPELINE                          │  │
│   │  • Company: Firecrawl + AI extraction                           │  │
│   │  • Lead: AI qualification + scoring                             │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Activity Point Values**:
| Source | Points | Intent Level |
|--------|--------|--------------|
| Form submission | 10 | High |
| Booking | 10 | High |
| Newsletter subscribe | 8 | Medium |
| Link click | 5 | Medium |
| Call logged | 5 | Medium |
| email open | 3 | Low |
| Page visit | 2 | Low |

**Automatic Enrichment**:
- When a new company is created fromemail domain matching, the `enrich-company` edge function is triggered automatically
- Company enrichment uses Firecrawl to scrape the website and AI to extract: industry, size, phone, address, description
- Lead qualification uses AI to generate summaries and suggest status changes based on activity history

### Fas 4: Enterprise (Future)
- SSO/SAML
- Multi-site support
- Advanced analytics & A/B testing
- API rate limiting
- Dedicated support SLA

### Backlog: Account & data Management

#### Account Deletion with data Preservation
**Priority**: Medium  
**Complexity**: High  
**GDPR Relevance**: Critical

**Problem**: Users need the ability to delete their accounts while preserving content integrity and complying with GDPR "right to erasure".

**Affected Tables**:
- `blog_posts` (author_id, created_by, updated_by, reviewer_id)
- `pages` (created_by, updated_by)
- `leads` (assigned_to, created_by)
- `kb_articles` (created_by, updated_by)
- `newsletters` (created_by)
- `companies` (created_by)
- `deals` (created_by)
- `global_Blocks` (created_by, updated_by)

**Proposed Strategies** (to be decided):
1. **Soft Delete**: Add `deleted_at` and `is_deleted` to profiles. Hide from UI, preserve content with original author. Account restorable by admin.
2. **Anonymize Author**: Delete account but keep content with author shown as "Deleted User". Irreversible.
3. **Transfer then Delete**: Require transferring content to another user before allowing deletion. Clean handover.
4. **Full Cascade Delete**: Delete user AND all their content. Simple but destructive.

**Implementation Considerations**:
- Add `deleted_at TIMESTAMP` and `is_deleted BOOLEAN default false` to profiles table
- Create edge function for cascading soft-delete/anonymization
- Update all queries to filter out deleted users
- Admin UI for viewing/restoring deleted accounts
- GDPR export before deletion

---

## Appendix B: Webhook Events

### Available Events

| Event | Description | Payload |
|-------|-------------|---------|
| `page.published` | Page published | id, slug, title, published_at |
| `page.updated` | Page updated | id, slug, title, updated_at |
| `page.deleted` | Page deleted | id, deleted_at |
| `blog_post.published` | Blog post published | id, slug, title, excerpt, published_at |
| `blog_post.updated` | Blog post updated | id, slug, title, updated_at |
| `blog_post.deleted` | Blog post deleted | id, deleted_at |
| `form.submitted` | Form submitted | form_name, Block_id, page_id, submission_data |
| `booking.submitted` | Booking request | service, customer, preferred_date/time, message |
| `newsletter.subscribed` | Newsletter signup | email, name, subscribed_at |
| `newsletter.unsubscribed` | Newsletter unsubscribe | email, unsubscribed_at |

### Webhook Configuration
- HMAC-SHA256 signature validation
- Custom headers support
- Retry with exponential backoff
- Auto-disable after 5 consecutive failures
- Test and resend from admin UI

---

## Appendix C: API Reference

Se separat API-dokumentation for fullständig referens of:
- REST endpoints
- GraphQL schema
- Authentication
- Rate limits
- Error codes

---

## Appendix D: Starter Templates

### Available Templates (10)

| Template | Category | Pages | Blog Posts | KB Articles | Target |
|----------|----------|-------|------------|-------------|--------|
| **Launchpad** | Startup | 5 | ✅ | ✅ | SaaS/Tech startups |
| **Momentum** | Startup | 4 | ✅ | — | Single-page dark design |
| **TrustCorp** | Enterprise | 5 | ✅ | ✅ | B2B companies |
| **SecureHealth** | Compliance | 7 | ✅ | ✅ | Healthcare providers (HIPAA) |
| **FlowWink Platform** | Platform | 5 | ✅ | ✅ | CMS showcase (dogfooding) |
| **Help Center** | Help Center | 4 | — | ✅ | Help center with KB + AI |
| **Service Pro** | Startup | 5 | ✅ | — | Service business + booking |
| **Digital Shop** | Platform | 5 | ✅ | — | E-commerce / digital products |
| **FlowWink Agency** | Platform | 5 | ✅ | ✅ | Agency white-label |
| **Consult Agency** | Platform | 5 | ✅ | ✅ | Consulting agency with AI matching |

### Template Features

Each template now includes:
- **FlowPilot configuration** — soul (purpose, tone, values) + initial objectives + priority skills
- **Blog posts** — SEO-optimized content relevant to the template niche
- **KB articles** — support content organized by category
- **Products** — e-commerce templates include sample products
- **Consultant profiles** — consulting templates include team expertise profiles
- **Required modules** — auto-enables relevant modules on install

### Template Export/Import System

The Template Manager (`/admin/template-export`) provides comprehensive template portability:

#### Export Formats
| format | Use Case | Includes |
|--------|----------|----------|
| **JSON** | Quick sharing, development | Template structure only |
| **TypeScript** | Codeintegration | Typed template code |
| **ZIP** | Cross-instance transfer | Template + all referenced images |

#### ZIP Export Features
- **Automatic Image Detection**: Scans all Blocks, branding, header/footer for image URLs
- **CORS-safe Download**: Uses edge function to fetch external images
- **Local Path Mapping**: Rewrites URLs to relative paths in `images/` folder
- **Manifest Included**: Contains original URLs for reference

#### ZIP Import Features
- **Image Upload**: Automatically uploads bundled images to storage
- **URL Restoration**: Rewrites local paths to new storage URLs
- **Progress Tracking**: Real-time feedback during import
- **Backward Compatible**: Falls back to JSON-only import if no images

#### Extracted Image Sources
- Page Blocks content (Hero backgrounds, Gallery images, Team photos)
- Blog post featured images
- Branding settings (Logo, Favicon, OG Image)
- Header/Footer settings (Logo)

---

## Appendix E: FlowPilot — Agentic CMS Operator

### Overview

FlowPilot is FlowWink's built-in AI agent that operates the CMS on behalf of administrators. It has two modes:

| Mode | Purpose | Access |
|------|---------|--------|
| **Operate** | Natural-language CMS control — write posts, analyze traffic, manage leads | `/admin/copilot` (default) |
| **Migrate** | AI-assisted site migration from external URLs | `/admin/copilot` → Migrate tab |

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SKILL REGISTRY                    │
│              (agent_skills table, DB)                │
│  ┌──────────┬──────────┬──────────┬──────────┐      │
│  │ content  │ crm      │ commerce │ analytics│      │
│  │ skills   │ skills   │ skills   │ skills   │      │
│  └──────────┴──────────┴──────────┴──────────┘      │
└────────────────────┬────────────────────────────────┘
                     │ OpenAI tool-calling format
          ┌──────────┴──────────┐
          │                     │
    ┌─────▼─────┐        ┌─────▼─────┐
    │ FlowPilot │        │  Public   │
    │ (internal)│        │   Chat    │
    │ agent-    │        │ chat-     │
    │ operate   │        │ completion│
    └─────┬─────┘        └─────┬─────┘
          │                     │
          └──────────┬──────────┘
                     │
              ┌──────▼──────┐
              │ agent-      │
              │ execute     │
              │ (unified    │
              │  executor)  │
              └──────┬──────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼───┐ ┌─────▼────┐ ┌───▼────┐
    │ edge:  │ │ module:  │ │ db:    │
    │ func   │ │ handler  │ │ table  │
    └────────┘ └──────────┘ └────────┘
```

### Skill Engine

Skills are stored in the `agent_skills` database table with full OpenAI function-calling `tool_definition` JSON. Each skill has:

| Field | Description |
|-------|-------------|
| `name` | Unique identifier (e.g. `write_blog_post`) |
| `handler` | Routing string: `edge:function-name`, `module:name`, `db:table`, `webhook:n8n` |
| `scope` | `internal` (FlowPilot only), `external` (public chat only), `both` |
| `category` | `content`, `crm`, `commerce`, `analytics`, `system` |
| `requires_approval` | If `true`, execution is gated until admin approves in Activity Feed |

#### Built-in Skills (11)

| Skill | Handler | Scope | Approval |
|-------|---------|-------|----------|
| `migrate_url` | `edge:copilot-action` | internal | No |
| `create_page_block` | `module:pages` | internal | No |
| `write_blog_post` | `module:blog` | internal | No |
| `send_newsletter` | `edge:send-newsletter` | internal | **Yes** |
| `create_campaign` | `module:campaigns` | internal | No |
| `add_lead` | `module:crm` | both | No |
| `search_web` | `edge:web-search` | both | No |
| `book_appointment` | `module:bookings` | external | No |
| `check_order` | `module:orders` | external | No |
| `update_settings` | `db:site_settings` | internal | **Yes** |
| `analyze_analytics` | `db:page_views` | internal | No |

### Data Model

#### `agent_skills` — Skill registry
Stores all available tools with OpenAI-compatible definitions. Skills can be enabled/disabled and scoped per agent.

#### `agent_activity` — Audit log
Every skill execution is logged with input, output, duration, status (`success`, `error`, `pending_approval`, `approved`), and the originating agent type.

#### `agent_memory` — Persistent context
Key-value store for agent state (e.g. user preferences, last analysis results). Categories: `context`, `preference`, `cache`. Supports TTL via `expires_at`.

### Edge Functions

| Function | Role |
|----------|------|
| `agent-execute` | Unified skill executor — validates scope, checks approval gates, routes to handler, logs activity |
| `agent-operate` | FlowPilot AI router — receives natural language, picks skills via tool calling, executes via `agent-execute`, summarizes results |
| `copilot-action` | Legacy migration assistant (to be refactored to use skill registry) |

### UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `CopilotPage` | `/admin/copilot` | Main FlowPilot page with mode tabs |
| `OperateChat` | Left panel (Operate mode) | Chat interface with quick actions and skill badges |
| `ActivityFeed` | Right panel (Operate mode) | Real-time activity log with approve button for gated actions |
| `CopilotChat` | Left panel (Migrate mode) | Migration conversation interface |
| `CopilotMigrationPreview` | Right panel (Migrate mode) | Block-by-block migration approval |

### Hooks

| Hook | Purpose |
|------|---------|
| `useAgentOperate` | Manages Operate mode — messages, skills, activity feed, approval flow |
| `useCopilot` | Manages Migrate mode — conversation, blocks, migration state |

### Security Model

- **Scope validation**: `agent-execute` enforces that internal skills cannot be called from public chat and vice versa
- **Approval gating**: Sensitive skills (newsletter, settings) return `202 pending_approval` and require admin action in Activity Feed
- **RLS policies**: All agent tables have proper row-level security; only admins can manage skills and view activity
- **Audit trail**: Every execution is logged in `agent_activity` with full input/output

### Roadmap

- [ ] Refactor `copilot-action` to load tool definitions from `agent_skills` table
- [ ] Agent memory read/write from FlowPilot conversations
- [ ] Automation layer: `agent_automations` table with schedule/event/signal triggers
- [ ] Cron-based skill execution
- [ ] Proactive suggestions (heartbeat system)

---

*Dokumentet underhålls of FlowWink-teamet. Senast uppdaterad mars 2026.*
