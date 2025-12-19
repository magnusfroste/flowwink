# Pezcms

**Head + Headless CMS** — The complete CMS that gives you a beautiful website AND a powerful API.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What is Pezcms?

Pezcms is a modern, open-source Content Management System built for organizations that need:

- ✅ A complete website without developers
- ✅ Headless API for multi-channel delivery
- ✅ AI-powered content tools
- ✅ GDPR and WCAG compliance built-in
- ✅ Full control with self-hosting

### Head + Headless

Unlike traditional CMS (website only) or pure headless solutions (API only, requires separate frontend), Pezcms delivers **both**:

```
┌─────────────────────────────────────────────────────────────┐
│                      PEZCMS CONTENT                         │
│                    (Single Source of Truth)                 │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌──────────┐       ┌──────────┐       ┌──────────┐
    │   HEAD   │       │ HEADLESS │       │  FUTURE  │
    │ Website  │       │   API    │       │ Channels │
    │(Built-in)│       │(REST/GQL)│       │          │
    └──────────┘       └──────────┘       └──────────┘
```

## Features

### Content Management
- **16 block types** — Text, images, galleries, accordions, CTAs, and more
- **Drag & drop** — Reorder blocks visually
- **Rich text editor** — Powered by Tiptap
- **Media library** — With automatic WebP optimization

### Editorial Workflow
- **Roles** — Writer, Approver, Admin
- **Approval flow** — Draft → Review → Published
- **Version history** — Track and restore changes
- **Scheduled publishing** — Set it and forget it

### AI Features
- **AI Chat** — Multi-provider support (OpenAI, Local LLM, N8N)
- **AI Migration** — Import existing websites automatically
- **AI Brand Analysis** — Extract colors and fonts from any URL
- **Knowledge Base** — Your content becomes AI context

### Compliance & Security
- **GDPR** — Audit logging, cookie consent, privacy by design
- **WCAG 2.1 AA** — Accessibility built into every component
- **Row Level Security** — Powered by Supabase RLS

### Headless API
- **REST API** — `/content-api/pages`, `/content-api/page/:slug`
- **GraphQL** — Full schema for flexible queries
- **Edge caching** — Fast responses worldwide

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| UI Components | shadcn/ui, Radix UI |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Editor | Tiptap |
| State | TanStack Query |

## Self-Hosting

Pezcms is **free to self-host**. Deploy on your own Supabase instance with full control over your data.

### Quick Start

```bash
# Clone the repository
git clone https://github.com/magnusfroste/pezcms.git
cd pezcms

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migrations (see docs/SETUP.md)

# Start development server
npm run dev
```

### Detailed Setup

See **[docs/SETUP.md](docs/SETUP.md)** for complete self-hosting instructions including:

- Supabase project setup
- Database migrations
- Edge Functions deployment
- Production deployment

### Database Schema

A complete SQL schema is available at **[supabase/schema.sql](supabase/schema.sql)** — run it in your Supabase SQL Editor to set up a new instance.

## Deployment Options

| Option | Description |
|--------|-------------|
| **Self-Hosted** | Free forever. Full control. Deploy on your own Supabase. |
| **Managed** | We host it for you. Dedicated instance. Enterprise support. |
| **Cloud** | Multi-tenant SaaS (coming soon). |

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** — Self-hosting guide
- **[docs/PRD.md](docs/PRD.md)** — Full product documentation

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

**Made in Sweden 🇸🇪**
