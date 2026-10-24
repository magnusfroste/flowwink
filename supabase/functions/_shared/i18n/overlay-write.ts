/**
 * Writing an overlay — what to translate, and how the result folds back in.
 *
 * Pure functions, so the rule "a hand-polished translation survives until its
 * source changes" is pinned by a test and not by a database:
 *
 *   plan     — split the page's units into keep (fresh), translate (missing or
 *              stale, or everything when forced) and orphans (entries whose
 *              unit is gone)
 *   number   — the strings the model sees, numbered: one per text unit, one
 *              per text NODE of a doc unit (a doc is one unit of storage, but
 *              the model translates its nodes, as translate_page always has)
 *   assemble — the new `strings`: kept entries, plus one entry per unit the
 *              model fully delivered, each stamped with the CURRENT source
 *              hash; a doc with one node missing is left untranslated rather
 *              than written half-done
 *
 * Design: docs/architecture/page-translations.md §2.2, §5.4.
 */
import { applyTranslations, collectTranslatable } from './translate-walk.ts';
import { diffOverlay, isTiptapDoc, type OverlayEntry, type TranslationUnit } from './translation-units.ts';

export interface WritePlan {
  translate: TranslationUnit[];
  keep: Record<string, OverlayEntry>;
  missing: string[];
  stale: string[];
  orphans: string[];
  total: number;
}

export function planOverlayWrite(
  units: TranslationUnit[],
  strings: Record<string, OverlayEntry> | null | undefined,
  opts: { force?: boolean } = {},
): WritePlan {
  const diff = diffOverlay(units, strings);
  const keep: Record<string, OverlayEntry> = {};
  const translate: TranslationUnit[] = [];
  if (opts.force) {
    translate.push(...units);
  } else {
    for (const u of diff.fresh) keep[u.unit] = (strings ?? {})[u.unit];
    translate.push(...diff.missing, ...diff.stale);
  }
  return {
    translate,
    keep,
    missing: diff.missing.map((u) => u.unit),
    stale: diff.stale.map((u) => u.unit),
    orphans: diff.orphans,
    total: units.length,
  };
}

export interface NumberedItem {
  i: number;
  text: string;
}

export interface Numbering {
  items: NumberedItem[];
  /** item index → which unit it belongs to and, for a doc, the node path inside the doc */
  owners: Array<{ unit: TranslationUnit; nodePath?: (string | number)[] }>;
}

export function numberForTranslation(translate: TranslationUnit[]): Numbering {
  const items: NumberedItem[] = [];
  const owners: Numbering['owners'] = [];
  for (const unit of translate) {
    if (unit.kind === 'doc') {
      for (const node of collectTranslatable(unit.doc)) {
        owners.push({ unit, nodePath: node.path });
        items.push({ i: items.length, text: node.text });
      }
    } else {
      owners.push({ unit });
      items.push({ i: items.length, text: unit.text });
    }
  }
  return { items, owners };
}

export interface Assembled {
  strings: Record<string, OverlayEntry>;
  translated: string[];
  untranslated: string[];
  coverage: number;
}

export function assembleOverlay(
  plan: WritePlan,
  numbering: Numbering,
  translations: Map<number, string>,
  existing: Record<string, OverlayEntry> | null | undefined = null,
): Assembled {
  const strings: Record<string, OverlayEntry> = { ...plan.keep };
  const translated: string[] = [];
  const untranslated: string[] = [];

  // Group delivered items per unit.
  const perUnit = new Map<string, { unit: TranslationUnit; nodes: Array<{ path: (string | number)[]; text: string }>; expected: number; got: number }>();
  numbering.owners.forEach((owner, i) => {
    const key = owner.unit.unit;
    const entry = perUnit.get(key) ?? { unit: owner.unit, nodes: [], expected: 0, got: 0 };
    entry.expected += 1;
    const t = translations.get(i);
    if (typeof t === 'string' && t.trim()) {
      entry.got += 1;
      if (owner.nodePath) entry.nodes.push({ path: owner.nodePath, text: t });
      else entry.nodes.push({ path: [], text: t });
    }
    perUnit.set(key, entry);
  });

  for (const unit of plan.translate) {
    const got = perUnit.get(unit.unit);
    if (!got || got.got < got.expected || got.expected === 0) {
      // A unit the model did not fully deliver keeps its OLD entry when there
      // was one (stale, but better than the source language) and is counted
      // untranslated.
      const old = existing?.[unit.unit];
      if (old) strings[unit.unit] = old;
      untranslated.push(unit.unit);
      continue;
    }
    if (unit.kind === 'doc') {
      const doc = applyTranslations(unit.doc, got.nodes);
      if (!isTiptapDoc(doc)) { untranslated.push(unit.unit); continue; }
      strings[unit.unit] = { doc, source_hash: unit.hash };
    } else {
      strings[unit.unit] = { text: got.nodes[0].text, source_hash: unit.hash };
    }
    translated.push(unit.unit);
  }

  const fresh = Object.keys(plan.keep).length + translated.length;
  return {
    strings,
    translated,
    untranslated,
    coverage: plan.total ? Math.round((fresh / plan.total) * 100) : 100,
  };
}

/** Coverage of an existing overlay against the page as it is now. */
export function coverageOf(units: TranslationUnit[], strings: Record<string, OverlayEntry> | null | undefined): number {
  if (!units.length) return 100;
  const d = diffOverlay(units, strings);
  return Math.round((d.fresh.length / units.length) * 100);
}
