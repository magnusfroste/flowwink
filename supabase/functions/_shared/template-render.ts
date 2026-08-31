/**
 * Template rendering for email_templates — the one substitution engine.
 *
 * Two passes:
 *
 *   1. Sections — `{{#key}}…{{/key}}` keeps its inner content when `vars.key`
 *      is non-empty and disappears entirely when it is empty or missing. This
 *      is what lets ALL language live in the template text (the rule from
 *      docs/architecture/language.md §Email templates): a labelled box like
 *      `{{#notes}}<strong>Your note:</strong> {{notes}}{{/notes}}` is template
 *      text an operator can translate, where a code-built `notes_block`
 *      variable froze its label in English. Sections do not nest — none of the
 *      templates need it, and a non-nesting rule is one a template editor can
 *      hold in their head.
 *
 *   2. Tokens — `{{key}}` → value; unknown keys render as ''. The permissive
 *      charset (`[\w.-]`, optional inner whitespace) is inherited from
 *      email-send's original renderer, which this replaces.
 *
 * Consumers: the comms-send senders, email-send's `template_name` path, and
 * the admin preview (src/lib/email-preview.ts) — one engine, so the preview
 * cannot drift from the sent mail.
 */
export function renderTemplate(input: string, vars: Record<string, string> = {}): string {
  const withSections = (input ?? '').replace(
    /\{\{\s*#([\w.-]+)\s*\}\}([\s\S]*?)\{\{\s*\/\1\s*\}\}/g,
    (_m, key: string, inner: string) => (vars[key] ? inner : ''),
  );
  return withSections.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? '');
}
