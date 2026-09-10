/**
 * manage_page's write contract, in one place.
 *
 * Observed live on restagard's instance (2026-09-09):
 *
 *   { "action": "update", "slug": "gris", "show_in_menu": false }  → "updated"
 *
 * and the row kept show_in_menu = true. The handler read title / slug / meta /
 * blocks and nothing else; every other key was dropped on the floor and the
 * call answered success — the silent-noop class ("updated: true, wrote {}").
 * Menu placement was not settable through the skill at all: create ignored it
 * too, so a page an agent built could only ever land wherever the DB default
 * put it (in the menu), and a hub's sub-pages piled up in the header.
 *
 * Two rules follow, and this module is where both are enforced so create and
 * update cannot drift apart again (they had: only update folded content_json):
 *
 *  1. Every key the caller sends is either READ or REFUSED. An unknown key
 *     bounces with the same self-correcting shape the purchase-order writer
 *     uses (buildUnknownParameterBounce) — nearest valid name, full valid
 *     list, pointer to the instructions — never ignored.
 *  2. The update writes EXACTLY the fields it was given. Nothing is added
 *     (no defaults re-stamped), nothing is dropped.
 *
 * MANAGE_PAGE_PARAMETERS is the handler's read set. A guardrail test pins it
 * to the seed's tool_definition properties in src/lib/modules/pages-module.ts:
 * a parameter the schema declares but the handler never reads is exactly the
 * silence rule 1 exists to end, and a parameter the handler reads but the
 * schema hides gets bounced by a transport preflight before it ever arrives.
 */
import { buildUnknownParameterBounce, isTransportKey } from '../skills/parameter-contract.ts';

/** Every argument key manage_page reads, by action. */
export const MANAGE_PAGE_PARAMETERS: Record<string, { type: string }> = {
  action: { type: 'string' },
  page_id: { type: 'string' },
  slug: { type: 'string' },
  title: { type: 'string' },
  status: { type: 'string' },
  meta: { type: 'object' },
  meta_json: { type: 'object' },
  blocks: { type: 'array' },
  content_json: { type: 'array' },
  version_id: { type: 'string' },
  show_in_menu: { type: 'boolean' },
  menu_order: { type: 'integer' },
};

export type ManagePageBounce = ReturnType<typeof buildUnknownParameterBounce>['body'];

/**
 * Refuse argument keys manage_page does not read. Returns null when every key
 * is known. The handler returns the bounce body as the tool result, so the
 * model sees the fix next turn instead of a success it cannot read back.
 */
export function bounceManagePageArgs(
  skillName: string,
  args: Record<string, unknown>,
): ManagePageBounce | null {
  const unknown = Object.keys(args ?? {}).filter(
    (k) => !isTransportKey(k) && !(k in MANAGE_PAGE_PARAMETERS),
  );
  if (unknown.length === 0) return null;
  return buildUnknownParameterBounce({
    skillName, unknown, args,
    properties: MANAGE_PAGE_PARAMETERS,
    hasInstructions: true,
  }).body;
}

/**
 * Parse show_in_menu / menu_order off the args. Strict on purpose: a menu
 * flag that arrives as the string "no" and is coerced to true is the same
 * silent inversion as ignoring it. JSON booleans/integers, plus their exact
 * string spellings ("true"/"false", "3"), are accepted; anything else names
 * the parameter and the type it wants.
 */
export function parseMenuFields(
  args: Record<string, unknown>,
): { fields: { show_in_menu?: boolean; menu_order?: number }; errors: string[] } {
  const fields: { show_in_menu?: boolean; menu_order?: number } = {};
  const errors: string[] = [];

  if (args.show_in_menu !== undefined && args.show_in_menu !== null) {
    const v = args.show_in_menu;
    if (typeof v === 'boolean') fields.show_in_menu = v;
    else if (v === 'true' || v === 'false') fields.show_in_menu = v === 'true';
    else errors.push(`show_in_menu must be a boolean (true/false), got ${JSON.stringify(v)}`);
  }

  if (args.menu_order !== undefined && args.menu_order !== null) {
    const v = args.menu_order;
    const n = typeof v === 'number' ? v : (typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN);
    if (Number.isInteger(n)) fields.menu_order = n;
    else errors.push(`menu_order must be an integer (0 = first), got ${JSON.stringify(v)}`);
  }

  return { fields, errors };
}

export interface PageWriteFields {
  title?: string;
  slug?: string;
  meta_json?: unknown;
  show_in_menu?: boolean;
  menu_order?: number;
}

/**
 * The scalar columns an update writes — exactly the ones the caller sent,
 * resolved through the alias the schema declares (meta_json→meta).
 *
 * The page BODY is deliberately not collected here: blocks / content_json are
 * resolved once at the top of the manage_page case (so create and update
 * cannot drift apart) and written only after normalizeBlocks has gated them —
 * landing-page-compose-retirement.guardrails.test.ts pins that path by text.
 *
 * `slugIsIdentifier`: on update, a slug sent WITHOUT page_id names the page to
 * edit (resolved upstream) and must not be re-written as a rename; with
 * page_id present it IS the rename. Create never passes through here — the
 * slug there names the new page and is uniqued first.
 */
export function collectPageUpdateFields(
  args: Record<string, unknown>,
  opts: { slugIsIdentifier: boolean },
): { fields: PageWriteFields; errors: string[] } {
  const fields: PageWriteFields = {};
  if (args.title !== undefined) fields.title = args.title as string;
  if (args.slug !== undefined && !opts.slugIsIdentifier) fields.slug = args.slug as string;

  const meta = args.meta !== undefined ? args.meta : args.meta_json;
  if (meta !== undefined) fields.meta_json = meta;

  const menu = parseMenuFields(args);
  Object.assign(fields, menu.fields);
  return { fields, errors: menu.errors };
}
