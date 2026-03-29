
UPDATE public.agent_skills
SET 
  handler = 'edge:web-scrape',
  description = 'Migrate an external website URL into FlowWink CMS pages. Scrapes the URL content and branding, then creates page blocks. Use when: user wants to migrate/clone/copy an existing website, user shares a URL and says "migrate this", user wants to recreate an external site. NOT for: creating new pages from scratch (use manage_page), scraping for research purposes (use scrape_url), analyzing competitors without migration intent.',
  instructions = '# Website Migration — Multi-Step Orchestration

## Overview
This skill scrapes a URL and returns its content. But migration is a MULTI-STEP process that YOU orchestrate.

## Migration Flow (follow this exactly)

### Step 1: Ask for the URL
If the user has not provided a URL yet, ask: "What is the URL of the website you want to migrate?"

### Step 2: Scrape the source page
Call migrate_url with the URL. You will get back markdown content and metadata.

### Step 3: Analyze the content structure
From the scraped markdown, identify:
- Hero section (headline, subheadline, CTA)
- Feature sections
- Testimonials / social proof
- Contact information
- Footer content
- Any other content blocks

### Step 4: Extract branding (optional)
If the user wants visual fidelity, note colors, fonts, and style from the scraped content.
You can also call site_branding_update to apply extracted branding to the FlowWink site.

### Step 5: Create the page
Use manage_page to create a new page with content_json containing the blocks you identified.
Map scraped content to FlowWink block types:
- Headlines → hero block
- Feature lists → features block  
- Testimonials → testimonials block
- Stats/numbers → stats block
- FAQ sections → accordion block
- Contact info → contact block
- Generic text → text block
- Images with text → two-column block

### Step 6: Report results
Tell the user what was migrated and ask if they want to:
- Migrate additional pages from the same site
- Adjust any of the created blocks
- Update branding to match the source

## Important
- NEVER fabricate content. Only use what was actually scraped.
- If scraping fails, tell the user honestly and suggest alternatives.
- For multi-page sites, offer to scrape the sitemap first using scrape_url on the root domain.',
  tool_definition = '{"type":"function","function":{"name":"migrate_url","description":"Scrape and analyze a URL to migrate its content into CMS page blocks. Use when: user wants to migrate/clone an existing website. NOT for: research scraping or new page creation.","parameters":{"type":"object","properties":{"url":{"type":"string","description":"The full URL to migrate (e.g., https://example.com)"},"extract_branding":{"type":"boolean","description":"Also extract brand colors, fonts, logos from the page (default: true)"}},"required":["url"]}}}'::jsonb,
  updated_at = now()
WHERE name = 'migrate_url';
