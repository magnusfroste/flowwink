import { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
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

interface Props {
  pages: DocsPage[];
}

export function DocsSidebar({ pages }: Props) {
  const location = useLocation();

  const grouped = useMemo(() => {
    const map = new Map<string, DocsPage[]>();
    for (const p of pages) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    const ordered = [...map.entries()].sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return ordered;
  }, [pages]);

  return (
    <ScrollArea className="h-[calc(100vh-9rem)] pr-4">
      <nav className="space-y-6 pb-12">
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

        {grouped.map(([category, items]) => (
          <div key={category} className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-2">
              {CATEGORY_LABELS[category] ?? category}
            </div>
            {items.map((p) => {
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
        ))}
      </nav>
    </ScrollArea>
  );
}
