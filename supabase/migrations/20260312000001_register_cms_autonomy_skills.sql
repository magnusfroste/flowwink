-- =============================================================================
-- Register CMS Autonomy Skills — FlowPilot 9/10
-- Adds block-level, page lifecycle, KB, global blocks, deals, products,
-- companies, forms, and webinar skills for full CMS autonomy.
-- =============================================================================

-- 1. manage_page — Full page lifecycle
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_page') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_page',
      'Create, update, publish, archive, delete, and rollback CMS pages. Full page lifecycle management.',
      'module:pages',
      'content',
      'internal',
      false,
      true,
      E'# Page Management\n\n## Actions\n- **list**: List all pages. Optional status filter (draft/published/archived).\n- **get**: Get page by page_id or slug. Returns block summary.\n- **create**: Create new page. Provide title (required), slug (auto-generated if omitted), blocks[], meta{}.\n- **update**: Update page_id with new title, slug, meta, or blocks.\n- **publish**: Publish a page (saves version first). Use after content is ready.\n- **archive**: Archive a page (removes from public but preserves).\n- **delete**: Soft-delete a page.\n- **rollback**: Rollback to previous version. Saves current state before reverting.\n\n## Block Format\nBlocks are objects: { id (auto), type (e.g. "hero", "text", "cta"), data: { ... }, spacing: {}, animation: { type: "fade-up" } }\n\n## When to Use\n- Use manage_page for page-level operations (create, publish, archive)\n- Use manage_page_blocks for block-level operations (add/update/remove blocks within a page)\n- Always get the page first to see current state before modifying',
      '{"type":"function","function":{"name":"manage_page","description":"Manage CMS pages: create, update, publish, archive, delete, rollback.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","get","create","update","publish","archive","delete","rollback"],"description":"Operation to perform"},"page_id":{"type":"string","description":"Page UUID (for get/update/publish/archive/delete/rollback)"},"slug":{"type":"string","description":"Page slug (for get or create)"},"title":{"type":"string","description":"Page title (for create/update)"},"status":{"type":"string","enum":["draft","published","archived"],"description":"Filter for list action"},"meta":{"type":"object","description":"Page meta (description, ogImage, etc.)"},"blocks":{"type":"array","description":"Array of ContentBlock objects (for create/update)"},"version_id":{"type":"string","description":"Specific version to rollback to"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 2. manage_page_blocks — Block-level manipulation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_page_blocks') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_page_blocks',
      'Add, update, remove, reorder, duplicate, and toggle visibility of blocks within a page.',
      'module:pages',
      'content',
      'internal',
      false,
      true,
      E'# Block Manipulation\n\n## Actions\n- **list**: See all blocks on a page with their types and positions.\n- **add**: Add a new block. Specify block_type and block_data. Optional position (defaults to end).\n- **update**: Update block_data for an existing block_id. Merges with existing data.\n- **remove**: Remove a block by block_id.\n- **reorder**: Provide block_ids[] in desired order. Blocks not in list are appended.\n- **toggle_visibility**: Hide/show a block without removing it.\n- **duplicate**: Clone a block (placed right after original).\n\n## Block Types (48+)\nContent: hero, text, quote, two-column, info-box, accordion, article-grid\nMedia: image, gallery, youtube, embed, lottie\nInteractive: cta, contact, form, newsletter, chat, booking, smart-booking, popup, tabs\nCommerce: pricing, comparison, testimonials, team, logos, products, cart\nKB: kb-featured, kb-hub, kb-search, kb-accordion\nGlobal: header, footer, announcement-bar\nLayout: separator, marquee, countdown, bento-grid\n\n## Block Data Examples\n- hero: { title, subtitle, backgroundType: "image", imageUrl, buttons: [{text, url}] }\n- text: { content: { type: "doc", content: [...] } } (Tiptap JSON)\n- cta: { title, description, buttons: [{text, url, variant}] }\n- image: { src, alt, caption }\n- pricing: { tiers: [{name, price, features: [], cta}] }\n\n## Tips\n- Always list blocks first to see current state\n- Use Tiptap JSON for rich text (or simple strings for basic text)\n- Each block gets auto-generated id, fade-up animation, and empty spacing',
      '{"type":"function","function":{"name":"manage_page_blocks","description":"Manipulate blocks within a CMS page: add, update, remove, reorder, duplicate, toggle visibility.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","add","update","remove","reorder","toggle_visibility","duplicate"],"description":"Block operation"},"page_id":{"type":"string","description":"Page UUID (required for all actions)"},"block_type":{"type":"string","description":"Block type for add action (e.g. hero, text, cta, image, pricing)"},"block_data":{"type":"object","description":"Block configuration data (for add/update)"},"block_id":{"type":"string","description":"Block UUID (for update/remove/toggle/duplicate)"},"block_ids":{"type":"array","items":{"type":"string"},"description":"Ordered block UUIDs (for reorder)"},"position":{"type":"number","description":"Insert position for add (0-based, defaults to end)"}},"required":["action","page_id"]}}}'::jsonb
    );
  END IF;
END $$;

-- 3. manage_kb_article — Knowledge Base CRUD
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_kb_article') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_kb_article',
      'Create, update, publish, and manage Knowledge Base articles. Powers the AI chat context and public KB.',
      'module:kb',
      'content',
      'internal',
      false,
      true,
      E'# Knowledge Base Article Management\n\n## Actions\n- **list**: List articles. Filter by category or is_published.\n- **get**: Get full article by article_id or slug.\n- **create**: Create article with title, question, answer, category. Defaults to draft.\n- **update**: Update any field on an existing article.\n- **publish**: Make article public and available in chat context.\n- **unpublish**: Remove from public view.\n\n## Important Fields\n- title: Display title\n- question: The question this article answers (used for chat matching)\n- answer: The answer text (plain text or markdown)\n- category: Grouping category\n- include_in_chat: Whether AI chat can use this as context (default true)\n- is_featured: Show on KB landing page\n\n## When to Use\n- After kb_gap_analysis reveals uncovered questions\n- When users ask questions the chat can''t answer\n- To document new features or processes\n- Always set include_in_chat=true for articles that help the public chatbot',
      '{"type":"function","function":{"name":"manage_kb_article","description":"Manage Knowledge Base articles: create, update, publish, list.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","get","create","update","publish","unpublish"],"description":"Operation to perform"},"article_id":{"type":"string","description":"Article UUID"},"slug":{"type":"string","description":"Article slug (for get)"},"title":{"type":"string","description":"Article title"},"question":{"type":"string","description":"The question this article answers"},"answer":{"type":"string","description":"Answer text (markdown supported)"},"category":{"type":"string","description":"Article category"},"include_in_chat":{"type":"boolean","description":"Include in AI chat context (default true)"},"is_featured":{"type":"boolean","description":"Feature on KB landing page"},"is_published":{"type":"boolean","description":"Filter for list action"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 4. manage_global_blocks — Header, Footer, Sidebar
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_global_blocks') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_global_blocks',
      'Manage global site elements: header navigation, footer content, sidebar, and announcement bars.',
      'module:globalElements',
      'content',
      'internal',
      false,
      true,
      E'# Global Blocks Management\n\n## Actions\n- **list**: See all global blocks (header, footer, sidebar) and their active state.\n- **get**: Get full data for a specific slot.\n- **update**: Update block data for a slot. Merges with existing data.\n- **toggle**: Enable/disable a global block.\n\n## Slots\n- **header**: Site navigation (logo, nav items, sticky settings)\n- **footer**: Footer content (contact info, social links, legal links)\n- **sidebar**: Optional sidebar content\n\n## Header Data Example\n{ logoUrl, logoAlt, navItems: [{label, url}], sticky: true, transparent: false }\n\n## Footer Data Example\n{ companyName, email, phone, address, socialLinks: [{platform, url}], legalLinks: [{label, url}] }',
      '{"type":"function","function":{"name":"manage_global_blocks","description":"Manage global site elements (header, footer, sidebar).","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","get","update","toggle"],"description":"Operation to perform"},"slot":{"type":"string","enum":["header","footer","sidebar"],"description":"Global block slot"},"block_data":{"type":"object","description":"Block configuration data (for update)"},"block_type":{"type":"string","description":"Block type (for creating new slot)"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 5. manage_deal — Sales pipeline management
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_deal') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_deal',
      'Create, update, and manage sales deals through pipeline stages (proposal → negotiation → closed).',
      'module:deals',
      'crm',
      'internal',
      false,
      true,
      E'# Deal Management\n\n## Actions\n- **list**: List deals. Filter by stage or lead_id.\n- **create**: Create deal with title, value_cents, stage, lead_id, company_id.\n- **update**: Update deal fields.\n- **move_stage**: Move deal to new pipeline stage.\n\n## Pipeline Stages\nproposal → negotiation → closed_won / closed_lost\n\n## When to Use\n- After qualifying a lead, create a deal\n- Track value in cents (e.g. 50000 = 500 SEK)\n- Link to lead_id and company_id for full CRM context',
      '{"type":"function","function":{"name":"manage_deal","description":"Manage sales deals and pipeline stages.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","create","update","move_stage"],"description":"Operation"},"deal_id":{"type":"string","description":"Deal UUID"},"title":{"type":"string","description":"Deal title"},"value_cents":{"type":"number","description":"Deal value in cents"},"currency":{"type":"string","description":"Currency code (default SEK)"},"stage":{"type":"string","enum":["proposal","negotiation","closed_won","closed_lost"],"description":"Pipeline stage"},"lead_id":{"type":"string","description":"Associated lead UUID"},"company_id":{"type":"string","description":"Associated company UUID"},"expected_close_date":{"type":"string","description":"Expected close date (ISO)"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 6. manage_product — E-commerce product catalog
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_product') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_product',
      'Create, update, and list e-commerce products with pricing and Stripe integration.',
      'module:products',
      'content',
      'internal',
      false,
      true,
      E'# Product Management\n\n## Actions\n- **list**: List products. Filter by is_active.\n- **create**: Create product with name, price_cents, currency, type.\n- **update**: Update product fields.\n\n## Types\n- one_time: Single purchase\n- recurring: Subscription\n\n## Pricing\nStore in cents: 9900 = 99.00 SEK',
      '{"type":"function","function":{"name":"manage_product","description":"Manage e-commerce products.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","create","update"],"description":"Operation"},"product_id":{"type":"string","description":"Product UUID"},"name":{"type":"string","description":"Product name"},"description":{"type":"string","description":"Product description"},"price_cents":{"type":"number","description":"Price in cents"},"currency":{"type":"string","description":"Currency (default SEK)"},"type":{"type":"string","enum":["one_time","recurring"],"description":"Pricing type"},"is_active":{"type":"boolean","description":"Active status"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 7. manage_company — Company CRM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_company') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_company',
      'Create, update, and list companies in the CRM. Link to leads and deals.',
      'module:companies',
      'crm',
      'internal',
      false,
      true,
      E'# Company Management\n\n## Actions\n- **list**: List all companies.\n- **create**: Create company with name, domain, industry, size, location.\n- **update**: Update company fields.\n\n## Tips\n- Use enrich_company to auto-fill data from domain\n- Link companies to leads and deals for full CRM context',
      '{"type":"function","function":{"name":"manage_company","description":"Manage CRM companies.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","create","update"],"description":"Operation"},"company_id":{"type":"string","description":"Company UUID"},"name":{"type":"string","description":"Company name"},"domain":{"type":"string","description":"Company domain"},"industry":{"type":"string","description":"Industry"},"size":{"type":"string","description":"Company size"},"city":{"type":"string","description":"City"},"country":{"type":"string","description":"Country"},"website":{"type":"string","description":"Website URL"},"description":{"type":"string","description":"Company description"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 8. manage_form_submissions — Form data access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_form_submissions') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_form_submissions',
      'List, view, and manage form submissions. Get stats on form performance.',
      'module:forms',
      'crm',
      'internal',
      false,
      true,
      E'# Form Submissions\n\n## Actions\n- **list**: List recent submissions (last 50).\n- **get**: Get full submission data by submission_id.\n- **update_status**: Update submission status.\n- **stats**: Get 30-day submission stats by form.',
      '{"type":"function","function":{"name":"manage_form_submissions","description":"Manage form submissions and stats.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","get","update_status","stats"],"description":"Operation"},"submission_id":{"type":"string","description":"Submission UUID"},"status":{"type":"string","description":"New status (for update_status)"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;

-- 9. manage_webinar — Webinar management
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'manage_webinar') THEN
    INSERT INTO public.agent_skills (name, description, handler, category, scope, requires_approval, enabled, instructions, tool_definition)
    VALUES (
      'manage_webinar',
      'Create, update, and list webinars with scheduling and platform integration.',
      'module:webinars',
      'communication',
      'internal',
      false,
      true,
      E'# Webinar Management\n\n## Actions\n- **list**: List all webinars.\n- **create**: Create webinar with title, scheduled_at, platform, meeting_url.\n- **update**: Update webinar fields.\n\n## Platforms\ngoogle_meet, zoom, teams',
      '{"type":"function","function":{"name":"manage_webinar","description":"Manage webinars and events.","parameters":{"type":"object","properties":{"action":{"type":"string","enum":["list","create","update"],"description":"Operation"},"webinar_id":{"type":"string","description":"Webinar UUID"},"title":{"type":"string","description":"Webinar title"},"description":{"type":"string","description":"Description"},"scheduled_at":{"type":"string","description":"ISO datetime"},"platform":{"type":"string","enum":["google_meet","zoom","teams"],"description":"Meeting platform"},"meeting_url":{"type":"string","description":"Meeting URL"},"max_attendees":{"type":"number","description":"Max attendees"}},"required":["action"]}}}'::jsonb
    );
  END IF;
END $$;
