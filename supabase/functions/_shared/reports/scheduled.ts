/**
 * The scheduled reports — what the platform writes for people on a clock,
 * as pages under Reports rather than only as a mail or a chat message that
 * scrolls away (docs/modules/reports.md, "Scheduled reports", 2026-11-04):
 *
 *   daily-briefing      — the morning briefing; one report, a version a day
 *   weekly-digest       — the Friday digest; a version a week
 *   month-close-<y>-<m> — one report per month: the close checklist as it
 *                         stood, and a live block that shows it as it is now
 *
 * Pure: the same input is the same markdown, so a run with nothing new adds
 * no version (report_publish compares the content hash). The callers —
 * flowpilot-lifecycle/briefing.ts and agent-execute's reports handler — pass
 * the figures and a formatter; nothing is read here.
 */

export interface ScheduledFormat {
  /** A *_cents amount in the business's currency and locale. */
  money(cents: number): string;
  /** A date, the business's way. */
  date(d: Date | string): string;
}

const DIVIDER = '\n\n';
const md = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

// ── The daily briefing ──────────────────────────────────────────────────────

export interface BriefingInput {
  date: Date | string;
  summary: string;
  healthScore: number;
  metrics: Record<string, number | string | null | undefined>;
  /** The briefing's sections as built — items are read loosely (label, value, unit, trend, format). */
  sections: ReadonlyArray<{ title: string; type?: string; items?: ReadonlyArray<unknown> }>;
  actionItems: Array<{ priority?: string; text: string; link?: string }>;
}

export const DAILY_BRIEFING_SLUG = 'daily-briefing';

export function briefingReport(input: BriefingInput, fmt: ScheduledFormat): { slug: string; title: string; description: string; category: string; note: string; content: string } {
  const m = input.metrics;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const kpis = [
    `- ${num(m.traffic_today ?? m.visitors_today)} | Visitors (24h)`,
    `- ${num(m.new_leads_today ?? m.leads_today)} | New leads (24h) | ${num(m.new_leads_week ?? m.leads_week)} this week`,
    `- ${fmt.money(num(m.revenue_week))} | Revenue (7d)`,
    `- ${num(m.bookings_week)} | Bookings (7d)`,
  ];
  const tone = input.healthScore >= 75 ? 'ok' : input.healthScore >= 50 ? 'info' : 'warn';
  const parts: string[] = [
    `# Daily briefing — ${fmt.date(input.date)}`,
    md(input.summary),
    `::note ${tone}\nHealth score ${Math.round(input.healthScore)}/100.\n::`,
    `::kpis\n${kpis.join('\n')}\n::`,
  ];
  if (input.actionItems.length) {
    parts.push(`## What needs a person\n\n${input.actionItems.map((a) => `- **${(a.priority ?? 'medium').toUpperCase()}** — ${md(a.text)}${a.link ? ` ([open](${a.link}))` : ''}`).join('\n')}`);
  }
  for (const s of input.sections) {
    type Item = { label?: string; value?: unknown; unit?: string; trend?: unknown; format?: string };
    const items = ((s.items ?? []) as Item[]).filter((i) => i && (i.label || i.value !== undefined));
    if (!items.length) continue;
    const rows = items.map((i) => {
      const value = i.format === 'currency' && typeof i.value === 'number' ? fmt.money(Math.round(i.value * 100)) : md(i.value);
      const trend = i.trend !== null && i.trend !== undefined && i.trend !== '' ? ` (${typeof i.trend === 'number' && i.trend > 0 ? '+' : ''}${md(i.trend)}${i.unit ?? ''})` : '';
      return `| ${md(i.label ?? '')} | ${value}${trend} |`;
    });
    parts.push(`## ${md(s.title)}\n\n| | |\n|---|---|\n${rows.join('\n')}`);
  }
  return {
    slug: DAILY_BRIEFING_SLUG,
    title: 'Daily briefing',
    description: 'The morning briefing — visitors, leads, revenue, what needs a person. A version a day.',
    category: 'Briefing',
    note: fmt.date(input.date),
    content: parts.join(DIVIDER) + '\n',
  };
}

// ── The weekly digest ───────────────────────────────────────────────────────

export interface WeeklyDigestInput {
  since?: string | null;
  page_views?: number; new_leads?: number; bookings?: number; orders?: number; order_revenue_cents?: number;
  invoices?: number; invoiced_cents?: number; new_deals?: number; deal_value_cents?: number;
}

export const WEEKLY_DIGEST_SLUG = 'weekly-digest';

export function weeklyDigestReport(d: WeeklyDigestInput, weekEnding: Date | string, fmt: ScheduledFormat): { slug: string; title: string; description: string; category: string; note: string; content: string } {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const content = [
    `# Weekly digest — week ending ${fmt.date(weekEnding)}`,
    `What the week brought${d.since ? `, since ${fmt.date(d.since)}` : ''}: traffic, leads, bookings, orders, invoices and deals, across every module that is on.`,
    `::kpis\n- ${n(d.page_views)} | Page views\n- ${n(d.new_leads)} | New leads\n- ${n(d.bookings)} | Bookings\n- ${n(d.orders)} | Orders | ${fmt.money(n(d.order_revenue_cents))} paid\n- ${n(d.invoices)} | Invoices | ${fmt.money(n(d.invoiced_cents))}\n- ${n(d.new_deals)} | New deals | ${fmt.money(n(d.deal_value_cents))} in value\n::`,
    `::details Method\nOne read, \`weekly_business_digest\`, over the last seven days at the time of publishing. Earlier weeks are the earlier versions of this report.\n::`,
  ].join(DIVIDER) + '\n';
  return {
    slug: WEEKLY_DIGEST_SLUG,
    title: 'Weekly digest',
    description: 'Traffic, leads, bookings, orders, invoices and deals — every Friday, a version a week.',
    category: 'Briefing',
    note: `Week ending ${fmt.date(weekEnding)}`,
    content,
  };
}

// ── The month close ─────────────────────────────────────────────────────────

export interface MonthCloseInput {
  fiscal_year: number; month: number; label?: string; period_label?: string;
  date_from?: string; date_to?: string; status?: string; ready?: boolean;
  blocking?: string[];
  checks?: Array<{ id?: string; label?: string; pass?: boolean; detail?: string; fix?: { skill?: string; tab?: string } }>;
  next?: { skill?: string; args?: Record<string, unknown> };
}

export function monthCloseSlug(year: number, month: number): string {
  return `month-close-${year}-${String(month).padStart(2, '0')}`;
}

export function monthCloseReport(c: MonthCloseInput, fmt: ScheduledFormat): { slug: string; title: string; description: string; category: string; note: string; audience_module: string; subject_type: string; subject_id: string; content: string } {
  const checks = c.checks ?? [];
  const failed = checks.filter((x) => x.pass === false);
  const closed = c.status === 'closed' || c.status === 'locked';
  const period = c.period_label ?? `${c.fiscal_year}-${String(c.month).padStart(2, '0')}`;
  const tone = closed ? 'ok' : c.ready ? 'info' : 'warn';
  const headline = closed
    ? `${period} is closed.`
    : c.ready
      ? `${period} is ready to close — nothing of the month is left outside the books. Next: \`${c.next?.skill ?? 'close_accounting_period'}\`.`
      : `${period} is not ready: ${failed.length} check${failed.length === 1 ? '' : 's'} block the close.`;
  const table = checks.length
    ? `| Check | | Fix |\n|---|---|---|\n${checks.map((x) => `| ${md(x.label ?? x.id)} | ${x.pass === false ? '✗' : '✓'}${x.detail ? ` ${md(x.detail)}` : ''} | ${x.pass === false && x.fix?.skill ? `\`${md(x.fix.skill)}\`${x.fix.tab ? ` · ${md(x.fix.tab)}` : ''}` : ''} |`).join('\n')}`
    : '_No checks were answered._';
  const live = JSON.stringify({
    skill: 'month_close_checklist', args: { p_year: c.fiscal_year, p_month: c.month }, title: 'The checklist right now',
    kpis: [{ path: 'status', label: 'Period' }, { path: 'blocking.length', label: 'Blocking checks' }],
    table: { rows: 'checks', columns: [{ path: 'label', label: 'Check' }, { path: 'pass', label: 'Passes' }], limit: 20 },
  });
  const content = [
    `# Month close — ${period}`,
    `${c.date_from && c.date_to ? `${fmt.date(c.date_from)} – ${fmt.date(c.date_to)}, ` : ''}fiscal year ${c.label ?? c.fiscal_year}. What the close looked like when this version was published, and — below — as it stands now.`,
    `::note ${tone}\n${headline}\n::`,
    `::kpis\n- ${checks.length - failed.length} / ${checks.length} | Checks passed\n- ${(c.blocking ?? []).length} | Blocking\n- ${md(c.status ?? '—')} | Period status\n::`,
    `## The checks\n\n${table}`,
    '```live\n' + live + '\n```',
  ].join(DIVIDER) + '\n';
  return {
    slug: monthCloseSlug(c.fiscal_year, c.month),
    title: `Month close — ${period}`,
    description: closed ? `${period} closed.` : c.ready ? `${period} is ready to close.` : `${period}: ${failed.length} check${failed.length === 1 ? '' : 's'} block the close.`,
    category: 'Month close',
    note: closed ? 'Closed' : c.ready ? 'Ready to close' : `${failed.length} blocking`,
    audience_module: 'accounting',
    subject_type: 'period',
    subject_id: `${c.fiscal_year}-${String(c.month).padStart(2, '0')}`,
    content,
  };
}

/** The month before a date, as fiscal_year/month the checklist takes (calendar months; the fiscal-year key is the year it falls in). */
export function previousMonth(now: Date): { year: number; month: number } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
