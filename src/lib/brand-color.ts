/**
 * Brand colour rules shared by the provider that paints the site and the
 * Branding page that previews it — one rule, two readers.
 *
 * Colours are HSL triplets as the tokens store them: "220 100% 26%".
 */

/** Text on a brand surface follows the surface's lightness: dark → light text. */
export function contrastForeground(hsl: string): string {
  const lightness = parseFloat(hsl.split(/\s+/)[2] || '50');
  return lightness < 40 ? '0 0% 98%' : '0 0% 9%';
}

/** A brand surface in the dark theme must sit at least this light to show against ~8–12 % backgrounds. */
export const DARK_PRIMARY_MIN_LIGHTNESS = 60;

/**
 * The dark theme's primary when the admin has not set one.
 *
 * Until 2026-10-02 the light primary was applied inline in BOTH themes, so a
 * black or deep-blue brand turned invisible in dark mode: the chat launcher,
 * the user's bubbles and every primary button vanished into the background
 * while their derived white text floated alone (synclairvision, primary black).
 * The dark theme's own CSS default never applied — inline beats `.dark`.
 *
 * Same hue, same saturation; lightness lifted to the floor when below it, left
 * alone when already light. Black becomes a mid grey, deep blue a sky blue, a
 * bright brand colour stays itself. An explicit primaryColorDark always wins —
 * this is only the answer when there is none. Malformed input passes through.
 */
export function darkModePrimary(lightHsl: string): string {
  const m = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(lightHsl);
  if (!m) return lightHsl;
  const [, h, s, l] = m;
  const lightness = parseFloat(l);
  if (lightness >= DARK_PRIMARY_MIN_LIGHTNESS) return lightHsl;
  return `${h} ${s}% ${DARK_PRIMARY_MIN_LIGHTNESS}%`;
}

/** What the dark theme will actually use: the explicit value, else the derived one. */
export function effectiveDarkPrimary(primaryColor: string | undefined, primaryColorDark: string | undefined): string | undefined {
  if (primaryColorDark) return primaryColorDark;
  return primaryColor ? darkModePrimary(primaryColor) : undefined;
}
