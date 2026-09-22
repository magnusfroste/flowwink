import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { History, MessageSquare, Clock } from "lucide-react";
import { useProjectChanges } from "@/hooks/useProjects";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";
import {
  SINCE_PRESETS, countsLabel, readSincePreset, sinceFor, writeSincePreset,
  type ChangeComment, type ChangeEntry, type ProjectChanges, type SincePreset,
} from "@/lib/project-changes";

/**
 * What changed since the last meeting — per project, or the whole portfolio.
 *
 * The digest is the database's (project_changes reads the task ledger every
 * writer feeds); the "since" is the viewer's and is remembered per browser.
 * A window that opens before the ledger began says so per project: before
 * that point only creation and completion are known, and an empty section
 * there means "not recorded", not "nothing happened".
 */
export function ProjectChangesPanel({ projectId }: { projectId: string | null }) {
  const [preset, setPreset] = useState<SincePreset>(() => readSincePreset());
  const since = sinceFor(preset);
  const { data, isLoading, error } = useProjectChanges(projectId, since);
  const { formatDateTime } = usePlatformFormat();

  const choose = (p: SincePreset) => { setPreset(p); writeSincePreset(p); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={preset} onValueChange={(v) => choose(v as SincePreset)}>
          <SelectTrigger className="h-8 w-56 text-xs" aria-label="Changes since">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SINCE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">From {formatDateTime(since.toISOString())}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : !data?.projects.length ? (
        <EmptyState
          icon={History}
          title="Nothing changed"
          description={projectId ? "No task in this project was touched in this window." : "No project was touched in this window."}
        />
      ) : (
        data.projects.map((p) => (
          <ProjectDigest key={p.project_id} digest={p} showName={!projectId} formatDateTime={formatDateTime} />
        ))
      )}

      {!projectId && !!data?.quiet.length && (
        <p className="text-xs text-muted-foreground">
          Quiet: {data.quiet.map((q) => q.name).join(", ")}
        </p>
      )}
    </div>
  );
}

function ProjectDigest({ digest: d, showName, formatDateTime }: {
  digest: ProjectChanges; showName: boolean; formatDateTime: (iso: string) => string;
}) {
  const summary = countsLabel(d.counts);
  const people = d.comments.filter((c) => c.author_type === "person");
  const agents = d.comments.filter((c) => c.author_type !== "person");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {showName && <span>{d.name}</span>}
          {summary && <span className="text-xs font-normal text-muted-foreground">{summary}</span>}
        </CardTitle>
        {d.coverage === "partial" && (
          <p className="text-xs text-muted-foreground">
            Recorded from {formatDateTime(d.history_from)}. Before that, only which tasks were created and completed is known — an empty list is not "nothing happened".
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!summary && <p className="text-muted-foreground">Nothing changed.</p>}
        <Section title="Completed" items={d.completed} render={(e) => <Line e={e} formatDateTime={formatDateTime} />} />
        <Section title="Created" items={d.created} render={(e) => <Line e={e} formatDateTime={formatDateTime} />} />
        <Section title="Reopened" items={d.reopened} render={(e) => <Line e={e} detail={`→ ${e.to}`} formatDateTime={formatDateTime} />} />
        <Section title="Moved" items={d.moved} render={(e) => <Line e={e} detail={`${e.from} → ${e.to}`} formatDateTime={formatDateTime} />} />
        <Section title="Reprioritised" items={d.reprioritised} render={(e) => <Line e={e} detail={`${e.from} → ${e.to}`} formatDateTime={formatDateTime} />} />
        <Section title="Reassigned" items={d.reassigned} render={(e) => <Line e={e} detail={`${e.from ?? "nobody"} → ${e.to ?? "nobody"}`} formatDateTime={formatDateTime} />} />
        <Section title="Rescheduled" items={d.rescheduled} render={(e) => <Line e={e} detail={`${e.from ?? "no date"} → ${e.to ?? "no date"}`} formatDateTime={formatDateTime} />} />
        <Section title="Renamed" items={d.renamed} render={(e) => <Line e={{ ...e, title: e.to }} detail={`was "${e.from}"`} formatDateTime={formatDateTime} />} />
        <Section title="Progress" items={d.progressed} render={(e) => <Line e={e} detail={`${e.from ?? "—"} → ${e.to ?? "—"}`} formatDateTime={formatDateTime} />} />
        <Section title="Dependencies" items={d.dependencies} render={(e) => <Line e={e} detail={`${e.change} "${e.on}"`} formatDateTime={formatDateTime} />} />
        <Section title="Milestones" items={d.milestones} render={(e) => <Line e={{ ...e, title: e.name }} detail={e.change} formatDateTime={formatDateTime} />} />
        <Section title="Deleted" items={d.deleted} render={(e) => <Line e={e} detail={`was ${e.was}`} formatDateTime={formatDateTime} />} />
        {!!people.length && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Said by people</h4>
            <ul className="space-y-1.5">{people.map((c, i) => <CommentLine key={i} c={c} formatDateTime={formatDateTime} />)}</ul>
          </div>
        )}
        {!!agents.length && (
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Done by agents</h4>
            <ul className="space-y-1.5">{agents.map((c, i) => <CommentLine key={i} c={c} formatDateTime={formatDateTime} />)}</ul>
          </div>
        )}
        {d.hours.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{d.hours.total} h logged</span>
            {d.hours.by_person.map((h) => (
              <Badge key={h.name} variant="outline" className="text-[10px]">{h.name} · {h.hours} h</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section<T>({ title, items, render }: { title: string; items: T[]; render: (item: T) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      <ul className="space-y-1">{items.map((item, i) => <li key={i}>{render(item)}</li>)}</ul>
    </div>
  );
}

function Line({ e, detail, formatDateTime }: { e: ChangeEntry; detail?: string; formatDateTime: (iso: string) => string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-medium">{e.title}</span>
      {detail && <span className="text-muted-foreground">{detail}</span>}
      <span className="text-[11px] text-muted-foreground">{formatDateTime(e.at)} · {e.by}</span>
    </div>
  );
}

function CommentLine({ c, formatDateTime }: { c: ChangeComment; formatDateTime: (iso: string) => string }) {
  return (
    <li className="flex gap-2">
      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
          {c.title && <span className="font-medium text-foreground">{c.title}</span>}
          <Badge variant="outline" className="h-4 px-1 text-[10px]">{c.kind}</Badge>
          <span>{c.author} · {formatDateTime(c.at)}</span>
        </div>
        <p className="whitespace-pre-line">{c.body}</p>
      </div>
    </li>
  );
}
