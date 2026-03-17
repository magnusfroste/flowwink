

## Plan: Seed FlowWink Template with Products, Consultants, Booking Data & New Consultancy Page

### What We're Adding

**1. Seed Data in `flowwink-platform.ts`**

- **Products** (4 items) — FlowWink-relevant SaaS products:
  - Starter Plan ($0, one_time — free tier)
  - Pro Plan ($49/mo, recurring)
  - Enterprise Plan ($199/mo, recurring)
  - FlowPilot Add-on ($29/mo, recurring)

- **Consultants** (5 profiles) — borrowed from consult-agency template style, but rebranded as "FlowWink implementation specialists":
  - Pick 5 of the 10 from consult-agency (Anna, Marcus, Sofia, Emma, Erik) and adjust titles/summaries to frame them as FlowWink platform experts

- **Booking Services & Availability** — this requires extending the template system since there's currently NO support for seeding `booking_services` or `booking_availability`

**2. Extend Template Types (`src/data/templates/types.ts`)**

Add new interfaces:
```typescript
interface TemplateBookingService {
  name: string;
  description?: string;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  color?: string;
  is_active?: boolean;
}

interface TemplateBookingAvailability {
  day_of_week: number; // 0=Sun, 1=Mon...
  start_time: string;  // "09:00"
  end_time: string;    // "17:00"
  service_id_ref?: string; // optional ref to service by name
}
```

Add `bookingServices?: TemplateBookingService[]` and `bookingAvailability?: TemplateBookingAvailability[]` to `StarterTemplate`.

**3. Extend Template Installer (`src/hooks/useTemplateInstaller.ts`)**

Add seeding logic for `booking_services` and `booking_availability` tables after products, similar to how consultants are seeded. Track IDs in manifest for clean uninstall.

**4. Add `'resume'` to `requiredModules`**

Currently missing — needed for the consultant search/resume matcher to work on the FlowWink demo.

**5. New Page: "Consultancy" (`/consultancy`)**

A dedicated page describing the consultancy module with blocks:
- **Hero** — "Find the Right Expert in Seconds"
- **Features/checklist block** — describing the Resume Matcher, Consultant Profiles, Check-in Flow
- **Resume Matcher block** — live interactive block (same as consult-agency)
- **Rich text** — explaining the Chrome Extension check-in workflow
- **CTA** — "See it in action on the Demo page"

Add to navigation menu.

**6. Seed Data for FlowWink Template**

In `flowwink-platform.ts`, add:
- `products: [...]` (4 products)
- `consultants: [...]` (5 consultants)  
- `bookingServices: [...]` (3 services: "Product Demo 30min", "Implementation Workshop 60min", "Strategy Call 45min")
- `bookingAvailability: [...]` (Mon–Fri 09:00–17:00)

**7. Update Quick Prompts**

Add a consultant-search prompt: "Find me a cloud architect available this month"

### Files to Change

| File | Change |
|------|--------|
| `src/data/templates/types.ts` | Add `TemplateBookingService`, `TemplateBookingAvailability` interfaces + fields on `StarterTemplate` |
| `src/hooks/useTemplateInstaller.ts` | Add booking service/availability seeding + manifest tracking |
| `src/data/templates/flowwink-platform.ts` | Add products, consultants, bookingServices, bookingAvailability arrays + new Consultancy page + update requiredModules + update suggestedPrompts |

