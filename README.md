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

### Option 1: Remix on Lovable (Easiest)

The fastest way to get started — remix the project on Lovable and get AI features included:

[![Remix on Lovable](https://img.shields.io/badge/Remix%20on-Lovable-ff69b4)](https://lovable.dev/projects/fac5f9b2-2dc8-4cce-be0a-4266a826f893)

**What you get:**
- ✅ One-click deployment
- ✅ Lovable AI Gateway included (Gemini-powered AI chat)
- ✅ Managed Supabase backend
- ✅ Automatic updates

### Option 2: Full Self-Hosting (Complete Control)

Deploy on your own infrastructure with full control over your data:

| Component | Your Choice |
|-----------|-------------|
| **Frontend** | Vercel, Netlify, Cloudflare Pages, or any static host |
| **Backend** | Your own Supabase project |
| **AI** | Private LLM (OpenAI, Gemini, Ollama, LM Studio, etc.) |

See **[docs/SETUP.md](docs/SETUP.md)** for complete self-hosting instructions.

**Note:** When self-hosting, AI features require configuring a Private LLM endpoint in the CMS admin panel. The Lovable AI Gateway is only available when using Lovable Cloud.

## Documentation

- **[docs/SETUP.md](docs/SETUP.md)** — Self-hosting guide
- **[docs/PRD.md](docs/PRD.md)** — Full product documentation

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

**Made in Sweden 🇸🇪**
