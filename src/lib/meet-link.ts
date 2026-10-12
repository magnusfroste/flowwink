/**
 * A meeting link in free text. River posts, ring fallbacks ("Called Peter on
 * video, no answer. Join here when you can: …/meet/x") and anything an agent
 * writes all carry the room as a plain URL; one matcher turns it into a
 * "Join video call" button wherever text is rendered.
 */
export interface MeetLink {
  slug: string;
  url: string;
}

const MEET_LINK = /\bhttps?:\/\/[^\s]+?\/meet\/([a-z0-9-]{3,64})\b/i;

export function findMeetLink(text: string | null | undefined): MeetLink | null {
  if (!text) return null;
  const m = text.match(MEET_LINK);
  if (!m) return null;
  return { slug: m[1].toLowerCase(), url: m[0] };
}

/** The post a started call leaves where the team talks. */
export function startedCallPost(name: string, url: string, about?: string | null): string {
  const topic = about?.trim() ? ` about ${about.trim()}` : '';
  return `${name} started a video call${topic}. Join: ${url}`;
}
