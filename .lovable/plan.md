

# Analys: Flowwink Template Gap-Analys

## Bakgrund

FlowWink Platform-templaten skiljer sig från övriga templates genom att den är **produktorienterad** – den beskriver själva FlowWink CMS-plattformen snarare än att visa hur systemet skapar värde för en verksamhet (som LaunchPad/TrustCorp gör).

---

## Sammanfattning av Gap

### Block som SAKNAS i FlowWink men finns i andra templates

| Block Type | Finns i | Effekt av saknad |
|------------|---------|------------------|
| `announcement-bar` | LaunchPad | Ingen möjlighet visa nyheter/kampanjer i toppen |
| `floating-cta` | Momentum | Tappar konverteringsoptimering med scroll-triggered CTA |
| `social-proof` | TrustCorp | Ingen live-metrik (aktiva användare, satisfaction) |
| `badge` | LaunchPad | Trust badges (SOC2, GDPR, Open Source) saknas |
| `marquee` | ServicePro | Inga rullande logotyper/partners |
| `progress` | ServicePro | Inga visuella KPI-indikatorer |
| `tabs` | SecureHealth | Saknar organiserat innehåll i flikar |
| `countdown` | LaunchPad | Ingen urgency/early bird timer |
| `notification-toast` | - | Ingen live activity (senaste registreringar) |
| `smart-booking` | SecureHealth, Agency | Ingen demo av bokningssystemet |
| `products` | Agency | Ingen produktvisning trots e-commerce modul |
| `lottie` | - | Inga animationer (produktvideo finns) |
| `map` | - | Kontaktblock utan karta |

### NYA Features som tillkommit sedan template skapades

Baserat på PRD.md och MODULES.md har följande features tillkommit:

1. **Flowwink Loop** (Lead Generation Pipeline)
   - Automatic lead creation från Forms, Bookings, Newsletter
   - Company enrichment via Firecrawl
   - AI qualification (qualify-lead edge function)
   - Activity scoring (10 pts booking, 8 pts newsletter, etc.)
   - *Saknas helt i templaten*

2. **Live Support med Human Handoff**
   - AI → Human eskalering vid frustration
   - Sentiment detection
   - Agent presence system
   - *Ej demonstrerat*

3. **Webinar Module** (nyss tillagt)
   - Webinar scheduling, registrations
   - Platform support (Zoom, Google Meet, etc.)
   - *Webinar block existerar men ej i template*

4. **Block Editor Previews** (Feb 2026)
   - 18 block editors med rika previews
   - *Bör demonstreras på Features-sidan*

5. **Progressive Lead Enrichment**
   - Auto-update lead med namn/phone vid returbesök
   - Company auto-link
   - *Dold feature, ej synlig i template*

---

## Rekommenderade Förbättringar

### 1. Lägg till saknade block på Home-sidan

```
Home-sida struktur (nuvarande + tillägg):
├── Hero (befintlig)
├── Stats (befintlig)
├── Timeline - How it works (befintlig)
├── Features - Best of Both Worlds (befintlig)
├── Chat Demo (befintlig)
├── Features - Everything You Need (befintlig)
├── Features - AI-First (befintlig)
├── Testimonials (befintlig)
├── 🆕 SOCIAL-PROOF - Live metrics (aktiva användare, uptime)
├── Comparison (befintlig)
├── 🆕 BADGE - Trust indicators (Open Source, GDPR, Self-Hostable)
├── Features - Compliance (befintlig)
├── 🆕 MARQUEE - Logos för användare/partners
├── Pricing (befintlig)
├── 🆕 FLOATING-CTA - "Try the Demo" sticky bar
├── 🆕 ANNOUNCEMENT-BAR (toppen) - "New: Flowwink Loop - Automatic Lead Enrichment"
```

### 2. Skapa ny sida: "Demo" eller "Playground"

Syftet är att låta besökare **interagera med alla moduler** live:

```
/demo sida:
├── Hero - "Experience FlowWink Live"
├── SMART-BOOKING - Demo av bokningssystem
├── PRODUCTS - Visa produkter med varukorg
├── FORM - Kontaktformulär som skapar lead
├── NEWSLETTER - Signup som triggar automation
├── NOTIFICATION-TOAST - Visa live aktivitet
├── CHAT-LAUNCHER - ChatGPT-stil input
├── KB-SEARCH - Sök i knowledge base
```

### 3. Uppdatera Features-sidan med nya moduler

```
Features-sida tillägg:
├── 🆕 TABS - Organise by category (CRM, Content, AI, E-commerce)
├── 🆕 PROGRESS - Module completion/maturity indicators
├── Separator: "Lead Generation Loop"
├── 🆕 TIMELINE (vertikal) - Flowwink Loop pipeline:
│   1. Visitor interacts (Form/Booking/Newsletter)
│   2. Lead auto-created with scoring
│   3. Company matched by email domain  
│   4. AI enrichment triggered
│   5. AI qualification runs
│   6. Sales sees complete profile
```

### 4. Lägg till Countdown på Pricing-sidan

```
Pricing-sida tillägg:
├── 🆕 COUNTDOWN - "Launch offer ends soon" (managed cloud discount)
├── Pricing tiers (befintlig)
├── 🆕 TABLE - Detailed feature comparison matrix
```

---

## Block Coverage After Implementation

| Status | Count | Percentage |
|--------|-------|------------|
| **Nuvarande** | ~25 block types | 54% |
| **Efter förbättringar** | ~38 block types | 83% |

### Block fortfarande oanvända

- `embed` - Kan läggas till för extern demo-video
- `lottie` - Animation för hero (valfritt)
- `popup` - Exit-intent signup (valfritt)
- `webinar` - När webinar-feature är mogen

---

## Teknisk Implementation

### Nya block att lägga till i flowwinkPages array:

1. **announcement-bar** (Home, topp)
2. **social-proof** (Home, efter testimonials)
3. **badge** (Home, efter comparison)
4. **marquee** (Home, efter badge)
5. **floating-cta** (Home, slutet)
6. **countdown** (Pricing)
7. **tabs** (Features)
8. **progress** (Features - module maturity)
9. **timeline** (Features - Flowwink Loop)
10. **smart-booking** (ny Demo-sida)
11. **products** (ny Demo-sida)
12. **notification-toast** (ny Demo-sida)
13. **chat-launcher** (ny Demo-sida)
14. **kb-search** (ny Demo-sida)
15. **table** (Pricing - feature matrix)

### Nya sidor att skapa:

1. **Demo** (`/demo`) - Interactive playground
2. **Integrations** (`/integrations`) - Webhook/N8N examples (valfritt)

### requiredModules att uppdatera:

```typescript
requiredModules: [
  'blog', 
  'knowledgeBase', 
  'chat', 
  'newsletter', 
  'leads',      // ✅ redan
  'forms',      // ✅ redan  
  'products',   // ✅ redan
  'orders',     // ✅ redan
  'booking',    // 🆕 lägg till
  'analytics',  // 🆕 lägg till
],
```

---

## Prioriteringsordning

| Prioritet | Åtgärd | Effort | Värde |
|-----------|--------|--------|-------|
| **1. Kritisk** | Lägg till social-proof, badge, marquee på Home | Låg | Högt - trust signals |
| **2. Hög** | Skapa Demo-sida med smart-booking, products | Medium | Högt - visar moduler |
| **3. Hög** | Floating-CTA + Announcement bar | Låg | Högt - konvertering |
| **4. Medium** | Tabs + Progress på Features | Medium | Medium - organisation |
| **5. Medium** | Flowwink Loop timeline på Features | Låg | Medium - förklarar värde |
| **6. Låg** | Countdown + Table på Pricing | Låg | Låg - nice-to-have |

---

## Slutsats

FlowWink-templaten använder för närvarande bara ~54% av tillgängliga block-typer och visar inte de senaste funktionerna:

- **Flowwink Loop** (lead automation) - helt osynlig
- **Smart Booking** - ej demonstrerad trots att det är key feature
- **Products/E-commerce** - modul aktiverad men ej visad
- **Live Support** - ej nämnd
- **Trust indicators** (badge, social-proof) - saknas helt

Den största bristen är att templaten berättar om funktioner istället för att **demonstrera** dem. En ny Demo-sida där besökare kan interagera med bokningssystem, produkter och chat launcher skulle dramatiskt förbättra konverteringen.

