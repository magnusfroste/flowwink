import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pin, PinOff } from 'lucide-react';
import type { WikiPageListItem } from '@/hooks/useWiki';
import { useAuth } from '@/hooks/useAuth';
import { useWikiPins } from '@/hooks/useWikiPins';
import { groupByTag, tagsInUse } from '@/lib/wiki-tags';
import { cn } from '@/lib/utils';

interface Props {
  pages: WikiPageListItem[];
  activeSlug: string;
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

function Row({ page, activeSlug, pins }: { page: WikiPageListItem; activeSlug: string; pins: PinControls }) {
  return (
    <li>
      <div className={`group flex items-center rounded pl-2 hover:bg-accent ${page.slug === activeSlug ? 'bg-accent' : ''}`}>
        <Link
          to={`/admin/wiki/${page.slug}`}
          className={`min-w-0 flex-1 truncate py-1.5 pr-2 text-sm ${page.slug === activeSlug ? 'font-medium' : ''}`}
          title={page.slug}
        >
          {page.title}
        </Link>
        <PinButton slug={page.slug} pins={pins} />
      </div>
    </li>
  );
}

/**
 * The left column groups pages by tag — a label, not a folder. A page with two
 * tags appears under both; groups are always open (no expander to hit);
 * newest first inside a group, so recurring notes read as a series. The chips
 * narrow the column to one tag. Pages without a tag sit under "Untagged" at
 * the end, visible rather than lost at a root.
 *
 * Why not the tree: the tree exists (parent_slug) and nobody used it — optic's
 * 37 pages all sat at the root, with the grouping done by hand in the titles
 * ("Sälj - …", "Produkt - …"). A title prefix is a label no code can read; a
 * tag is.
 */
export function WikiGroups({ pages, activeSlug }: Props) {
  const { user } = useAuth();
  const { pins: pinnedSlugs, isPinned, toggle: togglePin, atLimit, maxPins } = useWikiPins(user?.id);
  const pins: PinControls = { isPinned, toggle: togglePin, atLimit, maxPins, enabled: !!user?.id };
  const [only, setOnly] = useState<string | null>(null);

  const pinnedPages = useMemo(() => {
    const bySlug = new Map(pages.map((p) => [p.slug, p]));
    return pinnedSlugs.map((slug) => bySlug.get(slug)).filter((p): p is WikiPageListItem => !!p);
  }, [pinnedSlugs, pages]);

  const chips = useMemo(() => tagsInUse(pages), [pages]);
  const groups = useMemo(() => groupByTag(pages, only), [pages, only]);

  if (pages.length === 0) {
    return <p className="px-3 py-6 text-center text-xs text-muted-foreground">No pages yet.</p>;
  }

  return (
    <div className="min-w-0 overflow-hidden">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b p-2">
          {chips.map((c) => (
            <button
              key={c.tag}
              type="button"
              onClick={() => setOnly(only === c.tag ? null : c.tag)}
              aria-pressed={only === c.tag}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                only === c.tag ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {c.tag} <span className="opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      )}

      {pinnedPages.length > 0 && !only && (
        <div className="border-b">
          <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pinned</p>
          <ul className="p-1 pt-0">
            {pinnedPages.map((p) => <Row key={`pin-${p.slug}`} page={p} activeSlug={activeSlug} pins={pins} />)}
          </ul>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.tag ?? '__untagged'}>
          <h3 className="flex items-baseline gap-1.5 px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {g.label}
            <span className="font-normal normal-case tracking-normal opacity-60" aria-label={`${g.pages.length} pages`}>{g.pages.length}</span>
          </h3>
          <ul className="p-1 pt-0">
            {g.pages.map((p) => <Row key={`${g.tag ?? 'untagged'}-${p.slug}`} page={p} activeSlug={activeSlug} pins={pins} />)}
          </ul>
        </div>
      ))}
      {only && groups.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No page carries this tag.</p>
      )}
    </div>
  );
}
