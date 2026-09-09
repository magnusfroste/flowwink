/**
 * describe_blocks — the block vocabulary, served to whoever asks.
 *
 * manage_page_blocks' own instructions say "when unsure what a block supports,
 * ask for its schema rather than guessing from examples" — and until this
 * handler existed there was nothing to ask. BLOCK_TYPES_SCHEMA was injected
 * into FlowPilot's prompt via cms-context, so FlowPilot saw the vocabulary and
 * every external agent guessed. That asymmetry is exactly what the contract
 * authoring guide does NOT have, and it is why agent-built pages came out with
 * invented field names.
 *
 * The vocabulary is NOT copied into the database. Its home is
 * src/lib/block-reference.ts → block-schema.ts via sync-block-schema.ts; a DB
 * copy would be a third truth that goes stale (the same mistake that gave the
 * contract token list two drifting copies). This handler reads the generated
 * artifact — one source, served on demand.
 *
 * Two levels, because the whole schema is ~30 KB and would flood a context:
 *   no argument   → the catalogue: every type name + its one-line description
 *   block_type    → that block's full Data contract, verbatim
 */
import { BLOCK_TYPES_SCHEMA, IMPORTABLE_BLOCK_TYPES } from '../block-schema.ts';

interface BlockEntry {
  type: string;
  name: string;
  description: string;
  data: string;
}

/**
 * The generated schema is a numbered prose block per type:
 *   12. image - Image
 *      Single image with optional caption.
 *      Data: { src: string, ... }
 * Parsing it here (rather than generating a second machine-readable artifact)
 * keeps sync-block-schema.ts the only generator.
 */
function parseSchema(): BlockEntry[] {
  const entries: BlockEntry[] = [];
  // Split on "N. " at the start of a line — the generator's own numbering.
  const chunks = BLOCK_TYPES_SCHEMA.split(/\n(?=\d+\. )/);
  for (const chunk of chunks) {
    const header = chunk.match(/^\d+\.\s+([a-z0-9-]+)\s+-\s+(.+?)\n/);
    if (!header) continue;
    const [, type, name] = header;
    const rest = chunk.slice(header[0].length);
    const dataAt = rest.indexOf('Data:');
    const description = (dataAt === -1 ? rest : rest.slice(0, dataAt)).trim();
    const data = dataAt === -1 ? '' : rest.slice(dataAt + 'Data:'.length).trim();
    entries.push({ type, name, description, data });
  }
  return entries;
}

export function executeDescribeBlocks(args: Record<string, unknown>): {
  count: number;
  blocks: Array<Record<string, unknown>>;
  note?: string;
  error?: string;
  available_types?: readonly string[];
} {
  const requested = typeof args.block_type === 'string' ? args.block_type.trim() : '';
  const entries = parseSchema();
  // A page is several block types; one call per type is how an agent ends up
  // reading the catalogue and guessing the fields from an example (liteit,
  // 2026-09-06: eyebrow, accentText and titleSize never used because the
  // caller asked for `types:[…]`, got the catalogue, and moved on).
  const requestedMany = Array.isArray(args.block_types)
    ? (args.block_types as unknown[]).map((t) => String(t ?? '').trim()).filter(Boolean)
    : [];
  if (requestedMany.length) {
    const found = requestedMany.map((t) => entries.find((e) => e.type === t)).filter((e): e is BlockEntry => !!e);
    const missing = requestedMany.filter((t) => !entries.some((e) => e.type === t));
    return {
      count: found.length,
      blocks: found.map((e) => ({ type: e.type, name: e.name, description: e.description, data: e.data })),
      ...(missing.length ? { error: `Unknown block type(s): ${missing.join(', ')}`, available_types: IMPORTABLE_BLOCK_TYPES } : {}),
      note: 'Fields shown as a Tiptap JSON doc must be objects ({"type":"doc",…}), never strings. The optional fields are the design register — eyebrow, accentText, titleSize, imageAspect — use them.',
    };
  }

  if (!requested) {
    // Catalogue level: enough to choose, not enough to flood.
    return {
      count: entries.length,
      blocks: entries.map((e) => ({ type: e.type, name: e.name, description: e.description })),
      note: 'Call again with block_type=<type> for that block\'s full field contract before writing its data.',
    };
  }

  const match = entries.find((e) => e.type === requested);
  if (!match) {
    return {
      count: 0,
      blocks: [],
      error: `Unknown block type: ${requested}`,
      available_types: IMPORTABLE_BLOCK_TYPES,
    };
  }

  return {
    count: 1,
    blocks: [{
      type: match.type,
      name: match.name,
      description: match.description,
      // Verbatim from the generated artifact — including the `<TiptapDoc>`
      // markers, which are the field-level answer to the single most common
      // agent error: sending rich text as a string.
      data: match.data,
    }],
    note: 'Fields shown as a Tiptap JSON doc must be objects ({"type":"doc",…}), never strings.',
  };
}
