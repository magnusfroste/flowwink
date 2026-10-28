/**
 * "Today" for a model — on the business's calendar and clock. A model's sense
 * of now is its training cutoff: asked for a due date "in 30 days" it produced
 * one two years in the past (QA, 2026-08-20). workspace-chat said so in UTC
 * (between 00:00 and 02:00 in Stockholm it was told it was yesterday);
 * FlowPilot, the visitor chat and the voice receptionist were told nothing.
 */
import { dateInZone, homeFormat, type Home } from './home.ts';

export function todayLine(home: Home, at: Date = new Date()): string {
  const f = homeFormat(home, 'en');
  const weekday = f.dateTime(at, { weekday: 'long' });
  const time = f.time(at);
  return [
    `TODAY IS ${weekday}, ${dateInZone(home.timeZone, at)} — ${time} in ${home.timeZone} (the business's clock).`,
    'Every relative date ("today", "tomorrow", "next Friday", "in 30 days", "last quarter") resolves against THAT date, not against your training data. When a skill takes a date, compute it from today and pass an explicit ISO date (YYYY-MM-DD) — never a relative phrase, and never a year you assumed.',
  ].join('\n');
}
