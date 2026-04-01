UPDATE agent_skills SET instructions = '# Website Migration — Multi-Step Orchestration

This skill extracts content from a URL and returns blocks + metadata.

## CRITICAL CHAINING RULE
After migrate_url returns successfully, you MUST IMMEDIATELY call:
1. manage_page with action="create", using the returned title, slug, and blocks array
2. Do NOT summarize, describe, or ask the user — call manage_page NOW
3. After page is created, offer to migrate discovered otherPages[]

## What This Skill Returns
- title: Page title
- blocks: Array of ContentBlock objects ready for page creation
- otherPages: URLs discovered on the site for continued migration
- branding: Extracted brand colors/fonts
- _next_action: Chaining hint with exact tool call to make next

## Anti-Pattern (NEVER DO THIS)
- Do NOT respond with "Migration successful! Here are the results..."
- Do NOT ask user "Would you like me to create the page?"
- DO immediately call manage_page(action="create", title=result.title, blocks=result.blocks)' WHERE name = 'migrate_url';