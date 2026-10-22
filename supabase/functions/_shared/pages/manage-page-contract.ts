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
  scheduled_at: { type: 'string' },
  locale: { type: 'string' },
};

/** What the site declares about its languages (site_settings.site_languages). */
export interface SiteLanguagesDeclaration { default?: string; enabled?: string[] }

const baseSubtag = (tag: string) => tag.toLowerCase().trim().split('-')[0];

/**
 * The language a NEW page is born in.
 *
 * Omitted → nothing is written and the pages_default_locale trigger stamps
 * the site's default. Given → it must be a language the site declares
 * (site_languages.enabled, matched on the base subtag, the declared spelling
 * wins), because a page filed under a language the site does not serve is
 * reachable by nobody: the switcher never offers it and the prefix route
 * refuses it. Observed on a bilingual site (synclair, 2026-10-23): English
 * became the default the day before two operators' agents were to write
 * Swedish pages, and without this parameter every one of them would have been
 * stamped "en" and served at the English address.
 */
export function resolveCreateLocale(
  wanted: unknown,
  languages: SiteLanguagesDeclaration | null | undefined,
): { locale?: string; error?: string } {
  if (wanted === undefined || wanted === null || wanted === '') return {};
  if (typeof wanted !== 'string') return { error: 'locale must be a language tag string, e.g. "sv" or "en"' };
  const tag = wanted.trim().toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(tag)) {
    return { error: `locale "${wanted}" is not a language tag — send the short code the site declares, e.g. "sv" or "en"` };
  }
  const enabled = (languages?.enabled ?? []).map((l) => String(l).trim()).filter(Boolean);
  if (enabled.length === 0) return { locale: tag };
  const exact = enabled.find((l) => l.toLowerCase() === tag);
  const sameLanguage = exact ?? enabled.find((l) => baseSubtag(l) === baseSubtag(tag));
  if (sameLanguage) return { locale: sameLanguage.toLowerCase() };
  const def = languages?.default ? String(languages.default) : enabled[0];
  return {
    error: `locale "${wanted}" is not a language this site declares (enabled: ${enabled.join(', ')}; default: ${def}). `
      + 'Omit locale to create the page in the site\'s default language, or add the language first (translate_site_into / Site Settings → Languages).',
  };
}

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
  scheduled_at?: string | null;
  status?: 'reviewing';
}

/**
 * Scheduling a page, the same contract manage_blog_posts has had since
 * 2026-09-19: an ISO timestamp queues the page (status `reviewing` +
 * scheduled_at — publish_scheduled_content takes it live when the time
 * passes); null takes it out of the queue. Pages had no way to do this through
 * a skill at all, so the content-to-conversion battery played the admin UI for
 * it (finding 2026-09-19, still open on 2026-10-05).
 */
export function parseScheduleField(
  args: Record<string, unknown>,
): { fields: { scheduled_at?: string | null; status?: 'reviewing' }; errors: string[] } {
  if (args.scheduled_at === undefined) return { fields: {}, errors: [] };
  const v = args.scheduled_at;
  if (v === null || v === '') return { fields: { scheduled_at: null }, errors: [] };
  if (typeof v !== 'string' || isNaN(new Date(v).getTime())) {
    return { fields: {}, errors: [`scheduled_at must be an ISO timestamp (or null to take the page out of the queue), got ${JSON.stringify(v)}`] };
  }
  return { fields: { scheduled_at: new Date(v).toISOString(), status: 'reviewing' }, errors: [] };
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
  const schedule = parseScheduleField(args);
  Object.assign(fields, schedule.fields);
  const errors = [...menu.errors, ...schedule.errors];
  // A page's language is set when it is born. Moving an existing page is a
  // translation-group operation (its siblings and address change with it), so
  // it is refused here with the door named rather than written as a bare column.
  if (args.locale !== undefined) {
    errors.push('locale is set when a page is created (manage_page create). To move an existing page to another language use manage_page_translation with p_action "set_locale"');
  }
  return { fields, errors };
}
