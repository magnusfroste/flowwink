# FlowWink - Product Requirements Document (PRD)

> **Version:** 2.1  
> **Last Updated:** January 2025  
> **Status:** Core Modules + Conversion Blocks Complete

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
| **Text & Media** | Text | Rik text med Tiptap-editor |
| | Image | Bild med alt-text och bildtext |
| | Gallery | Galleri med grid/carousel/masonry + lightbox |
| | Quote | Citat med författare och källa |
| | YouTube | Inbäddad YouTube-video med autoplay-inställningar |
| | Embed | Anpassad iframe/HTML-embed med aspektförhållande |
| | Table | Strukturerad data med kolumner och rader |
| **Layout** | Two-Column | Tvåkolumnslayout med text och bild |
| | Separator | Visuell avdelare (linje/punkter/ornament/mellanrum) |
| | Tabs | Flikbaserat innehåll med ikoner och varianter |
| **Navigation** | Link Grid | Rutnät med länkkort och ikoner |
| | Hero | Sidhuvud med bakgrund (bild/video/färg), titel och CTA |
| | Announcement Bar | Toppbanner för meddelanden och erbjudanden |
| **Information** | Info Box | Informationsblock med variant (info/success/warning/highlight) |
| | Stats | Nyckeltal och statistik med ikoner |
| | Accordion | Expanderbar FAQ/innehåll med bilder |
| | Article Grid | Rutnät med artikelkort |
| | Features | Funktioner/tjänster med ikoner och beskrivningar |
| | Timeline | Stegvis process eller historik |
| | Progress | Framstegsindikatorer och progress bars |
| | Countdown | Nedräkningstimer till specifikt datum |
| | Marquee | Rullande text/ikoner för uppmärksamhet |
| **Social Proof** | Testimonials | Kundrecensioner med stjärnbetyg, carousel/grid-layout |
| | Logos | Kundlogotyper/partners med gråskale-/scroll-variant |
| | Team | Teammedlemmar med bio, foto och sociala länkar |
| | Badge | Certifieringar och förtroendeikoner (SOC2, GDPR, etc.) |
| | Social Proof | Liveräknare, betyg och aktivitetsnotifieringar |
| **Konvertering** | CTA | Call-to-action med knappar och gradient |
| | Pricing | Pristabell med tiers, features och badges |
| | Comparison | Jämförelsetabell för produkter/planer |
| | Booking | Bokningsformulär eller embed (Calendly/Cal.com/HubSpot) |
| | Smart Booking | Inbyggt bokningssystem med tjänster, tillgänglighet och kalender |
| | Form | Anpassningsbart formulär med fältvalidering |
| | Newsletter | Nyhetsbrev-anmälan med GDPR-samtycke |
| | Floating CTA | Scroll-triggad CTA som dyker upp vid scroll |
| | Notification Toast | Dynamiska aktivitetsnotifieringar (köp, registreringar) |
| **Kontakt** | Contact | Kontaktinformation med adress och öppettider |
| | Map | Google Maps-embed med adress |
| **Interaktivt** | Chat | Inbäddad AI-chatt med kontextmedvetenhet |
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
- **Förhandsgranskning**: Se ändringar i realtid
- **Responsivt**: Alla block anpassas automatiskt

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

### 3.1 Fördefinierade Teman

| Tema | Beskrivning |
|------|-------------|
| **Klassisk Sjukvård** | Traditionell medicinsk blå/vit |
| **Modern Minimalist** | Ren, avskalad estetik |
| **Varm & Välkomnande** | Varma, inbjudande toner |
| **Professionell & Pålitlig** | Förtroendeingivande färger |

### 3.2 Anpassningsmöjligheter

#### Färger (HSL-format)
- Primärfärg
- Sekundärfärg  
- Accentfärg
- Bakgrundsfärg
- Förgrundsfärg

#### Typografi
- Rubrikfont (Google Fonts)
- Brödtextfont (Google Fonts)
- Dynamisk fontladdning

#### Utseende
- Kantradier (rounded corners)
- Skuggintensitet
- Mörkt/Ljust läge

### 3.3 AI Brand Guide Assistant

**Funktion**: Analyserar befintlig webbplats och extraherar branding automatiskt.

**Process**:
1. Ange URL till befintlig webbplats
2. AI analyserar färger, typografi, logotyper
3. Granska mappning mot CMS-variabler
4. Applicera direkt eller spara som eget tema

**Kräver**: FIRECRAWL_API_KEY

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

### 6.2 AI-driven Sidimport

---

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

---

*Dokumentet underhålls av FlowWink-teamet. Senast uppdaterad december 2024.*
