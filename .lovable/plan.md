

# Invoicing Module — Quote-to-Cash MVP

## Current State

**What exists:**
- `deals` table: lead_id, product_id, value_cents, stage (proposal → negotiation → won → lost)
- `orders` table: customer_email, total_cents, status, Stripe integration
- `products` table: price_cents, inventory tracking
- Deal activities and CRM tasks linked to deals

**The gap:** No way to generate a formal quote/invoice from a deal. The flow breaks at "deal won" — there's no document to send the customer.

## What We Build

A single new module: **Invoicing** — covers both quotes and invoices as the same entity with a status lifecycle.

```text
Deal (won) → Invoice (draft) → Invoice (sent) → Invoice (paid)
                ↑                                      ↓
         FlowPilot auto-creates              Stripe or manual mark
```

## Database

One new table: `invoices`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| invoice_number | text | Auto-generated (INV-0001) |
| deal_id | uuid | FK → deals (nullable) |
| customer_email | text | Required |
| customer_name | text | |
| status | enum | draft, sent, paid, cancelled |
| line_items | jsonb | Array of {description, qty, unit_price_cents} |
| subtotal_cents | int | Computed on save |
| tax_rate | numeric | Default 0.25 (25% moms) |
| tax_cents | int | Computed |
| total_cents | int | Computed |
| currency | text | Default SEK |
| due_date | date | |
| paid_at | timestamptz | |
| notes | text | Free text |
| created_by | uuid | |
| created_at / updated_at | timestamptz | |

One new enum: `invoice_status` (draft, sent, paid, cancelled).

RLS: Admin full access. Approver read + update. No public access.

## Module Registration

- Module ID: `invoicing`
- Category: `data`
- Autonomy: `agent-capable` (FlowPilot can create invoices from won deals)
- Icon: `FileText` or `Receipt`
- Dependencies: `deals` (optional — invoices can also be standalone)

## Admin UI (Minimal)

**InvoicesPage** (`/admin/invoices`):
- Table view: number, customer, status badge, total, due date
- Filters: status tabs (All / Draft / Sent / Paid)
- Click row → detail sheet

**Invoice Detail Sheet:**
- Line items editor (description, qty, unit price — total auto-calculates)
- Customer info (auto-filled from deal/lead)
- Status actions: Send (→ email via Resend), Mark Paid, Cancel
- "Generate PDF" button (edge function renders to PDF, stores in storage)

## FlowPilot Integration

Two new skills:

1. **`create_invoice`** — Creates a draft invoice from a deal or standalone
   - Input: deal_id OR {customer_email, line_items}
   - Auto-populates from deal's product + value_cents
   - Use when: "create invoice", "bill the client", "fakturera"

2. **`send_invoice`** — Sends invoice email via Resend
   - Input: invoice_id
   - Generates PDF, attaches to email
   - Use when: "send invoice", "skicka faktura"

**Autonomous behavior:** When a deal moves to `won`, FlowPilot's heartbeat can auto-create a draft invoice and notify admin for approval (HIL pattern).

## Edge Function

**`generate-invoice-pdf`** — Deno function that:
- Fetches invoice data
- Renders a clean PDF using company profile (logo, address, org number from business identity)
- Stores PDF in Supabase Storage (`invoices/` bucket)
- Returns download URL

## Implementation Steps

1. **Migration**: Create `invoice_status` enum + `invoices` table with RLS
2. **Hook**: `useInvoices.ts` — CRUD + status transitions
3. **Module registration**: Add to `useModules.tsx`, sidebar, `App.tsx` route
4. **Admin page**: `InvoicesPage.tsx` with table + detail sheet
5. **FlowPilot skills**: Register `create_invoice` and `send_invoice`
6. **PDF edge function**: `generate-invoice-pdf` (can be phase 2)
7. **Email sending**: Reuse Resend integration for invoice delivery (phase 2)

## Phase 1 (This Sprint)

Steps 1-5: Table, hooks, UI, and FlowPilot skills. Invoices can be created, viewed, and managed. No PDF generation yet — that comes in phase 2.

## Phase 2 (Next)

- PDF generation edge function
- Email delivery via Resend
- Auto-create invoice on deal won (heartbeat automation)
- Stripe payment link on invoice

## Design Notes

- Apple-inspired: clean table, minimal chrome, status badges with subtle colors
- Invoice detail uses the same sheet pattern as deals/leads
- Line items use inline editing (no modal)
- FlowPilot handles the tedious parts — admin just reviews and approves

