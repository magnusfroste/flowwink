import { useTheme } from 'next-themes';

/**
 * The theme actually on screen. next-themes reports `resolvedTheme` from the
 * STORED choice even while a `forcedTheme` is applied — so a public page
 * forced to light, visited by someone whose saved choice is dark, would pick
 * the dark logo. Read the theme through here, not resolvedTheme.
 */
export function useEffectiveTheme(): 'light' | 'dark' | undefined {
  const { forcedTheme, resolvedTheme } = useTheme();
  const t = forcedTheme ?? resolvedTheme;
  return t === 'light' || t === 'dark' ? t : undefined;
}
