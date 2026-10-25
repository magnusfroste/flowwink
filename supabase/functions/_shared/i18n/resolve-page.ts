/**
 * The page in language L — the source structure with the overlay's text.
 *
 * One function, imported by the edge (`get-page`) and by the app (the admin
 * preview, PublicPage's DB fallback): `src/` already imports from
 * `_shared/` directly (forms/delivery-plan, email/sender-identity), so there
 * is no twin to keep in step. The block renderers receive a tree of the same
 * shape as the source and never learn that language exists.
 *
 * A unit with no entry keeps the SOURCE text — visible, never hidden — and is
 * named in `fallback_units` so the admin can count it and the operator can
 * see it. A stale entry (its source changed since it was written) is still
 * shown: it is a translation of something very close, and better than the
 * source language; it is named in `stale_units`.
 *
 * Design: docs/architecture/page-translations.md §2.3.
 */
import {
  applyOverlay, collectEntityUnits, collectUnits, diffOverlay, overlayReplacements,
  type ContentEntity, type OverlayEntry, type PageLike, type PostLike, type TranslationUnit,
} from './translation-units.ts';

export interface OverlayRow {
  locale: string;
  status?: string | null;
  slug?: string | null;
  strings: Record<string, OverlayEntry> | null;
}

export interface ResolvedPage<T> {
  /** The page with the overlay applied — same keys, same structure. */
  page: T;
  /** The language the text is in: the overlay's locale, or the page's own when no overlay was given. */
  locale: string | null;
  /** The overlay's per-language slug, when one is set. */
  slug: string | null;
  units_total: number;
  /** Units with no entry — shown in the source language. */
  fallback_units: string[];
  /** Units whose source text changed after they were translated — shown, but behind. */
  stale_units: string[];
  /** Entries whose unit no longer exists on the page. */
  orphan_units: string[];
  /** fresh / total, 0–100. 100 with no overlay means a page with no text. */
  coverage: number;
}

export function resolvePageInLocale<T extends PageLike>(page: T, overlay: OverlayRow | null | undefined): ResolvedPage<T> {
  return resolveWithUnits(page, overlay, collectUnits(page));
}

/** Any overlaid content — a page, a blog post — through the same resolver. */
export function resolveContentInLocale<T extends PageLike & PostLike>(entity: ContentEntity, row: T, overlay: OverlayRow | null | undefined): ResolvedPage<T> {
  return resolveWithUnits(row, overlay, collectEntityUnits(entity, row));
}

function resolveWithUnits<T>(row: T, overlay: OverlayRow | null | undefined, units: TranslationUnit[]): ResolvedPage<T> {
  if (!overlay) {
    return {
      page: JSON.parse(JSON.stringify(row)) as T,
      locale: typeof (row as unknown as { locale?: unknown }).locale === 'string' ? (row as unknown as { locale: string }).locale : null,
      slug: null,
      units_total: units.length,
      fallback_units: [],
      stale_units: [],
      orphan_units: [],
      coverage: 100,
    };
  }
  const diff = diffOverlay(units, overlay.strings);
  const resolved = applyOverlay(row, overlayReplacements(units, overlay.strings)) as T;
  return {
    page: resolved,
    locale: overlay.locale,
    slug: overlay.slug ?? null,
    units_total: units.length,
    fallback_units: diff.missing.map((u) => u.unit),
    stale_units: diff.stale.map((u) => u.unit),
    orphan_units: diff.orphans,
    coverage: units.length ? Math.round((diff.fresh.length / units.length) * 100) : 100,
  };
}
