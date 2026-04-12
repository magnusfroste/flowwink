/**
 * Module → Skill Name Mapping
 * 
 * Each module declares which skills it owns. When a module is enabled/disabled,
 * its skills are enabled/disabled in the agent_skills table.
 * 
 * Full skill definitions live in setup-flowpilot (edge function) for first-boot seeding.
 * Module bootstraps control the lifecycle (enable/disable) based on this map.
 * 
 * Accounting is the exception: it has full SkillSeed definitions in its bootstrap
 * for INSERT-if-not-exists (pilot pattern for future module migration).
 */

import type { ModulesSettings, ModuleConfig } from '@/hooks/useModules';
import { getUnifiedSkillNames, isUnifiedModule } from '@/lib/module-def';

/**
 * Maps each module to the skill names it owns.
 * Skills not listed here are considered "core" FlowPilot skills
 * and are always available when FlowPilot is enabled.
 */
export const MODULE_SKILL_MAP: Partial<Record<keyof ModulesSettings, string[]>> = {
  // ═══ Content ═══
  blog: [
    'write_blog_post',
    'manage_blog_posts',
    'manage_blog_categories',
    'browse_blog',
    'content_calendar_view',
    'product_promoter',
    'seo_content_brief',
    'social_post_batch',
    'generate_social_post',
    'research_content',
    'generate_content_proposal',
  ],

  pages: [
    'manage_page',
    'manage_page_blocks',
    'create_page_block',
    'manage_global_blocks',
    'generate_site_from_identity',
    'landing_page_compose',
  ],

  knowledgeBase: [
    'manage_kb_article',
  ],

  mediaLibrary: [
    'media_browse',
  ],

  templates: [
    // No skills yet — template installation is a UI flow
  ],

  handbook: [
    'handbook_search',
  ],

  // ═══ Data / CRM ═══
  leads: [
    'add_lead',
    'manage_leads',
    'lead_pipeline_review',
    'lead_nurture_sequence',
    'crm_task_list',
    'crm_task_create',
    'crm_task_update',
  ],

  deals: [
    'manage_deal',
    'deal_stale_check',
  ],

  companies: [
    'manage_company',
  ],

  forms: [
    'manage_form_submissions',
  ],

  bookings: [
    'book_appointment',
    'check_availability',
    'browse_services',
    'manage_booking_availability',
    'manage_bookings',
  ],

  ecommerce: [
    'browse_products',
    'manage_product',
    'manage_inventory',
    'manage_orders',
    'lookup_order',
    'check_order_status',
    'place_order',
    'cart_recovery_check',
    'inventory_report',
  ],

  inventory: [
    'check_stock',
    'adjust_stock',
    'low_stock_report',
  ],

  purchasing: [
    'manage_vendor',
    'create_purchase_order',
    'send_purchase_order',
    'receive_goods',
    'purchase_reorder_check',
  ],

  // ═══ Communication ═══
  newsletter: [
    'send_newsletter',
    'manage_newsletters',
    'execute_newsletter_send',
    'manage_newsletter_subscribers',
    'newsletter_subscribe',
  ],

  chat: [
    // Chat uses chat-completion directly, no DB skills
  ],

  liveSupport: [
    'support_list_conversations',
    'support_assign_conversation',
  ],

  webinars: [
    'manage_webinar',
    'register_webinar',
  ],

  // ═══ Insights ═══
  analytics: [
    'analyze_analytics',
    'seo_audit_page',
    'kb_gap_analysis',
    'analyze_chat_feedback',
    'weekly_business_digest',
    'support_get_feedback',
    'competitor_monitor',
  ],

  // ═══ System ═══
  salesIntelligence: [
    'prospect_research',
    'prospect_fit_analysis',
    'qualify_lead',
    'enrich_company',
    'contact_finder',
    'sales_profile_setup',
  ],

  paidGrowth: [
    'ad_campaign_create',
    'ad_creative_generate',
    'ad_performance_check',
    'ad_optimize',
  ],

  resume: [
    'manage_consultant_profile',
    'match_consultant',
  ],

  browserControl: [
    // browser_fetch is cross-cutting, kept as core
  ],

  federation: [
    'a2a_chat',
    'a2a_request',
    'openclaw_start_session',
    'openclaw_end_session',
    'openclaw_report_finding',
    'openclaw_exchange',
    'openclaw_get_status',
    'queue_beta_test',
    'resolve_finding',
    'scan_beta_findings',
  ],

  siteMigration: [
    'migrate_url',
  ],

  composio: [
    'composio_execute',
    'composio_search_tools',
    'composio_gmail_read',
    'composio_gmail_send',
  ],

  tickets: [
    'ticket_triage',
  ],

  invoicing: [
    'manage_invoice',
    'invoice_from_timesheets',
    'invoice_overdue_check',
  ],

  accounting: [
    'manage_journal_entry',
    'accounting_reports',
    'manage_accounting_template',
    'manage_opening_balances',
    'manage_chart_of_accounts',
    'suggest_accounting_template',
  ],

  expenses: [
    'manage_expenses',
    'analyze_receipt',
  ],

  timesheets: [
    'log_time',
    'manage_projects',
    'manage_tasks',
    'timesheet_summary',
  ],

  developer: [
    // Developer module is UI-only (API Explorer, Webhooks)
  ],

  companyInsights: [
    // Shares salesIntelligence skills
  ],

  contracts: [
    'manage_contract',
    'contract_renewal_check',
  ],

  hr: [
    'manage_employee',
    'manage_leave',
    'onboarding_checklist',
  ],

  // documents — MIGRATED to unified defineModule() in documents-module.ts
  // documents: ['manage_document'],

  projects: [
    'manage_project',
    'manage_project_task',
  ],
};

/**
 * Core FlowPilot skills — always available when FlowPilot is enabled.
 * These are NOT owned by any module.
 */
export const CORE_SKILLS = [
  'create_objective',
  'manage_site_settings',
  'site_branding_get',
  'site_branding_update',
  'users_list',
  'publish_scheduled_content',
  'learn_from_data',
  'manage_automations',
  'process_signal',
  'search_web',
  'scrape_url',
  'browser_fetch',
  'extract_pdf_text',
  'scan_gmail_inbox',
];

/**
 * Get all skill names owned by a module.
 */
export function getModuleSkillNames(moduleId: keyof ModulesSettings): string[] {
  // Unified modules handle their own skills — don't double-count
  if (isUnifiedModule(moduleId)) {
    return getUnifiedSkillNames(moduleId);
  }
  return MODULE_SKILL_MAP[moduleId] ?? [];
}

/**
 * Get all skill names across all enabled modules.
 */
export function getEnabledModuleSkillNames(modules: ModulesSettings): string[] {
  const names: string[] = [];
  for (const [id, config] of Object.entries(modules)) {
    if ((config as ModuleConfig).enabled) {
      const skills = MODULE_SKILL_MAP[id as keyof ModulesSettings];
      if (skills) names.push(...skills);
    }
  }
  return names;
}
