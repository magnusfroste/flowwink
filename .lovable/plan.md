## Månadsavstämning: CMS Blocks — Full Sweep + Modernisera 2026

Jag går igenom samtliga **64 public blocks** och deras admin-editors, säkerställer preview-paritet, och drar upp designspråket ett snäpp mot 2026 — större typografi, mer whitespace, mjukare kort, subtila motion-hints. Inga nya blocks tillkommer.

### Arbetsflöde (iterativt, i faser)

**Fas 1 — Audit & rapport** *(en iteration)*
- Kör Playwright genom `TemplateLivePreviewPage` och `/admin/pages` editor, screenshotar varje block i både preview- och live-läge
- Producerar `docs/reference/block-audit-2026-07.md` med per-block-status:
  - ✅ OK / ⚠️ Preview mismatch / 🔴 Trasig / 💅 Design-debt
  - Konkret åtgärd per rad
- Levereras som deliverable innan kod ändras — du får godkänna åtgärdslistan

**Fas 2 — Design language uplift** *(gemensamma primitives först)*
- `src/components/public/blocks/_shared/` — dela ut återanvändbara delar:
  - `SectionHeading` (eyebrow + h2 + lead, konsistent skala clamp(2rem, 4vw, 3.25rem))
  - `BlockContainer` (spacing-skala: py-16 md:py-24 lg:py-32, container max-w-6xl)
  - `Card` variants (soft, elevated, outlined) med enhetliga radie- och shadow-tokens
- Lägg till motion-tokens i `index.css`: `--ease-out-expo`, `--duration-slow`
- Introducera `--radius-block`, `--shadow-block-hover`, `--gradient-subtle` som semantic tokens

**Fas 3 — Block-för-block sweep** *(grupperade PRs, ~5-8 block per iteration)*
Prioritetsordning baserat på synlighet:
1. **Hero-familjen**: Hero, ParallaxSection, TwoColumn, FeaturedCarousel
2. **Content-primärt**: Text, Quote, InfoBox, Accordion, Tabs, Timeline
3. **Marketing-tunga**: Features, Bento, Stats, Testimonials, Team, Logos, Pricing, Comparison
4. **Commerce**: Products, FeaturedProduct, Cart, TrustBar, CategoryNav, ShippingInfo
5. **Lead capture**: CTA, Contact, Form, Newsletter, Booking, SmartBooking, Popup, FloatingCTA
6. **Blog/KB**: LatestPosts, ArticleGrid, KbFeatured, KbHub, KbSearch, KbAccordion, Handbook, Webinar
7. **Media/interactivity**: Gallery, Image, YouTube, Lottie, Marquee, Embed, Map, Chat, ChatLauncher, AiAssistant
8. **Layout/utility**: Separator, SectionDivider, Table, Progress, Countdown, Badge, SocialProof, NotificationToast, AnnouncementBar, TrustBar, QuickLinks, LinkGrid, ConsultantMatcher

För varje block, samma checklista:
- [ ] Admin preview (`isEditing=false`) matchar live-render inom rimlig felmarginal
- [ ] Använder endast semantic tokens (grep efter `text-white|bg-black|#[0-9a-f]`)
- [ ] Responsiv: mobile → desktop utan trasiga breakpoints
- [ ] Dark mode: kontrast OK
- [ ] Använder shared `BlockContainer`/`SectionHeading` där tillämpligt
- [ ] Empty states rimliga (inte "undefined" eller tomma flikar)
- [ ] Motion: hover states, entry-animations där det höjer utan att distrahera

**Fas 4 — Verifiering**
- Playwright-screenshot-diff före/efter per block
- `TemplateLivePreviewPage` för `flowwink-platform`-templaten renderar utan errors
- `bun run lint` + `npx vitest run` gröna
- Uppdaterar `docs/reference/block-audit-2026-07.md` med after-shots

### Constraints
- Ingen ny business logic — bara presentation
- Semantic tokens hela vägen (index.css + tailwind.config.ts)
- English UI copy
- shadcn/ui primitives, inte custom re-implementations
- Ingen skill/module/edge-function ändras

### Vad du får per iteration
Efter Fas 1: en genomläsbar audit-rapport med prioriterad åtgärdslista.
Efter varje sub-batch i Fas 3: uppdaterade block + before/after-screenshots i chatten.

### Öppna frågor jag löser själv om du inte flaggar
- Radie-skala: sannolikt 0.75rem (sm) / 1rem (md) / 1.5rem (lg) på kort
- Heading-familj förblir befintlig — jag ändrar bara skalan/rytmiken
- Existerande block-schemas orörda (backwards compatible) — bara render-lagret ändras

Vill du att jag kör igång Fas 1 direkt (audit-scriptet + rapporten)?
