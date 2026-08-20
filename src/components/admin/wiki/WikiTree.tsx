import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Pin, PinOff } from 'lucide-react';
import type { WikiPageListItem } from '@/hooks/useWiki';
import { useAuth } from '@/hooks/useAuth';
import { useWikiPins } from '@/hooks/useWikiPins';

interface Props {
  pages: WikiPageListItem[];
  activeSlug: string;
}

interface Node extends WikiPageListItem {
  children: Node[];
}

/** Build a parent/child tree; orphans (missing parent) are treated as roots. */
function buildTree(pages: WikiPageListItem[]): Node[] {
  const bySlug = new Map<string, Node>();
  pages.forEach((p) => bySlug.set(p.slug, { ...p, children: [] }));
  const roots: Node[] = [];
  bySlug.forEach((node) => {
    const parent = node.parent_slug ? bySlug.get(node.parent_slug) : undefined;
    if (parent && parent.slug !== node.slug) parent.children.push(node);
    else roots.push(node);
  });
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.title.localeCompare(b.title));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function ancestorsOf(pages: WikiPageListItem[], slug: string): Set<string> {
  const map = new Map(pages.map((p) => [p.slug, p]));
  const out = new Set<string>();
  let cur = map.get(slug)?.parent_slug ?? null;
  let guard = 0;
  while (cur && guard++ < 50) {
    out.add(cur);
    cur = map.get(cur)?.parent_slug ?? null;
  }
  return out;
}

interface PinControls {
  isPinned: (slug: string) => boolean;
  toggle: (slug: string) => void;
  atLimit: boolean;
  maxPins: number;
  enabled: boolean;
}

/**
 * The affordance stays out of the way until wanted: invisible until the row is
 * hovered or focused, and always visible once the page IS pinned — the pin is
 * then state, not an offer, and hiding state behind hover is how people lose
 * track of what they pinned.
 */
function PinButton({ slug, pins }: { slug: string; pins: PinControls }) {
  if (!pins.enabled) return null;
  const pinned = pins.isPinned(slug);
  const blocked = !pinned && pins.atLimit;
  return (
    <button
      type="button"
      onClick={(e) => {
        // The row is a link; pinning must not navigate.
        e.preventDefault();
        e.stopPropagation();
        if (!blocked) pins.toggle(slug);
      }}
      disabled={blocked}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${slug}` : `Pin ${slug}`}
      title={
        blocked
          ? `Pin limit reached (${pins.maxPins}) — unpin something first`
          : pinned ? 'Unpin' : 'Pin to the top'
      }
      className={`mr-1 shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:text-foreground ${
        pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
      } ${blocked ? 'cursor-not-allowed' : ''}`}
    >
      {pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
    </button>
  );
}

function Row({
  node,
  depth,
  activeSlug,
  openSet,
  toggle,
  pins,
}: {
  node: Node;
  depth: number;
  activeSlug: string;
  openSet: Set<string>;
  toggle: (slug: string) => void;
  pins: PinControls;
}) {
  const hasKids = node.children.length > 0;
  const open = openSet.has(node.slug);
  return (
    <li>
      <div
        className={`group flex items-center rounded hover:bg-accent ${
          node.slug === activeSlug ? 'bg-accent' : ''
        }`}
        style={{ paddingLeft: depth * 12 }}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={() => toggle(node.slug)}
            aria-label={open ? 'Collapse' : 'Expand'}
            className="p-1 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-5" />
        )}
        <Link
          to={`/admin/wiki/${node.slug}`}
          className={`flex-1 truncate py-1.5 pr-2 text-sm ${
            node.slug === activeSlug ? 'font-medium' : ''
          }`}
          title={node.slug}
        >
          {node.title}
        </Link>
        <PinButton slug={node.slug} pins={pins} />
      </div>
      {hasKids && open && (
        <ul>
          {node.children.map((c) => (
            <Row
              key={c.slug}
              node={c}
              depth={depth + 1}
              activeSlug={activeSlug}
              openSet={openSet}
              toggle={toggle}
              pins={pins}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function WikiTree({ pages, activeSlug }: Props) {
  // Read here rather than through props: WikiPage.tsx is the busiest file in
  // this feature, and the tree is where pinning is both seen and done.
  const { user } = useAuth();
  const { pins: pinnedSlugs, isPinned, toggle: togglePin, atLimit, maxPins } = useWikiPins(user?.id);
  const pins: PinControls = { isPinned, toggle: togglePin, atLimit, maxPins, enabled: !!user?.id };

  /**
   * Pins resolve against the LIVE page list, in the order they were pinned.
   * A pin whose page was deleted resolves to nothing and stops rendering; a
   * renamed page keeps its pin and shows its new title, because the slug is
   * the key and the title is read fresh.
   */
  const pinnedPages = useMemo(() => {
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    return pinnedSlugs.map((slug) => bySlug.get(slug)).filter((p): p is WikiPageListItem => !!p);
  }, [pinnedSlugs, pages]);

  const tree = useMemo(() => buildTree(pages), [pages]);
  const autoOpen = useMemo(() => ancestorsOf(pages, activeSlug), [pages, activeSlug]);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const openSet = useMemo(() => {
    const s = new Set<string>(autoOpen);
    // Default: roots open one level so the structure is visible at a glance.
    tree.forEach((r) => s.add(r.slug));
    closed.forEach((slug) => s.delete(slug));
    return s;
  }, [autoOpen, tree, closed]);

  const toggle = (slug: string) =>
    setClosed((prev) => {
      const next = new Set(prev);
      if (openSet.has(slug)) next.add(slug);
      else next.delete(slug);
      return next;
    });

  if (pages.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">No pages yet.</p>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden">
      {pinnedPages.length > 0 && (
        <div className="border-b">
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Pinned
          </p>
          <ul className="p-1 pt-0">
            {pinnedPages.map((p) => (
              <li key={`pin-${p.slug}`}>
                <div
                  className={`group flex items-center rounded hover:bg-accent ${
                    p.slug === activeSlug ? 'bg-accent' : ''
                  }`}
                >
                  {/* Flat, not nested: a pin is a shortcut past the hierarchy,
                      so re-drawing the hierarchy here would defeat it. */}
                  <span className="w-5" />
                  <Link
                    to={`/admin/wiki/${p.slug}`}
                    className={`flex-1 truncate py-1.5 pr-2 text-sm ${
                      p.slug === activeSlug ? 'font-medium' : ''
                    }`}
                    title={p.slug}
                  >
                    {p.title}
                  </Link>
                  <PinButton slug={p.slug} pins={pins} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="p-1">
        {tree.map((n) => (
          <Row key={n.slug} node={n} depth={0} activeSlug={activeSlug} openSet={openSet} toggle={toggle} pins={pins} />
        ))}
      </ul>
    </div>
  );
}
