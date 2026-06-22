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
  Image,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Sparkles,
  Package,
} from 'lucide-react';
import { getAllModuleOwnership, wipeModulesData, countModuleRows } from '@/lib/module-data-ownership';
import type { ModulesSettings } from '@/hooks/useModules';

interface ResetSiteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ResetStep = 'warning' | 'confirm' | 'password' | 'progress' | 'complete';

/**
 * Cross-cutting wipes that don't belong to a single module.
 * Module-owned data (pages, blog, leads, finance, hr, ...) is now wiped
 * exclusively via the manifest-driven module list below.
 */
interface ResetOptions {
  media: boolean;       // storage bucket (cms-images)
  settings: boolean;    // site_settings keys → defaults
  engineRoom: boolean;  // FlowPilot brain: objectives, memory, activity, audit
}

const defaultOptions: ResetOptions = {
  media: true,
  settings: true,
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

    // Helper: bulk-delete all rows from a table by name. Untyped on purpose.
    const wipe = async (table: string) => {
      const client = supabase as any;
      let { error } = await client.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error && /column .*id.* does not exist/i.test(error.message ?? '')) {
        const res = await client.from(table).delete().not('created_at', 'is', null);
        error = res.error;
      }
      if (error) {
        logger.warn(`[reset] wipe(${table}) failed:`, error.message);
      }
    };

    const tasks: { label: string; fn: () => Promise<void> }[] = [];

    // -------------------- Module-owned data (manifest-driven) --------------------
    // All business data — pages, blog, leads, finance, hr, orders, etc. — is
    // owned by a module and wiped through the module's manifest. This is the
    // single source of truth: no legacy hardcoded clears coexist.
    const selectedIds = moduleOwnership
      .filter(m => selectedModules.has(m.moduleId))
      .map(m => m.moduleId as keyof ModulesSettings);
    if (selectedIds.length > 0) {
      const tableCount = selectedIds.reduce(
        (n, id) => n + (moduleOwnership.find(m => m.moduleId === id)?.tables.length ?? 0),
        0
      );
      tasks.push({
        label: `Modules: ${selectedIds.length} selected (${tableCount} tables)`,
        fn: async () => {
          const results = await wipeModulesData(selectedIds);
          const failed = results.filter(r => !r.ok);
          if (failed.length > 0) {
            throw new Error(
              `${failed.length} tables failed: ${failed
                .map(f => `${f.module}.${f.table}`)
                .slice(0, 5)
                .join(', ')}${failed.length > 5 ? '…' : ''}`
            );
          }
        },
      });
    }

    // -------------------- Cross-cutting: Media library --------------------
    if (options.media) {
      tasks.push({
        label: 'Clearing media library',
        fn: async () => {
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
        },
      });
    }

    // -------------------- Cross-cutting: FlowPilot brain --------------------
    if (options.engineRoom) {
      tasks.push({
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
        },
      });
    }

    // -------------------- Cross-cutting: Site settings --------------------
    if (options.settings) {
      tasks.push({
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
            { key: 'autonomy_schedule', value: { timezone: 'Europe/Stockholm', heartbeatEnabled: true, briefingEnabled: true, briefingHour: 8, learnEnabled: true, learnHour: 3, heartbeatHours: [0, 12] } },
            { key: 'modules', value: {} },
            { key: 'footer', value: {} },
            { key: 'integrations', value: {} },
            { key: 'kb', value: { enabled: true, menuSlug: 'help', menuTitle: 'Help', showInMenu: true } },
            { key: 'custom_themes', value: [] },
            { key: 'company_name', value: '' },
            { key: 'company_profile', value: {} },
          ];

          await (supabase as any).from('site_settings').delete().in('key', ['business_identity', 'business_profile']);

          for (const setting of defaultSettings) {
            const { error } = await supabase
              .from('site_settings')
              .upsert({ key: setting.key, value: setting.value }, { onConflict: 'key' });
            if (error) throw error;
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

            <div className="mt-4 space-y-4">
              {/* Cross-cutting platform toggles */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Platform</p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={options.settings}
                    onCheckedChange={(c) => setOptions(p => ({ ...p, settings: !!c }))}
                  />
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Site Settings (reset to defaults)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={options.engineRoom}
                    onCheckedChange={(c) => setOptions(p => ({ ...p, engineRoom: !!c }))}
                  />
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  FlowPilot brain (objectives, memory, activity)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={options.media}
                    onCheckedChange={(c) => setOptions(p => ({ ...p, media: !!c }))}
                  />
                  <Image className="h-4 w-4 text-muted-foreground" />
                  Media Library
                </label>
              </div>

              {/* Module-owned data */}
              {moduleOwnership.length > 0 && (
                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Modules
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedModules(new Set(moduleOwnership.filter(m => (moduleRowCounts[m.moduleId] ?? 0) > 0).map(m => m.moduleId)))}
                      >
                        Select all
                      </button>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                        onClick={() => setSelectedModules(new Set())}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Each module owns its own tables. Empty modules are disabled.
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
                          <span className="truncate">{m.moduleName}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
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
