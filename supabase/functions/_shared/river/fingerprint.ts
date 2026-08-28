// River system-post fingerprint — the dedup key for agent-created posts.
//
// River incident (2026-08-23→28): the heartbeat posted four NEARLY identical
// ⚠️ warnings in five days — same alert, slightly different numbers ("36 HTTP
// errors" vs "38 HTTP errors"), each one a fresh post. Rule: the same system
// finding within DEDUP_WINDOW_DAYS updates the existing post instead of
// creating a new one.
//
// The fingerprint normalizes exactly what varies between re-emissions of the
// same system post: digits (counts, timestamps), whitespace, and punctuation.
// Two posts that differ only in those are the SAME post. Genuinely different
// announcements keep different letter content and therefore different
// fingerprints.

export const DEDUP_WINDOW_DAYS = 7;

/** Max normalized length compared — enough to distinguish real posts, short
 * enough that a long shared preamble doesn't glue different posts together. */
const FINGERPRINT_CHARS = 240;

export function riverPostFingerprint(body: string): string {
  return String(body || '')
    .toLowerCase()
    // Strip everything that legitimately varies between re-emissions of the
    // same alert: numbers, punctuation, markdown decoration, whitespace runs.
    // Keep letters (any script) — they carry the post's actual identity.
    .replace(/[0-9]+/g, '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FINGERPRINT_CHARS);
}

/** True when two bodies are re-emissions of the same system post. */
export function isSameRiverPost(bodyA: string, bodyB: string): boolean {
  const a = riverPostFingerprint(bodyA);
  const b = riverPostFingerprint(bodyB);
  if (!a || !b) return false;
  return a === b;
}
