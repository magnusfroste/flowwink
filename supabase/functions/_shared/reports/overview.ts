/**
 * The overview dashboard — "what needs attention right now", one report of
 * live blocks that FlowPilot publishes on its own (2026-11-04). Pure: given
 * the site's language and which modules are on, it is the same report every
 * time, so publishing it again adds no version (report_publish: identical
 * content → unchanged). A module switched on or off changes the content, and
 * the next run publishes that as a version.
 *
 * Every block is a live block: the figures are fetched as the person who
 * opens the report, so a role without accounting sees the books' block say
 * so, and the operations block (a platform skill) is the owner's.
 */

export const OVERVIEW_SLUG = 'overview';

type Lang = 'sv' | 'en';
const T = {
  sv: {
    title: 'Läget just nu',
    description: 'Det som behöver uppmärksamhet i böckerna och i driften — siffrorna hämtas när du öppnar sidan.',
    category: 'Översikt',
    intro: 'En dashboard som FlowPilot håller uppdaterad. Varje ruta hämtar sina siffror när du öppnar sidan, med din behörighet.',
    books: 'Böckerna', needs: 'Att åtgärda', high: 'Hög prioritet', finding: 'Fynd', count: 'Antal', level: 'Nivå',
    deadlines: 'Kommande deklarationer', what: 'Vad', due: 'Senast', days: 'Dagar kvar',
    ops: 'Driften', opsCount: 'Att åtgärda i driften', area: 'Område',
    note: 'Saknas en ruta är modulen avstängd. Ser du ett meddelande i stället för siffror saknar din roll den modulen.',
  },
  en: {
    title: 'The state of things',
    description: 'What needs attention in the books and in operations — the figures are fetched when you open the page.',
    category: 'Overview',
    intro: 'A dashboard FlowPilot keeps current. Each block fetches its figures when you open the page, with your access.',
    books: 'The books', needs: 'Need attention', high: 'High priority', finding: 'Finding', count: 'Count', level: 'Level',
    deadlines: 'Upcoming filings', what: 'What', due: 'Due', days: 'Days left',
    ops: 'Operations', opsCount: 'Need attention in operations', area: 'Area',
    note: 'A missing block means its module is off. A message instead of figures means your role lacks that module.',
  },
} as const;

const live = (o: unknown) => '```live\n' + JSON.stringify(o) + '\n```';

export function overviewDashboard(language: string, modules: { accounting: boolean }): {
  slug: string; title: string; description: string; category: string; content: string;
} {
  const lang: Lang = String(language || '').toLowerCase().startsWith('sv') ? 'sv' : 'en';
  const t = T[lang];
  const parts: string[] = [`# ${t.title}`, t.intro];
  if (modules.accounting) {
    parts.push(live({
      skill: 'check_books', args: {}, title: t.books,
      kpis: [{ path: 'summary.total', label: t.needs }, { path: 'summary.high', label: t.high }],
      table: { rows: 'findings', columns: [{ path: 'label', label: t.finding }, { path: 'count', label: t.count }, { path: 'severity', label: t.level }], limit: 8 },
    }));
    parts.push(live({
      skill: 'check_books', args: {}, title: t.deadlines,
      table: { rows: 'next_deadlines', columns: [{ path: 'label', label: t.what }, { path: 'due_date', label: t.due }, { path: 'days_left', label: t.days }], limit: 6 },
    }));
  }
  parts.push(live({
    skill: 'check_operations', args: {}, title: t.ops,
    kpis: [{ path: 'findings.length', label: t.opsCount }],
    table: { rows: 'findings', columns: [{ path: 'area', label: t.area }, { path: 'label', label: t.finding }, { path: 'severity', label: t.level }], limit: 10 },
  }));
  parts.push(`::note info\n${t.note}\n::`);
  return { slug: OVERVIEW_SLUG, title: t.title, description: t.description, category: t.category, content: parts.join('\n\n') + '\n' };
}
