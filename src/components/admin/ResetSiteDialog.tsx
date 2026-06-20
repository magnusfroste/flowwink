import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  Trash2, 
  FileText, 
  Users, 
  Image, 
  Settings, 
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Sparkles,
  Briefcase,
  Receipt,
  ClipboardList,
  Truck,
  LifeBuoy,
  Package,
} from 'lucide-react';
import { getAllModuleOwnership, wipeModulesData, countModuleRows } from '@/lib/module-data-ownership';
import type { ModulesSettings } from '@/hooks/useModules';

interface ResetSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResetStep = 'warning' | 'confirm' | 'password' | 'progress' | 'complete';

interface ResetOptions {
  pages: boolean;
  blogPosts: boolean;
  kbArticles: boolean;
  products: boolean;
  leads: boolean;
  companies: boolean;
  deals: boolean;
  media: boolean;
  settings: boolean;
  formSubmissions: boolean;
  newsletters: boolean;
  bookings: boolean;
  orders: boolean;
  engineRoom: boolean;
  // ERP modules
  hr: boolean;              // employees, leave, attendance, contracts, onboarding, performance, recruitment
  finance: boolean;         // quotes, invoices, accounting, dunning, payments, payroll, tax
  operations: boolean;      // projects, tasks, time entries, expenses, handbook
  procurement: boolean;     // vendors, POs, goods receipts, inventory/stock
  service: boolean;         // tickets, SLA, contracts (legal), documents, subscriptions, feedback
  growth: boolean;          // ad campaigns, webinars, sales intelligence
  federation: boolean;      // a2a peers/activity, federation connections, webhooks, api keys
}

const defaultOptions: ResetOptions = {
  pages: true,
  blogPosts: true,
  kbArticles: true,
  products: true,
  leads: true,
  companies: true,
  deals: true,
  media: true,
  settings: true,
  formSubmissions: true,
  newsletters: true,
  bookings: true,
  orders: true,
  engineRoom: true,
  hr: true,
  finance: true,
  operations: true,
  procurement: true,
  service: true,
  growth: true,
  federation: true,
};

interface ProgressItem {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  error?: string;
}

export function ResetSiteDialog({ open, onOpenChange }: ResetSiteDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<ResetStep>('warning');
  const [options, setOptions] = useState<ResetOptions>(defaultOptions);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);

  // Dynamic modular wipe — modules that declare `data.tables` show up here
  // automatically. No code change required when a new module is annotated.
  const moduleOwnership = getAllModuleOwnership();
  const [selectedModules, setSelectedModules] = useState<Set<string>>(
    () => new Set(moduleOwnership.map(m => m.moduleId))
  );
  const [moduleRowCounts, setModuleRowCounts] = useState<Record<string, number | null>>({});
  const [countsLoading, setCountsLoading] = useState(false);

  // Probe each module's tables when the dialog opens so admins can see
  // leftover data — including from disabled modules.
  useEffect(() => {
    if (!open || step !== 'warning') return;
    let cancelled = false;
    setCountsLoading(true);
    (async () => {
      const entries = await Promise.all(
        moduleOwnership.map(async (m) => {
          const c = await countModuleRows(m.moduleId as keyof ModulesSettings);
          return [m.moduleId, c] as const;
        })
      );
      if (cancelled) return;
      setModuleRowCounts(Object.fromEntries(entries));
      setCountsLoading(false);
      // Auto-deselect modules with 0 rows — no point wiping empty tables
      setSelectedModules(prev => {
        const next = new Set(prev);
        for (const [id, count] of entries) {
          if ((count ?? 0) === 0) next.delete(id);
        }
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);


  const resetState = () => {
    setStep('warning');
    setOptions(defaultOptions);
    setConfirmText('');
    setPassword('');
    setPasswordError('');
    setProgress([]);
    setOverallProgress(0);
    setIsResetting(false);
    setSelectedModules(new Set(moduleOwnership.map(m => m.moduleId)));
  };

  const handleClose = () => {
    if (!isResetting) {
      resetState();
      onOpenChange(false);
    }
  };

  const updateProgress = (label: string, status: ProgressItem['status'], error?: string) => {
    setProgress(prev => {
      const existing = prev.find(p => p.label === label);
      if (existing) {
        return prev.map(p => p.label === label ? { ...p, status, error } : p);
      }
      return [...prev, { label, status, error }];
    });
  };

  const verifyPassword = async (): Promise<boolean> => {
    if (!user?.email) return false;
    
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password,
    });
    
    return !error;
  };

  const executeReset = async () => {
    setIsResetting(true);
    setStep('progress');

    // Helper: bulk-delete all rows from a table by name. Untyped on purpose —
    // chaining many supabase.from('x').delete() inside one fn blows TS depth.
    // Tables without an `id` column (e.g. wiki_pages uses `slug` as PK) need a
    // different predicate — try `id` first, fall back to a column-agnostic
    // "always true" filter using `created_at`.
    const wipe = async (table: string, throwOnError = false) => {
      const client = supabase as any;
      let { error } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && /column .*id.* does not exist/i.test(error.message ?? '')) {
        // Fallback for tables without an `id` column
        const res = await client.from(table).delete().not('created_at', 'is', null);
        error = res.error;
      }
      if (error) {
        logger.warn(`[reset] wipe(${table}) failed:`, error.message);
        if (throwOnError) throw error;
      }
    };

    const tasks: { key: keyof ResetOptions; label: string; fn: () => Promise<void> }[] = [];
    
    if (options.formSubmissions) {
      tasks.push({
        key: 'formSubmissions',
        label: 'Clearing form submissions',
        fn: async () => {
          const { error } = await supabase.from('form_submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.newsletters) {
      tasks.push({
        key: 'newsletters',
        label: 'Clearing newsletters & subscribers',
        fn: async () => {
          // Delete tracking data first (foreign keys reference newsletters)
          const { error: clicksError } = await supabase.from('newsletter_link_clicks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (clicksError) throw clicksError;
          const { error: opensError } = await supabase.from('newsletter_email_opens').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (opensError) throw opensError;
          // Delete newsletters
          const { error: nlError } = await supabase.from('newsletters').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (nlError) throw nlError;
          // Delete subscribers
          const { error: subError } = await supabase.from('newsletter_subscribers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (subError) throw subError;
        }
      });
    }

    if (options.bookings) {
      tasks.push({
        key: 'bookings',
        label: 'Clearing bookings & services',
        fn: async () => {
          const { error } = await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
          const { error: availErr } = await supabase.from('booking_availability').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (availErr) throw availErr;
          const { error: blockedErr } = await supabase.from('booking_blocked_dates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (blockedErr) throw blockedErr;
          const { error: svcErr } = await supabase.from('booking_services').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (svcErr) throw svcErr;
        }
      });
    }

    if (options.orders) {
      tasks.push({
        key: 'orders',
        label: 'Clearing orders',
        fn: async () => {
          const { error: itemsError } = await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (itemsError) throw itemsError;
          const { error } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
          // Customer-related extras
          const { error: addrErr } = await supabase.from('customer_addresses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (addrErr) throw addrErr;
          const { error: wishErr } = await supabase.from('wishlist_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (wishErr) throw wishErr;
        }
      });
    }

    if (options.deals) {
      tasks.push({
        key: 'deals',
        label: 'Clearing deals',
        fn: async () => {
          const { error: actErr } = await supabase.from('deal_activities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (actErr) throw actErr;
          const { error } = await supabase.from('deals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.leads) {
      tasks.push({
        key: 'leads',
        label: 'Clearing leads & CRM tasks',
        fn: async () => {
          // FK references that do NOT cascade or set-null must be cleared first
          // (webinar_registrations.lead_id is NO ACTION → blocks DELETE on leads)
          const { error: wrErr } = await supabase.from('webinar_registrations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (wrErr) throw wrErr;
          const { error: actErr } = await supabase.from('lead_activities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (actErr) throw actErr;
          const { error: taskErr } = await supabase.from('crm_tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (taskErr) throw taskErr;
          // CASCADE handles deals/lead_activities/crm_tasks/pricelists;
          // SET NULL handles tickets/invoices/quotes — no pre-clear needed.
          const { error } = await supabase.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.companies) {
      tasks.push({
        key: 'companies',
        label: 'Clearing companies & sales intelligence',
        fn: async () => {
          const { error: siErr } = await supabase.from('sales_intelligence_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (siErr) throw siErr;
          const { error } = await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.products) {
      tasks.push({
        key: 'products',
        label: 'Clearing products, stock & consultants',
        fn: async () => {
          // Stock movements + per-product stock first (FK to products)
          const { error: smErr } = await supabase.from('stock_moves').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (smErr) throw smErr;
          const { error: psErr } = await supabase.from('product_stock').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (psErr) throw psErr;
          const { error: bisErr } = await supabase.from('back_in_stock_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (bisErr) throw bisErr;
          const { error: pcErr } = await supabase.from('product_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (pcErr) throw pcErr;
          const { error } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
          const { error: cpErr } = await supabase.from('consultant_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (cpErr) throw cpErr;
        }
      });
    }

    if (options.blogPosts) {
      tasks.push({
        key: 'blogPosts',
        label: 'Clearing blog posts',
        fn: async () => {
          // Clear junction tables first
          const { error: catError } = await supabase.from('blog_post_categories').delete().neq('post_id', '00000000-0000-0000-0000-000000000000');
          if (catError) throw catError;
          const { error: tagError } = await supabase.from('blog_post_tags').delete().neq('post_id', '00000000-0000-0000-0000-000000000000');
          if (tagError) throw tagError;
          const { error } = await supabase.from('blog_posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
          // Also clear categories and tags
          const { error: catDeleteError } = await supabase.from('blog_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (catDeleteError) throw catDeleteError;
          const { error: tagDeleteError } = await supabase.from('blog_tags').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (tagDeleteError) throw tagDeleteError;
        }
      });
    }

    if (options.kbArticles) {
      tasks.push({
        key: 'kbArticles',
        label: 'Clearing knowledge base',
        fn: async () => {
          const { error: articlesError } = await supabase.from('kb_articles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (articlesError) throw articlesError;
          const { error: categoriesError } = await supabase.from('kb_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (categoriesError) throw categoriesError;
        }
      });
    }

    if (options.pages) {
      tasks.push({
        key: 'pages',
        label: 'Clearing pages',
        fn: async () => {
          // Clear page versions first
          const { error: versionsError } = await supabase.from('page_versions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (versionsError) throw versionsError;
          const { error } = await supabase.from('pages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
          // Clear global blocks
          const { error: globalError } = await supabase.from('global_blocks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (globalError) throw globalError;
        }
      });
    }

    if (options.media) {
      tasks.push({
        key: 'media',
        label: 'Clearing media library',
        fn: async () => {
          // List files from all subfolders
          const folders = ['pages', 'imports', 'templates'];
          for (const folder of folders) {
            const { data: files, error: listError } = await supabase.storage
              .from('cms-images')
              .list(folder, { limit: 1000 });
            if (listError) throw listError;
            
            if (files && files.length > 0) {
              const filePaths = files.map(f => `${folder}/${f.name}`);
              const { error: deleteError } = await supabase.storage
                .from('cms-images')
                .remove(filePaths);
              if (deleteError) throw deleteError;
            }
          }
        }
      });
    }

    if (options.engineRoom) {
      tasks.push({
        key: 'engineRoom',
        label: 'Resetting FlowPilot brain (objectives, memory, activity)',
        fn: async () => {
          await wipe('agent_objective_activities');
          await wipe('agent_objectives');
          await wipe('agent_activity');
          await wipe('agent_memory');
          await wipe('agent_automations');
          await wipe('agent_workflows');
          await wipe('agent_audit_trail');
          await wipe('agent_events');
          await wipe('agent_locks');
          await wipe('ai_usage_logs');
          await wipe('pending_operations');
          await wipe('chat_feedback');
          await wipe('chat_messages');
          await wipe('chat_conversations');
          await wipe('flowpilot_briefings');
          await wipe('content_proposals');
          await wipe('content_research');
          await wipe('installed_template');
          await wipe('audit_logs');
          await wipe('auth_events');
          await wipe('autonomy_test_runs');
          await wipe('platform_test_runs');
          await wipe('bootstrap_runs');
          await wipe('beta_test_exchanges');
          await wipe('beta_test_findings');
          await wipe('beta_test_sessions');
          await wipe('demo_run_items');
          await wipe('demo_runs');
          await wipe('page_views');
        }
      });
    }

    // -------------------- HR --------------------
    if (options.hr) {
      tasks.push({
        key: 'hr',
        label: 'Clearing HR (employees, leave, contracts, recruitment)',
        fn: async () => {
          await supabase.from('candidate_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('applications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('application_stages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('job_postings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('one_on_ones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('performance_reviews').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('performance_goals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('onboarding_checklists').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('onboarding_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('leave_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('leave_allocations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('vacation_policies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('attendance_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('employment_contracts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('employment_contract_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('employee_skills').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('employee_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('certifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('skills_catalog').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          const { error } = await supabase.from('employees').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    // -------------------- Operations --------------------
    if (options.operations) {
      tasks.push({
        key: 'operations',
        label: 'Clearing projects, tasks, time entries & expenses',
        fn: async () => {
          await wipe('time_entries');
          await wipe('project_tasks');
          await wipe('project_members');
          await wipe('projects');
          await wipe('expense_attachments');
          await wipe('expense_payments');
          await wipe('expenses');
          await wipe('handbook_chapters');
          await wipe('wiki_pages');
          await wipe('river_reactions');
          await wipe('river_posts');
          await wipe('timesheet_period_locks');
        }
      });
    }

    // -------------------- Procurement & inventory --------------------
    if (options.procurement) {
      tasks.push({
        key: 'procurement',
        label: 'Clearing vendors, purchase orders & goods receipts',
        fn: async () => {
          await wipe('rfq_bids');
          await wipe('rfq_lines');
          await wipe('rfqs');
          await wipe('goods_receipt_lines');
          await wipe('goods_receipts');
          await wipe('purchase_order_lines');
          await wipe('purchase_orders');
          await wipe('procurement_suggestions');
          await wipe('reorder_rules');
          await wipe('tolerance_policies');
          await wipe('vendor_invoices');
          await wipe('vendor_products');
          await wipe('vendors');
          // Manufacturing
          await wipe('mo_components');
          await wipe('manufacturing_orders');
          await wipe('bom_lines');
          await wipe('bom_headers');
          // Warehouse / fulfilment
          await wipe('shipments');
          await wipe('picking_lines');
          await wipe('picking_orders');
          await wipe('carriers');
          await wipe('stock_reservations');
          await wipe('stock_lots');
          await wipe('stock_quants');
          await wipe('stock_locations');
          // POS
          await wipe('pos_payments');
          await wipe('pos_sale_lines');
          await wipe('pos_sales');
          await wipe('pos_sessions');
          await wipe('pos_registers');
          // Returns
          await wipe('return_items');
          await wipe('returns');
        }
      });
    }

    // -------------------- Finance --------------------
    if (options.finance) {
      tasks.push({
        key: 'finance',
        label: 'Clearing quotes, invoices, accounting & payroll',
        fn: async () => {
          await wipe('quote_signatures');
          await wipe('quote_versions');
          await wipe('quote_items');
          await wipe('quotes');
          await wipe('quote_templates');
          await wipe('payment_reconciliations');
          await wipe('dunning_actions');
          await wipe('dunning_sequences');
          await wipe('invoices');
          await wipe('reconciliation_matches');
          await wipe('bank_transactions');
          await wipe('bank_import_batches');
          await wipe('bank_accounts');
          await wipe('payroll_export_lines');
          await wipe('payroll_exports');
          await wipe('payroll_lines');
          await wipe('payroll_runs');
          await wipe('payroll_components');
          // expense_reports + depreciation_entries hold journal_entry_id FKs — must clear before journal_entries
          await wipe('expense_reports');
          await wipe('depreciation_entries');
          await wipe('fixed_assets');
          await wipe('analytic_lines');
          await wipe('analytic_accounts');
          await wipe('accounting_corrections');
          await wipe('journal_entry_line_taxes');
          await wipe('journal_entry_lines');
          await wipe('journal_entries');
          await wipe('journals');
          await wipe('opening_balances');
          await wipe('accounting_periods');
          await wipe('accounting_templates');
          await wipe('chart_of_accounts');
          await wipe('tax_code_grids');
          await wipe('tax_grids');
          await wipe('tax_codes');
          await wipe('exchange_rates');
          await wipe('currencies');
        }
      });
    }

    // -------------------- Service --------------------
    if (options.service) {
      tasks.push({
        key: 'service',
        label: 'Clearing tickets, SLA, contracts, documents & subscriptions',
        fn: async () => {
          await wipe('ticket_comments');
          await wipe('support_escalations');
          await wipe('tickets');
          await wipe('support_agents');
          await wipe('sla_violations');
          await wipe('sla_policies');
          await wipe('feedback');
          await wipe('contract_signatures');
          await wipe('contract_versions');
          await wipe('contract_documents');
          await wipe('contracts');
          await wipe('contract_templates');
          await wipe('documents');
          await wipe('subscription_winback_sends');
          await wipe('subscription_winback_campaigns');
          await wipe('subscription_churn_reasons');
          await wipe('subscription_events');
          await wipe('subscriptions');
          await wipe('service_order_lines');
          await wipe('service_visits');
          await wipe('service_orders');
          await wipe('approval_decisions');
          await wipe('approval_requests');
          await wipe('approval_rules');
        }
      });
    }

    // -------------------- Growth --------------------
    if (options.growth) {
      tasks.push({
        key: 'growth',
        label: 'Clearing ad campaigns, webinars & surveys',
        fn: async () => {
          await wipe('ad_creatives');
          await wipe('ad_campaigns');
          await wipe('webinar_registrations');
          await wipe('webinars');
          await wipe('survey_sends');
          await wipe('survey_responses');
          await wipe('survey_campaigns');
          await wipe('survey_templates');
        }
      });
    }

    // -------------------- Federation & integrations --------------------
    if (options.federation) {
      tasks.push({
        key: 'federation',
        label: 'Clearing federation peers, webhooks & API keys',
        fn: async () => {
          await wipe('federation_connections');
          await wipe('webhook_logs');
          await wipe('webhooks');
          await wipe('api_keys');
          await wipe('peer_invitations');
          await wipe('clawable_messages');
          await wipe('clawable_sessions');
          await wipe('a2a_activity');
          await wipe('a2a_peers');
        }
      });
    }

    if (options.settings) {
      tasks.push({
        key: 'settings',
        label: 'Resetting settings to defaults',
        fn: async () => {
          const defaultSettings = [
            { key: 'seo', value: { siteTitle: '', titleTemplate: '%s', defaultDescription: '', ogImage: '', twitterHandle: '', googleSiteVerification: '', robotsIndex: true, robotsFollow: true, developmentMode: false, requireAuthInDevMode: false } },
            { key: 'performance', value: { lazyLoadImages: true, prefetchLinks: true, minifyHtml: false, enableServiceWorker: false, imageCacheMaxAge: 31536000, cacheStaticAssets: true, enableEdgeCaching: false, edgeCacheTtlMinutes: 5 } },
            { key: 'branding', value: {} },
            { key: 'chat', value: { enabled: false, title: 'AI Assistant', placeholder: 'Ask a question...', welcomeMessage: 'Hi! How can I help you today?', aiProvider: 'openai', openaiModel: 'gpt-4o-mini', systemPrompt: '', toolCallingEnabled: false, widgetEnabled: false, blockEnabled: true, saveConversations: true, includeContentAsContext: false, feedbackEnabled: true } },
            { key: 'blog', value: { enabled: true, postsPerPage: 10, showAuthorBio: true, showReadingTime: true, showReviewer: false, archiveTitle: 'Blog', archiveSlug: 'blog', rssEnabled: true } },
            { key: 'general', value: { homepageSlug: 'home', contentReviewEnabled: false } },
            { key: 'cookie_banner', value: { enabled: true, title: 'We use cookies', description: 'We use cookies to improve your experience.', policyLinkText: 'Privacy Policy', policyLinkUrl: '/privacy', acceptButtonText: 'Accept all', rejectButtonText: 'Essential only' } },
            { key: 'maintenance', value: { enabled: false, title: 'Site under maintenance', message: 'We will be back soon.', expectedEndTime: '' } },
            { key: 'system_ai', value: { provider: 'openai', openaiModel: 'gpt-4.1-mini', openaiReasoningModel: 'gpt-4.1', geminiModel: 'gemini-2.5-flash', geminiReasoningModel: 'gemini-2.5-pro', anthropicModel: 'claude-sonnet-4-20250514', anthropicReasoningModel: 'claude-sonnet-4-20250514', defaultTone: 'professional', defaultLanguage: 'en' } },
            { key: 'aeo', value: { enabled: false } },
            { key: 'custom_scripts', value: { headStart: '', headEnd: '', bodyStart: '', bodyEnd: '' } },
            { key: 'store', value: { currency: 'USD', taxRate: 0, taxDisplay: 'hidden', taxLabel: 'VAT', storeName: '' } },
            { key: 'autonomy_schedule', value: { timezone: 'Europe/Stockholm', heartbeatEnabled: true, heartbeatHours: [0, 12], briefingEnabled: true, briefingHour: 8, learnEnabled: true, learnHour: 3 } },
            { key: 'modules', value: {} },
            { key: 'footer', value: {} },
            { key: 'integrations', value: {} },
            { key: 'kb', value: { enabled: true, menuSlug: 'help', menuTitle: 'Help', showInMenu: true } },
            { key: 'custom_themes', value: [] },
            // Business identity — reset to blank so a fresh site has no leftover company profile
            { key: 'company_name', value: '' },
            { key: 'company_profile', value: {} },
          ];

          // Also delete any ad-hoc business identity keys that aren't in the upsert list
          await (supabase as any).from('site_settings').delete().in('key', ['business_identity', 'business_profile']);

          for (const setting of defaultSettings) {
            const { error } = await supabase
              .from('site_settings')
              .upsert({ key: setting.key, value: setting.value }, { onConflict: 'key' });
            if (error) throw error;
          }
        }
      });
    }

    // -------------------- Dynamic module wipes (manifest-driven) --------------------
    // Run all selected modules' tables in one multi-pass loop so cross-module
    // FKs (e.g. expense_reports → journal_entries) resolve themselves.
    const selectedIds = moduleOwnership
      .filter(m => selectedModules.has(m.moduleId))
      .map(m => m.moduleId as keyof ModulesSettings);
    if (selectedIds.length > 0) {
      tasks.push({
        key: 'pages', // placeholder — not used for module tasks
        label: `Modules: ${selectedIds.length} selected (${selectedIds.reduce((n, id) => n + (moduleOwnership.find(m => m.moduleId === id)?.tables.length ?? 0), 0)} tables)`,
        fn: async () => {
          const results = await wipeModulesData(selectedIds);
          const failed = results.filter(r => !r.ok);
          if (failed.length > 0) {
            throw new Error(`${failed.length} tables failed: ${failed.map(f => `${f.module}.${f.table}`).slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}`);
          }
        },
      });
    }


    // Initialize progress items
    setProgress(tasks.map(t => ({ label: t.label, status: 'pending' as const })));

    let completed = 0;
    for (const task of tasks) {
      updateProgress(task.label, 'running');
      try {
        await task.fn();
        updateProgress(task.label, 'done');
        completed++;
        setOverallProgress(Math.round((completed / tasks.length) * 100));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        updateProgress(task.label, 'error', errorMsg);
        logger.error(`Error in ${task.label}:`, error);
      }
    }

    setStep('complete');
    setIsResetting(false);
  };

  const handlePasswordSubmit = async () => {
    setPasswordError('');
    
    const isValid = await verifyPassword();
    if (!isValid) {
      setPasswordError('Incorrect password. Please try again.');
      return;
    }

    await executeReset();
  };

  const selectedCount = Object.values(options).filter(Boolean).length + selectedModules.size;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {step === 'warning' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                  <ShieldAlert className="h-6 w-6 text-destructive" />
                </div>
                <div>
                  <DialogTitle>Reset Site</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                You are about to permanently delete all selected data from your site. 
                This action is irreversible and will remove content, settings, and files.
              </AlertDescription>
            </Alert>

            <div className="mt-4 space-y-3">
              <Label className="text-sm font-medium">Select what to reset:</Label>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Content</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.pages} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, pages: !!c }))} 
                    />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Pages & Global Blocks
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.blogPosts} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, blogPosts: !!c }))} 
                    />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Blog Posts
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.kbArticles} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, kbArticles: !!c }))} 
                    />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Knowledge Base
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.products} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, products: !!c }))} 
                    />
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Products
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">CRM</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.leads} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, leads: !!c }))} 
                    />
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Leads
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.companies} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, companies: !!c }))} 
                    />
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Companies
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.deals} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, deals: !!c }))} 
                    />
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Deals
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.formSubmissions} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, formSubmissions: !!c }))} 
                    />
                    Form Submissions
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.newsletters} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, newsletters: !!c }))} 
                    />
                    Newsletter Subscribers
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.bookings} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, bookings: !!c }))} 
                    />
                    Bookings
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.orders} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, orders: !!c }))} 
                    />
                    Orders
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">System</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.media} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, media: !!c }))} 
                    />
                    <Image className="h-4 w-4 text-muted-foreground" />
                    Media Library
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.settings} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, settings: !!c }))} 
                    />
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    Site Settings
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox 
                      checked={options.engineRoom} 
                      onCheckedChange={(c) => setOptions(p => ({ ...p, engineRoom: !!c }))} 
                    />
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    FlowPilot brain (objectives, memory, activity)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ERP — People & Ops</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.hr} onCheckedChange={(c) => setOptions(p => ({ ...p, hr: !!c }))} />
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    HR (employees, leave, recruitment)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.operations} onCheckedChange={(c) => setOptions(p => ({ ...p, operations: !!c }))} />
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    Projects, time & expenses
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.procurement} onCheckedChange={(c) => setOptions(p => ({ ...p, procurement: !!c }))} />
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    Procurement & inventory
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">ERP — Finance & Service</p>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.finance} onCheckedChange={(c) => setOptions(p => ({ ...p, finance: !!c }))} />
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    Quotes, invoices & accounting
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.service} onCheckedChange={(c) => setOptions(p => ({ ...p, service: !!c }))} />
                    <LifeBuoy className="h-4 w-4 text-muted-foreground" />
                    Tickets, contracts & subscriptions
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.growth} onCheckedChange={(c) => setOptions(p => ({ ...p, growth: !!c }))} />
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    Growth (ads, webinars)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={options.federation} onCheckedChange={(c) => setOptions(p => ({ ...p, federation: !!c }))} />
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    Federation, webhooks & API keys
                  </label>
                </div>
              </div>

              {moduleOwnership.length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    Modular (manifest-driven)
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Modules that declare their own tables. New modules appear here automatically.
                    {countsLoading && ' Scanning row counts…'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {moduleOwnership.map(m => {
                      const count = moduleRowCounts[m.moduleId];
                      const isEmpty = count === 0;
                      return (
                        <label
                          key={m.moduleId}
                          className={`flex items-center gap-2 text-sm ${isEmpty ? 'opacity-50' : ''}`}
                        >
                          <Checkbox
                            checked={selectedModules.has(m.moduleId)}
                            disabled={isEmpty}
                            onCheckedChange={(c) => {
                              setSelectedModules(prev => {
                                const next = new Set(prev);
                                if (c) next.add(m.moduleId); else next.delete(m.moduleId);
                                return next;
                              });
                            }}
                          />
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <span>{m.moduleName}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {count === undefined ? `${m.tables.length}t` :
                             count === null ? '?' :
                             count === 0 ? 'empty' :
                             `${count} rows`}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                variant="destructive" 
                onClick={() => setStep('confirm')}
                disabled={selectedCount === 0}
              >
                Continue ({selectedCount} selected)
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>Confirm Reset</DialogTitle>
              <DialogDescription>
                Type "RESET" to confirm you want to proceed
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  You are about to delete {selectedCount} categories of data. 
                  This cannot be undone.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="confirm">Type RESET to continue</Label>
                <Input
                  id="confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="RESET"
                  className="font-mono"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('warning')}>Back</Button>
              <Button 
                variant="destructive" 
                onClick={() => setStep('password')}
                disabled={confirmText !== 'RESET'}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'password' && (
          <>
            <DialogHeader>
              <DialogTitle>Password Verification</DialogTitle>
              <DialogDescription>
                Enter your password to confirm this action
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                {passwordError && (
                  <p className="text-sm text-destructive">{passwordError}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('confirm')}>Back</Button>
              <Button 
                variant="destructive" 
                onClick={handlePasswordSubmit}
                disabled={!password || isResetting}
              >
                {isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset Site
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'progress' && (
          <>
            <DialogHeader>
              <DialogTitle>Resetting Site...</DialogTitle>
              <DialogDescription>
                Please wait while we reset your site
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Progress value={overallProgress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{overallProgress}% complete</p>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {progress.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    {item.status === 'pending' && (
                      <div className="h-4 w-4 rounded-full border-2 border-muted" />
                    )}
                    {item.status === 'running' && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                    {item.status === 'done' && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {item.status === 'error' && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className={item.status === 'error' ? 'text-destructive' : ''}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 'complete' && (() => {
          const doneCount = progress.filter(p => p.status === 'done').length;
          const errorItems = progress.filter(p => p.status === 'error');
          const hasErrors = errorItems.length > 0;
          return (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${hasErrors ? 'bg-destructive/10' : 'bg-green-500/10'}`}>
                    {hasErrors
                      ? <XCircle className="h-6 w-6 text-destructive" />
                      : <CheckCircle2 className="h-6 w-6 text-green-500" />}
                  </div>
                  <div>
                    <DialogTitle>{hasErrors ? 'Reset Completed with Errors' : 'Reset Complete'}</DialogTitle>
                    <DialogDescription>
                      {doneCount} area{doneCount === 1 ? '' : 's'} cleared
                      {hasErrors && ` · ${errorItems.length} error${errorItems.length === 1 ? '' : 's'}`}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {hasErrors && (
                <div className="space-y-2 py-2">
                  {errorItems.map((item) => (
                    <div key={item.label} className="flex items-start gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                      <span className="text-destructive">
                        {item.label}
                        {item.error && <span className="text-xs text-muted-foreground ml-2">({item.error})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <details className="py-2">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
                  Show details ({progress.length} steps)
                </summary>
                <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto pl-1">
                  {progress.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm">
                      {item.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                      {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                      <span className={item.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </details>

              <DialogFooter>
                <Button onClick={() => {
                  handleClose();
                  toast.success('Site has been reset');
                  window.location.reload();
                }}>
                  Done
                </Button>
              </DialogFooter>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
