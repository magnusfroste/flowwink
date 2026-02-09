

# Plan: Template AEO + Chat Launcher Enhancement

## Bakgrund

Du har helt rätt - det är kontraproduktivt att leverera templates där det första användaren behöver göra är att lägga till beskrivningar och FAQ-block för bra AEO-poäng. Templates ska vara **produktionsfärdiga** med:

1. **Chat Launcher** - En av plattformens USPs där CMS-innehållet blir AI-kontext
2. **Accordion/FAQ** - Kritiskt för AEO (Answer Engine Optimization)
3. **Kompletta meta-descriptions** på alla sidor

## Nulägesanalys

| Template | Chat Launcher | FAQ/Accordion på Home | AEO Ready |
|----------|---------------|----------------------|-----------|
| LaunchPad | Nej | Nej (endast på Pricing/Help) | Nej |
| TrustCorp | Nej | Nej | Nej |
| SecureHealth | Nej | Nej (endast /faq sida) | Delvis |
| Flowwink | Ja (på /demo) | Nej på Home | Delvis |
| ServicePro | Nej | Nej | Nej |
| Momentum | Nej | Ja (Pricing FAQ) | Delvis |
| Agency | Behöver granskas | Behöver granskas | Behöver granskas |

## Förändringar per Template

### 1. LaunchPad (Startup)
- **Lägg till `chat-launcher`** på Home (efter CTA, före Newsletter)
- **Lägg till `accordion`** "Common Questions" på Home med 4-5 generella frågor
- Verifiera att alla sidor har kompletta meta-descriptions

### 2. TrustCorp (Enterprise)
- **Lägg till `chat-launcher`** på Home (efter social-proof/trust signaler)
- **Lägg till `accordion`** "Enterprise FAQ" på Home (säkerhet, deployment, compliance)
- Lyft fram "AI som förstår ert innehåll" i titeln

### 3. SecureHealth (Compliance)
- **Lägg till `chat-launcher`** på Home (lyft fram HIPAA/privat AI)
- **Flytta/duplicera FAQ-content** från /faq till Home som `accordion`
- Betona compliance-vinkeln i chat-launcher

### 4. FlowWink Platform
- **Flytta `chat-launcher`** från /demo till Home (mer prominent)
- **Lägg till `accordion`** "Platform FAQ" på Home
- Behåll demo-sidans chat-launcher också

### 5. ServicePro
- **Lägg till `chat-launcher`** på Home eller /book
- **Lägg till `accordion`** "Service FAQ" på Home (bokning, avbokning, priser)
- Titel: "Quick Questions? Ask our AI"

### 6. Momentum (YC-style)
- **Lägg till `chat-launcher`** (kompakt variant passar YC-stilen)
- Accordion finns redan - verifiera att den är på Home

### 7. Agency (behöver granskas)
- Samma princip - säkerställ chat-launcher + accordion

## Chat Launcher Block-konfiguration per Template

Varje template får anpassad `chat-launcher` med:
- **title**: Kontextanpassad ("Ask our AI", "Quick Questions?", "Have Questions?")
- **placeholder**: Template-specifik ("Ask about our services...", "What would you like to know?")
- **variant**: Passande för sidans design (card/minimal/hero-integrated)
- **showQuickActions**: true (använder template-specifika suggested prompts)

## Accordion FAQ-struktur

Varje Home-sida får 4-5 FAQ-items som täcker:
1. Vad ni gör / erbjuder
2. Hur det fungerar (bokning/process)
3. Priser / kostnad
4. Hur man kommer igång
5. (Valfritt) Compliance/säkerhet beroende på vertikal

## Teknisk Implementation

**Fil:** `src/data/starter-templates.ts`

För varje template:
1. Lägg till `chat-launcher` block i pages[0].blocks (Home)
2. Lägg till `accordion` block med AEO-optimerade Q&A
3. Verifiera/uppdatera meta.description på alla sidor

## Förväntade resultat

- Alla templates levereras med 80%+ AEO-score från start
- Chat Launcher synlig på alla landningssidor
- Användare behöver inte lägga till FAQ manuellt
- Plattformens AI-USP demonstreras direkt

