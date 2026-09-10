import { describe, it, expect } from 'vitest';
import { operatorText, operatorPrompts } from '../operator-text';

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
    expect(operatorText('Blogg', 'Blog', 'sv', 'sv', null)).toBe('Blogg');
    expect(operatorText('Blogg', 'Blog', 'sv-SE', 'sv', null)).toBe('Blogg');
  });

  it('en sida utan eget språk räknas som sajtens', () => {
    expect(operatorText('Blogg', 'Blog', null, 'sv', null)).toBe('Blogg');
  });

  it('på ett ANNAT språk gäller packet — aldrig operatörens ord', () => {
    // Kärnan. Utan det här står "Blogg" kvar i en engelsk meny.
    expect(operatorText('Blogg', 'Blog', 'en', 'sv', null)).toBe('Blog');
    expect(operatorText('Blogg', 'Nyheter', 'de', 'sv', null)).toBe('Nyheter');
  });

  it('utan operatörsord faller det tillbaka på packet', () => {
    expect(operatorText(null, 'Blog', 'sv', 'sv', null)).toBe('Blog');
    expect(operatorText('   ', 'Blog', 'sv', 'sv', null)).toBe('Blog');
  });
});

describe('operatorPrompts — listvarianten', () => {
  const pack = ['P1', 'P2'];
  it('sajtens eget språk: operatörens lista vinner, tomma rader bort', () => {
    expect(operatorPrompts(['Egen', '', null], pack, 'sv', 'sv', null)).toEqual(['Egen']);
  });
  it('annat språk: packet vinner även när operatören har egna', () => {
    expect(operatorPrompts(['Egen'], pack, 'en', 'sv', null)).toEqual(pack);
  });
  it('ingen sidkontext räknas som sajtens språk', () => {
    expect(operatorPrompts(['Egen'], pack, null, 'sv', null)).toEqual(['Egen']);
  });
  it('tom operatörslista faller till packet', () => {
    expect(operatorPrompts([], pack, 'sv', 'sv', null)).toEqual(pack);
    expect(operatorPrompts(undefined, pack, 'sv', 'sv', null)).toEqual(pack);
  });
  it('tomma packrader blir inga knappar', () => {
    expect(operatorPrompts([], ['P1', ''], 'en', 'sv', null)).toEqual(['P1']);
  });
});

/**
 * Kodens default är inget operatörsord.
 *
 * Hooken svarar `{ ...defaultBlogSettings, ...lagrat }`, så utan blog-rad
 * kommer 'Blog' fram som om operatören valt det — och slog packets "Blogg" på
 * Resta Gård (2026-09-10). Ett värde lika med defaulten räknas som frånvarande.
 */
describe('kodens default räknas som frånvarande', () => {
  it('samma ord som defaulten faller till packet', () => {
    expect(operatorText('Blog', 'Blogg', 'sv', 'sv', 'Blog')).toBe('Blogg');
    expect(operatorText(' Blog ', 'Blogg', null, 'sv', 'Blog')).toBe('Blogg');
  });
  it('ett eget ord vinner fortfarande', () => {
    expect(operatorText('Nyheter', 'Blogg', 'sv', 'sv', 'Blog')).toBe('Nyheter');
  });
  it('null = ingen koddefault kan nå värdet', () => {
    expect(operatorText('Blog', 'Blogg', 'sv', 'sv', null)).toBe('Blog');
  });
  it('listan: defaultens förslag faller till packet, egna vinner', () => {
    const dflt = ['What can you help me with?', 'Tell me about your services'];
    const pack = ['Vad kan du hjälpa till med?', 'Berätta om era tjänster'];
    expect(operatorPrompts([...dflt], pack, 'sv', 'sv', dflt)).toEqual(pack);
    expect(operatorPrompts(['Egen fråga'], pack, 'sv', 'sv', dflt)).toEqual(['Egen fråga']);
    expect(operatorPrompts([...dflt], pack, 'sv', 'sv', null)).toEqual(dflt);
  });
});
