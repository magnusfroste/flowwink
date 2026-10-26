/**
 * A customer mail in the recipient's language — the shared half of the
 * template rail the comms-send senders walk.
 *
 * The words live in `email_templates` (one row per name + locale, edited by
 * the operator or the agent through manage_email_template); code passes DATA
 * only. `resolve_email_template` walks the same ladder as the rest of the
 * system (exact tag → same language → the site's default → ANY active
 * version), and a sender whose template does not resolve keeps its built-in
 * text: Law 4 — a mail never fails to go out because a template is missing.
 *
 * Escaping happens HERE, not in each sender: renderTemplate substitutes
 * verbatim, so every value is HTML-escaped for the body and left raw for the
 * subject (a plain-text header, where `&amp;` would be printed as-is).
 */
import { renderTemplate } from '../template-render.ts';

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): RpcResult;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * A language tag from untrusted input ("sv", "en-GB"), lower-cased, or null.
 * A public endpoint must not pass whatever a visitor typed on to the database.
 */
export function cleanLanguageTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,2}$/i.test(t) ? t.toLowerCase() : null;
}

/**
 * The partner's language (partner_language: the partner's own, else the
 * site's). Null — meaning "the site's default" to resolve_email_template —
 * when there is no partner or the read fails; a failed read is logged.
 */
export async function partnerLanguage(
  supabase: unknown,
  partnerId: string | null | undefined,
  logTag: string,
): Promise<string | null> {
  if (!partnerId) return null;
  try {
    const { data, error } = await (supabase as RpcClient).rpc('partner_language', { p_partner_id: partnerId });
    if (error) {
      console.warn(`[${logTag}] could not read the recipient language:`, error.message);
      return null;
    }
    return (data as { lang?: string } | null)?.lang ?? null;
  } catch (e) {
    console.warn(`[${logTag}] could not read the recipient language:`, (e as Error).message);
    return null;
  }
}

export interface RenderedMail {
  subject: string | null;
  html: string;
  /** The locale of the version that was used — the language the mail is in. */
  locale: string | null;
}

/**
 * Resolve `name` in `locale` and render it. `vars` receives the locale the
 * template is actually written in, so dates and amounts are formatted in the
 * same language as the words around them. Returns null when no template
 * resolves (or the read fails) — the caller then sends its built-in text.
 */
export async function renderMailTemplate(
  supabase: unknown,
  name: string,
  locale: string | null,
  vars: (templateLocale: string | null) => Record<string, string>,
  logTag: string,
): Promise<RenderedMail | null> {
  try {
    const { data, error } = await (supabase as RpcClient).rpc('resolve_email_template', {
      p_name: name,
      p_locale: locale,
    });
    if (error) {
      console.warn(`[${logTag}] template lookup failed — using built-in fallback:`, error.message);
      return null;
    }
    const tpl = data as { ok?: boolean; html?: string; subject?: string; locale?: string } | null;
    if (!tpl?.ok || !tpl.html) return null;
    if (locale && tpl.locale && tpl.locale !== locale.toLowerCase()) {
      console.warn(`[${logTag}] no ${locale} version of "${name}" — sent the ${tpl.locale} one`);
    }
    const raw = vars(tpl.locale ?? locale);
    const escaped: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) escaped[k] = escapeHtml(v);
    const subject = tpl.subject ? renderTemplate(tpl.subject, raw).replace(/\s+/g, ' ').trim() : null;
    return { subject: subject || null, html: renderTemplate(tpl.html, escaped), locale: tpl.locale ?? null };
  } catch (e) {
    console.warn(`[${logTag}] template read failed — using built-in fallback:`, (e as Error).message);
    return null;
  }
}
