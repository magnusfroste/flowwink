import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicFooter } from '../PublicFooter';

/**
 * The footer can show the header menu as link columns (MJP's footer is the
 * site map). One list: the menu. Items with no children form a first, untitled
 * column; each group is a titled column of its children.
 */
const footer = { variant: 'full', showMenuColumns: true, showQuickLinks: false, phone: '', email: '', address: '', postalCode: '', weekdayHours: '', weekendHours: '' };
const header = { customNavItems: [
  { id: 'a', label: 'Applications', url: '/applications', enabled: true, children: [{ id: 'a1', label: 'Wind Farm', url: '/wind-farm' }] },
  { id: 'r', label: 'References', url: '/references', enabled: true },
  { id: 'h', label: 'Hidden', url: '/hidden', enabled: false },
] };
vi.mock('@/hooks/useGlobalBlocks', () => ({
  useFooterBlock: () => ({ data: { data: footer } }),
  useHeaderBlock: () => ({ data: { data: header } }),
  defaultFooterData: {},
}));
vi.mock('@/providers/BrandingProvider', () => ({ useBranding: () => ({ branding: { organizationName: 'Marine Jet Power' } }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@/lib/ui-text', () => ({ useUiText: () => (_k: string, f: string) => f, useUiTextLanguage: () => ({ lang: 'en', siteLang: 'en' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ order: () => ({ order: async () => ({ data: [], error: null }) }) }) }) }) }) }) } }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] }) }));

describe('footer menu columns', () => {
  it('renders the menu groups as columns, leaves first, hidden items never', () => {
    render(<MemoryRouter><PublicFooter /></MemoryRouter>);
    const nav = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(nav).getByRole('link', { name: 'References' })).toHaveAttribute('href', '/references');
    expect(within(nav).getByRole('link', { name: 'Applications' })).toHaveAttribute('href', '/applications');
    expect(within(nav).getByRole('link', { name: 'Wind Farm' })).toHaveAttribute('href', '/wind-farm');
    expect(within(nav).queryByText('Hidden')).not.toBeInTheDocument();
  });
});
