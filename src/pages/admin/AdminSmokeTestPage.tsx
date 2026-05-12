/**
 * Admin Smoke Test
 *
 * Runs the most common admin actions (leads, blog, KB) end-to-end through
 * `agent-execute` so we can quickly detect regressions like 401s, missing
 * skills, broken handlers, or contract drift — and report failures directly
 * in the UI instead of finding them through FlowChat.
 */

import { useState } from 'react';
import {
  Play,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

type Status = 'pending' | 'running' | 'pass' | 'fail' | 'skip';

interface StepResult {
  status: Status;
  duration_ms?: number;
  error?: string;
  output?: any;
}

interface Ctx {
  leadId?: string;
  blogPostId?: string;
  blogPostSlug?: string;
  articleId?: string;
  articleSlug?: string;
}

interface Step {
  key: string;
  group: 'leads' | 'blog' | 'kb';
  title: string;
  description: string;
  skill: string;
  args: (ctx: Ctx) => Record<string, any> | null;
  capture?: (output: any, ctx: Ctx) => void;
  optional?: boolean;
}

function buildSteps(runId: string): Step[] {
  const email = `smoke+${runId}@flowwink.test`;
  const blogTitle = `Smoke Test Post ${runId}`;
  const kbSlugBase = `smoke-test-${runId}`;
  return [
    {
      key: 'leads.list',
      group: 'leads',
      title: 'List leads',
      description: 'manage_leads · action=list',
      skill: 'manage_leads',
      args: () => ({ action: 'list', limit: 5 }),
    },
    {
      key: 'leads.add',
      group: 'leads',
      title: 'Add lead',
      description: 'add_lead · creates a smoke-test lead',
      skill: 'add_lead',
      args: () => ({ name: `Smoke Test ${runId}`, email, source: 'smoke-test' }),
      capture: (out, ctx) => {
        ctx.leadId = out?.lead?.id ?? out?.id ?? out?.lead_id;
      },
    },
    {
      key: 'leads.update',
      group: 'leads',
      title: 'Update lead status',
      description: 'manage_leads · action=update status=opportunity',
      skill: 'manage_leads',
      args: (ctx) =>
        ctx.leadId ? { action: 'update', lead_id: ctx.leadId, status: 'opportunity' } : null,
    },
    {
      key: 'leads.delete',
      group: 'leads',
      title: 'Delete lead (cleanup)',
      description: 'manage_leads · action=delete',
      skill: 'manage_leads',
      args: (ctx) => (ctx.leadId ? { action: 'delete', lead_id: ctx.leadId } : null),
    },
    {
      key: 'blog.categories',
      group: 'blog',
      title: 'List blog categories',
      description: 'manage_blog_categories · action=list',
      skill: 'manage_blog_categories',
      args: () => ({ action: 'list' }),
      optional: true,
    },
    {
      key: 'blog.draft',
      group: 'blog',
      title: 'Draft blog post',
      description: 'write_blog_post · status=draft',
      skill: 'write_blog_post',
      args: () => ({
        title: blogTitle,
        content: 'This post was created by the admin smoke test. Safe to delete.',
        status: 'draft',
      }),
      capture: (out, ctx) => {
        ctx.blogPostId = out?.post?.id ?? out?.id ?? out?.post_id;
        ctx.blogPostSlug = out?.post?.slug ?? out?.slug;
      },
    },
    {
      key: 'blog.publish',
      group: 'blog',
      title: 'Publish blog post',
      description: 'write_blog_post · status=published (single call)',
      skill: 'write_blog_post',
      args: () => ({
        title: `${blogTitle} (published)`,
        content: 'Published by the admin smoke test. Safe to delete.',
        status: 'published',
      }),
    },
    {
      key: 'kb.create',
      group: 'kb',
      title: 'Create KB article',
      description: 'manage_kb_article · action=create',
      skill: 'manage_kb_article',
      args: () => ({
        action: 'create',
        title: `Smoke Test KB ${runId}`,
        slug: kbSlugBase,
        question: 'Is the smoke test working?',
        answer: 'Yes — this article was created by the admin smoke test.',
      }),
      capture: (out, ctx) => {
        ctx.articleId = out?.article_id ?? out?.id;
        ctx.articleSlug = out?.slug ?? kbSlugBase;
      },
    },
    {
      key: 'kb.publish',
      group: 'kb',
      title: 'Publish KB article',
      description: 'manage_kb_article · action=publish (chained from create)',
      skill: 'manage_kb_article',
      args: (ctx) => {
        if (!ctx.articleId && !ctx.articleSlug) return null;
        return ctx.articleId
          ? { action: 'publish', article_id: ctx.articleId }
          : { action: 'publish', slug: ctx.articleSlug };
      },
    },
    {
      key: 'kb.unpublish',
      group: 'kb',
      title: 'Unpublish KB article (cleanup)',
      description: 'manage_kb_article · action=unpublish',
      skill: 'manage_kb_article',
      args: (ctx) =>
        ctx.articleId
          ? { action: 'unpublish', article_id: ctx.articleId }
          : ctx.articleSlug
          ? { action: 'unpublish', slug: ctx.articleSlug }
          : null,
      optional: true,
    },
  ];
}

async function callSkill(name: string, args: Record<string, any>) {
  const session = (await supabase.auth.getSession()).data.session;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-execute`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };
  const t0 = performance.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ skill_name: name, arguments: args, agent_type: 'admin-smoke-test' }),
  });
  const dt = Math.round(performance.now() - t0);
  let data: any = null;
  try {
    data = await resp.json();
  } catch {
    data = { error: `HTTP ${resp.status}` };
  }
  const ok =
    resp.ok &&
    data &&
    typeof data === 'object' &&
    (data.status === 'ok' || data.success === true || data.status === 'success');
  return {
    ok,
    duration_ms: dt,
    output: data?.output ?? data?.result ?? data,
    error: ok ? undefined : data?.error || data?.message || `HTTP ${resp.status}`,
  };
}

const STATUS_BADGE: Record<Status, { label: string; className: string; icon: any }> = {
  pending: { label: 'Pending', className: 'bg-muted text-muted-foreground', icon: Clock },
  running: { label: 'Running', className: 'bg-blue-500/10 text-blue-600', icon: Loader2 },
  pass: { label: 'Pass', className: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
  fail: { label: 'Fail', className: 'bg-red-500/10 text-red-600', icon: XCircle },
  skip: { label: 'Skipped', className: 'bg-amber-500/10 text-amber-600', icon: AlertTriangle },
};

const GROUP_LABEL: Record<Step['group'], string> = {
  leads: 'Leads',
  blog: 'Blog',
  kb: 'Knowledge Base',
};

export default function AdminSmokeTestPage() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [finishedAt, setFinishedAt] = useState<string | null>(null);

  const runSuite = async () => {
    setRunning(true);
    setFinishedAt(null);
    const runId = Math.random().toString(36).slice(2, 8);
    const plan = buildSteps(runId);
    setSteps(plan);
    const initial: Record<string, StepResult> = {};
    for (const s of plan) initial[s.key] = { status: 'pending' };
    setResults(initial);
    const ctx: Ctx = {};
    const auto: Record<string, boolean> = {};

    for (const step of plan) {
      setResults((r) => ({ ...r, [step.key]: { status: 'running' } }));
      const args = step.args(ctx);
      if (!args) {
        setResults((r) => ({
          ...r,
          [step.key]: { status: 'skip', error: 'Skipped: missing context from previous step' },
        }));
        continue;
      }
      try {
        const res = await callSkill(step.skill, args);
        if (res.ok && step.capture) {
          try {
            step.capture(res.output, ctx);
          } catch {
            /* ignore capture errors */
          }
        }
        setResults((r) => ({
          ...r,
          [step.key]: {
            status: res.ok ? 'pass' : 'fail',
            duration_ms: res.duration_ms,
            error: res.error,
            output: res.output,
          },
        }));
        if (!res.ok) auto[step.key] = true;
      } catch (err: any) {
        setResults((r) => ({
          ...r,
          [step.key]: { status: 'fail', error: err?.message ?? 'Unknown error' },
        }));
        auto[step.key] = true;
      }
    }

    setExpanded((e) => ({ ...e, ...auto }));
    setFinishedAt(new Date().toISOString());
    setRunning(false);
  };

  const total = steps.length;
  const passed = Object.values(results).filter((r) => r.status === 'pass').length;
  const failed = Object.values(results).filter((r) => r.status === 'fail').length;
  const skipped = Object.values(results).filter((r) => r.status === 'skip').length;
  const failures = steps.filter((s) => results[s.key]?.status === 'fail');

  return (
    <AdminLayout>
      <AdminPageHeader
        title="Admin Smoke Test"
        description="Runs the most common admin actions (leads, blog, KB) through agent-execute and reports any failures directly here."
      >
        <Button onClick={runSuite} disabled={running}>
          {running ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" /> Run smoke test
            </>
          )}
        </Button>
      </AdminPageHeader>

      {finishedAt && (
        <Alert className="mb-4" variant={failed > 0 ? 'destructive' : 'default'}>
          <AlertTitle>
            {failed === 0
              ? `All ${passed}/${total} checks passed`
              : `${failed} of ${total} checks failed`}
          </AlertTitle>
          <AlertDescription>
            {passed} pass · {failed} fail · {skipped} skipped · finished at{' '}
            {new Date(finishedAt).toLocaleTimeString()}
            {failures.length > 0 && (
              <ul className="list-disc pl-5 mt-2">
                {failures.map((s) => (
                  <li key={s.key}>
                    <span className="font-medium">{s.title}</span>
                    {' — '}
                    <code className="text-xs">{results[s.key]?.error}</code>
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {steps.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Click <strong>Run smoke test</strong> to execute the full suite.
          </CardContent>
        </Card>
      ) : (
        (['leads', 'blog', 'kb'] as const).map((group) => {
          const groupSteps = steps.filter((s) => s.group === group);
          if (!groupSteps.length) return null;
          return (
            <Card key={group} className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">{GROUP_LABEL[group]}</CardTitle>
                <CardDescription>
                  {groupSteps.length} {groupSteps.length === 1 ? 'check' : 'checks'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {groupSteps.map((step) => {
                  const r = results[step.key] ?? { status: 'pending' as Status };
                  const meta = STATUS_BADGE[r.status];
                  const Icon = meta.icon;
                  const isOpen = expanded[step.key] ?? false;
                  const canExpand = r.status === 'fail' || r.status === 'pass';
                  return (
                    <div
                      key={step.key}
                      className="rounded-lg border bg-card overflow-hidden"
                    >
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/40 transition"
                        onClick={() =>
                          canExpand && setExpanded((e) => ({ ...e, [step.key]: !isOpen }))
                        }
                        disabled={!canExpand}
                      >
                        <Badge className={`${meta.className} gap-1 font-normal`}>
                          <Icon
                            className={`h-3 w-3 ${
                              r.status === 'running' ? 'animate-spin' : ''
                            }`}
                          />
                          {meta.label}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{step.title}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {step.description}
                          </div>
                        </div>
                        {r.duration_ms != null && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {r.duration_ms} ms
                          </span>
                        )}
                        {canExpand &&
                          (isOpen ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          ))}
                      </button>
                      {isOpen && (
                        <div className="border-t bg-muted/20 p-3 space-y-2">
                          {r.error && (
                            <div>
                              <div className="text-xs font-semibold text-red-600 mb-1">
                                Error
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-all bg-background p-2 rounded border">
                                {r.error}
                              </pre>
                            </div>
                          )}
                          {r.output != null && (
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-1">
                                Response
                              </div>
                              <pre className="text-xs whitespace-pre-wrap break-all bg-background p-2 rounded border max-h-60 overflow-auto">
                                {JSON.stringify(r.output, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </AdminLayout>
  );
}
