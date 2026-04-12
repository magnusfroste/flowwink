---
title: Module Overview
summary: All FlowWink modules, their skills, webhooks, and relationships
read_when:
  - Planning module work
  - Understanding system capabilities
  - Checking which skills belong to which module
---

# Modules — FlowWink's Claws

> Modules are FlowWink's equivalent of OpenClaw's channels and plugins. Each module gives the agent a distinct operational domain — content, CRM, accounting, HR, etc.

## Module Lifecycle

```
Enable  → seedData() → enable skills → register automations
Disable → disable skills → disable automations (data preserved)
```

When FlowPilot is off, modules run as a traditional CMS shell (manual UI only).
When FlowPilot is on, modules gain autonomous skills and automation.

---

## Module Registry

### Content

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Blog** | `write_blog_post`, `manage_blog_posts`, `manage_blog_categories`, `browse_blog`, `content_calendar_view`, `product_promoter`, `seo_content_brief`, `social_post_batch`, `generate_social_post`, `research_content`, `generate_content_proposal` | `blog.published` | Content creation and publishing |
| **Pages** | `manage_page`, `manage_page_blocks`, `create_page_block`, `manage_global_blocks`, `generate_site_from_identity`, `landing_page_compose` | — | Page management and generation |
| **Knowledge Base** | `manage_kb_article` | — | Self-service help articles |
| **Media Library** | `media_browse` | — | Asset management |
| **Handbook** | `handbook_search` | — | Internal documentation |

### Data / CRM

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Leads** | `add_lead`, `manage_leads`, `lead_pipeline_review`, `lead_nurture_sequence`, `crm_task_list`, `crm_task_create`, `crm_task_update` | `lead.created`, `lead.score_updated`, `lead.status_changed` | Lead capture and pipeline |
| **Deals** | `manage_deal`, `deal_stale_check` | `deal.won`, `deal.lost` | Sales pipeline |
| **Companies** | `manage_company` | — | Company records |
| **Forms** | `manage_form_submissions` | `form.submitted` | Form data collection |
| **Bookings** | `book_appointment`, `check_availability`, `browse_services`, `manage_booking_availability`, `manage_bookings` | `booking.created`, `booking.cancelled` | Appointment scheduling |

### E-commerce

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **E-commerce** | `browse_products`, `manage_product`, `manage_inventory`, `manage_orders`, `lookup_order`, `check_order_status`, `place_order`, `cart_recovery_check`, `inventory_report` | `order.created`, `order.paid`, `order.fulfilled` | Products, orders, fulfillment |
| **Inventory** | `check_stock`, `adjust_stock`, `low_stock_report` | `stock.low`, `stock.adjusted` | Stock management |
| **Purchasing** | `manage_vendor`, `create_purchase_order`, `send_purchase_order`, `receive_goods`, `purchase_reorder_check` | `purchase_order.created`, `purchase_order.received` | Procurement |

### Finance

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Invoicing** | `manage_invoice`, `invoice_from_timesheets`, `invoice_overdue_check` | `invoice.created`, `invoice.paid`, `invoice.overdue` | Invoice lifecycle |
| **Accounting** | `manage_journal_entry`, `accounting_reports`, `manage_accounting_template`, `manage_opening_balances`, `manage_chart_of_accounts`, `suggest_accounting_template` | — | Double-entry bookkeeping |
| **Expenses** | `manage_expenses`, `analyze_receipt` | `expense.submitted`, `expense.status_changed` | Expense reporting |

### Communication

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Newsletter** | `send_newsletter`, `manage_newsletters`, `execute_newsletter_send`, `manage_newsletter_subscribers`, `newsletter_subscribe` | `newsletter.sent` | Email campaigns |
| **Live Support** | `support_list_conversations`, `support_assign_conversation` | — | Human agent handoff |
| **Webinars** | `manage_webinar`, `register_webinar` | — | Event management |

### Operations

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Timesheets** | `log_time`, `manage_projects`, `manage_tasks`, `timesheet_summary` | `timesheet.submitted` | Time tracking |
| **Projects** | `manage_project`, `manage_project_task` | `project.created`, `task.completed` | Project management |
| **Contracts** | `manage_contract`, `contract_renewal_check` | `contract.created`, `contract.signed`, `contract.status_changed` | Contract lifecycle |
| **HR** | `manage_employee`, `manage_leave`, `onboarding_checklist` | `employee.created`, `leave.requested`, `leave.status_changed` | People management |
| **Documents** | `manage_document` | `document.uploaded` | Document management |

### Intelligence

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Analytics** | `analyze_analytics`, `seo_audit_page`, `kb_gap_analysis`, `analyze_chat_feedback`, `weekly_business_digest`, `support_get_feedback`, `competitor_monitor` | — | Business intelligence |
| **Sales Intelligence** | `prospect_research`, `prospect_fit_analysis`, `qualify_lead`, `enrich_company`, `contact_finder`, `sales_profile_setup` | — | Sales automation |
| **Paid Growth** | `ad_campaign_create`, `ad_creative_generate`, `ad_performance_check`, `ad_optimize` | — | Ad management |

### System

| Module | Skills | Webhooks | Description |
|--------|--------|----------|-------------|
| **Federation** | `a2a_chat`, `a2a_request`, `openclaw_start_session`, `openclaw_end_session`, `openclaw_report_finding`, `openclaw_exchange`, `openclaw_get_status`, `queue_beta_test`, `resolve_finding`, `scan_beta_findings` | — | Agent-to-Agent protocol |
| **Composio** | `composio_execute`, `composio_search_tools`, `composio_gmail_read`, `composio_gmail_send` | — | External tool bridge |
| **Resume** | `manage_consultant_profile`, `match_consultant` | — | Talent matching |
| **Site Migration** | `migrate_url` | — | Content import |
| **Tickets** | `ticket_triage` | — | Support tickets |

---

## Core Skills (Always Active)

These skills are not owned by any module — they're available whenever FlowPilot is enabled:

- `create_objective`, `manage_site_settings`, `site_branding_get`, `site_branding_update`
- `users_list`, `publish_scheduled_content`, `learn_from_data`, `manage_automations`
- `process_signal`, `search_web`, `scrape_url`, `browser_fetch`, `extract_pdf_text`, `scan_gmail_inbox`

---

## Per-Module Documentation

Each module has auto-generated documentation with API contracts, webhook events, integrations, and file maps. Generated by `bun run scripts/generate-module-docs.ts`.

| Module | Doc |
|--------|-----|
| Accounting | [accounting.md](./accounting.md) |
| Blog | [blog.md](./blog.md) |
| Booking | [booking.md](./booking.md) |
| Browser Control | [browser-control.md](./browser-control.md) |
| Companies | [companies.md](./companies.md) |
| Composio | [composio.md](./composio.md) |
| Contracts | [contracts.md](./contracts.md) |
| CRM (Leads) | [crm.md](./crm.md) |
| Deals | [deals.md](./deals.md) |
| Developer | [developer.md](./developer.md) |
| Documents | [documents.md](./documents.md) |
| E-commerce | [orders.md](./orders.md) · [products.md](./products.md) |
| Expenses | [expenses.md](./expenses.md) |
| Federation | [federation.md](./federation.md) |
| Forms | [forms.md](./forms.md) |
| Handbook | [handbook.md](./handbook.md) |
| HR | [hr.md](./hr.md) |
| Inventory | [inventory.md](./inventory.md) |
| Invoicing | [invoicing.md](./invoicing.md) |
| Knowledge Base | [kb.md](./kb.md) |
| Media Library | [media.md](./media.md) |
| Newsletter | [newsletter.md](./newsletter.md) |
| Pages | [pages.md](./pages.md) |
| Projects | [projects.md](./projects.md) |
| Purchasing | [purchasing.md](./purchasing.md) |
| Resume | [resume.md](./resume.md) |
| Sales Intelligence | [sales-intelligence.md](./sales-intelligence.md) |
| SLA | [sla.md](./sla.md) |
| Tickets | [tickets.md](./tickets.md) |
| Timesheets | [timesheets.md](./timesheets.md) |
| Webinars | [webinars.md](./webinars.md) |

---

*See also: [Module API Reference](../reference/module-api.md) · [Skills Registry](../reference/skills-source.md)*
