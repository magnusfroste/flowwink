/**
 * Tag groups and spec rows as DATA — the two small shapes a design draft is
 * full of that had no field: "Adapts to your mission: [chip] [chip] [chip]"
 * and "Weight — 320 g". Shared by hero, features, text and the editors;
 * the editors read and write them as plain lines.
 */
export interface TagGroup {
  /** Optional lead-in, e.g. "Adapts to your mission". */
  label?: string;
  tags: string[];
}
export interface SpecRow { label: string; value: string }

/** "Label: a, b, c" per line → groups; a line without ":" is a group without a label. */
export function parseTagGroups(text: string): TagGroup[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    const label = i >= 0 ? line.slice(0, i).trim() : '';
    const tags = (i >= 0 ? line.slice(i + 1) : line).split(',').map((t) => t.trim()).filter(Boolean);
    return label ? { label, tags } : { tags };
  }).filter((g) => g.tags.length > 0);
}
export function formatTagGroups(groups: TagGroup[] | undefined): string {
  return (groups ?? []).map((g) => (g.label ? `${g.label}: ` : '') + g.tags.join(', ')).join('\n');
}
/** "Label: value" per line → rows. */
export function parseSpecs(text: string): SpecRow[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(':');
    return i >= 0 ? { label: line.slice(0, i).trim(), value: line.slice(i + 1).trim() } : { label: line, value: '' };
  }).filter((r) => r.label);
}
export function formatSpecs(rows: SpecRow[] | undefined): string {
  return (rows ?? []).map((r) => `${r.label}: ${r.value}`).join('\n');
}
