import type { HeaderNavItem } from '@/types/cms';

export interface MenuColumn {
  id: string;
  /** Group label; '' for the first column of top-level links. */
  title: string;
  url: string;
  links: { id: string; label: string; url: string; openInNewTab?: boolean }[];
}

/**
 * The header menu as columns — one reading, two readers: the footer's menu
 * columns and the header's desktop menu panel. Top-level items without
 * children form a first, untitled column; each group becomes a column titled
 * with its label. Hidden items (enabled: false) never appear.
 */
export function menuColumns(items: HeaderNavItem[] | undefined): MenuColumn[] {
  const visible = (items ?? []).filter((i) => i.enabled !== false && i.label);
  const leaves = visible.filter((i) => !i.children?.length);
  const groups = visible.filter((i) => i.children?.length);
  return [
    ...(leaves.length
      ? [{ id: 'leaves', title: '', url: '', links: leaves.map((l) => ({ id: l.id, label: l.label, url: l.url, openInNewTab: l.openInNewTab })) }]
      : []),
    ...groups.map((g) => ({
      id: g.id,
      title: g.label,
      url: g.url,
      links: (g.children ?? [])
        .filter((c) => c.label && c.url)
        .map((c) => ({ id: c.id, label: c.label, url: c.url, openInNewTab: c.openInNewTab })),
    })),
  ];
}

/**
 * Where the desktop menu panel's columns sit. The panel opens from the menu
 * button, which lives at the header's right edge; with one column (a site with
 * only page links) a left-starting grid put every link at the far side of the
 * screen from the button the visitor just clicked (synclairvision, 2026-10-04).
 * The header already has ONE setting for where navigation sits —
 * navAlignment, default right — so the panel follows it rather than growing a
 * second, possibly contradicting, setting.
 */
export function menuPanelJustify(navAlignment: 'left' | 'center' | 'right' | undefined | null): 'justify-start' | 'justify-center' | 'justify-end' {
  if (navAlignment === 'left') return 'justify-start';
  if (navAlignment === 'center') return 'justify-center';
  return 'justify-end';
}
