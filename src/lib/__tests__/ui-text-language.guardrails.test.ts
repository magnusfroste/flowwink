import { describe, it, expect } from 'vitest';
import { resolveUiText, type UiTextMap } from '../ui-text';

/**
 * Skaltexten fick en språkdimension. Det farliga med den ändringen är inte att
 * översättningar saknas — det är att en befintlig instans, som bara har en
 * platt karta, skulle börja bete sig annorlunda. Testerna pinnar båda halvorna:
 * gamla former löser upp EXAKT som förut, och en engelsk sida faller aldrig
 * tillbaka på det svenska baslagret.
 */
describe('ui_text med språkdimension', () => {
  const SWEDISH_SITE: UiTextMap = {
    'page.backHome': 'Tillbaka till startsidan',
    'chat.send': 'Skicka',
  };

  it('en platt karta beter sig precis som förut', () => {
    const t = resolveUiText(SWEDISH_SITE, 'sv-SE', 'sv-SE');
    expect(t('page.backHome', 'Back to homepage')).toBe('Tillbaka till startsidan');
    expect(t('unknown.key', 'Back to homepage')).toBe('Back to homepage');
  });

  it('en tom pack ger anropsplatsens engelska', () => {
    const t = resolveUiText({}, 'sv-SE', 'sv-SE');
    expect(t('chat.send', 'Send message')).toBe('Send message');
  });

  it('en engelsk sida på en svensk sajt faller ALDRIG till det svenska baslagret', () => {
    const t = resolveUiText(SWEDISH_SITE, 'en', 'sv-SE');
    expect(t('page.backHome', 'Back to homepage')).toBe('Back to homepage');
    expect(t('chat.send', 'Send message')).toBe('Send message');
  });

  it('overlayen för sidans språk vinner', () => {
    const map: UiTextMap = { ...SWEDISH_SITE, '@en': { 'chat.send': 'Send' } };
    expect(resolveUiText(map, 'en', 'sv-SE')('chat.send', 'Send message')).toBe('Send');
    expect(resolveUiText(map, 'sv', 'sv-SE')('chat.send', 'Send message')).toBe('Skicka');
  });

  it('exakt tagg slår grundtagg', () => {
    const map: UiTextMap = { '@en': { greet: 'Colour' }, '@en-us': { greet: 'Color' } };
    expect(resolveUiText(map, 'en-US', 'sv')('greet', 'Colour')).toBe('Color');
    expect(resolveUiText(map, 'en-GB', 'sv')('greet', 'x')).toBe('Colour');
  });

  it('en tom sträng i en overlay är inte en översättning', () => {
    const map: UiTextMap = { ...SWEDISH_SITE, '@sv': { 'chat.send': '' } };
    expect(resolveUiText(map, 'sv', 'sv-SE')('chat.send', 'Send message')).toBe('Skicka');
  });

  it('en overlay som inte är ett objekt ignoreras i stället för att krascha', () => {
    const map = { '@en': 'trasig' } as unknown as UiTextMap;
    expect(resolveUiText(map, 'en', 'en')('chat.send', 'Send message')).toBe('Send message');
  });

  it('@-nycklar kan inte krocka med riktiga nycklar', () => {
    const t = resolveUiText({ '@en': { x: 'overlay' }, x: 'bas' }, 'en', 'en');
    expect(t('x', 'fallback')).toBe('overlay');
    expect(t('@en', 'fallback')).toBe('fallback');
  });
});
