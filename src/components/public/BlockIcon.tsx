import { useEffect, useState, type ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

type IconProps = Omit<LucideProps, 'ref'>;
type IconMap = Record<string, ComponentType<IconProps>>;

/*
 * Loaded once, shared by every block. After the first load the lookup is
 * synchronous, so a later render never flickers through the placeholder.
 */
let loaded: IconMap | null = null;
let loading: Promise<IconMap> | null = null;
const loadIcons = () =>
  (loading ??= import('@/lib/lucide-icon-map').then((m) => (loaded = m.icons as unknown as IconMap)));

interface BlockIconProps extends IconProps {
  /** Icon name as stored in block data (PascalCase, e.g. "FileText"). */
  name: string | null | undefined;
  /** Rendered when the name is empty or unknown — pass a static import. */
  fallback: ComponentType<IconProps>;
}

/**
 * An icon chosen by name in block data, without shipping the icon set in the
 * page's first chunk.
 *
 * Five public blocks did `import { icons } from 'lucide-react'` to look an icon
 * up by name. That map IS the whole library — 1 541 icons, ~380 KB — and it sat
 * in the chunk every visitor must download and parse before the page draws a
 * line of text. On a phone that parse is what the visitor waits for (optic's
 * landing page, 2026-09-16).
 *
 * Now the set is one separate chunk, fetched when a block that needs an icon
 * mounts, i.e. after the page has already painted. A page with no icon blocks
 * never fetches it. An unknown name ("Sheep", invented by a composer) still
 * renders the fallback. The placeholder keeps the icon's box, so nothing
 * shifts when the icon arrives.
 *
 * NOT lucide's dynamicIconImports: measured, its 1 541-entry loader map with
 * Vite's preload wrappers made the main chunk BIGGER (2 214 → 2 430 KB) and
 * added 1 450 files.
 */
export function BlockIcon({ name, fallback: Fallback, ...props }: BlockIconProps) {
  const [icons, setIcons] = useState<IconMap | null>(loaded);

  useEffect(() => {
    if (icons || !name) return;
    let alive = true;
    loadIcons().then((m) => { if (alive) setIcons(m); }, () => { /* fallback stays */ });
    return () => { alive = false; };
  }, [icons, name]);

  if (!name) return <Fallback {...props} />;
  if (!icons) return <span aria-hidden className={props.className} style={{ display: 'inline-block' }} />;
  const Icon = icons[name.trim()] ?? Fallback;
  return <Icon {...props} />;
}
