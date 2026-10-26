/**
 * "Run at 08:00 and 20:00 on the business's clock" for pg_cron, which only
 * knows UTC. Writing a fixed UTC hour into the cron (the old way) froze the
 * offset of the day an admin saved: after every DST change heartbeat and learn
 * ran an hour off, and a half-hour zone (Asia/Kolkata) was 30 minutes off for
 * ever. Instead the job fires every half hour with the wanted LOCAL hours in
 * its body, and the function asks this gate whether now is one of them — on
 * today's offset, every day. The first half-hour tick inside a local hour
 * answers yes, so a whole-hour and a half-hour zone both run exactly once.
 */
import { isTimeZone } from './home.ts';

export const LOCAL_HOUR_CRON = '0,30 * * * *';

export function localHourAndMinute(timeZone: string, at: Date = new Date()): { hour: number; minute: number } {
  const zone = isTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get('hour') % 24, minute: get('minute') };
}

/** True on the first half-hour tick of one of `hours` on the zone's clock. */
export function isDueLocalHour(hours: readonly number[], timeZone: string, at: Date = new Date()): boolean {
  const { hour, minute } = localHourAndMinute(timeZone, at);
  return minute < 30 && hours.map(Number).includes(hour);
}
