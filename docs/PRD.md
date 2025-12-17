# Pezcms - Product Requirements Document (PRD)

> **Version:** 1.0  
> **Last Updated:** December 2024  
> **Status:** MVP Complete

---

## Executive Summary

**Pezcms** är ett modernt Content Management System byggt specifikt för svenska vårdgivare och organisationer som behöver:

- ✅ En komplett webbplats utan utvecklare
- ✅ Headless API för multi-kanal distribution
- ✅ AI-drivna verktyg för innehållshantering
- ✅ GDPR- och WCAG-efterlevnad inbyggd
- ✅ Svenskt språkstöd och lokalisering

### Unik Positionering: "Head + Headless"

Till skillnad från traditionella CMS (som bara levererar webbplats) eller rena headless-lösningar (som kräver separat frontend-utveckling), erbjuder Pezcms **båda**:

```
┌─────────────────────────────────────────────────────────────┐
│                      PEZCMS CONTENT                         │
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

Pezcms använder en modulär block-arkitektur för flexibel innehållshantering:

#### Tillgängliga Block (16 typer)

| Kategori | Block | Beskrivning |
|----------|-------|-------------|
| **Text & Media** | Text | Rik text med Tiptap-editor |
| | Image | Bild med alt-text och bildtext |
| | Gallery | Galleri med grid/carousel/masonry + lightbox |
| | Quote | Citat med författare och källa |
| **Layout** | Two-Column | Tvåkolumnslayout med anpassningsbar bredd |
| | Separator | Visuell avdelare (linje/punkter/ornament/mellanrum) |
| **Navigation** | Link Grid | Rutnät med länkkort |
| | Hero | Sidhuvud med bakgrund, titel och CTA |
| **Information** | Fact Box | Fakta-/informationsruta |
| | Info Box | Informationsblock med ikon |
| | Stats | Nyckeltal och statistik |
| | Accordion | Expanderbar FAQ/innehåll |
| | Article Grid | Rutnät med artikelkort |
| **Interaktion** | CTA | Call-to-action med knappar |
| | Contact | Kontaktinformation |
| | YouTube | Inbäddad YouTube-video |
| | Chat | Inbäddad AI-chatt |

#### Block-funktioner

- **Drag & Drop**: Omordna block fritt
- **Duplicera/Ta bort**: Snabb hantering
- **Förhandsgranskning**: Se ändringar i realtid
- **Responsivt**: Alla block anpassas automatiskt

### 1.2 Mediabibliotek

- **Uppladdning**: Drag & drop eller filväljare
- **WebP-konvertering**: Automatisk optimering
- **Sök & Filter**: Hitta bilder snabbt
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

Pezcms stödjer tre olika AI-providers för maximal flexibilitet:

| Provider | Användning | Data Location |
|----------|------------|---------------|
| **Lovable AI** | Standard molntjänst, ingen setup krävs | Moln (EU) |
| **Private LLM** | Självhostad OpenAI-kompatibel endpoint | On-premise/Privat |
| **N8N Webhook** | Agentic workflows med AI-agent | Konfigurerbart |

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
- 🔮 **Mobile App** (Framtida)
- 🔮 **Newsletter** (Framtida)
- 🔮 **Digital Signage** (Framtida)

### 8.2 API Explorer

- **GraphQL Query Runner**: Testa queries direkt
- **REST Examples**: curl-kommandon
- **Code Snippets**: React, Next.js, vanilla JS

### 8.3 Content Model Overview

Översikt av alla block-typer med:
- Antal instanser i publicerade sidor
- JSON-preview av block-struktur
- Dokumentation av data-format

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

| Pezcms | Contentful/Sanity |
|--------|-------------------|
| ✅ Inbyggd webbplats | ❌ Kräver separat frontend |
| ✅ Svensk lokalisering | ❌ Engelska UI |
| ✅ Vårdfokuserad | ❌ Generisk |
| ✅ Ingen utvecklare behövs | ❌ Kräver utvecklare |

### 11.2 Jämfört med WordPress

| Pezcms | WordPress |
|--------|-----------|
| ✅ Modern React-stack | ❌ PHP/Legacy |
| ✅ Block-baserat native | ❌ Gutenberg addon |
| ✅ Headless API inbyggt | ❌ REST API begränsat |
| ✅ GDPR/WCAG inbyggt | ❌ Kräver plugins |

### 11.3 Jämfört med Strapi

| Pezcms | Strapi |
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

### Fas 1: MVP ✅
- Block-baserad sidbyggare
- Editorial workflow
- Branding & SEO
- AI Chat & Import
- Headless API

### Fas 2: Expansion (Planerad)
- Multi-site support
- Advanced analytics
- A/B testing
- Newsletter integration
- Mobile app SDK

### Fas 3: Enterprise (Framtida)
- SSO/SAML
- Custom workflows
- API rate limiting
- Advanced audit logging
- Dedicated support

---

## Appendix B: API Reference

Se separat API-dokumentation för fullständig referens av:
- REST endpoints
- GraphQL schema
- Authentication
- Rate limits
- Error codes

---

*Dokumentet underhålls av Pezcms-teamet. Senast uppdaterad december 2024.*
