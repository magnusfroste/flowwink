UPDATE agent_skills SET handler = 'internal:fetch_ecb_rates', updated_at = now() WHERE name = 'fetch_ecb_rates' AND handler = 'edge:fetch-fx-rates';
UPDATE agent_skills SET handler = 'internal:qualify_lead', updated_at = now() WHERE name = 'qualify_lead' AND handler = 'edge:qualify-lead';
UPDATE agent_skills SET handler = 'internal:enrich_company', updated_at = now() WHERE name = 'enrich_company' AND handler = 'edge:enrich-company';
UPDATE agent_skills SET handler = 'internal:prospect_research', updated_at = now() WHERE name = 'prospect_research' AND handler = 'edge:prospect-research';
UPDATE agent_skills SET handler = 'internal:prospect_fit_analysis', updated_at = now() WHERE name = 'prospect_fit_analysis' AND handler = 'edge:prospect-fit-analysis';
UPDATE agent_skills SET handler = 'internal:sales_profile_setup', updated_at = now() WHERE name = 'sales_profile_setup' AND handler = 'edge:sales-profile-setup';