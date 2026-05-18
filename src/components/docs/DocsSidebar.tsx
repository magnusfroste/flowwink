import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Search, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocsPage } from '@/hooks/useDocs';

const CATEGORY_LABELS: Record<string, string> = {
  concepts: 'Concepts',
  modules: 'Modules',
  processes: 'Processes',
  architecture: 'Architecture',
  pilot: 'FlowPilot',
  guides: 'Guides',
  reference: 'Reference',
  agents: 'Agents',
  contributing: 'Contributing',
  mcp: 'MCP',
  archive: 'Archive',
  general: 'General',
};

const CATEGORY_ORDER = [
  'concepts',
  'modules',
  'processes',
  'architecture',
  'pilot',
  'guides',
  'reference',
  'agents',
  'mcp',
  'contributing',
  'general',
  'archive',
];

// Categories that start collapsed unless they contain the active page.
// Modules is huge (65+), so we collapse it by default.
const DEFAULT_COLLAPSED = new Set(['modules', 'archive', 'agents', 'contributing', 'mcp']);

interface Props {
  pages: DocsPage[];
}

export function DocsSidebar({ pages }: Props) {
  const location = useLocation();
  const [query, setQuery] = useState('');

  const activeCategory = useMemo(() => {
    const m = location.pathname.match(/^\/docs\/([^/]+)/);
    return m?.[1] ?? null;
  }, [location.pathname]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => {
      const desc =
        typeof p.frontmatter?.description === 'string'
          ? (p.frontmatter.description as string).toLowerCase()
          : '';
      return p.title.toLowerCase().includes(q) || desc.includes(q) || p.slug.toLowerCase().includes(q);
    });
  }, [pages, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocsPage[]>();
    for (const p of filtered) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [filtered]);

  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (cat: string) => {
    if (cat in openOverrides) return openOverrides[cat];
    if (query.trim()) return true; // expand all while searching
    if (cat === activeCategory) return true;
    return !DEFAULT_COLLAPSED.has(cat);
  };
  const toggle = (cat: string) =>
    setOpenOverrides((s) => ({ ...s, [cat]: !isOpen(cat) }));

  return (
    <ScrollArea className="h-[calc(100vh-9rem)] pr-4">
      <div className="relative mb-4">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search docs…"
          className="pl-8 pr-8 h-9 text-sm"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQuery('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <nav className="space-y-3 pb-12">
        <Link
          to="/docs"
          className={cn(
            'block text-sm font-medium px-2 py-1.5 rounded-md transition-colors',
            location.pathname === '/docs'
              ? 'bg-primary/10 text-primary'
              : 'text-foreground/80 hover:bg-muted',
          )}
        >
          Introduction
        </Link>

        {query.trim() && grouped.length === 0 && (
          <p className="text-sm text-muted-foreground px-2 py-4">No matches for "{query}".</p>
        )}

        {grouped.map(([category, items]) => {
          const open = isOpen(category);
          return (
            <div key={category} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggle(category)}
                className="w-full flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/60 transition-colors group"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                  <ChevronRight
                    className={cn(
                      'h-3 w-3 text-muted-foreground transition-transform',
                      open && 'rotate-90',
                    )}
                  />
                </span>
              </button>
              {open &&
                items.map((p) => {
                  const href = `/docs/${p.category}/${p.slug}`;
                  const active = location.pathname === href;
                  return (
                    <Link
                      key={p.id}
                      to={href}
                      className={cn(
                        'block text-sm px-2 py-1.5 rounded-md transition-colors truncate',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-foreground/70 hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {p.title}
                    </Link>
                  );
                })}
            </div>
          );
        })}
      </nav>
    </ScrollArea>
  );
}
