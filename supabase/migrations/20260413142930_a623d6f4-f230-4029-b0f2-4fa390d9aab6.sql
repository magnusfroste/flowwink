-- Expose all FlowWink SaaS business skills via MCP
-- These are operational skills an external agent needs to operate the platform
UPDATE public.agent_skills
SET mcp_exposed = true
WHERE enabled = true
  AND mcp_exposed = false
  AND name IN (
    -- Content
    'write_blog_post', 'manage_blog_categories', 'manage_newsletters', 'media_browse',
    'site_branding_update', 'research_content', 'seo_content_brief',
    'generate_content_proposal', 'generate_social_post', 'social_post_batch',
    'product_promoter', 'handbook_search', 'match_consultant',
    'create_page_block', 'generate_site_from_identity', 'publish_scheduled_content',
    -- CRM
    'add_lead', 'book_appointment', 'check_availability',
    'crm_task_create', 'crm_task_update', 'deal_stale_check',
    'lead_pipeline_review', 'lookup_order', 'onboarding_checklist',
    'qualify_lead', 'contact_finder', 'enrich_company',
    'prospect_fit_analysis', 'prospect_research', 'sales_profile_setup',
    'ticket_triage', 'cart_recovery_check', 'lead_nurture_sequence',
    -- Communication
    'manage_webinar', 'register_webinar', 'send_newsletter',
    'execute_newsletter_send', 'newsletter_subscribe',
    'support_assign_conversation', 'scan_gmail_inbox',
    -- Automation
    'manage_automations',
    -- Search
    'browser_fetch', 'scrape_url', 'search_web',
    -- Analytics
    'learn_from_data',
    -- Commerce
    'analyze_receipt', 'check_order_status', 'contract_renewal_check',
    'purchase_reorder_check', 'receive_goods', 'record_goods_receipt',
    'suggest_accounting_template'
  );