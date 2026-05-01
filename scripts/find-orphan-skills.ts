import { getAllUnifiedModules } from '@/lib/module-def';
import '@/lib/modules';

const owned = new Set<string>();
for (const m of getAllUnifiedModules()) {
  for (const s of m.skills ?? []) owned.add(s);
  for (const s of m.skillSeeds ?? []) if (s?.name) owned.add(s.name);
}
console.log('Total owned skills:', owned.size);

const gated = [
  'generate_site_from_identity','social_post_batch','cart_recovery_check','update_company_profile',
  'approve_expense_report','book_expense_report','invoice_from_timesheets','mark_expense_report_paid',
  'ad_optimize','browse_blog','extract_pdf_text','generate_content_proposal','handbook_search',
  'manage_blog_categories','manage_blog_posts','manage_consultant_profile','manage_document',
  'manage_global_blocks','manage_kb_article','manage_newsletters','manage_page','manage_page_blocks',
  'match_consultant','media_browse','migrate_url','publish_scheduled_content','research_content',
  'site_branding_get','site_branding_update','write_blog_post','add_lead','auto_allocate_vacation',
  'book_appointment','browse_services','check_availability','crm_task_create','crm_task_list',
  'crm_task_update','enrich_company','hire_application','hire_candidate','log_time','lookup_order',
  'manage_booking_availability','manage_bookings','manage_company','manage_deal','manage_employee',
  'manage_form_submissions','manage_job_posting','manage_leads','manage_leave','manage_project',
];

const orphans = gated.filter(s => !owned.has(s));
console.log('\nOrphan gated skills:', orphans.length);
for (const o of orphans) console.log(' -', o);
