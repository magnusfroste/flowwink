import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Bot, Copy, FileBarChart, History, LayoutDashboard, Loader2, Lock, Pencil, Search, Unlock, X } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { callSkill } from '@/lib/call-skill';
import { useAuth } from '@/hooks/useAuth';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { ReportBody } from '@/components/admin/reports/ReportBody';
import { subjectHref, subjectLabel } from '@/lib/report-subjects';
import {
  useArchiveReport, useReports, useReportVersions, useRestoreReportVersion, useSetReportDetails,
  type ReportCard,
} from '@/hooks/useReports';

/**
 * Reports — what agents worked out, as pages (src/lib/modules/reports-module.ts).
 * Agents publish (publish_report); a person reads, archives, restores a
 * version and renames — and what a person renames, agents keep.
 */
export default function ReportsPage() {
  const { slug } = useParams<{ slug?: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { data: reports = [], isLoading, isError } = useReports(showArchived);

  // ?for=accounting — the reports written for one module's people, as the
  // accounting workspace links them. A chip shows it and clears it.
  const audience = params.get('for');
  const forAudience = useMemo(() => reports.filter((r) => !audience || r.audience_module === audience), [reports, audience]);
  const categories = useMemo(() => [...new Set(forAudience.map((r) => r.category).filter(Boolean) as string[])].sort(), [forAudience]);
  const shown = forAudience.filter((r) =>
    (!category || r.category === category) &&
    (!search || `${r.title} ${r.description ?? ''} ${r.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())));
  const current = reports.find((r) => r.slug === slug) ?? null;
  // The overview dashboard is published by a daily automation, but an
  // instance that got the module before its automation (an existing one) has
  // none yet: an admin creates it here with one click.
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const createOverview = useMutation({
    mutationFn: () => callSkill<{ slug?: string }>('publish_overview_dashboard'),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['reports'] }); navigate(`/admin/reports/${r.slug ?? 'overview'}`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const hasOverview = reports.some((r) => r.slug === 'overview') || showArchived;

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Reports"
          description="What FlowPilot, Flowwork and your agents worked out — as pages. Every publish is a version; only people archive or rename."
        />
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reports" className="pl-8" />
            </div>
            {audience && (
              <Badge variant="secondary" className="gap-1 font-normal">
                For {audience}
                <button type="button" aria-label="Show every report" className="ml-0.5 hover:text-foreground"
                  onClick={() => { const p = new URLSearchParams(params); p.delete('for'); setParams(p); }}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant={category ? 'outline' : 'secondary'} className="h-7" onClick={() => setCategory(null)}>All</Button>
                {categories.map((c) => (
                  <Button key={c} size="sm" variant={category === c ? 'secondary' : 'outline'} className="h-7" onClick={() => setCategory(c)}>{c}</Button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Show archived
            </label>
            {isAdmin && !isLoading && !hasOverview && (
              <Button size="sm" variant="outline" className="w-full" disabled={createOverview.isPending} onClick={() => createOverview.mutate()}>
                {createOverview.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <LayoutDashboard className="mr-2 h-3.5 w-3.5" />}
                Create the overview dashboard
              </Button>
            )}
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : isError ? <p className="text-sm text-destructive">Could not read the reports.</p>
                : shown.length === 0 ? <EmptyList />
                  : (
                    <ul className="space-y-1.5">
                      {shown.map((r) => (
                        <li key={r.id}>
                          <Link to={`/admin/reports/${r.slug}${audience ? `?for=${encodeURIComponent(audience)}` : ''}`}
                            className={cn('block rounded-lg border border-border p-3 transition-colors hover:bg-accent/60',
                              r.slug === slug && 'border-primary/50 bg-accent', r.status === 'archived' && 'opacity-60')}>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium leading-snug">{r.title}</span>
                              <Badge variant="outline" className="shrink-0 font-normal">v{r.current_version}</Badge>
                            </div>
                            {r.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>}
                            <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                              {r.category && <span>{r.category}</span>}
                              {r.status === 'archived' && <span>· archived</span>}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
          </aside>
          <section className="min-w-0">
            {current ? (
              <ReportView
                report={current}
                version={Number(params.get('v')) || null}
                onVersion={(v) => { const p = new URLSearchParams(params); if (v) p.set('v', String(v)); else p.delete('v'); setParams(p); }}
                onGone={() => navigate('/admin/reports')}
              />
            ) : slug && !isLoading ? (
              <p className="text-sm text-muted-foreground">No report <code>{slug}</code> that your role may read.</p>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                <FileBarChart className="mx-auto mb-3 h-8 w-8" />
                Pick a report on the left.
              </div>
            )}
          </section>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function EmptyList() {
  return (
    <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">No reports yet.</p>
      <p className="mt-1">Ask FlowPilot or Flowwork for one — "make a report of last month's costs" — or give an external agent the
        <code className="mx-1">publish_report</code> skill over MCP.</p>
    </div>
  );
}

function ReportView({ report, version, onVersion, onGone }: {
  report: ReportCard; version: number | null; onVersion: (v: number | null) => void; onGone: () => void;
}) {
  const { formatDateTime } = usePlatformFormat();
  const { data: versions = [], isLoading } = useReportVersions(report.id);
  const archive = useArchiveReport();
  const restore = useRestoreReportVersion();
  const [editing, setEditing] = useState(false);
  const shown = versions.find((v) => v.version === (version ?? report.current_version)) ?? versions[0];
  const isOld = !!shown && shown.version !== report.current_version;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-serif text-2xl">
            {report.title}
            {report.locked_fields.length > 0 && <Lock className="h-4 w-4 text-muted-foreground" aria-label="Set by a person — agents keep it" />}
          </h2>
          {report.description && <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>}
          {shown && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              {shown.requested_by ? `${shown.requested_by} via ${shown.published_by}` : shown.published_by}
              <span>· {formatDateTime(shown.created_at)}</span>
              {report.category && <Badge variant="outline" className="font-normal">{report.category}</Badge>}
              {report.audience_module && <Badge variant="outline" className="font-normal">for {report.audience_module}</Badge>}
              {report.subject_type && <SubjectBadge type={report.subject_type} id={report.subject_id} />}
              {report.status === 'archived' && <Badge variant="secondary">Archived</Badge>}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={String(shown?.version ?? '')} onValueChange={(v) => onVersion(Number(v) === report.current_version ? null : Number(v))}>
            <SelectTrigger className="h-8 w-[150px]" aria-label="Version"><History className="mr-1 h-3.5 w-3.5" /><SelectValue placeholder="Version" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.version} value={String(v.version)}>
                  v{v.version}{v.version === report.current_version ? ' (current)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/admin/reports/${report.slug}`).then(
              () => toast.success('Link copied'), () => toast.error('Could not copy the link'));
          }}><Copy className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(true)} aria-label="Rename"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" className="h-8" disabled={archive.isPending}
            onClick={() => archive.mutate({ p_slug: report.slug, p_archived: report.status !== 'archived' }, { onSuccess: () => { if (report.status !== 'archived') onGone(); } })}
            aria-label={report.status === 'archived' ? 'Restore from archive' : 'Archive'}>
            {report.status === 'archived' ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {isOld && shown && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <span>You are reading version {shown.version}{shown.note ? ` — ${shown.note}` : ''}. The current one is {report.current_version}.</span>
          <Button size="sm" variant="outline" disabled={restore.isPending}
            onClick={() => restore.mutate({ p_slug: report.slug, p_version: shown.version }, { onSuccess: () => onVersion(null) })}>
            Restore as newest
          </Button>
        </div>
      )}
      {!isOld && shown?.note && <p className="text-xs text-muted-foreground">This version: {shown.note}</p>}

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : shown ? <ReportBody format={shown.format} content={shown.content} />
          : <p className="text-sm text-muted-foreground">This report has no content yet.</p>}

      <DetailsDialog report={report} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

function DetailsDialog({ report, open, onOpenChange }: { report: ReportCard; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSetReportDetails();
  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description ?? '');
  const [category, setCategory] = useState(report.category ?? '');
  const locked = new Set(report.locked_fields);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) { setTitle(report.title); setDescription(report.description ?? ''); setCategory(report.category ?? ''); } onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Report details</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">What you change here is kept: an agent's next version will not overwrite it. Unlock a field to hand it back to the agents.</p>
        {([
          ['title', 'Title', title, setTitle],
          ['description', 'Description', description, setDescription],
          ['category', 'Category', category, setCategory],
        ] as const).map(([field, label, value, set]) => (
          <div key={field} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`report-${field}`}>{label}</Label>
              {locked.has(field) && (
                <Button type="button" size="sm" variant="ghost" className="h-6 text-xs"
                  onClick={() => save.mutate({ p_slug: report.slug, p_unlock: [field] })}>
                  <Unlock className="mr-1 h-3 w-3" /> Hand back to agents
                </Button>
              )}
            </div>
            {field === 'description'
              ? <Textarea id={`report-${field}`} value={value} onChange={(e) => set(e.target.value)} rows={3} />
              : <Input id={`report-${field}`} value={value} onChange={(e) => set(e.target.value)} />}
          </div>
        ))}
        <DialogFooter>
          <Button disabled={save.isPending} onClick={() => save.mutate({
            p_slug: report.slug,
            ...(title !== report.title ? { p_title: title } : {}),
            ...(description !== (report.description ?? '') ? { p_description: description } : {}),
            ...(category !== (report.category ?? '') ? { p_category: category } : {}),
          }, { onSuccess: () => onOpenChange(false) })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What the report is about, linking to its page when it has one. */
function SubjectBadge({ type, id }: { type: string; id: string | null }) {
  const href = subjectHref(type, id);
  const label = `About: ${subjectLabel(type)}${!href && id ? ` ${id}` : ''}`;
  return href
    ? <Link to={href}><Badge variant="outline" className="font-normal hover:bg-accent">{label} →</Badge></Link>
    : <Badge variant="outline" className="font-normal">{label}</Badge>;
}
