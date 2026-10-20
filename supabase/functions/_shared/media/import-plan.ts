/**
 * What happens to an image an agent imports — decided BEFORE it is stored.
 *
 * Synclair, 2026-10-19: a connected ChatGPT sideloaded the agency's background
 * textures with media_browse import_from_url — 8014×4500 px, 7 MB PNG — and
 * wrote that URL into the site. The import answered "imported" and handed
 * back the 7 MB file; every page view since downloads it. Nothing on the way
 * said that no screen is wider than ~2560 px, or that the library can make a
 * web-sized copy. The rail stored what it was given and the agent did the
 * natural thing with what it got back.
 *
 * So the import now has a plan, and the plan is the easy path:
 *   keep      — small enough: stored and served as it is
 *   optimize  — bigger than a web page needs: a web-sized copy (≤ WEB_MAX_WIDTH
 *               wide; PNG when the source has alpha, JPEG otherwise) is stored
 *               NEXT TO the original, and the copy is the `url` the agent gets
 *   refuse    — too big to even decode on the edge (memory): the answer says
 *               the size, why it is pointless, and what to send instead
 *
 * Dimensions are read from the file HEADER (PNG IHDR, JPEG SOF, WebP, GIF), so
 * a 36-megapixel file is refused without ever being decoded.
 */

export const WEB_MAX_WIDTH = 1600;
/** Above this, a web-sized copy is made even when the width is fine. */
export const WEB_TRIGGER_BYTES = 400_000;
/** Decoding ≈ 4 bytes per pixel on the edge; 16 Mpx ≈ 64 MB — the ceiling. */
export const MAX_MEGAPIXELS = 16;
export const MAX_BYTES = 15 * 1024 * 1024;

export interface ImageHeader {
  width: number;
  height: number;
  /** Known only for PNG (colour type) and WebP (VP8X flag); JPEG never has it. */
  hasAlpha: boolean | null;
}

/** Read width/height (and alpha where the format says) from the first bytes. */
export function readImageHeader(bytes: Uint8Array, contentType = ''): ImageHeader | null {
  const ct = contentType.toLowerCase();
  const u32 = (i: number) => ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const u16be = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u16le = (i: number) => bytes[i] | (bytes[i + 1] << 8);
  const u24le = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);

  // PNG: signature, then IHDR at 16 (width), 20 (height), 25 (colour type).
  if (bytes.length >= 26 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const colourType = bytes[25];
    return { width: u32(16), height: u32(20), hasAlpha: colourType === 4 || colourType === 6 };
  }
  // JPEG: walk the segments to the first SOF (C0–CF except C4, C8, CC).
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = u16be(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(i + 7), height: u16be(i + 5), hasAlpha: false };
      }
      i += 2 + len;
    }
    return null;
  }
  // GIF: logical screen width/height at 6 and 8, little-endian.
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: u16le(6), height: u16le(8), hasAlpha: null };
  }
  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X chunk.
  if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X') return { width: u24le(24) + 1, height: u24le(27) + 1, hasAlpha: (bytes[20] & 0x10) !== 0 };
    if (chunk === 'VP8L') {
      const b = u32(21);
      const le = ((b >>> 24) & 0xff) | (((b >>> 16) & 0xff) << 8) | (((b >>> 8) & 0xff) << 16) | ((b & 0xff) << 24);
      return { width: (le & 0x3fff) + 1, height: ((le >>> 14) & 0x3fff) + 1, hasAlpha: ((le >>> 28) & 1) === 1 };
    }
    if (chunk === 'VP8 ') return { width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff, hasAlpha: false };
  }
  if (ct === 'image/svg+xml') return null;
  return null;
}

export type ImportPlan =
  | { verdict: 'keep'; reason: string }
  | { verdict: 'optimize'; targetWidth: number; format: 'png' | 'jpeg'; reason: string }
  | { verdict: 'refuse'; reason: string };

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

/** A logo-mark animation or a hero loop: a few seconds. Above this it is a film, not an asset. */
export const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

export function planImport(input: { bytes: number; contentType: string; header: ImageHeader | null }): ImportPlan {
  const { bytes, contentType, header } = input;
  const ct = contentType.toLowerCase();
  if (ct === 'video/mp4' || ct === 'video/webm') {
    if (bytes > MAX_VIDEO_BYTES) {
      return { verdict: 'refuse', reason: `${mb(bytes)} of video — the ${mb(MAX_VIDEO_BYTES)} cap keeps a logo animation or a hero loop a few seconds long. Trim or re-encode (H.264, 720p, no audio) before importing.` };
    }
    return { verdict: 'keep', reason: `${ct}, ${mb(bytes)} — stored as it is (videos are not re-encoded here)` };
  }
  if (bytes > MAX_BYTES) {
    return { verdict: 'refuse', reason: `${mb(bytes)} — the ${mb(MAX_BYTES)} import cap protects storage and page weight. Resize to ≤ ${WEB_MAX_WIDTH} px wide (≤ 500 KB) before importing.` };
  }
  // Vector and animated formats are stored as they are: there is nothing to resize.
  if (ct === 'image/svg+xml' || ct === 'image/gif') return { verdict: 'keep', reason: `${ct} is stored as it is` };
  if (!header) return { verdict: 'keep', reason: 'dimensions unreadable from the header — stored as it is' };

  const megapixels = (header.width * header.height) / 1_000_000;
  if (megapixels > MAX_MEGAPIXELS) {
    return {
      verdict: 'refuse',
      reason:
        `${header.width}×${header.height} px (${megapixels.toFixed(0)} Mpx, ${mb(bytes)}) is too large to process on the edge, and pointless on a page: no screen is wider than ~2560 px and a content image is served at ≤ ${WEB_MAX_WIDTH} px. ` +
        `Resize to ≤ ${WEB_MAX_WIDTH} px wide before importing (a PNG texture with transparency: keep PNG, aim for ≤ 300 KB; a photo: JPEG ≤ 500 KB). ` +
        'A page-wide background texture is not a content image at all — it belongs on a hero (backgroundType "image") or a section-divider, never in custom_scripts.',
    };
  }
  const decodable = ct === 'image/png' || ct === 'image/jpeg' || ct === 'image/jpg';
  if (!decodable) return { verdict: 'keep', reason: `${ct} is stored as it is (only PNG and JPEG are resized here)` };
  if (header.width > WEB_MAX_WIDTH || bytes > WEB_TRIGGER_BYTES) {
    const format = header.hasAlpha ? 'png' : 'jpeg';
    return {
      verdict: 'optimize',
      targetWidth: Math.min(WEB_MAX_WIDTH, header.width),
      format,
      reason: `${header.width}×${header.height} px, ${bytes > 1024 * 1024 ? mb(bytes) : kb(bytes)} — a web-sized ${format === 'png' ? 'PNG (transparency kept)' : 'JPEG'} copy at ≤ ${WEB_MAX_WIDTH} px wide is what pages should carry`,
    };
  }
  return { verdict: 'keep', reason: `${header.width}×${header.height} px, ${kb(bytes)} — already web-sized` };
}
