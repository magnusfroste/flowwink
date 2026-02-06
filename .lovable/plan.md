
# Plan: Enhance Lead Generation Flow (Flowwink Loop)

## Problem Statement
The lead generation loop has gaps where data doesn't flow automatically into the CRM:
- **Bookings** don't create or link to leads
- **Company enrichment** only runs manually, not when companies are auto-created from email domains
- **Newsletter leads** don't trigger AI qualification

This breaks the "automatic enrichment philosophy" where contacts should build complete profiles with minimal manual work.

---

## Solution: Unified Lead Capture + Auto-Enrichment

### Architecture
```text
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

---

## Implementation Tasks

### 1. Booking-to-Lead Integration
**File:** `supabase/functions/send-booking-confirmation/index.ts`

Add lead creation logic after booking confirmation:
- Extract email, name, phone from booking
- Create or update lead via same pattern as newsletter
- Add `booking` activity type with points (10 points - high intent)
- Auto-match company by email domain
- Trigger AI qualification

New activity type in scoring:
```typescript
ACTIVITY_POINTS: {
  ...
  booking: 10, // High intent signal
}
```

### 2. Auto-Enrichment on Company Creation
**File:** `src/lib/lead-utils.ts` (function `findOrCreateCompanyByDomain`)

When a NEW company is created from domain matching:
- Queue background enrichment via edge function
- Fire-and-forget pattern (don't block lead creation)

Update return signature to include `isNew` flag:
```typescript
async function findOrCreateCompanyByDomain(email: string, companyName?: string): 
  Promise<{ companyId: string | null; isNew: boolean }>
```

### 3. Trigger AI Qualification for Newsletter Leads
**File:** `supabase/functions/newsletter-subscribe/index.ts`

After creating/updating lead from newsletter confirmation:
- Call `supabase.functions.invoke('qualify-lead', { body: { leadId } })`
- Fire-and-forget pattern (already used elsewhere)

### 4. Update Lead Utils with Booking Source
**File:** `src/lib/lead-utils.ts`

Add new function:
```typescript
export async function createLeadFromBooking(options: {
  email: string;
  name: string;
  phone?: string;
  serviceName: string;
  bookingId: string;
}): Promise<{ lead: Lead | null; isNew: boolean; error: string | null }>
```

This follows the same pattern as `createLeadFromForm` but with booking-specific metadata.

### 5. Add "booking" Activity Type
**File:** `src/lib/lead-utils.ts`

Update `ACTIVITY_POINTS` constant:
```typescript
const ACTIVITY_POINTS: Record<string, number> = {
  form_submit: 10,
  booking: 10,        // NEW - high intent
  email_open: 3,
  link_click: 5,
  page_visit: 2,
  newsletter_subscribe: 8,
  status_change: 0,
  note: 0,
  call: 5,
};
```

### 6. Background Enrichment Edge Function Enhancement
**File:** `supabase/functions/enrich-company/index.ts`

Accept optional `companyId` parameter to fetch domain from database:
- If `domain` is provided, use directly
- If `companyId` is provided, fetch company's domain and enrich
- Update company record with enrichment data and `enriched_at` timestamp

---

## Technical Details

### New Activity Type Metadata
For booking activities:
```typescript
{
  lead_id: string,
  type: 'booking',
  points: 10,
  metadata: {
    booking_id: string,
    service_name: string,
    booking_date: string,
  }
}
```

### Enrichment Trigger Logic
Only trigger enrichment when:
1. Company is newly created (not existing match)
2. Domain is a business domain (not personal email)
3. Enrichment hasn't been done before (`enriched_at` is null)

### Error Handling
All enrichment and qualification calls use fire-and-forget pattern:
- Log warnings but don't fail lead creation
- Background tasks complete asynchronously
- User sees immediate success feedback

---

## Files to Modify
1. `supabase/functions/send-booking-confirmation/index.ts` - Add lead creation
2. `src/lib/lead-utils.ts` - Add booking function + auto-enrich trigger
3. `supabase/functions/newsletter-subscribe/index.ts` - Add AI qualification
4. `supabase/functions/enrich-company/index.ts` - Accept companyId parameter
5. `docs/PRD.md` - Document the unified lead capture flow

---

## Expected Outcome
After implementation:
- Every booking creates or updates a lead with company link
- New companies auto-trigger enrichment in background
- All lead sources (forms, newsletter, bookings) trigger AI qualification
- Sales team sees complete activity history across all touchpoints
- Lead scoring reflects engagement across all channels
