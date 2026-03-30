import { logger } from '@/lib/logger';
import { useState } from 'react';
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
  Sparkles
} from 'lucide-react';

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

  const resetState = () => {
    setStep('warning');
    setOptions(defaultOptions);
    setConfirmText('');
    setPassword('');
    setPasswordError('');
    setProgress([]);
    setOverallProgress(0);
    setIsResetting(false);
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
        }
      });
    }

    if (options.deals) {
      tasks.push({
        key: 'deals',
        label: 'Clearing deals',
        fn: async () => {
          const { error } = await supabase.from('deals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.leads) {
      tasks.push({
        key: 'leads',
        label: 'Clearing leads',
        fn: async () => {
          const { error } = await supabase.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.companies) {
      tasks.push({
        key: 'companies',
        label: 'Clearing companies',
        fn: async () => {
          const { error } = await supabase.from('companies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
        }
      });
    }

    if (options.products) {
      tasks.push({
        key: 'products',
        label: 'Clearing products & consultants',
        fn: async () => {
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
        label: 'Resetting Engine Room (objectives, memory, activity)',
        fn: async () => {
          // Clear objective activities junction first
          const { error: oaErr } = await supabase.from('agent_objective_activities').delete().neq('objective_id', '00000000-0000-0000-0000-000000000000');
          if (oaErr) throw oaErr;
          // Clear objectives
          const { error: objErr } = await supabase.from('agent_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (objErr) throw objErr;
          // Clear activity log
          const { error: actErr } = await supabase.from('agent_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (actErr) throw actErr;
          // Clear memory (except soul/identity which get re-seeded)
          const { error: memErr } = await supabase.from('agent_memory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (memErr) throw memErr;
          // Clear automations
          const { error: autoErr } = await supabase.from('agent_automations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (autoErr) throw autoErr;
          // Clear chat conversations & messages
          const { error: feedbackErr } = await supabase.from('chat_feedback').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (feedbackErr) throw feedbackErr;
          const { error: msgErr } = await supabase.from('chat_messages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (msgErr) throw msgErr;
          const { error: convErr } = await supabase.from('chat_conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (convErr) throw convErr;
          // Clear workflows
          const { error: wfErr } = await supabase.from('agent_workflows').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (wfErr) throw wfErr;
          // Clear briefings
          const { error: brErr } = await supabase.from('flowpilot_briefings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (brErr) throw brErr;
          // Clear content proposals & research
          const { error: cpErr } = await supabase.from('content_proposals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (cpErr) throw cpErr;
          const { error: crErr } = await supabase.from('content_research').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (crErr) throw crErr;
          // Clear installed template marker
          const { error: tmplErr } = await supabase.from('installed_template').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (tmplErr) throw tmplErr;
          // Clear audit logs
          const { error: auditErr } = await supabase.from('audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (auditErr) throw auditErr;
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
            { key: 'system_ai', value: { provider: 'openai', openaiModel: 'gpt-4.1-mini', openaiReasoningModel: 'gpt-4.1', geminiModel: 'gemini-2.5-flash', geminiReasoningModel: 'gemini-2.5-pro', defaultTone: 'professional', defaultLanguage: 'en' } },
            { key: 'aeo', value: { enabled: false } },
            { key: 'custom_scripts', value: { headStart: '', headEnd: '', bodyStart: '', bodyEnd: '' } },
            { key: 'store', value: { currency: 'USD', taxRate: 0, taxDisplay: 'hidden', taxLabel: 'VAT', storeName: '' } },
            { key: 'autonomy_schedule', value: { timezone: 'Europe/Stockholm', heartbeatEnabled: true, heartbeatHours: [0, 12], briefingEnabled: true, briefingHour: 8, learnEnabled: true, learnHour: 3 } },
            { key: 'modules', value: {} },
            { key: 'footer', value: {} },
            { key: 'integrations', value: {} },
            { key: 'kb', value: { enabled: true, menuSlug: 'help', menuTitle: 'Help', showInMenu: true } },
            { key: 'custom_themes', value: [] },
          ];

          for (const setting of defaultSettings) {
            const { error } = await supabase
              .from('site_settings')
              .upsert({ key: setting.key, value: setting.value }, { onConflict: 'key' });
            if (error) throw error;
          }
        }
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

  const selectedCount = Object.values(options).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
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
                    Engine Room (objectives, memory, activity)
                  </label>
                </div>
              </div>
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

        {step === 'complete' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <DialogTitle>Reset Complete</DialogTitle>
                  <DialogDescription>
                    Your site has been reset successfully
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-2 py-4 max-h-64 overflow-y-auto">
              {progress.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  {item.status === 'done' && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {item.status === 'error' && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={item.status === 'error' ? 'text-destructive' : ''}>
                    {item.label}
                    {item.error && <span className="text-xs text-muted-foreground ml-2">({item.error})</span>}
                  </span>
                </div>
              ))}
            </div>

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
        )}
      </DialogContent>
    </Dialog>
  );
}
