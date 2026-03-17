

## Plan: Restructure FlowWink Template — Remove Pricing/Demo, Add Vertical Pitch Pages

### Summary

Remove `/pricing` and `/demo` pages. Move pricing block to Home. Remove `/features`, `/blocks`, `/consultancy`. Keep Home + FlowPilot as core product pages. Add 4 vertical elevator pitch pages. Update all internal links.

### Pages After Restructure

| # | Page | Slug | Content |
|---|------|------|---------|
| 1 | **Home** | `home` | Keep as-is + add pricing block (from `/pricing`: tiers + FAQ + countdown) before final CTA |
| 2 | **FlowPilot** | `flowpilot` | Keep as-is, update CTA links |
| 3 | **For Consultancies** | `for-consultancies` | Mini hero → chat-launcher → resume-matcher → testimonials (from consult-agency) → CTA |
| 4 | **For E-Commerce** | `for-ecommerce` | Mini hero → chat-launcher → products grid → bento categories → social-proof → CTA |
| 5 | **For Service Business** | `for-services` | Mini hero → chat-launcher → featured-carousel → bento benefits → booking widget → CTA |
| 6 | **For Healthcare** | `for-healthcare` | Mini hero → chat-launcher → badge (compliance) → booking → accordion FAQ → CTA |

### Detailed Changes in `flowwink-platform.ts`

**Remove pages:** `demo`, `features`, `blocks`, `pricing`, `consultancy` (5 pages removed)

**Home page additions** (before `cta-final` block):
- `countdown-launch` block (from pricing page)
- `pricing-detailed` block with the 3 tiers (Self-Hosted / Managed / Enterprise)
- `table-comparison` block
- `accordion-faq` block

**Add 4 new vertical pitch pages**, each following the pattern:
1. Compact `hero` with vertical-specific headline
2. `chat-launcher` with vertical-specific placeholder
3. 2-3 signature blocks borrowed from the corresponding template
4. `cta` linking to Home pricing section

**Update all internal links:**
- `/demo` → `#chat-hero-usp` (chat on home)
- `/pricing` → `#pricing-detailed` (anchor on home)
- `/features` → `/flowpilot`
- `/blocks` → removed
- Quick-links blocks updated throughout
- Floating CTA updated
- Announcement bar link updated

**Update navigation menu_order** for the new 6-page structure.

### File Changed

Only `src/data/templates/flowwink-platform.ts` — no type or installer changes needed since all blocks already exist in the system.

