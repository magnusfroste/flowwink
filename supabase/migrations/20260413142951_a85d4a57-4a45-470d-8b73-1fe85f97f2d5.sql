UPDATE public.agent_skills
SET mcp_exposed = true
WHERE enabled = true
  AND mcp_exposed = false
  AND name IN ('update_purchase_order', 'ad_creative_generate', 'ad_optimize', 'landing_page_compose');