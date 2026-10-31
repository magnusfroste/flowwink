/**
 * A lesson keeps the pattern, never the instance.
 *
 * Nordbrygg, Sep–Oct 2026: the heartbeat miscopied one digit of a task id
 * (…-4682-… → …-4687-…) and comment_on_task answered "no task <wrong id> —
 * did you mean <right id>?". The daily reflection then wrote "comment_on_task
 * fails frequently: no task <wrong id> …" into memory — 30 lessons in a row —
 * and the next heartbeat copied the id from its memory instead of from the
 * answer: 129 failures. An id in a lesson is a stale instance the model will
 * re-send; the lesson is that the call shape failed. Pure, so vitest runs it.
 */
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function lessonText(message: string): string {
  return String(message ?? '').replace(UUID_RE, '<id>');
}
