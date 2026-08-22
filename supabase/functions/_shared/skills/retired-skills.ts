/**
 * Retired skills — names that were removed from the seeds and must NOT become
 * a silent dead end.
 *
 * `sync-skills` disables orphaned `agent_skills` rows, it never deletes them
 * (a removed skill lives on as `enabled = false`). agent-execute looks up
 * skills with `.eq('enabled', true)`, so a call to a retired name would answer
 * "Skill not found: <name>" — which tells an operator nothing about what to do
 * instead. On instances that have not synced yet the row is still enabled and
 * the call falls through to the module executor's `Unknown <module> skill`
 * default. Both are dead ends, in the same class as the bug that retired
 * `landing_page_compose` in the first place: a failure that reads like a wall
 * rather than a direction.
 *
 * This map is consulted BEFORE the skill lookup, so it answers identically on
 * a synced and an unsynced instance, and it answers with a replacement.
 *
 * Adding an entry is the required second half of deleting a skill.
 */

export interface RetiredSkill {
  /** The skill that does this job now. Must be a live skill name. */
  readonly replacement: string;
  /** Why it went, and what the caller has to do differently. Reaches the model. */
  readonly guidance: string;
}

export const RETIRED_SKILLS: Readonly<Record<string, RetiredSkill>> = Object.freeze({
  // Retired 2026-08-22 (Law 3). It ran its own AI prompt with a hardcoded
  // output shape — {hero_headline, hero_sub, cta, sections[]} — and cast the
  // result into a fixed hero + text×N + cta skeleton. It could therefore never
  // choose a block: every section became a `text` block regardless of what the
  // content was, while the house's own templates use `text` for 2.9% of blocks
  // and never twice in a row. It also wrote invented field names (`cta_label`,
  // and `heading`/`body` on `text`) straight past the block validation every
  // other write path goes through, so the buttons silently never rendered.
  landing_page_compose: {
    replacement: 'manage_page',
    guidance:
      'landing_page_compose was retired: it could only ever emit hero + text + cta, '
      + 'and wrote field names no renderer reads. Compose the page yourself instead — '
      + 'call describe_blocks to see the block library and each block\'s real fields, '
      + 'then manage_page (action "create") with a content_json array of '
      + '{ type, data } blocks, or manage_page_blocks (action "add", blocks[]) to add '
      + 'sections to an existing page. Both validate every block and name the exact '
      + 'field that is wrong, so a rejected block can be corrected and re-sent.',
  },
  // Retired 2026-08-22, same handler, same four faults — plus its own: the
  // declared parameters include_header / include_footer / include_landing_page
  // were never read. It never created a header or a footer in its life; it
  // produced the same one-page stub as landing_page_compose and reported
  // success. A skill that answers `ok` to three parameters it ignores is worse
  // than no skill.
  generate_site_from_identity: {
    replacement: 'manage_page',
    guidance:
      'generate_site_from_identity was retired: it ignored include_header, '
      + 'include_footer and include_landing_page and only ever wrote one stub page. '
      + 'Build the site explicitly: read the profile with get_company_profile, '
      + 'call describe_blocks for the block library, create pages with manage_page '
      + '(action "create", content_json as a { type, data } block array), and create '
      + 'the header/footer with manage_global_blocks.',
  },
});

/** The error body a retired name answers with. Shape mirrors a skill result. */
export function retiredSkillResult(name: string): Record<string, unknown> | null {
  const entry = RETIRED_SKILLS[name];
  if (!entry) return null;
  return {
    error: `Skill retired: ${name}. Use ${entry.replacement} instead.`,
    retired: true,
    use_instead: entry.replacement,
    guidance: entry.guidance,
    status: 'failed',
  };
}
