/**
 * "4 steps · 1 failed · 1 refused" — the one line a turn's skill calls get
 * in the chat (and as the Steps section's meta), instead of a chip each.
 */
export function stepSummary(steps: Array<{ status?: string }>): string {
  if (!steps.length) return '';
  const count = (s: string[]) => steps.filter((x) => s.includes(String(x.status ?? ''))).length;
  const failed = count(['failed', 'error']);
  const refused = count(['refused']);
  const waiting = count(['pending_approval', 'pending', 'staged']);
  return [
    `${steps.length} step${steps.length === 1 ? '' : 's'}`,
    failed ? `${failed} failed` : '',
    refused ? `${refused} refused` : '',
    waiting ? `${waiting} awaiting approval` : '',
  ].filter(Boolean).join(' · ');
}
