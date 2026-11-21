/**
 * translate_site — the whole site into a language, in one call (2026-11-20).
 *
 * Adding a language used to be a checklist nobody finished: enable_language,
 * then translate_page per page (the admin's button looped the pages from the
 * browser, so the tab had to stay open), then posts, products, categories and
 * variant labels one skill each, then translate_ui_text. A site came out half
 * translated and no one could say what was left.
 *
 * One call now, the same for FlowPilot, an agent on the gateway and the
 * admin's button:
 *   1. the language is declared (enable_language) when it is not yet;
 *   2. what is MISSING or STALE is listed — list_stale_translations, per
 *      string by hash — so a translation a person polished is never redone;
 *   3. each item is translated and published through translate_content, as
 *      much as fits in the time budget (the edge runtime stops a call at
 *      150 s; a whole site does not fit);
 *   4. when the content is done, the interface texts (translate_ui_text) —
 *      except where the platform already speaks the language (Swedish).
 *
 * The state is the content itself: what is left is what is still stale. The
 * record in `site_settings.translation_sweep` only says that a language is
 * being worked on and what the last run did, so the "Finish site
 * translations" sweep continues where the call stopped, nobody needs the
 * browser open, and the admin shows progress. An item that fails is tried
 * again on the next run; a run that moves nothing forward marks the language
 * `stuck` (no AI provider, say) instead of retrying it every ten minutes.
 *
 * Changing which language visitors land in is not here: that changes the
 * addresses and is a launch decision (site_languages.default).
 */

export const SWEEP_KEY = 'translation_sweep';

export interface StaleFinding {
  entity: string;
  id?: string;
  slug: string;
  locale: string;
  missing?: number;
  stale?: number;
}

export interface FailedItem {
  entity: string;
  slug: string;
  error: string;
}

export interface LocaleSweep {
  status: 'running' | 'done' | 'stuck';
  started_at: string;
  last_run_at: string;
  /** Items translated over every run of this sweep. */
  translated: number;
  /** Items still to do after the last run. */
  remaining: number;
  /** The interface texts are done (or the platform speaks the language). */
  ui_done: boolean;
  /** What failed in the last run. */
  failed: FailedItem[];
  note?: string;
}

export type SweepState = Record<string, LocaleSweep>;

export interface TranslateSiteArgs {
  /** The language to translate the site into, e.g. "de". Omit with continue: true. */
  locale?: string;
  /** The sweep's call: carry on with every language still running. */
  continue?: boolean;
  /** Report what would be translated, change nothing. */
  dry_run?: boolean;
  /** Seconds this call may spend translating (default 60, at most 100). */
  budget_seconds?: number;
}

export interface TranslateSiteDeps {
  languages(): Promise<{ default: string; enabled: string[] }>;
  enableLanguage(locale: string): Promise<{ success?: boolean; error?: string }>;
  listStale(locale: string): Promise<{ success?: boolean; error?: string; stale?: StaleFinding[] }>;
  translateItem(f: StaleFinding, locale: string): Promise<{ success?: boolean; error?: string; status?: string }>;
  /** Does what fits in `budgetSeconds`, keeps it, and answers what is left in `remaining`. */
  translateUi(locale: string, budgetSeconds: number): Promise<{ success?: boolean; error?: string; translated?: number; remaining?: number }>;
  /** True where the platform's own pack carries the interface texts. */
  platformSpeaks(locale: string): boolean;
  readState(): Promise<SweepState>;
  writeState(state: SweepState): Promise<void>;
  now(): number;
}

const TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
/** The interface pass is not started with less than this left. */
const UI_MIN_SECONDS = 15;

function cleanTag(raw: unknown): string | null {
  const t = String(raw ?? '').trim().toLowerCase().replace('_', '-');
  return TAG.test(t) ? t : null;
}

export async function runTranslateSite(args: TranslateSiteArgs, deps: TranslateSiteDeps): Promise<Record<string, unknown>> {
  const started = deps.now();
  // 60 by default: on sandbox a call was stopped by the platform after 76
  // seconds (WORKER_RESOURCE_LIMIT), well inside the 150 s wall clock.
  const budgetMs = Math.max(10, Math.min(Number(args.budget_seconds ?? 60) || 60, 100)) * 1000;
  const deadline = started + budgetMs;
  const langs = await deps.languages();
  const state = await deps.readState();

  let targets: string[];
  if (args.locale !== undefined && args.locale !== null && args.locale !== '') {
    const tag = cleanTag(args.locale);
    if (!tag) return { success: false, code: 'INVALID_INPUT', error: `Not a language tag: "${args.locale}". Use a form like "de", "sv" or "en-GB".` };
    targets = [tag];
  } else if (args.continue) {
    targets = Object.entries(state).filter(([, s]) => s.status === 'running').map(([l]) => l);
    if (!targets.length) return { success: true, work_done: 0, note: 'No language is being translated — nothing to continue.' };
  } else {
    return { success: false, code: 'MISSING_REQUIRED_PARAMETER', error: 'locale is required, e.g. translate_site({ locale: "de" }).' };
  }

  const results: Array<Record<string, unknown>> = [];
  let workDone = 0;

  for (const locale of targets) {
    const nowIso = new Date(deps.now()).toISOString();
    const isDefault = locale === langs.default;

    if (!isDefault && !langs.enabled.includes(locale) && !args.dry_run) {
      const en = await deps.enableLanguage(locale);
      if (en && en.success === false) {
        results.push({ locale, success: false, error: en.error ?? 'enable_language failed' });
        continue;
      }
    }

    const listed = await deps.listStale(locale);
    if (listed.success === false) {
      results.push({ locale, success: false, error: listed.error ?? 'list_stale_translations failed' });
      continue;
    }
    const todo = (listed.stale ?? []).filter((f) => f.locale === locale);
    const uiNeeded = !isDefault && !deps.platformSpeaks(locale);

    if (args.dry_run) {
      const byEntity: Record<string, number> = {};
      for (const f of todo) byEntity[f.entity] = (byEntity[f.entity] ?? 0) + 1;
      results.push({
        locale, dry_run: true, items_to_translate: todo.length, by_entity: byEntity,
        units: todo.reduce((n, f) => n + Number(f.missing ?? 0) + Number(f.stale ?? 0), 0),
        interface_texts: uiNeeded ? 'translated after the content' : (isDefault ? 'the site language — nothing to do' : 'the platform already speaks this language'),
        enables_language: !isDefault && !langs.enabled.includes(locale),
      });
      continue;
    }

    const prev = state[locale];
    // Written BEFORE the work: a call the platform stops mid-way must leave a
    // language the sweep carries on with. On sandbox the first real run was
    // stopped after 76 s and had recorded nothing — the content was translated,
    // the interface texts were not, and nothing would ever have continued.
    state[locale] = {
      status: 'running',
      started_at: prev && prev.status === 'running' ? prev.started_at : nowIso,
      last_run_at: nowIso,
      translated: prev && prev.status === 'running' ? prev.translated : 0,
      remaining: todo.length,
      ui_done: uiNeeded ? (prev?.ui_done ?? false) : true,
      failed: [],
    };
    await deps.writeState(state);
    const failed: FailedItem[] = [];
    let translated = 0;
    let tried = 0;
    let slowest = 0;
    for (const f of todo) {
      // Stop before an item that would not finish inside the budget: the
      // slowest item so far is the estimate (a first item always runs).
      if (tried > 0 && deps.now() + slowest > deadline) break;
      const t0 = deps.now();
      let r: { success?: boolean; error?: string };
      try {
        r = await deps.translateItem(f, locale);
      } catch (e) {
        r = { success: false, error: e instanceof Error ? e.message : String(e) };
      }
      slowest = Math.max(slowest, deps.now() - t0);
      tried += 1;
      if (r.success === false) failed.push({ entity: f.entity, slug: f.slug, error: String(r.error ?? 'failed').slice(0, 200) });
      else translated += 1;
      // The same error three times running is the setup, not the item (no AI
      // provider, say): trying the other hundred items only repeats it.
      const last = failed.slice(-3);
      if (translated === 0 && last.length === 3 && last.every((x) => x.error === last[0].error)) break;
    }
    const untried = todo.length - tried;
    const remaining = untried + failed.length;

    let uiDone = prev?.ui_done ?? false;
    let uiResult: Record<string, unknown> | null = null;
    if (!uiNeeded) uiDone = true;
    // Only once the content is all in: the interface texts are the last step,
    // and a failing provider must not read as progress.
    else if (!uiDone && remaining === 0 && deps.now() + UI_MIN_SECONDS * 1000 <= deadline) {
      try {
        const left = Math.floor((deadline - deps.now()) / 1000) - 5;
        const u = await deps.translateUi(locale, Math.max(5, left));
        uiResult = u as Record<string, unknown>;
        if (u.success === false) failed.push({ entity: 'ui_text', slug: locale, error: String(u.error ?? 'failed').slice(0, 200) });
        else {
          // Done only when nothing is left; a partial pass is still progress.
          uiDone = Number(u.remaining ?? 0) === 0;
          translated += Number(u.translated ?? 0) > 0 ? 1 : 0;
        }
      } catch (e) {
        failed.push({ entity: 'ui_text', slug: locale, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
      }
    }

    const complete = remaining === 0 && uiDone;
    const movedNothing = translated === 0 && failed.length > 0;
    const status: LocaleSweep['status'] = complete ? 'done' : movedNothing ? 'stuck' : 'running';
    state[locale] = {
      status,
      started_at: prev && prev.status === 'running' ? prev.started_at : nowIso,
      last_run_at: nowIso,
      translated: (prev && prev.status === 'running' ? prev.translated : 0) + translated,
      remaining,
      ui_done: uiDone,
      failed: failed.slice(0, 20),
      ...(status === 'stuck' ? { note: 'Nothing could be translated in the last run — read failed[]. Run translate_site again once it is fixed.' } : {}),
    };
    workDone += translated + failed.length;
    results.push({
      locale, success: true, status,
      translated_now: translated, failed_now: failed.length, remaining,
      interface_texts: uiNeeded ? (uiDone ? 'done' : uiResult && Number(uiResult.remaining ?? 0) > 0 ? `${uiResult.remaining} left` : 'after the content') : 'the platform already speaks this language',
      ...(uiResult ? { ui_text: { translated: uiResult.translated ?? 0, remaining: uiResult.remaining ?? 0 } } : {}),
      ...(failed.length ? { failed: failed.slice(0, 10) } : {}),
      next: complete
        ? `${locale} is translated and published. Visitors choose it in the language switcher.`
        : status === 'stuck'
          ? 'Fix what failed[] names (an AI provider under Integrations, say), then call translate_site again.'
          : 'The "Finish site translations" sweep continues every ten minutes — or call translate_site with the same locale again.',
    });
  }

  if (!args.dry_run) await deps.writeState(state);
  const single = results.length === 1 ? results[0] : null;
  return {
    success: results.every((r) => r.success !== false),
    work_done: workDone,
    ...(single ?? { languages: results }),
    seconds: Math.round((deps.now() - started) / 1000),
  };
}
