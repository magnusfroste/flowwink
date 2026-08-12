import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Link } from 'react-router-dom';
import {
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
  RotateCcw,
  FileText,
  FileSignature,
  BookOpen,
  Layout,
  Users,
  UserCheck,
  Table2,
} from 'lucide-react';
import type { WorkspaceCitation } from '@/hooks/useWorkspaceChat';
import {
  ALL_WORKSPACE_SOURCES,
  type WorkspaceSource,
} from '@/hooks/useWorkspaceChat';

interface Props {
  citations: WorkspaceCitation[];
  sources: WorkspaceSource[];
  onSourcesChange: (next: WorkspaceSource[]) => void;
  onResetSources: () => void;
  /** Ref of the citation currently hovered/clicked in the answer. */
  activeCitation?: number | null;
  onActiveCitationChange?: (ref: number | null) => void;
}

const TYPE_LABEL: Record<string, string> = {
  document: 'Document',
  contract: 'Contract',
  employment_contract: 'Employment',
  kb_article: 'KB',
  page: 'Page',
  lead: 'Lead',
  deal: 'Deal',
  employee: 'Employee',
  // Citation TYPES come from the retrieval layer; source KEYS from the chat.
  // Two lists that drift unless extended together — a wiki citation used to
  // render the raw string 'wiki'.
  wiki: 'Wiki',
  handbook: 'Handbook',
  flowtable: 'Flowtable',
  skill: 'Live data',
  attachment: 'Attachment',
};

/**
 * Where an "Open" on a citation should land.
 *
 * FlowWork's reader is always signed-in staff, and it cites nine source types —
 * documents, contracts, employees, CRM records — of which only pages and KB
 * articles ever have a public address. So the internal view is the consistent
 * destination, not the exception.
 *
 * KB got that wrong in a way worth remembering: the retrieval layer stamped
 * `/kb/<slug>` into each chunk's metadata, the citation rendered it verbatim,
 * and no such route existed — every KB citation was a 404 dressed as a
 * quality signal. Route it to the admin reading panel instead
 * (`?article=<id>`), which opens the article in a reading panel with Edit as
 * the secondary action. Other types keep whatever URL retrieval gave them.
 */
function citationHref(c: WorkspaceCitation): string | undefined {
  if (c.type === 'kb_article' && c.id) return `/admin/knowledge-base?article=${c.id}`;
  return c.url || undefined;
}

const SOURCE_META: Record<
  WorkspaceSource,
  { label: string; Icon: any }
> = {
  documents: { label: 'Documents', Icon: FileText },
  contracts: { label: 'Contracts', Icon: FileSignature },
  kb: { label: 'Knowledge Base', Icon: BookOpen },
  pages: { label: 'Pages', Icon: Layout },
  crm: { label: 'CRM', Icon: Users },
  employees: { label: 'Employees', Icon: UserCheck },
  wiki: { label: 'Wiki', Icon: BookOpen },
  handbook: { label: 'Handbook', Icon: BookOpen },
  flowtable: { label: 'Flowtable', Icon: Table2 },
};

export function CitationsDrawer({
  citations,
  sources,
  onSourcesChange,
  onResetSources,
  activeCitation,
  onActiveCitationChange,
}: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Bring the highlighted citation into view when the answer points at it.
  useEffect(() => {
    if (activeCitation == null) return;
    cardRefs.current[activeCitation]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [activeCitation]);

  const toggle = (key: WorkspaceSource) => {
    if (sources.includes(key)) {
      onSourcesChange(sources.filter((k) => k !== key));
    } else {
      onSourcesChange([...sources, key]);
    }
  };

  const allSelected = sources.length === ALL_WORKSPACE_SOURCES.length;

  return (
    <Card className="border-border/60 h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Sources cited{' '}
          <span className="text-xs text-muted-foreground font-normal">
            ({citations.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0 flex flex-col">
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 pb-4 space-y-2">
            {citations.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4">
                No citations yet. Ask a question — sources used in the answer
                will appear here.
              </p>
            ) : (
              citations.map((c) => {
                const active = activeCitation === c.ref;
                return (
                  <div
                    key={`${c.type}-${c.id}-${c.ref}`}
                    ref={(el) => {
                      cardRefs.current[c.ref] = el;
                    }}
                    onMouseEnter={() => onActiveCitationChange?.(c.ref)}
                    onMouseLeave={() => onActiveCitationChange?.(null)}
                    className={
                      active
                        ? 'rounded-md border border-primary/60 bg-primary/5 ring-1 ring-primary/30 p-3 transition-colors'
                        : 'rounded-md border border-border/60 bg-card/50 p-3 hover:bg-accent/50 transition-colors'
                    }
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-primary mt-0.5">
                        [{c.ref}]
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5 h-4"
                          >
                            {TYPE_LABEL[c.type] || c.type}
                          </Badge>
                        </div>
                        <p
                          className="text-sm font-medium truncate"
                          title={c.title}
                        >
                          {c.title}
                        </p>
                        {citationHref(c) && (
                          <Link
                            to={citationHref(c)!}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                          >
                            Open <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>


        {/* Sources filter — collapsed by default */}
        <Separator />
        <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center justify-between px-6 py-2.5 text-xs hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Filter className="h-3 w-3" />
                Sources{' '}
                <span className="text-foreground/70">
                  ({allSelected ? 'all' : sources.length})
                </span>
              </span>
              {sourcesOpen ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-6 pb-4 pt-1 space-y-2">
            <div className="flex items-center justify-end gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSourcesChange([...ALL_WORKSPACE_SOURCES])}
                className="h-6 text-[11px] px-2"
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSourcesChange([])}
                className="h-6 text-[11px] px-2"
              >
                None
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetSources}
                className="h-6 text-[11px] gap-1 px-2"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </Button>
            </div>
            {ALL_WORKSPACE_SOURCES.map((key) => {
              const meta = SOURCE_META[key];
              const Icon = meta.Icon;
              const checked = sources.includes(key);
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <Checkbox
                    id={`src-${key}`}
                    checked={checked}
                    onCheckedChange={() => toggle(key)}
                  />
                  <Label
                    htmlFor={`src-${key}`}
                    className="flex items-center gap-1.5 text-xs cursor-pointer flex-1"
                  >
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    {meta.label}
                  </Label>
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
