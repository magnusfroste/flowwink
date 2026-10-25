/**
 * Converting a sibling-row translation into an overlay — the pure half.
 *
 * Until 2026-10 a page in two languages was two rows with two copies of the
 * block tree (pages.translation_group_id). The overlay model keeps ONE tree
 * and a strings-per-language overlay. Conversion pairs the sibling's text
 * with the source's units and writes it as the overlay, stamped with the
 * source's CURRENT hash — fresh by definition, because the sibling WAS a
 * translation of this source when the conversion runs.
 *
 * Pairing is by unit key (block id + path inside the block). Where the
 * sibling's block ids differ from the source's but the two trees have the same
 * shape (`structureSignature`), blocks are matched by position and the
 * sibling's units re-keyed — reported, never silent. Text the sibling has that
 * the source has not (a block only the English page carries) is the FINDING:
 * the operator decides whether the source structure is right (the text is
 * dropped, listed) or whether this is a different page (it stays a page).
 *
 * Design: docs/architecture/page-translations.md §6.
 */
import { structureSignature } from './translate-walk.ts';
import { collectUnits, isTiptapDoc, type OverlayEntry, type PageLike, type TranslationUnit } from './translation-units.ts';

export interface SiblingPairing {
  /** The overlay to write: sibling text under the source's unit keys, source hashes. */
  strings: Record<string, OverlayEntry>;
  /** Units paired by block id. */
  paired: number;
  /** Units paired by block POSITION after re-keying (ids differed, shape equal). */
  paired_by_position: number;
  /** Units paired by block TYPE (a sole unmatched block of that type on each side, any position). */
  paired_by_type: number;
  /** Source units the sibling has no text for — shown in the source language, counted. */
  missing: string[];
  /** Sibling text with no counterpart on the source: the finding. */
  extra: Array<{ unit: string; text: string }>;
  /** Source units whose text is byte-identical in the sibling — untranslated copies, left out. */
  untranslated: string[];
  coverage: number;
}

interface BlockLike { id?: unknown }

/** Maps sibling block ids → source block ids by position when the trees have the same shape. */
export function blockIdMapByPosition(sourceBlocks: unknown, siblingBlocks: unknown): Map<string, string> | null {
  if (!Array.isArray(sourceBlocks) || !Array.isArray(siblingBlocks)) return null;
  if (sourceBlocks.length !== siblingBlocks.length) return null;
  if (structureSignature(sourceBlocks) !== structureSignature(siblingBlocks)) return null;
  const map = new Map<string, string>();
  for (let i = 0; i < sourceBlocks.length; i++) {
    const s = (sourceBlocks[i] as BlockLike)?.id;
    const t = (siblingBlocks[i] as BlockLike)?.id;
    if (typeof s === 'string' && typeof t === 'string' && s !== t) map.set(t, s);
  }
  return map;
}

/**
 * After id pairing: a block left unmatched on both sides pairs with the other
 * side's unmatched block of the same TYPE when that type occurs exactly once
 * among the unmatched on each side — even at another position. Hand-edited
 * sites drift exactly like this: a section re-added in one language gets a
 * fresh id and lands elsewhere (optic home, 2026-10-25: the same two-column
 * section, different id, different place, read as 6 extra + 7 missing).
 * The overlay keeps the SOURCE's order, which is what the model says anyway.
 */
export function blockIdMapByType(sourceBlocks: unknown, siblingBlocks: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(sourceBlocks) || !Array.isArray(siblingBlocks)) return map;
  type B = { id?: unknown; type?: unknown };
  const ids = (bs: unknown[]) => new Set(bs.map((b) => (b as B)?.id).filter((x): x is string => typeof x === 'string'));
  const srcIds = ids(sourceBlocks);
  const sibIds = ids(siblingBlocks);
  const unmatched = (bs: unknown[], other: Set<string>) =>
    bs.filter((b): b is B & { id: string; type: string } => typeof (b as B)?.id === 'string' && typeof (b as B)?.type === 'string' && !other.has((b as B).id as string));
  const src = unmatched(sourceBlocks, sibIds);
  const sib = unmatched(siblingBlocks, srcIds);
  const count = (bs: Array<{ type: string }>) => bs.reduce((m, b) => m.set(b.type, (m.get(b.type) ?? 0) + 1), new Map<string, number>());
  const srcCount = count(src);
  const sibCount = count(sib);
  for (const b of sib) {
    if (sibCount.get(b.type) !== 1 || srcCount.get(b.type) !== 1) continue;
    const match = src.find((x) => x.type === b.type);
    if (match) map.set(b.id, match.id);
  }
  return map;
}

function rekey(unit: string, idMap: Map<string, string>): string {
  const dot = unit.indexOf('.');
  const head = dot === -1 ? unit : unit.slice(0, dot);
  const mapped = idMap.get(head);
  return mapped ? mapped + unit.slice(head.length) : unit;
}

export function pairSiblingUnits(source: PageLike, sibling: PageLike): SiblingPairing {
  const sourceUnits = collectUnits(source);
  const siblingUnits = collectUnits(sibling);
  const positionMap = blockIdMapByPosition(source.content_json, sibling.content_json);
  const typeMap = positionMap ? new Map<string, string>() : blockIdMapByType(source.content_json, sibling.content_json);
  const idMap = positionMap ?? typeMap;

  const siblingByKey = new Map<string, { unit: TranslationUnit; rekeyed: boolean; byType: boolean }>();
  for (const u of siblingUnits) {
    const key = rekey(u.unit, idMap);
    const head = u.unit.split('.')[0];
    siblingByKey.set(key, { unit: u, rekeyed: key !== u.unit, byType: typeMap.has(head) });
  }

  const strings: Record<string, OverlayEntry> = {};
  const missing: string[] = [];
  const untranslated: string[] = [];
  let paired = 0;
  let pairedByPosition = 0;
  let pairedByType = 0;
  const consumed = new Set<string>();

  for (const su of sourceUnits) {
    const hit = siblingByKey.get(su.unit);
    if (!hit || hit.unit.kind !== su.kind) { missing.push(su.unit); continue; }
    consumed.add(su.unit);
    // An untranslated copy (translate_site_into copied the source text) is not
    // a translation — leave the unit missing so the source text shows and the
    // unit is listed for translate_page.
    if (hit.unit.text === su.text) { untranslated.push(su.unit); continue; }
    if (su.kind === 'doc') {
      if (!isTiptapDoc(hit.unit.doc)) { missing.push(su.unit); continue; }
      strings[su.unit] = { doc: hit.unit.doc, source_hash: su.hash };
    } else {
      strings[su.unit] = { text: hit.unit.text, source_hash: su.hash };
    }
    paired += 1;
    if (hit.rekeyed && hit.byType) pairedByType += 1;
    else if (hit.rekeyed) pairedByPosition += 1;
  }

  const extra: Array<{ unit: string; text: string }> = [];
  for (const [key, hit] of siblingByKey) {
    if (consumed.has(key)) continue;
    extra.push({ unit: key, text: hit.unit.kind === 'doc' ? hit.unit.text.split('\u001f').join(' ').slice(0, 200) : hit.unit.text.slice(0, 200) });
  }

  return {
    strings,
    paired,
    paired_by_position: pairedByPosition,
    paired_by_type: pairedByType,
    missing,
    extra,
    untranslated,
    coverage: sourceUnits.length ? Math.round((paired / sourceUnits.length) * 100) : 100,
  };
}
