# CMS Block Audit — 2026-07 (Modernize 2026 sweep, Phase 1)

Scope: all 64 public block renderers + 72 admin editors.
Method: static scan (raw-color usage, `isEditing` preview branches) + live
render of every page in 5 flagship templates (`flowwink-platform`,
`launchpad`, `digital-shop`, `service-pro`, `helpcenter`) through
`/admin/template-live-preview` in headless Chromium, viewport 1280×1800.

Screenshots saved to `/mnt/documents/*.png` (20 files) for review.

## Runtime health

- 0 page errors across 20 rendered template pages.
- 0 unhandled console errors (only harmless `wss://localhost` HMR noise
  and the React Router v7 future-flag warning).
- All full-bleed / self-styled block families laid out correctly.

## Preview-parity (admin `isEditing=false` vs. live)

Earlier scan flagged 14 editors as missing a preview branch; deeper read
shows all editors DO branch (`!isEditing`, `!canEdit`, or by rendering
the public block directly). Concrete parity gaps to still verify visually
in Phase 3:

- Editors that render a bespoke "mini-preview" instead of the real public
  block. These drift from the live render and should switch to importing
  the public component:
  - `WebinarBlockEditor` — hand-rolled card, not the real block
  - `LatestPostsBlockEditor` — imports `LatestPostsBlock`, good baseline
  - `HeaderBlockEditor`, `FooterBlockEditor` — no `isEditing` branch at all
  - `AnnouncementBarBlockEditor`, `MarqueeBlockEditor` — preview is a
    static row, doesn't mirror the animated live block
- Editors that render the public block correctly (parity OK): CTA,
  Contact, Accordion, Tabs, Stats, TwoColumn, Article-grid, Features,
  Pricing, Testimonials, Team, Timeline, Bento-grid, Gallery, Logos,
  Comparison, Countdown, Progress, Badge, Social-proof, Table, Featured-
  carousel, Consultant-matcher, Featured-product, Trust-bar, Category-nav,
  Shipping-info, Ai-assistant, Quick-links, Handbook, all KB blocks,
  Products, Cart, Form, Newsletter, Booking, Smart-booking, Popup,
  Notification-toast, Floating-cta, Chat-launcher, Parallax-section,
  Section-divider, Embed, Lottie, YouTube, Map.

## Design tokenization

Raw color / hex usage remaining in public blocks (most are legit
text-on-image or overlay contrast; flagged for Phase 3 review):

| Block                 | Raw hits | Legit reason?                    |
|-----------------------|---------:|----------------------------------|
| FeaturedCarouselBlock |       12 | Overlay + text-on-image (audit)  |
| GalleryBlock          |        8 | Lightbox chrome (audit)          |
| HeroBlock             |        7 | Text-on-image, overlay (mostly ok) |
| BentoGridBlock        |        3 | Card variants (audit)            |
| CategoryNavBlock      |        2 | Pill states (audit)              |
| ParallaxSectionBlock  |        2 | Overlay (ok)                     |
| ImageBlock            |        1 | Placeholder (ok)                 |

Action: move overlay/text-on-image cases to a shared
`text-on-image` utility class in `index.css`; migrate card-variant hex
values to semantic tokens.

## Visual findings from live render

1. **Broken glyphs** — announcement-bar and several section eyebrows in
   `flowwink-platform` render as `□`/replacement chars (emoji like 🚀,
   🧬). System-emoji font not guaranteed on all hosts. Two options:
   swap for Lucide icons inside the string, or ship
   `Twemoji`/`Noto Color Emoji` via `@font-face`.
2. **Announcement-bar** (`AnnouncementBarBlock`) — dismissable close
   sits flush right against edge; add `pr-4` and align close with
   baseline.
3. **Hero** — solid, no changes.
4. **`Meet FlowPilot` hero** — subtitle wraps oddly at 1280w; consider
   `max-w-2xl mx-auto` on the description.
5. **Agency landing** ("Scale Your Agency…") — dark overlay is too dense,
   drops contrast on background photo detail; drop overlay from
   `bg-black/60` to `bg-black/40` (via `--hero-overlay` token).

## Phase 2 deliverables (next)

Shared primitives in `src/components/public/blocks/_shared/`:

- `<BlockSection>` — resolves `sectionBackground`, padding, container.
  Replaces duplicated `container mx-auto max-w-6xl px-4 py-12 md:py-16`
  patterns in ~40 blocks.
- `<SectionHeading eyebrow title accent titleSize>` — the pattern
  already coded inline in TextBlock/CTABlock/PricingBlock/Features etc.
- `<TextOnImageOverlay>` — canonical overlay + text-color pair with
  design-token backing (replaces raw `text-white`/`bg-black/*`).
- Motion tokens: `--motion-in`, `--motion-hover`, `--motion-emphasis`
  in `index.css` (currently ad-hoc `duration-300` sprinkled everywhere).

## Phase 3 sweep order (Modernize 2026)

Batches, roughly 8-10 blocks each, verified with a template re-render
after each batch:

1. Hero family: Hero, Parallax-section, Featured-carousel, Marquee,
   Announcement-bar
2. Content: Text, TwoColumn, Accordion, Tabs, InfoBox, Quote, Timeline
3. Marketing: CTA, Features, Stats, Testimonials, Trust-bar,
   Social-proof, Logos, Comparison
4. Commerce: Products, Featured-product, Pricing, Cart, Category-nav,
   Shipping-info, Countdown
5. Content-hub: Article-grid, Latest-posts, KB (4 blocks), Handbook,
   Blog listing
6. Interactive: Form, Newsletter, Booking, Smart-booking, Chat, Popup,
   Notification-toast, Floating-cta, Chat-launcher
7. Media/layout: Image, Gallery, YouTube, Lottie, Embed, Map, Table,
   Bento-grid, Section-divider, Separator, Badge, Progress
8. Header/Footer + Preview parity for editors that render bespoke
   mini-previews (`WebinarBlockEditor`, `HeaderBlockEditor`,
   `FooterBlockEditor`, `AnnouncementBarBlockEditor`,
   `MarqueeBlockEditor`)

## Phase 4 verification

Playwright renders each flagship template after every batch, diffs
against the checked-in baseline in `/mnt/documents/`. Any raw-color
regression fails the sweep for that batch.
