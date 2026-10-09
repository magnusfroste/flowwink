/**
 * The form inbox's filter — form, handled state and search — as one pure
 * function, so the page and a test read the same rule.
 *
 * It used to live inline in a useMemo whose dependency list left out the
 * handled filter. The inbox opens on "Unhandled"; switching to "All" did not
 * recompute, so it kept showing only unhandled rows — empty once every
 * submission had become a lead — until picking a specific form changed a
 * listed dependency (synclair, 2026-10-09: "All forms shows nothing, I have
 * to pick a form").
 */
export type HandledFilter = 'unhandled' | 'all' | 'handled';

export interface InboxRow {
  form_name?: string | null;
  data?: unknown;
  lead_id?: string | null;
  handled_at?: string | null;
  page?: { title?: string | null } | null;
}

/** Handled = a lead was made from it, or someone marked it done. */
export function isHandled(s: Pick<InboxRow, 'lead_id' | 'handled_at'>): boolean {
  return !!s.lead_id || !!s.handled_at;
}

export function filterInbox<T extends InboxRow>(
  rows: T[],
  opts: { formName: string; handled: HandledFilter; search: string },
): T[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((s) => {
    if (opts.formName !== 'all' && s.form_name !== opts.formName) return false;
    if (opts.handled === 'unhandled' && isHandled(s)) return false;
    if (opts.handled === 'handled' && !isHandled(s)) return false;
    if (!q) return true;
    return (
      JSON.stringify(s.data ?? {}).toLowerCase().includes(q) ||
      (s.form_name || '').toLowerCase().includes(q) ||
      (s.page?.title || '').toLowerCase().includes(q)
    );
  });
}
