

# Digital Shop Template Redesign — Stunning Modern E-commerce

## Vision

Transform the current "Digital Shop" template from a generic product listing into a **premium, editorial-first shopping experience** inspired by Shopify's Impulse theme. The homepage should feel like a lifestyle brand site — not a catalog.

## Current State

The template is functional but generic: announcement bar → hero → stats → product grid → features → carousel → another product grid → testimonials → FAQ → CTA. It reads like a checklist, not a curated experience.

## Redesigned Page Structure

```text
┌─────────────────────────────────────────┐
│  Marquee: "Free shipping on $50+"       │  ← replaces announcement bar
├─────────────────────────────────────────┤
│  HERO: Full-bleed image, 80vh          │
│  Minimal text, single CTA              │
│  "Curate Your Workspace"               │
├─────────────────────────────────────────┤
│  Trust Bar: Free Shipping │ SSL │ 30d  │
├─────────────────────────────────────────┤
│  TWO-COLUMN: Featured story            │
│  Image left, editorial copy right      │
│  "The Template Pack" — hero product    │
├─────────────────────────────────────────┤
│  PRODUCTS: 3-col, icon-only buttons    │
│  "Shop Bestsellers"                    │
├─────────────────────────────────────────┤
│  PARALLAX: Full-width lifestyle shot   │
│  "Built for creators who ship fast"    │
├─────────────────────────────────────────┤
│  BENTO GRID: Category showcase         │
│  Templates (wide), Courses, Tools,     │
│  Membership (tall)                     │
├─────────────────────────────────────────┤
│  TESTIMONIALS: 3-col with ratings      │
├─────────────────────────────────────────┤
│  FEATURED PRODUCT: Membership upsell   │
│  gradient background                   │
├─────────────────────────────────────────┤
│  NEWSLETTER: "Join 10K+ creators"      │
├─────────────────────────────────────────┤
│  FAQ accordion                         │
├─────────────────────────────────────────┤
│  NOTIFICATION TOAST: Social proof      │
│  FLOATING CTA: Cart button             │
└─────────────────────────────────────────┘
```

## Key Design Decisions

1. **Marquee** instead of announcement bar — creates energy and movement
2. **Trust bar** placed right after hero — builds confidence immediately
3. **Two-column editorial** for hero product — story-driven, not just a card
4. **Parallax section** breaks up the grid with a full-width lifestyle image
5. **Bento grid** for categories — visual, asymmetric, modern
6. **Featured product block** for subscription upsell with gradient background
7. **Newsletter block** — drives retention
8. **Floating CTA** — persistent cart access on mobile
9. **Icon-only add-to-cart** on product grid — cleaner, Shopify-style

## Branding Update

- Warmer, more premium palette (deep navy primary `220 50% 20%`, warm gold accent `40 90% 55%`)
- Heading font: **Playfair Display** (editorial luxury feel)
- Body font: **Inter** (clean readability)
- Larger border radius (`xl`) for softer cards
- Stronger shadows for depth

## Products Update

More aspirational names and better imagery URLs from Unsplash:
- "Creator Toolkit" (one_time, $49)
- "Design System Pro" (one_time, $79)  
- "Growth Masterclass" (one_time, $199)
- "Pro Membership" (recurring, $29/mo)

## Implementation

Single file edit: `src/data/templates/digital-shop.ts` — rewrite the blocks array, branding, and products with the new editorial layout.

