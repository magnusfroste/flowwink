/**
 * submit_feedback's cadence — the feedback loop without the flood.
 *
 * Every instance's operator (FlowPilot, or an external agent on the gateway)
 * is meant to report what works badly to the endpoint's board (www.flowwink.com
 * for the fleet): it is how the platform hears about a skill that answers
 * wrong, a job that never runs, a parameter nobody can guess. A person reads
 * that board. An hourly heartbeat that finds the same broken job on eight
 * instances must not file it eight times an hour, so:
 *
 *  1. The same report (same title, normalised) from this instance is refused
 *     for 14 days — ALREADY_REPORTED names the post it already became.
 *  2. An unattended caller (no person at the keyboard) sends at most
 *     DAILY_CAP reports in 24 hours — FEEDBACK_DAILY_CAP. A person is never
 *     capped.
 *
 * Refusals, not failures (agent-errors.ts): nothing is retried, nothing counts
 * against the skill. The log is site_settings.feedback_sent, newest last.
 */

export const REPEAT_WINDOW_DAYS = 14;
export const DAILY_CAP = 3;
const LOG_LIMIT = 100;

export interface SentFeedback {
  key: string;
  title: string;
  at: string;
  post_id?: string | null;
  unattended?: boolean;
}

/** "Cron job 'x' never runs!" and "cron job x never runs" are the same report. */
export function feedbackKey(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function judgeFeedback(
  log: SentFeedback[],
  input: { title: string; unattended: boolean; now?: Date },
): null | { status: 'refused'; code: 'ALREADY_REPORTED' | 'FEEDBACK_DAILY_CAP'; retryable: false; hint: string } {
  const now = (input.now ?? new Date()).getTime();
  const key = feedbackKey(input.title);
  const repeat = [...log].reverse().find((e) => e.key === key && now - Date.parse(e.at) < REPEAT_WINDOW_DAYS * 86400000);
  if (repeat) {
    return {
      status: 'refused', code: 'ALREADY_REPORTED', retryable: false,
      hint: `This instance reported "${repeat.title}" on ${repeat.at.slice(0, 10)}${repeat.post_id ? ` (post ${repeat.post_id})` : ''}. It is on the board; a new report of the same thing waits ${REPEAT_WINDOW_DAYS} days. Add what is new to the owner's notes instead.`,
    };
  }
  if (input.unattended) {
    const today = log.filter((e) => e.unattended && now - Date.parse(e.at) < 86400000).length;
    if (today >= DAILY_CAP) {
      return {
        status: 'refused', code: 'FEEDBACK_DAILY_CAP', retryable: false,
        hint: `An unattended agent sends at most ${DAILY_CAP} reports a day from one instance, and ${today} went in the last 24 hours. Keep the rest for tomorrow, or let the owner send it.`,
      };
    }
  }
  return null;
}

export function appendSent(log: SentFeedback[], entry: SentFeedback): SentFeedback[] {
  return [...log, entry].slice(-LOG_LIMIT);
}
