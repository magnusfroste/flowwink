/**
 * A phone number as it is written ("+46 (0) 10 165 10 00") → the number a
 * phone dials ("tel:+46101651000").
 *
 * The "(0)" is the trunk prefix, written for readers dialling domestically;
 * after a country code it must go, or the link dials +46 0 10… — a number
 * that does not exist. MJP's footer did exactly that (2026-09-28). Every
 * tel: link in the app goes through here (guard: tel-links-one-reader).
 */
export function telHref(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '';
  const international = raw.startsWith('+') || raw.startsWith('00');
  const withoutTrunk = international ? raw.replace(/\(\s*0\s*\)/g, '') : raw;
  let digits = withoutTrunk.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  // Only a leading + is meaningful.
  digits = digits.charAt(0) + digits.slice(1).replace(/\+/g, '');
  return digits ? `tel:${digits}` : '';
}
