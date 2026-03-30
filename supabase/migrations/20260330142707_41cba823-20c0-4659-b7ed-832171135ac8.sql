
UPDATE agent_skills SET 
  description = 'Scrape and analyze an external URL to extract its content as markdown. Returns page content, metadata, and branding — but does NOT create pages or blocks. After calling this, you MUST chain to manage_page (create the page) then manage_page_blocks (add blocks with the scraped content). Use when: user wants to migrate/clone/copy an existing website, user shares a URL and says "migrate this", user wants to import content from another site. NOT for: creating pages (use manage_page after this tool), scraping for research (use scrape_url instead), checking a single page for info.',
  instructions = '# Website Migration — Multi-Step Orchestration

## Overview
This skill scrapes a URL and returns its content. Migration is a MULTI-STEP process that YOU orchestrate.

## PROACTIVE MIGRATION FLOW (follow this exactly)

### Step 1: Ask for the URL
If the user has not provided a URL yet, ask: "What is the URL of the website you want to migrate?"

### Step 2: Scrape and create the first page
Call migrate_url with the URL. You will get back markdown content, metadata, AND a site structure with discovered pages.

### Step 3: Create the page using manage_page
Use manage_page to create a new page with content_json containing the blocks you identified.

**CRITICAL — Use the BLOCK TYPE REFERENCE from the system prompt!**
Every block must use the EXACT field names from the schema. Common mistakes to avoid:
- hero: use "imageSrc" NOT "image", use "primaryButton" NOT "cta"
- text: "content" must be TipTap JSON, NEVER raw HTML strings
- two-column: use "content" (tiptap) + "imageSrc"
- features: use "features" array with { id, icon, title, description }
- testimonials: use "testimonials" array with { id, content, author, role, company }

**TipTap JSON format** for all rich text fields:
{ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Your text" }] }] }

Map scraped content to FlowWink block types:
- Headlines/hero areas → hero block (include backgroundImage from OG image or extracted hero image)
- Feature lists/grids → features block
- Customer quotes → testimonials block
- Stats/numbers → stats block
- FAQ sections → accordion block
- Contact info → form block or text block
- Generic text → text block
- Side-by-side content → two-column block (content tiptap + imageSrc)
- Logos/partners → logos block
- Pricing tables → pricing block

### Step 4: BE PROACTIVE — Offer to migrate more pages!
After successfully creating the first page, ALWAYS:
1. List the OTHER pages discovered from the site (navigation + sitemap)
2. Present them in a clear list with page names
3. Ask: "I found X more pages on this site. Would you like me to migrate any of these?"
4. If the user says yes to all, migrate them ONE BY ONE, reporting progress after each
5. After ALL pages are done, offer to update branding to match the source site

### Step 5: Branding (after pages are done)
Offer to apply extracted branding (colors, fonts) using site_branding_update.

## Important
- NEVER fabricate content. Only use what was actually scraped.
- ALWAYS check the BLOCK TYPE REFERENCE for exact field names before constructing content_json.
- If scraping fails, tell the user honestly and suggest alternatives.
- Be ENTHUSIASTIC and PROACTIVE — dont just stop after one page!
- Report what was migrated after each page: block count, types, any issues.',
  updated_at = now()
WHERE name = 'migrate_url';
