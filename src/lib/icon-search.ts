/**
 * Icon search over the whole lucide library — pure, shared by the admin picker
 * and its guard test. See src/components/admin/IconPicker.tsx for the story.
 */
import { icons } from 'lucide-react';

/** All PascalCase icon names in the library, computed once. */
export const ALL_ICON_NAMES: readonly string[] = Object.keys(icons).sort();

/** "ChartBarIncreasing" → "chart bar increasing" (plus the compact form). */
function wordsOf(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

const SEARCH_INDEX: ReadonlyArray<{ name: string; words: string; compact: string }> = ALL_ICON_NAMES.map((name) => ({
  name,
  words: wordsOf(name),
  compact: name.toLowerCase(),
}));

/** Shown before the operator types. Generic across businesses — no sector groups. */
export const STARTER_ICONS: readonly string[] = [
  'Star', 'Heart', 'Shield', 'ShieldCheck', 'Check', 'CircleCheck', 'Zap', 'Sparkles',
  'Users', 'User', 'UserCheck', 'Handshake', 'Building2', 'Briefcase', 'Globe', 'MapPin',
  'Phone', 'Mail', 'MessageCircle', 'Calendar', 'Clock', 'Rocket', 'TrendingUp', 'ChartColumn',
  'FileText', 'ClipboardList', 'BookOpen', 'Settings', 'Wrench', 'Truck', 'ShoppingCart',
  'CreditCard', 'Receipt', 'Calculator', 'Lock', 'Key', 'Lightbulb', 'Target', 'Award', 'Bot',
];

export const SEARCH_LIMIT = 60;

/**
 * Pure: the icon names matching `query`, best first, at most `limit`.
 * Every whitespace-separated term must match somewhere in the name's words;
 * a name whose word STARTS with the first term ranks before one that merely
 * contains it. Empty query → empty list (the starter set is the caller's).
 */
export function searchIcons(query: string, limit = SEARCH_LIMIT): string[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const joined = terms.join('');
  const starts: string[] = [];
  const rest: string[] = [];
  for (const e of SEARCH_INDEX) {
    const hit = terms.every((t) => e.words.includes(t)) || e.compact.includes(joined);
    if (!hit) continue;
    const wordStart = e.words.startsWith(terms[0]) || e.words.includes(' ' + terms[0]);
    (wordStart ? starts : rest).push(e.name);
    if (starts.length >= limit) break;
  }
  return [...starts, ...rest].slice(0, limit);
}

