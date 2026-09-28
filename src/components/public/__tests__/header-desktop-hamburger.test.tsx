import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { HeaderBlockData } from '@/types/cms';

/**
 * desktopMenu: 'hamburger' — MJP's own header: a transparent bar over a video
 * hero, one visible link, the mega menu behind a menu button. The panel shows
 * the menu's groups as columns (the same reading as the footer's columns).
 */
let header: HeaderBlockData = {};
vi.mock('@/hooks/useGlobalBlocks', () => ({
  useHeaderBlock: () => ({ data: { data: header } }),
  defaultHeaderData: {},
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/ui-text', () => ({ useUiText: () => (_k: string, f: string) => f }));
vi.mock('@/providers/BrandingProvider', () => ({ useBranding: () => ({ branding: { organizationName: 'Marine Jet Power', allowThemeToggle: false } }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@/hooks/useModules', () => ({ useIsModuleEnabled: () => false }));
vi.mock('@/hooks/useSiteSettings', () => ({
  useStoreSettings: () => ({ data: { storefront: false }, isLoading: false }),
  useCustomerPortalSettings: () => ({ data: { enabled: false } }),
  useBlogSettings: () => ({ data: { enabled: false } }),
  useSiteLanguages: () => ({ defaultLanguage: 'en', languages: ['en'] }),
  defaultBlogSettings: { enabled: false },
}));
vi.mock('../ThemeToggle', () => ({ ThemeToggle: () => null }));
vi.mock('../CartIndicator', () => ({ CartIndicator: () => null }));
vi.mock('../AccountIndicator', () => ({ AccountIndicator: () => null }));
vi.mock('../LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));
vi.mock('@/components/SandboxBanner', () => ({ SandboxBanner: () => null }));

import { PublicNavigation } from '../PublicNavigation';

const menu: HeaderBlockData['customNavItems'] = [
  { id: 'apps', label: 'Applications', url: '/applications', enabled: true, children: [{ id: 'wind', label: 'Wind Farm', url: '/wind-farm' }] },
  { id: 'refs', label: 'References', url: '/references', enabled: true },
];
const renderHeader = () => render(<MemoryRouter><PublicNavigation /></MemoryRouter>);

describe('header desktop menu', () => {
  beforeEach(() => { header = { variant: 'mega-menu', customNavItems: menu, ctaText: 'Contact', ctaUrl: '/contact-us' }; });

  it('inline (default): the menu sits in the header row, no desktop menu button', () => {
    renderHeader();
    expect(screen.getAllByText('Applications').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Open menu' })).toHaveLength(1); // the phone toggle only
  });

  it('hamburger: only the header link shows; the button opens the menu as columns', () => {
    header = { ...header, desktopMenu: 'hamburger' };
    renderHeader();
    expect(screen.queryByText('Applications')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact-us');

    const [desktopButton] = screen.getAllByRole('button', { name: 'Open menu' });
    fireEvent.click(desktopButton);
    const panel = screen.getByRole('dialog', { name: 'Menu' });
    expect(within(panel).getByRole('heading', { name: 'Applications' })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Wind Farm' })).toHaveAttribute('href', '/wind-farm');
    expect(within(panel).getByRole('link', { name: 'References' })).toHaveAttribute('href', '/references');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument();
  });
});
