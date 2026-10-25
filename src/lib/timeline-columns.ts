/**
 * Desktop columns follow the step count, so a row never ends with one step
 * left alone on a second line (nordbrygg 2026-10-25: five steps in a fixed
 * four-column grid put "Service agreement" on a row of its own). Six becomes
 * 3 + 3; more than six wraps at four. Literal classes so Tailwind keeps them.
 */
export const HORIZONTAL_COLUMNS: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-3',
};
export function horizontalGridClass(count: number): string {
  return `grid grid-cols-2 md:grid-cols-3 ${HORIZONTAL_COLUMNS[count] ?? 'lg:grid-cols-4'} gap-8`;
}
