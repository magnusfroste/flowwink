/**
 * Hosts an EmbedBlock may frame. Anything else is shown as a link, not a frame:
 * `<iframe src={data.url}>` with a writer-typed URL ran `javascript:` in the
 * site origin (security sweep 2026-10-22). A host matches itself or as a
 * subdomain; the scheme must be https.
 */
export const EMBED_HOST_ALLOWLIST = [
  'youtube.com', 'youtube-nocookie.com', 'youtu.be', 'vimeo.com', 'spotify.com', 'soundcloud.com',
  'codepen.io', 'figma.com', 'loom.com', 'google.com', 'calendly.com', 'tiktok.com', 'twitter.com', 'x.com',
  'typeform.com', 'hubspot.com', 'hsforms.com', 'wistia.com', 'wistia.net', 'dailymotion.com', 'vidyard.com',
  'descript.com', 'canva.com', 'airtable.com', 'notion.site', 'maps.googleapis.com', 'openstreetmap.org',
  'slideshare.net', 'docs.google.com', 'forms.gle', 'tally.so', 'cal.com', 'zcal.co', 'flowwink.com',
];

export function isAllowedEmbedUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return EMBED_HOST_ALLOWLIST.some((h) => host === h || host.endsWith('.' + h));
}
