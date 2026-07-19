UPDATE agent_skills SET handler = 'internal:parse_resume', updated_at = now() WHERE name = 'parse_resume' AND handler = 'edge:parse-resume';
UPDATE agent_skills SET handler = 'internal:scan_gmail_inbox', updated_at = now() WHERE name = 'scan_gmail_inbox' AND handler = 'edge:gmail-inbox-scan';
UPDATE agent_skills SET handler = 'internal:prepare_vat_return', updated_at = now() WHERE name = 'prepare_vat_return' AND handler = 'edge:accounting-vat-return-se';
UPDATE agent_skills SET handler = 'internal:build_site_step', updated_at = now() WHERE name = 'build_site_step' AND handler = 'edge:copilot-action';
UPDATE agent_skills SET handler = 'internal:get_customer_360', updated_at = now() WHERE name = 'get_customer_360' AND handler = 'edge:customer-360';