import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { LanguageSwitcher } from '../LanguageSwitcher';

// Växlaren läser sajtens språk och startsida via TanStack Query för att bygga
// /en/-adresser — testerna monterar därför en provider. Frågorna får svara
// tomt: fallbacken (default 'en') räcker för form-kontrakten här.
const render = (ui: ReactElement) => rtlRender(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {ui}
  </QueryClientProvider>,
);

/**
 * Språkväljaren får INTE synas på en enspråkig sajt.
 *
 * Alla fem livesajter är enspråkiga i dag. En växlare som ändå dyker upp i
 * navigationen vore en synlig regression på var och en av dem — och den sortens
 * kontroll ("välj mellan ett alternativ") är dessutom meningslös. Rälsen för
 * översättningar har funnits sedan juli utan att någon kunde nå den; det som
 * saknades var kontrollen, inte mekanismen, och kontrollen ska bara finnas där
 * det faktiskt finns ett val.
 */
describe('LanguageSwitcher syns bara när det finns ett val', () => {
  it('renderar ingenting utan översättningar', () => {
    const { container } = render(<LanguageSwitcher />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar ingenting för en tom lista', () => {
    const { container } = render(<LanguageSwitcher translations={[]} currentLocale="sv" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderar ingenting när sidan är ensam i sin grupp', () => {
    const { container } = render(
      <LanguageSwitcher
        translations={[{ slug: 'priser', locale: 'sv', title: 'Priser' }]}
        currentLocale="sv"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('ignorerar rader utan slug eller locale — halv data är inget val', () => {
    const { container } = render(
      <LanguageSwitcher
        translations={[
          { slug: 'priser', locale: 'sv', title: 'Priser' },
          { slug: '', locale: 'en', title: 'Pricing' },
        ]}
        currentLocale="sv"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('syns först när ett andra språk är publicerat, och visar det nuvarande', () => {
    render(
      <LanguageSwitcher
        translations={[
          { slug: 'priser', locale: 'sv', title: 'Priser' },
          { slug: 'pricing', locale: 'en', title: 'Pricing' },
        ]}
        currentLocale="sv"
      />,
    );
    const trigger = screen.getByLabelText('Change language');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('sv');
  });
});
