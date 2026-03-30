UPDATE agent_skills 
SET description = 'Scrape and analyze an external URL to extract its content as markdown. Returns page content, metadata, and branding — but does NOT create pages or blocks. After calling this, you MUST chain to manage_page (create the page) then manage_page_blocks (add blocks with the scraped content). Use when: user wants to migrate/clone/copy an existing website, user shares a URL and says "migrate this". NOT for: creating pages (use manage_page after this tool), scraping for research (use scrape_url).',
    tool_definition = jsonb_set(
      tool_definition, 
      '{function,description}', 
      '"Scrape and analyze an external URL to extract its content as markdown. Returns page content, metadata, and branding — but does NOT create pages or blocks. After calling this, you MUST chain to manage_page (create the page) then manage_page_blocks (add blocks with the scraped content). Use when: user wants to migrate/clone/copy an existing website, user shares a URL and says \"migrate this\". NOT for: creating pages (use manage_page after this tool), scraping for research (use scrape_url)."'
    )
WHERE name = 'migrate_url';