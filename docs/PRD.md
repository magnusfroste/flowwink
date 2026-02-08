# FlowWink - Product Requirements Document (PRD)

> **Version:** 2.2  
> **Last Updated:** February 2026  
> **Status:** Block Editor Previews Complete

---

## Executive Summary

**FlowWink** är ett modernt Content Management System byggt specifikt för svenska vårdgivare och organisationer som behöver:

- ✅ En komplett webbplats utan utvecklare
- ✅ Headless API för multi-kanal distribution
- ✅ AI-drivna verktyg för innehållshantering
- ✅ GDPR- och WCAG-efterlevnad inbyggd
- ✅ Svenskt språkstöd och lokalisering

### Unik Positionering: "Head + Headless"

Till skillnad från traditionella CMS (som bara levererar webbplats) eller rena headless-lösningar (som kräver separat frontend-utveckling), erbjuder FlowWink **båda**:

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

### 1.1 Block-baserad Sidbyggare

FlowWink använder en modulär block-arkitektur för flexibel innehållshantering:

#### Tillgängliga Block (50+ typer)

| Kategori | Block | Beskrivning |
|----------|-------|-------------|
| **Text & Media** | Text | Rik text med Tiptap-editor (eyebrow, titel, accent text) |
| | Image | Bild med alt-text och bildtext |
| | Gallery | Galleri med grid/carousel/masonry + lightbox |
| | Quote | Citat med författare och källa |
| | YouTube | Inbäddad YouTube-video med autoplay-inställningar |
| | Embed | Anpassad iframe/HTML-embed med aspektförhållande |
| | Table | Strukturerad data med kolumner och rader |
| **Layout** | Two-Column | Tvåkolumnslayout med text, bild, eyebrow, titel, accent text, CTA |
| | Separator | Visuell avdelare (linje/punkter/ornament/mellanrum) |
| | Tabs | Flikbaserat innehåll med ikoner och varianter |
| **Navigation** | Link Grid | Rutnät med länkkort och ikoner |
| | Hero | Sidhuvud med bakgrund (bild/video/färg), titel och CTA |
| | Announcement Bar | Toppbanner för meddelanden och erbjudanden |
| **Information** | Info Box | Informationsblock med variant (info/success/warning/highlight) |
| | Stats | Nyckeltal och statistik med ikoner och cards |
| | Accordion | Expanderbar FAQ/innehåll med bilder (Tiptap rich text) |
| | Article Grid | Rutnät med artikelkort |
| | Features | Funktioner/tjänster med ikoner, hover effects, card styles |
| | Timeline | Stegvis process eller historik med ikoner och beskrivningar |
| | Progress | Framstegsindikatorer och progress bars |
| | Countdown | Nedräkningstimer till specifikt datum (cards/hero/minimal) |
| | Marquee | Rullande text/ikoner för uppmärksamhet |
| **Social Proof** | Testimonials | Kundrecensioner med stjärnbetyg, citat, avatar |
| | Logos | Kundlogotyper/partners med gråskale-/scroll-variant |
| | Team | Teammedlemmar med bio, foto och sociala länkar |
| | Badge | Certifieringar och förtroendeikoner (SOC2, GDPR, etc.) |
| | Social Proof | Liveräknare, betyg och aktivitetsnotifieringar |
| **Konvertering** | CTA | Call-to-action med knappar och gradient |
| | Pricing | Pristabell med tiers, features och badges |
| | Comparison | Jämförelsetabell för produkter/planer |
| | Booking | Bokningsformulär eller embed (Calendly/Cal.com/HubSpot) |
| | Smart Booking | Inbyggt bokningssystem med tjänster, tillgänglighet och kalender |
| | Form | Anpassningsbart formulär med fältvalidering (default/card/minimal) |
| | Newsletter | Nyhetsbrev-anmälan med GDPR-samtycke (default/card/minimal) |
| | Floating CTA | Scroll-triggad CTA som dyker upp vid scroll (bar/card/pill) |
| | Notification Toast | Dynamiska aktivitetsnotifieringar (köp, registreringar) |
| **Kontakt** | Contact | Kontaktinformation med adress och öppettider |
| | Map | Google Maps-embed med adress |
| **Interaktivt** | Chat | Inbäddad AI-chatt med kontextmedvetenhet |
| | Chat Launcher | ChatGPT-stil launcher som routar till /chat med initial prompt |
| | Popup | Triggade popups (scroll/tid/exit-intent) |
| **Knowledge Base** | KB Hub | Kunskapsbas-landningssida med kategorier |
| | KB Search | Sökblock för kunskapsbas |
| | KB Featured | Utvalda KB-artiklar |
| | KB Accordion | FAQ i accordion-format |
| **E-commerce** | Products | Produktrutnät från databas med varukorg |
| | Cart | Varukorg med summering och checkout |

#### Block-funktioner

- **Drag & Drop**: Omordna block fritt med @dnd-kit
- **Duplicera/Ta bort**: Snabb hantering
- **Animationer**: Per-block animeringar (fade, slide, scale)
- **Spacing**: Konfigurerbar padding och margin
- **Anchor ID**: Sätt ett ID för in-page navigation (t.ex. `#kontakta-oss`)
- **Hide/Show**: Dölj block från publika sidan utan att ta bort (Webflow-stil)
- **Rich Previews**: Block editors visar realistiska previews som matchar publik rendering
- **Responsivt**: Alla block anpassas automatiskt

#### Hide/Show Block (Webflow-stil)

Varje block kan döljas från publika sidan utan att tas bort:

**Funktioner:**
- **Toggle-knapp**: Ögon-ikon i block-toolbaren (👁/🙈)
- **Visuell feedback**: Dolda block visas med 40% opacity och "Hidden" badge i editorn
- **Persistens**: `hidden`-egenskapen sparas i blockets JSON
- **Public rendering**: Dolda block renderas inte alls på publika sidor

**Användningsfall:**
- Dölj block som inte är klara för publicering
- Testa olika block-kombinationer utan att radera
- Behåll block för framtida användning

#### Block Editor Previews

Alla block editors visar rika previews som matchar den publika renderingen:

**Förbättrade Block (Feb 2026):**
- **FormBlockEditor** — Visar fält, labels, submit-knapp, variant-stöd
- **AccordionBlockEditor** — Riktiga Accordion-komponenter med expand/collapse
- **TwoColumnBlockEditor** — Eyebrow, titel med accent text, CTA, andra bilden
- **TextBlockEditor** — Eyebrow, titel med accent/storlek i preview
- **ChatBlockEditor** — Meddelandebubblor, input-fält, send-knapp
- **ChatLauncherBlockEditor** — Sparkles-input, quick action pills
- **NewsletterBlockEditor** — Email-input, subscribe-knapp, variant-stöd
- **CountdownBlockEditor** — Nedräkningsrutor med siffror, variant-stöd
- **FloatingCTABlockEditor** — CTA-bar/card/pill med knappar
- **NotificationToastBlockEditor** — Toast-mockup med ikon, titel, meddelande
- **FeaturesBlockEditor** — Rich preview med ikoner, hover effects
- **TestimonialsBlockEditor** — Citat, avatar, stjärnbetyg
- **PricingBlockEditor** — Priskort, features, badges
- **TimelineBlockEditor** — Stegvis process med ikoner
- **SocialProofBlockEditor** — Liveräknare, betyg
- **StatsBlockEditor** — Statistik med ikoner och cards
- **TeamBlockEditor** — Teammedlemmar med bio, foto
- **ContactBlockEditor** — Kontaktinfo, öppettider, 2-kolumns

**Övriga Block:**
- Alla andra block har redan rika previews eller är DB-beroende (kan inte visa statisk preview)

#### Anchor-länkar (In-page Navigation)

Varje block kan tilldelas ett **Anchor ID** för att möjliggöra in-page navigation:

1. **Sätta Anchor ID**: Klicka på `#`-ikonen i block-toolbaren
2. **Länka till block**: Använd URL:er som `#kontakta-oss` i knappar eller navigation
3. **Smooth Scroll**: Automatisk mjuk scrollning vid klick på anchor-länkar
4. **URL-stöd**: Direktlänkar som `/sida#kontakta-oss` fungerar vid sidladdning

**Användningsfall:**
- Navigation inom en lång sida (t.ex. hero → kontaktformulär)
- Header-meny med snabblänkar till sektioner
- CTA-knappar som scrollar till formulär

### 1.2 Mediabibliotek

- **Uppladdning**: Drag & drop eller filväljare
- **WebP-konvertering**: Automatisk optimering
- **Unsplash-integration**: Sök och använd stockbilder
- **Mappar**: Automatisk organisering (pages/imports)
- **Sök & Filter**: Hitta bilder snabbt med folder-tabs
- **Bulk-hantering**: Markera flera, radera samtidigt
- **Lightbox**: Fullskärmsvisning med tangentbordsnavigering
- **Återanvändning**: Välj från biblioteket i alla block
- **Alt-text**: WCAG-kompatibel bildhantering

### 1.3 Editor-arkitektur

FlowWink använder två olika editor-typer beroende på innehållstyp:

| Innehållstyp | Editor | Fokus |
|--------------|--------|-------|
| **Pages** | Block-system | Layout-komponering (Hero, Features, CTA, etc.) |
| **Blog** | Tiptap Rich Text | Dokument-fokus (text, bilder, citat) |
| **Newsletter** | Tiptap Rich Text | Email-formaterat innehåll |

**Fördelar:**
- Blog och Newsletter delar samma editor-upplevelse
- Content Campaigns kan publicera direkt till Blog utan konvertering
- Enklare för skribenter - fokus på innehåll, inte layout
- AI-genererat innehåll passar naturligt

---

## 2. Editorial Workflow

### 2.1 Rollbaserat System

| Roll | Rättigheter |
|------|-------------|
| **Writer** | Skapa utkast, redigera egna sidor, skicka för granskning |
| **Approver** | Allt Writer + Granska, godkänn/avvisa, publicera |
| **Admin** | Full åtkomst + Användarhantering, systeminställningar |

### 2.2 Statusflöde

```
┌─────────┐     ┌───────────┐     ┌───────────┐
│  DRAFT  │ ──► │ REVIEWING │ ──► │ PUBLISHED │
│ (Utkast)│     │(Granskas) │     │(Publicerad)│
└─────────┘     └───────────┘     └───────────┘
      ▲               │
      │               │ Avvisad
      └───────────────┘
```

### 2.3 Versionshantering

- **Automatiska versioner**: Skapas vid publicering
- **Versionshistorik**: Se alla tidigare versioner
- **Återställning**: Återgå till tidigare version
- **Jämförelse**: Se skillnader mellan versioner

### 2.4 Schemalagd Publicering

- **Framtida publicering**: Välj datum och tid
- **Automatisk aktivering**: Cron-jobb publicerar vid rätt tid
- **Visuell indikator**: Klocka visar schemalagda sidor
- **Avbryt/Ändra**: Justera eller ta bort schema

### 2.5 Förhandsgranskning

- **Live Preview**: Se sidan innan publicering
- **Nytt fönster**: Öppnas separat från admin
- **Tidsbegränsad**: Data raderas efter 1 timme
- **Banner**: Tydlig markering "FÖRHANDSGRANSKNING"

---

## 3. Branding & Design System

### 3.1 Templates (Complete Packages)

Templates är kompletta paket som innehåller:
- **Förkonfigurerade sidor** (startsida, om oss, tjänster, kontakt, etc.)
- **Block-innehåll** (redan ifyllda med relevant text och bilder)
- **Branding-inställningar** (färger, typografi, logotyp, etc.)

| Template | Kategori | Sidor | Målgrupp |
|----------|----------|-------|----------|
| **Launchpad** | Startup | 5 | SaaS/Tech startups |
| **TrustCorp** | Enterprise | 5 | B2B companies |
| **SecureHealth** | Compliance | 7 | Healthcare providers |
| **FlowWink Platform** | Platform | 5 | CMS showcase |

#### Template Selection
Varje template har sina egna branding-inställningar. När du väljer en template:
- Alla sidor skapas automatiskt med förkonfigurerat innehåll
- Branding-inställningar appliceras (färger, typografi, logotyp)
- Du kan anpassa allt efter behov (ändra block, färger, innehåll)

#### Reset to Template Defaults
BrandingSettingsPage visar vilken template som är aktiv och erbjuder "Reset to Template Defaults"-knapp för att återställa branding till template-standarden.

### 3.2 Custom Themes (Brand Guide Assistant)

**Funktion**: Analysera befintlig webbplats och extrahera branding automatiskt.

**Process**:
1. Ange URL till befintlig webbplats
2. AI analyserar färger, typografi, logotyper
3. Granska mappning mot CMS-variabler
4. Applicera direkt eller spara som eget tema

**Kräver**: FIRECRAWL_API_KEY

### 3.3 Anpassningsmöjligheter

#### Färger (HSL-format med WCAG-validering)
- **Primärfärg** — med kontrastvalidering (AA/AAA)
- **Sekundärfärg** — med kontrastvalidering
- **Accentfärg** — med kontrastvalidering
- **Bakgrundsfärg**
- **Förgrundsfärg**

**WCAG Color Contrast Validation:**
- Alla färgpickers har inbyggd kontrastvalidering
- Visuell indikator för AA (4.5:1) och AAA (7:1) kompatibilitet
- Hjälp-text visar kontrastförhållande och status

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

| Inställning | Beskrivning |
|-------------|-------------|
| Site Title Template | Mall för sidtitlar (t.ex. "%s | Företagsnamn") |
| Default Meta Description | Standardbeskrivning för sidor |
| Open Graph Image | Standardbild för delning i sociala medier |
| Twitter Handle | @användarnamn för Twitter Cards |
| Google Verification | Verifieringskod för Search Console |
| Robots Indexing | Global indexeringsinställning |

### 4.2 Per-sida SEO

- **Anpassad titel**: Override för specifik sida
- **Meta description**: Unik beskrivning per sida
- **noindex/nofollow**: Exkludera från sökmotorer
- **Canonical URL**: Förhindra duplicerat innehåll

### 4.3 Performance-optimering

| Funktion | Beskrivning |
|----------|-------------|
| **Edge Caching** | In-memory cache med konfigurerbar TTL |
| **Lazy Loading** | Bilder laddas vid scroll |
| **WebP-konvertering** | Automatisk bildoptimering |
| **Link Prefetching** | Förladdning av länkar |

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

**TTL**: Konfigurerbar (standard 5 minuter)  
**Invalidering**: Automatisk vid publicering/avpublicering

---

## 5. Public Site Features

### 5.0 Developer Tools (Hidden)

Developer Tools är en dold sektion för utvecklare att testa och debugga:

**Åtkomst:** `/admin/developer-tools` eller sök med `#developer-tools`

**Not synlig i side panel** - Endast direkt URL-åtkomst eller sökbar via `#`

#### Webhook Logger
- Logga webhooks istället för att skicka till externa API:er
- Visa payload-struktur
- Testa event triggers
- Inga externa API-anrop

#### Block Previewer
- Förhandsgranska custom blocks utan att skapa sidor
- Testa olika varianter
- Hot reload support
- Mock data generator

#### Mock Data Generator
- Generera test data för utveckling
- Test sidor, blocks, webhooks
- Anpassningsbara data sets

---

### 5.1 Dynamisk Navigation

- **Automatisk meny**: Baserat på publicerade sidor
- **Menyordning**: Drag & drop i admin
- **Visa/Dölj**: Kontrollera synlighet per sida
- **Mobil-meny**: Responsiv hamburger-meny
- **Konfigurerbar startsida**: Valfri sida som hem

### 5.2 Footer

#### Anpassningsbara Sektioner
- Varumärke & Logotyp
- Snabblänkar
- Kontaktinformation
- Öppettider

#### Funktioner
- Drag & drop-ordning
- Visa/dölj sektioner
- Sociala medier-länkar (Facebook, Instagram, LinkedIn, Twitter, YouTube)
- Dynamiska juridiska länkar

### 5.3 Cookie Banner (GDPR)

- **Samtycke**: "Acceptera alla" / "Endast nödvändiga"
- **Lagring**: localStorage med status
- **Anpassningsbar**: Text, knappar, länk till policy
- **Standardpolicy**: Svensk GDPR-mall inkluderad

### 5.4 Underhållslägen

| Läge | Effekt |
|------|--------|
| **Blockera sökmotorer** | noindex/nofollow på alla sidor |
| **Kräv inloggning** | Blockerar all publik åtkomst |
| **Underhållsläge** | Visar underhållsmeddelande med förväntad sluttid |

### 5.5 Mörkt Läge

- **Tema-växlare**: Ljus/Mörk/System
- **Alternativ logotyp**: Separat logo för mörkt läge
- **CSS-variabler**: Automatisk anpassning
- **Persistence**: Sparas mellan sessioner

---

## 6. AI-Powered Features

### 6.1 AI Chat System

#### Multi-Provider Arkitektur

FlowWink stödjer fem olika AI-providers för maximal flexibilitet:

| Provider | Användning | Data Location | Setup |
|----------|------------|---------------|-------|
| **Lovable AI** | Standard molntjänst, ingen setup krävs | Moln (EU) | Ingen API-nyckel behövs |
| **OpenAI** | GPT-modeller med anpassad konfiguration | OpenAI Cloud | API-nyckel (secret) |
| **Google Gemini** | Google AI-modeller | Google Cloud | API-nyckel (secret) |
| **Private LLM** | Självhostad OpenAI-kompatibel endpoint | On-premise/Privat | Endpoint URL, valfri API-nyckel |
| **N8N Webhook** | Agentic workflows med AI-agent | Konfigurerbart | Webhook URL |

#### Integration Testing

Alla AI-providers har inbyggda testfunktioner:
- **Test Connection**: Verifiera att anslutningen fungerar
- **Active Provider Indicator**: Visa vilken provider som är aktiv
- **Error Handling**: Tydliga felmeddelanden vid konfigurationsproblem

#### Private/Local LLM (HIPAA-kompatibel)

För organisationer med strikta datakrav (HIPAA, GDPR, interna policies):

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
- **Endpoint**: OpenAI-kompatibel URL (t.ex. `https://api.autoversio.ai/v1`)
- **Model**: Modellnamn (t.ex. `llama3`, `mistral`, custom)
- **API Key**: Valfri autentisering

**Fördelar**:
- ✅ Data lämnar aldrig din infrastruktur
- ✅ Full kontroll över modell och inferens
- ✅ HIPAA/GDPR-kompatibel by design
- ✅ Ingen vendor lock-in

#### N8N AI Agent Integration

Koppla chatten till N8N för avancerade AI-agenter med verktyg:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Chat     │ ──► │  Edge Function  │ ──► │  N8N Workflow   │
│   "Boka tid"    │     │ + sessionId     │     │  AI Agent Node  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │   Agent Tools   │
                                              │ - Cal.com       │
                                              │ - Google Sheets │
                                              │ - Email         │
                                              │ - Custom APIs   │
                                              └─────────────────┘
```

**Webhook Types**:
- **Chat Webhook**: N8N Chat node med session memory (rekommenderad)
- **Generic Webhook**: OpenAI-kompatibelt format med full historik

**Session Memory**: SessionId skickas automatiskt för konversationsminne i N8N.

#### Leveranslägen

- **Dedikerad sida**: /chat
- **CMS-block**: Inbäddat i sidor
- **Floating Widget**: Flytande ikon på alla sidor

#### Context Augmented Generation (CAG)

- **Kunskapsbas**: Publicerade sidor som kontext
- **Selektiv**: Välj vilka sidor som inkluderas
- **Token-limit**: Konfigurerbar maxgräns
- **Per-sida toggle**: Inkludera/exkludera specifika sidor

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

**Intelligent Content Migration** från valfri webbplats:

| Feature | Description |
|---------|-------------|
| **Platform Detection** | Auto-detects WordPress, Wix, Squarespace, Webflow, Shopify, Ghost, HubSpot, Drupal, SiteVision, Episerver |
| **Video Extraction** | YouTube, Vimeo and embedded iframes |
| **Image Extraction** | Regular images, lazy-loaded, background-images |
| **Screenshot Analysis** | Visual context for AI block mapping |
| **22+ Block Types** | Hero, text, gallery, team, stats, testimonials, pricing, features, accordion, etc. |
| **Local Storage** | Optional download of all images to media library |
| **Smart Page Filtering** | Excludes pagination, archives, admin pages, search results, feed URLs |
| **Date-based Filtering** | Filters out old content (lastmod > 24 months) from sitemap |
| **Duplicate Detection** | URL normalization and slug deduplication prevents duplicate imports |
| **Sitemap Limit** | Max 50 sitemap pages to focus on active content |

**Usage:** Admin → Pages → Import Page → Enter URL → AI analyzes and maps to blocks

## 7. Headless Content API

### 7.1 REST Endpoints

#### Lista alla publicerade sidor
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
      "blocks": [ ... ]
    }
  ]
}
```

#### Hämta specifik sida
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
  blocks(pageSlug: String!, type: String): [Block!]!
}

type Page {
  id: ID!
  title: String!
  slug: String!
  status: String!
  meta: JSON
  blocks: [Block!]!
}

type Block {
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
    blocks {
      type
      data
    }
  }
}
```

### 7.3 Rich Text Format

Alla rich text-fält (Text, Two-Column, Accordion, InfoBox) serialiseras som **Tiptap JSON** för maximal portabilitet:

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

Visuellt diagram som demonstrerar innehållsflöde från CMS till olika kanaler:

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

Översikt av alla 50+ block-typer med:
- Antal instanser i publicerade sidor
- JSON-preview av block-struktur
- Dokumentation av data-format

### 8.4 Block Data Structures

#### Konverteringsblock

**Testimonials Block**
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

**Pricing Block**
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

**Comparison Block**
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

**Booking Block (Enhanced)**
```typescript
interface BookingBlockData {
  title?: string;
  description?: string;
  mode: 'embed' | 'form';
  // Embed mode
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
  // Webhook integration
  triggerWebhook?: boolean;
  variant?: 'default' | 'card' | 'minimal';
}
```

#### Social Proof Block

**Team Block**
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

**Logos Block**
```typescript
interface LogosBlockData {
  title?: string;
  subtitle?: string;
  logos: {
    id: string;
    name: string;
    logo: string;
    url?: string;
  }[];
  columns?: 3 | 4 | 5 | 6;
  layout?: 'grid' | 'carousel' | 'scroll';
  variant?: 'default' | 'grayscale' | 'bordered';
  logoSize?: 'sm' | 'md' | 'lg';
}
```

**Features Block**
```typescript
interface FeaturesBlockData {
  title?: string;
  subtitle?: string;
  features: {
    id: string;
    icon: string;
    title: string;
    description: string;
    url?: string;
  }[];
  columns?: 2 | 3 | 4;
  layout?: 'grid' | 'list';
  variant?: 'default' | 'cards' | 'minimal' | 'centered';
  iconStyle?: 'circle' | 'square' | 'none';
}
```

**Timeline Block**
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

| Funktion | Implementation |
|----------|----------------|
| **Audit Logging** | Alla användaråtgärder loggas |
| **Cookie Consent** | Samtyckesbanner med val |
| **Data Retention** | Konfigurerbar lagringstid |
| **Privacy Policy** | Mall för integritetspolicy |
| **Right to Erasure** | Stöd för radering av data |

### 9.2 WCAG 2.1 AA

- **Semantisk HTML**: Korrekt användning av element
- **Alt-text**: Obligatorisk för bilder
- **Kontrastförhållanden**: Verifierade färgkombinationer
- **Tangentbordsnavigering**: Full stöd
- **Focus States**: Synliga fokusindikatorer

### 9.3 Row Level Security (RLS)

Supabase RLS säkerställer dataåtkomst per användare:

```sql
-- Endast publicerade sidor för anonyma användare
CREATE POLICY "Public can view published pages" 
ON public.pages 
FOR SELECT 
TO anon 
USING (status = 'published');

-- Writers kan bara redigera sina utkast
CREATE POLICY "Writers can edit own drafts"
ON public.pages
FOR UPDATE
USING (
  created_by = auth.uid() 
  AND status = 'draft'
);
```

### 9.4 HIPAA-kompatibilitet

För vårdorganisationer som kräver HIPAA:

- **Lokal AI**: Självhostad OpenAI-kompatibel endpoint
- **Ingen molndata**: Chatt-konversationer stannar lokalt
- **Audit Trail**: Komplett loggning av åtkomst

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
│   Supabase (via Lovable Cloud)                             │
│   ├── PostgreSQL Database                                   │
│   ├── Row Level Security (RLS)                             │
│   ├── Edge Functions (Deno)                                │
│   ├── Storage (S3-compatible)                              │
│   └── Realtime Subscriptions                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                      EDGE FUNCTIONS                         │
│                                                             │
│   ├── chat-completion (AI Chat)                            │
│   ├── content-api (REST/GraphQL)                           │
│   ├── get-page (Cached page fetch)                         │
│   ├── migrate-page (AI import)                             │
│   ├── analyze-brand (Brand extraction)                     │
│   ├── process-image (WebP conversion)                      │
│   ├── create-user (Admin user creation)                    │
│   ├── invalidate-cache (Cache management)                  │
│   └── publish-scheduled-pages (Cron job)                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.2 Database Schema

#### Core Tables

| Tabell | Beskrivning |
|--------|-------------|
| `pages` | Sidor med content_json, meta_json, status |
| `page_versions` | Versionshistorik för sidor |
| `profiles` | Användarprofiler |
| `user_roles` | Roll-tilldelningar (writer/approver/admin) |
| `site_settings` | Globala inställningar (key-value) |
| `audit_logs` | Händelselogg för GDPR |
| `chat_conversations` | AI-chattkonversationer |
| `chat_messages` | Meddelanden i konversationer |

### 10.3 Key Dependencies

| Paket | Användning |
|-------|------------|
| `@tiptap/*` | Rich text editor |
| `@dnd-kit/*` | Drag and drop |
| `@tanstack/react-query` | Data fetching & caching |
| `react-helmet-async` | SEO meta tags |
| `next-themes` | Dark mode |
| `lucide-react` | Icons |
| `sonner` | Toast notifications |

---

## 11. Unique Selling Points

### 11.1 Jämfört med Contentful/Sanity

| FlowWink | Contentful/Sanity |
|--------|-------------------|
| ✅ Inbyggd webbplats | ❌ Kräver separat frontend |
| ✅ Svensk lokalisering | ❌ Engelska UI |
| ✅ Vårdfokuserad | ❌ Generisk |
| ✅ Ingen utvecklare behövs | ❌ Kräver utvecklare |

### 11.2 Jämfört med WordPress

| FlowWink | WordPress |
|--------|-----------|
| ✅ Modern React-stack | ❌ PHP/Legacy |
| ✅ Block-baserat native | ❌ Gutenberg addon |
| ✅ Headless API inbyggt | ❌ REST API begränsat |
| ✅ GDPR/WCAG inbyggt | ❌ Kräver plugins |

### 11.3 Jämfört med Strapi

| FlowWink | Strapi |
|--------|--------|
| ✅ Komplett lösning | ❌ Bara backend |
| ✅ Zero-config | ❌ Kräver hosting |
| ✅ AI-funktioner | ❌ Ingen AI |
| ✅ Managed | ❌ Self-hosted |

---

## 12. Target Users

### 12.1 Primär Målgrupp

**Svenska vårdgivare**
- Vårdcentraler
- Privata kliniker
- Tandläkarmottagningar
- Rehabiliteringscentra

**Krav**:
- GDPR-efterlevnad
- WCAG-tillgänglighet
- Svenskt språk
- Professionell design
- Enkel administration

### 12.2 Sekundär Målgrupp

**Organisationer med liknande behov**
- Non-profit organisationer
- Utbildningsinstitutioner
- Myndigheter och kommuner
- Professionella tjänsteföretag

---

## Appendix A: Roadmap

### Fas 1: MVP ✅ (Complete)
- Block-baserad sidbyggare (46 block types)
- Editorial workflow (Draft → Review → Published)
- Branding & SEO
- AI Chat & Import
- Headless API (REST + GraphQL)

### Fas 2: Core Modules ✅ (Complete)
- **Blog Module** — Posts, categories, tags, author profiles, RSS feed
- **Newsletter Module** — Subscribers, campaigns, open/click tracking, GDPR export
- **Integration Module** — Webhooks, N8N templates, event system

### Fas 3: Process Automation ✅ (Complete)

| Module | Priority | Synergy | Status |
|--------|----------|---------|--------|
| **Booking/Scheduling** | High | Newsletter (reminders), Webhooks (calendar sync) | ✅ Complete |
| **Lead CRM** | Medium | Forms → Pipeline, Newsletter nurturing | ✅ Complete |
| **Conversion Blocks** | High | Social proof, pricing tables | ✅ Complete |
| **Interactive Blocks** | High | Tabs, countdown, progress | ✅ Complete |

#### Booking Module Features

**Basic Booking Block**:
- **Form Mode**: Built-in appointment request form
- **Embed Mode**: Calendly, Cal.com, HubSpot integration
- **Webhook Trigger**: Automatic `booking.submitted` event for n8n workflows

**Smart Booking Block** (Native System):
- **Service Management**: Create services with name, duration, price, description
- **Availability Calendar**: Configure available days and time slots per service
- **Multi-step Flow**: Service selection → Date/time picker → Customer details → Confirmation
- **Week View**: Visual calendar with available slots
- **Real-time Availability**: Shows only bookable time slots
- **Admin Dashboard**: View, manage, and track all bookings
- **Status Tracking**: Pending, confirmed, cancelled, completed
- **Webhook Integration**: Triggers `booking.created` event for automation

#### Conversion Blocks Added
- **Testimonials**: Customer reviews with star ratings, carousel/grid layouts
- **Pricing**: Tiered pricing tables with features and CTA buttons
- **Comparison**: Feature comparison tables for plans/products
- **Team**: Staff profiles with photos, bio, and social links
- **Logos**: Client/partner logos with grayscale and scroll variants
- **Features**: Service/feature grids with icons
- **Timeline**: Step-by-step process visualization

#### Interactive Blocks Added (January 2025)
- **Badge**: Trust badges and certifications (SOC2, GDPR, ISO)
- **Social Proof**: Live counters, ratings, and activity indicators
- **Notification Toast**: Dynamic activity notifications (purchases, signups)
- **Floating CTA**: Scroll-triggered call-to-action bars
- **Marquee**: Scrolling text/icons for announcements
- **Tabs**: Tabbed content with multiple orientations and variants
- **Countdown**: Live countdown timers with customizable labels
- **Progress**: Progress bars and circular indicators
- **Embed**: Custom iframe/HTML embeds with aspect ratio control
- **Table**: Structured data tables with styling options
- **Announcement Bar**: Top banner for important messages

#### Block Editor Previews (February 2026)
**Objective**: Ensure all block editors show rich previews matching public rendering

**Completed Blocks (18)**:
- FormBlockEditor — Fields, labels, submit button, variant support
- AccordionBlockEditor — Real Accordion components with expand/collapse
- TwoColumnBlockEditor — Eyebrow, title with accent text, CTA, second image
- TextBlockEditor — Eyebrow, title with accent/size in preview
- ChatBlockEditor — Message bubbles, input field, send button
- ChatLauncherBlockEditor — Sparkles input, quick action pills
- NewsletterBlockEditor — Email input, subscribe button, variant support
- CountdownBlockEditor — Countdown boxes with numbers, variant support
- FloatingCTABlockEditor — CTA bar/card/pill with buttons
- NotificationToastBlockEditor — Toast mockup with icon, title, message
- FeaturesBlockEditor — Rich preview with icons, hover effects
- TestimonialsBlockEditor — Quotes, avatar, star ratings
- PricingBlockEditor — Pricing cards, features, badges
- TimelineBlockEditor — Step-by-step process with icons
- SocialProofBlockEditor — Live counters, ratings
- StatsBlockEditor — Stats with icons and cards
- TeamBlockEditor — Team members with bio, photo
- ContactBlockEditor — Contact info, opening hours, 2-column layout

**Other Blocks**: Already have rich previews or are DB-dependent (Booking, Cart, Products, KB blocks, etc.)

#### Lead Generation Loop (Flowwink Loop)

The Flowwink Loop is the unified lead capture and enrichment pipeline that automatically converts all visitor interactions into enriched CRM contacts:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LEAD GENERATION LOOP                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│   │  Forms   │  │Newsletter│  │ Bookings │  │   Chat   │               │
│   │  Block   │  │  Block   │  │  Block   │  │  Widget  │               │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘               │
│        │             │             │             │                      │
│        └─────────────┴──────┬──────┴─────────────┘                      │
│                             ▼                                           │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    LEAD CAPTURE ENGINE                          │  │
│   │  • Auto-create lead if new email                                │  │
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
| Email open | 3 | Low |
| Page visit | 2 | Low |

**Automatic Enrichment**:
- When a new company is created from email domain matching, the `enrich-company` edge function is triggered automatically
- Company enrichment uses Firecrawl to scrape the website and AI to extract: industry, size, phone, address, description
- Lead qualification uses AI to generate summaries and suggest status changes based on activity history

### Fas 4: Enterprise (Future)
- SSO/SAML
- Multi-site support
- Advanced analytics & A/B testing
- API rate limiting
- Dedicated support SLA

### Backlog: Account & Data Management

#### Account Deletion with Data Preservation
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
- `global_blocks` (created_by, updated_by)

**Proposed Strategies** (to be decided):
1. **Soft Delete**: Add `deleted_at` and `is_deleted` to profiles. Hide from UI, preserve content with original author. Account restorable by admin.
2. **Anonymize Author**: Delete account but keep content with author shown as "Deleted User". Irreversible.
3. **Transfer then Delete**: Require transferring content to another user before allowing deletion. Clean handover.
4. **Full Cascade Delete**: Delete user AND all their content. Simple but destructive.

**Implementation Considerations**:
- Add `deleted_at TIMESTAMP` and `is_deleted BOOLEAN DEFAULT false` to profiles table
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
| `form.submitted` | Form submitted | form_name, block_id, page_id, submission_data |
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

Se separat API-dokumentation för fullständig referens av:
- REST endpoints
- GraphQL schema
- Authentication
- Rate limits
- Error codes

---

## Appendix D: Starter Templates

### Available Templates

| Template | Category | Pages | Target |
|----------|----------|-------|--------|
| **Launchpad** | Startup | 5 | SaaS/Tech startups |
| **TrustCorp** | Enterprise | 5 | B2B companies |
| **SecureHealth** | Compliance | 7 | Healthcare providers |
| **FlowWink Platform** | Platform | 5 | CMS showcase |

### SecureHealth Template Highlights
- HIPAA-compliant messaging
- Dedicated Appointments page (`/boka`)
- Service-based booking with 5 pre-configured medical services
- Webhook integration for n8n calendar sync
- Patient resources and FAQ
- Team profiles for medical staff
- Emergency contact information

### Template Export/Import System

The Template Manager (`/admin/template-export`) provides comprehensive template portability:

#### Export Formats
| Format | Use Case | Includes |
|--------|----------|----------|
| **JSON** | Quick sharing, development | Template structure only |
| **TypeScript** | Code integration | Typed template code |
| **ZIP** | Cross-instance transfer | Template + all referenced images |

#### ZIP Export Features
- **Automatic Image Detection**: Scans all blocks, branding, header/footer for image URLs
- **CORS-safe Download**: Uses edge function to fetch external images
- **Local Path Mapping**: Rewrites URLs to relative paths in `images/` folder
- **Manifest Included**: Contains original URLs for reference

#### ZIP Import Features
- **Image Upload**: Automatically uploads bundled images to storage
- **URL Restoration**: Rewrites local paths to new storage URLs
- **Progress Tracking**: Real-time feedback during import
- **Backward Compatible**: Falls back to JSON-only import if no images

#### Extracted Image Sources
- Page block content (Hero backgrounds, Gallery images, Team photos)
- Blog post featured images
- Branding settings (Logo, Favicon, OG Image)
- Header/Footer settings (Logo)

---

*Dokumentet underhålls av FlowWink-teamet. Senast uppdaterad februari 2026.*
