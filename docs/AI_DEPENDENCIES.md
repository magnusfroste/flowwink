# AI Dependencies in FlowWink

This document lists all AI-dependent features in FlowWink and their configuration requirements.

## Overview

FlowWink uses AI in multiple areas of the application. All AI features support multiple providers:
- **OpenAI** (Recommended) - Industry standard, reliable
- **Google Gemini** - Cost-effective alternative
- **Local LLM** - HIPAA-compliant, self-hosted
- **N8N Webhook** - Custom agentic workflows

## AI Provider Configuration

### OpenAI
```bash
# Supabase Secrets
OPENAI_API_KEY=sk-...
```

**Admin Settings:**
- Go to Admin → Chat Settings
- Select "OpenAI" as AI Provider
- Choose model: `gpt-4o`, `gpt-4o-mini`, or `gpt-3.5-turbo`
- Optional: Custom base URL for OpenAI-compatible APIs

### Google Gemini
```bash
# Supabase Secrets
GEMINI_API_KEY=...
```

**Admin Settings:**
- Go to Admin → Chat Settings
- Select "Gemini" as AI Provider
- Choose model: `gemini-2.0-flash-exp`, `gemini-1.5-pro`, or `gemini-1.5-flash`

### Local LLM (Private)
**Admin Settings:**
- Go to Admin → Chat Settings
- Select "Local LLM" as AI Provider
- Enter endpoint URL (e.g., `https://your-llm.internal/v1`)
- Enter model name (e.g., `llama3`)
- Optional: API key if required

### N8N Webhook (Agentic)
**Admin Settings:**
- Go to Admin → Chat Settings
- Select "N8N Webhook" as AI Provider
- Enter webhook URL
- Configure trigger mode and keywords

## AI-Dependent Features

### 1. AI Chat Assistant
**Location:** Visitor-facing chat widget, chat block, chat landing page

**Purpose:** Answer visitor questions using Context Augmented Generation (CAG) based on your Knowledge Base, blog posts, and page content.

**Edge Function:** `chat-completion`

**Configuration:**
- Admin → Chat Settings
- Choose AI provider
- Configure system prompt
- Enable/disable widget, block, or landing page
- Configure Knowledge Base context

**API Keys Used:**
- `OPENAI_API_KEY` (if using OpenAI)
- `GEMINI_API_KEY` (if using Gemini)
- Local endpoint (if using Local LLM)
- N8N webhook URL (if using N8N)

---

### 2. AI Text Generation (Editor Toolbar)
**Location:** All text editors (Tiptap) throughout admin panel

**Purpose:** Generate, improve, expand, summarize, translate, and continue text content.

**Edge Function:** `generate-text`

**Actions:**
- **Expand** - Make text longer with more details
- **Improve** - Enhance clarity and quality
- **Summarize** - Create concise summary
- **Continue** - Generate continuation
- **Translate** - Translate to other languages

**Configuration:**
- Uses the same AI provider as Chat Settings
- No separate configuration needed

**API Keys Used:**
- `OPENAI_API_KEY` (if using OpenAI)
- `GEMINI_API_KEY` (if using Gemini)

---

### 3. Content Migration (AI Page Import)
**Location:** Admin → Pages → Import Page

**Purpose:** Import content from any website (WordPress, Wix, Squarespace, Webflow, Shopify, etc.) and convert to FlowWink blocks using AI.

**Features:**
- **Platform Detection:** Automatically detects CMS platform (WordPress, Wix, Squarespace, Webflow, Shopify, Ghost, HubSpot, Drupal, SiteVision, Episerver) for optimized extraction
- **Hero Video Extraction:** Detects HTML5 background videos (MP4/WebM) commonly used in hero sections, preserving them as video backgrounds in imported hero blocks
- **Video Extraction:** Finds YouTube and Vimeo videos embedded on the page
- **Direct Video Support:** Extracts direct video file URLs (MP4, WebM, MOV) from video tags, data attributes, and background styles
- **Lottie Animation Extraction:** Detects Lottie animations from:
  - `<lottie-player>` and `<dotlottie-player>` web components
  - `<dotlottie-wc>` elements
  - `<amp-bodymovin-animation>` (AMP)
  - `lottie.loadAnimation()` and `bodymovin.loadAnimation()` script calls
  - Data attributes referencing .lottie or .json files
  - lottie.host and lottiefiles.com URLs
- **SVG Animation Extraction:** Detects animated SVGs:
  - External SVG files with animation hints in class names
  - Inline SVGs with SMIL animations (`<animate>`, `<animateTransform>`, `<animateMotion>`)
  - Inline SVGs with CSS keyframe animations
- **Image Extraction:** Extracts all images including lazy-loaded and background images
- **Screenshot Context:** Captures page screenshot for AI visual analysis
- **Block Mapping:** Maps content to 33+ block types (hero, text, gallery, team, stats, testimonials, etc.)
- **Local Image Storage:** Optional download of all images to media library

**Hero Block Enhancement:**
The importer now intelligently detects hero sections with video backgrounds:
- Identifies `<video>` tags with autoplay, loop, muted attributes as hero candidates
- Extracts MP4/WebM sources and poster images
- Creates hero blocks with `backgroundType: 'video'` when video is found
- Falls back to OG image as `backgroundType: 'image'` when no video is present

**Animation Block Support:**
Lottie and SVG animations are imported as "embed" blocks with the animation URL, allowing for later playback or conversion to native animation components.

**Edge Function:**
- `migrate-page` (scraping + AI conversion)

**Configuration:**
- Uses OpenAI (gpt-4o) or Gemini (gemini-2.0-flash-exp) for AI analysis
- Requires Firecrawl for enhanced web scraping

**API Keys Used:**
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (for AI conversion)
- `FIRECRAWL_API_KEY` (for web scraping with screenshot support)

---

### 4. Company Enrichment (CRM)
**Location:** Admin → CRM → Companies (automatic enrichment)

**Purpose:** Automatically extract company information (description, industry, size, etc.) from company websites.

**Edge Functions:**
- `enrich-company` (AI extraction)
- `firecrawl` (web scraping)

**Configuration:**
- Uses the same AI provider as Chat Settings
- Automatically triggered when adding company with website

**API Keys Used:**
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (for AI extraction)
- `FIRECRAWL_API_KEY` (for web scraping)

---

### 5. Lead Qualification (CRM)
**Location:** Admin → CRM → Leads (automatic scoring)

**Purpose:** Automatically score and qualify leads based on form submissions and company data.

**Edge Function:** `qualify-lead`

**Configuration:**
- Uses the same AI provider as Chat Settings
- Automatically triggered on new lead creation
- Optional: Can be disabled if AI not configured

**API Keys Used:**
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (optional)

---

## Environment Variables Summary

### Required for AI Features
```bash
# Choose ONE of these based on your preferred provider:
OPENAI_API_KEY=sk-...           # For OpenAI
GEMINI_API_KEY=...              # For Google Gemini

# Optional for specific features:
FIRECRAWL_API_KEY=...           # For content migration and company enrichment
```

### Optional
```bash
# For Local LLM (configured in Admin UI, not env vars)
# For N8N (configured in Admin UI, not env vars)
```

## Feature Matrix

| Feature | OpenAI | Gemini | Local LLM | N8N | Firecrawl |
|---------|--------|--------|-----------|-----|-----------|
| AI Chat | ✅ | ✅ | ✅ | ✅ | - |
| Text Generation | ✅ | ✅ | ❌ | ❌ | - |
| Content Migration | ✅ | ✅ | ❌ | ❌ | ✅ |
| Company Enrichment | ✅ | ✅ | ❌ | ❌ | ✅ |
| Lead Qualification | ✅ | ✅ | ❌ | ❌ | - |

**Notes:**
- Text Generation, Content Migration, Company Enrichment, and Lead Qualification currently only support OpenAI and Gemini
- Local LLM and N8N are only available for AI Chat
- This is by design to keep the implementation simple

## Fallback Behavior

If AI is not configured:
- **AI Chat:** Shows error message to visitor
- **Text Generation:** Button disabled in editor
- **Content Migration:** Feature unavailable
- **Company Enrichment:** Skipped, manual entry required
- **Lead Qualification:** Skipped, manual review required

## Cost Considerations

### OpenAI Pricing (as of 2024)
- `gpt-4o-mini`: $0.15/1M input tokens, $0.60/1M output tokens (Recommended)
- `gpt-4o`: $2.50/1M input tokens, $10.00/1M output tokens
- `gpt-3.5-turbo`: $0.50/1M input tokens, $1.50/1M output tokens

### Google Gemini Pricing (as of 2024)
- `gemini-2.0-flash-exp`: Free tier available, then $0.075/1M tokens
- `gemini-1.5-flash`: $0.075/1M input tokens, $0.30/1M output tokens
- `gemini-1.5-pro`: $1.25/1M input tokens, $5.00/1M output tokens

### Recommendations
- **For most users:** OpenAI `gpt-4o-mini` - Best balance of cost and quality
- **For budget-conscious:** Gemini `gemini-2.0-flash-exp` - Free tier available
- **For privacy:** Local LLM - No external API costs, full data control
- **For advanced workflows:** N8N - Custom logic, connect to any AI

## Migration from Lovable AI

If you previously used Lovable AI (deprecated):

1. **Update Chat Settings:**
   - Go to Admin → Chat Settings
   - Change AI Provider from "Lovable" to "OpenAI" or "Gemini"
   - Add API key in Supabase Secrets

2. **Remove Old Secrets:**
   ```bash
   # Remove from Supabase Secrets:
   LOVABLE_API_KEY (no longer used)
   ```

3. **Update Templates:**
   - All templates now default to OpenAI
   - Your AI configuration is preserved when switching templates

## Troubleshooting

### "AI service not configured" error
- Check that you have added the appropriate API key to Supabase Secrets
- Verify the API key is valid and has credits
- Check Admin → Integrations to see which services are configured

### Chat not responding
- Check Admin → Chat Settings → AI Provider is selected
- Verify API key in Supabase Secrets
- Check Supabase Edge Function logs for errors

### Text generation not working
- Ensure Chat Settings has a valid AI provider (OpenAI or Gemini)
- Check that the API key has sufficient credits
- Try regenerating if first attempt fails

### Content migration fails
- Requires both AI provider AND Firecrawl API key
- Check that the URL is accessible
- Some websites block scraping - try a different source

## Security Best Practices

1. **Never commit API keys to git**
   - Always use Supabase Secrets
   - Never hardcode keys in code

2. **Use environment-specific keys**
   - Different keys for development and production
   - Rotate keys regularly

3. **Monitor usage**
   - Set up billing alerts in OpenAI/Gemini dashboard
   - Monitor Supabase Edge Function invocations

4. **Consider Local LLM for sensitive data**
   - HIPAA-compliant option
   - Full data sovereignty
   - No data leaves your infrastructure

---

**Last Updated:** 2026-01-09
**FlowWink Version:** 1.0.0+
