/**
 * Which logo the footer shows, by the SURFACE it sits on.
 *
 * The rule used to assume the footer was always painted in the brand colour
 * (`bg-primary`), so it picked the opposite of the theme: the light-theme
 * logo in dark theme. That stopped being true the day the footer got a
 * surface dial (#715): on `ground` the footer is the page ground, so in dark
 * theme it is dark and the light-theme (black) logo vanished into it
 * (synclair, 2026-10-23: black mark on a black footer).
 *
 *  - ground / muted — the page's own ground: follow the theme, like the header.
 *  - inverse        — the opposite surface: the opposite of the theme.
 *  - primary        — the brand colour: unchanged, the opposite of the theme.
 */
export type FooterSurfaceName = 'primary' | 'ground' | 'inverse' | 'muted';

export function footerLogoFor(
  surface: string | null | undefined,
  theme: 'light' | 'dark' | string,
  logo: string | null | undefined,
  logoDark: string | null | undefined,
): string | null {
  const dark = theme === 'dark';
  const s = (surface || 'primary') as FooterSurfaceName;
  const onDarkSurface = s === 'ground' || s === 'muted' ? dark : !dark;
  return (onDarkSurface ? (logoDark || logo) : (logo || logoDark)) || null;
}
