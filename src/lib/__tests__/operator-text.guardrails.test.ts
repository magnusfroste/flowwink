import { describe, it, expect } from 'vitest';
import { operatorText } from '../operator-text';

/**
 * Bloggänkens etikett — precedensen som varit fel två gånger.
 *
 * Först stod "Blogg" som kodens fallback, så varje sajt visade svenska utan att
 * någon valt det. Sedan, när den blev 'Blog', var operatörens archiveTitle
 * fortfarande fallback på ALLA språk — vilket hade satt tillbaka "Blogg" i en
 * engelsk meny. archiveTitle är operatörens ord för sitt EGET språk.
 */
describe('bloggänkens etikett', () => {
  it('operatörens ord vinner på sajtens eget språk', () => {
    expect(operatorText('Blogg', 'Blog', 'sv', 'sv')).toBe('Blogg');
    expect(operatorText('Blogg', 'Blog', 'sv-SE', 'sv')).toBe('Blogg');
  });

  it('en sida utan eget språk räknas som sajtens', () => {
    expect(operatorText('Blogg', 'Blog', null, 'sv')).toBe('Blogg');
  });

  it('på ett ANNAT språk gäller packet — aldrig operatörens ord', () => {
    // Kärnan. Utan det här står "Blogg" kvar i en engelsk meny.
    expect(operatorText('Blogg', 'Blog', 'en', 'sv')).toBe('Blog');
    expect(operatorText('Blogg', 'Nyheter', 'de', 'sv')).toBe('Nyheter');
  });

  it('utan operatörsord faller det tillbaka på packet', () => {
    expect(operatorText(null, 'Blog', 'sv', 'sv')).toBe('Blog');
    expect(operatorText('   ', 'Blog', 'sv', 'sv')).toBe('Blog');
  });
});
