# Changelog

All notable changes to FlowWink will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

## [1.2.0] - 2026-02-20

### Added
- **Live Agent Chat Avatars**: Agent profile photos now display in chat widget for personalized support experience
- **Sentiment Detection**: Real-time AI-powered sentiment analysis during conversations
  - Automatic frustration detection (caps, repeated questions, negative words)
  - Configurable threshold (1-10 scale) for human handoff triggers
  - Visual sentiment indicator on Live Support page (green/yellow/red)
- **Human Handoff Improvements**: Enhanced escalation with explicit "speak to human" detection
- **Live Support Dashboard Widget**: New admin dashboard widget showing:
  - Active and waiting conversations
  - Online agent count
  - Average sentiment metrics
  - Quick access to support queue

### Changed
- Support agents table now has public read access for chat widget avatar display
- Improved agent presence detection in chat conversations

### Fixed
- Agent avatars now correctly display for anonymous chat visitors (RLS policy update)
- Profile avatar URL properly fetched from profiles_public view

## [1.1.0] - 2026-01-16

### Added
- **Self-Hosting Setup Script**: Complete CLI-driven setup (`./scripts/setup-supabase.sh`)
  - Automatic Supabase login with interactive prompts
  - Project selection with numbered list
  - Deploy all 33 edge functions automatically
  - Run database migrations
  - Create admin user with proper role assignment
  - Output environment variables for deployment
  - `--fresh` flag for agencies setting up multiple sites
  - `--env` flag to only display environment variables
- **Secrets Configuration Script**: Interactive secrets setup (`./scripts/configure-secrets.sh`)
  - Resend (email)
  - Stripe (payments)
  - OpenAI (AI features)
  - Google Gemini (AI alternative)
  - Firecrawl (web scraping)
  - Unsplash (stock photos)
  - Local LLM (self-hosted AI)
  - N8N (workflow automation)

### Changed
- Auth page branding updated to FlowWink
- Setup documentation rewritten for CLI-first workflow
- Improved error handling in setup scripts

### Fixed
- Environment variables now fetched via `supabase projects api-keys`
- Admin user creation uses Supabase Admin API directly
- Project selection handles deleted projects gracefully

## [1.0.0] - 2026-01-09

### Added

#### Core CMS
- Block-based page builder with 20+ block types
- Visual drag-and-drop block reordering
- Block animation controls and spacing settings
- Page versioning with restore functionality
- SEO meta settings per page
- Scheduled publishing
- Global header and footer blocks
- Menu ordering system

#### Blog Module
- Full blog engine with posts, categories, and tags
- Featured posts support
- Author profiles with avatars
- Reading time calculation
- RSS feed generation
- SEO-optimized blog pages

#### Newsletter Module
- Subscriber management with GDPR compliance
- Email campaigns with tracking (opens, clicks)
- Double opt-in support
- Export functionality
- Unsubscribe handling

#### CRM Modules
- **Leads**: Lead capture, scoring, AI qualification, status tracking
- **Deals**: Kanban board, pipeline stages, activity tracking
- **Companies**: Company profiles, domain enrichment, lead association
- **Products**: Product catalog with pricing (one-time and recurring)
- CSV import/export for leads and companies

#### Knowledge Base
- Hierarchical categories with icons
- FAQ-style articles
- AI Chat integration with context
- Helpful/not helpful voting
- Featured articles

#### Integrations
- Webhook system with event triggers
- N8N workflow templates
- Unsplash image picker
- AI text generation (expand, improve, translate, summarize)
- Brand guide analyzer

#### User Management
- Role-based access control (Writer, Approver, Admin)
- User profiles with avatars
- Activity logging

#### Public Website
- Responsive design with dark/light mode
- Cookie consent banner
- Contact forms with submissions
- Booking forms (Cal.com integration ready)
- Chat widget

### Security
- Row Level Security (RLS) on all tables
- Secure authentication flow
- GDPR-compliant data handling

---

## Upgrade Instructions

See [docs/UPGRADING.md](docs/UPGRADING.md) for detailed upgrade instructions.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for contribution guidelines.
