-- Fix 1: Disable broken automation referencing non-existent memory_write skill
UPDATE agent_automations 
SET enabled = false 
WHERE name = 'New Lead Notification' AND skill_name = 'memory_write';

-- Fix 3: Remove duplicate web_scrape (keep scrape_url)
UPDATE agent_skills SET enabled = false WHERE name = 'web_scrape' AND handler = 'edge:web-scrape';

-- Fix 4: Remove duplicate create_campaign (keep generate_content_proposal)
UPDATE agent_skills SET enabled = false WHERE name = 'create_campaign' AND handler = 'edge:generate-content-proposal';

-- Fix 5: Remove duplicate create_automation (keep manage_automations)
UPDATE agent_skills SET enabled = false WHERE name = 'create_automation' AND handler = 'module:automations';